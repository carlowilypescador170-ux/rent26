// ─────────────────────────────────────────────────────────────────────────────
// routes/user.js  —  Customer-facing routes
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const User     = require('../models/user');
const Rental   = require('../models/rental');
const Item     = require('../models/item');
const Notification = require('../models/notification');
const { isUser }   = require('../middleware/isUser');
const { isRental, isRentalOwner, isRentalPending, isRentalActive } = require('../middleware/isRental');
const { isValidId }  = require('../middleware/isValidId');
const { uploadProfilePicture } = require('../middleware/isUpload');
const { createAuditLog }       = require('../middleware/isAuditLog');

// All routes here require logged-in customer
router.use(isUser);

// ── GET /user/dashboard ───────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.currentUser._id;

    const [recentRentals, notifications, allRentals] = await Promise.all([
      Rental.find({ customer: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      Rental.find({ customer: userId }).lean(),
    ]);

    const stats = {
      total:      allRentals.length,
      pending:    allRentals.filter(r => r.status === 'pending').length,
      active:     allRentals.filter(r => ['approved','active'].includes(r.status)).length,
      totalSpent: allRentals.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    };

    res.render('user/dashboard', {
      pageTitle: 'My Dashboard',
      recentRentals,
      notifications,
      stats,
    });
  } catch (err) {
    console.error('[User Dashboard]', err.message);
    req.flash('error', 'Could not load dashboard.');
    res.redirect('/');
  }
});
router.get('/new', async (req, res) => {
  try {
    const items = await Item.find({ isAvailable: true }).sort({ pricePerDay: 1 });
    res.render('rentals/new', { items });
  } catch (err) {
    req.flash('error', 'Could not load items.');
    res.redirect('/user/rentals');
  }
});
// ── GET /user/rentals ─────────────────────────────────────────────────────────
router.get('/rentals', async (req, res) => {
  try {
    const { status, page = 1 } = req.query;
    const limit = 10;
    const skip  = (page - 1) * limit;

    const filter = { customer: req.currentUser._id };
    if (status && status !== 'all') filter.status = status;

    const [rentals, total] = await Promise.all([
      Rental.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Rental.countDocuments(filter),
    ]);

    res.render('user/rentals', {
      pageTitle:     'My Rentals',
      rentals,
      currentStatus: status || 'all',
      currentPage:   parseInt(page),
      totalPages:    Math.ceil(total / limit),
    });
  } catch (err) {
    req.flash('error', 'Could not load rentals.');
    res.redirect('/user/dashboard');
  }
});

// ── GET /user/rentals/new ─────────────────────────────────────────────────────
router.get('/rentals/new', async (req, res) => {
  try {
    const items = await Item.find({ isAvailable: true }).lean();
    res.render('user/new-rental', { pageTitle: 'New Rental Request', items });
  } catch (err) {
    req.flash('error', 'Could not load rental form.');
    res.redirect('/user/rentals');
  }
});

// ── POST /user/rentals ────────────────────────────────────────────────────────
router.post('/rentals', async (req, res) => {
  try {
    const { rentalStartDate, rentalEndDate, deliveryAddress, notes, items } = req.body;

    // 1. Check kung may laman ang items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      req.flash('error', 'Please select at least one item.');
      return res.redirect('/user/rentals/new');
    }

    // 2. Linisin ang items (tanggalin ang mga null o walang itemType)
    const validItems = items.filter(i => i.itemType && i.quantity);

    if (validItems.length === 0) {
      req.flash('error', 'Please select at least one valid item.');
      return res.redirect('/user/rentals/new');
    }

    // 3. Date Validation
    const start = new Date(rentalStartDate);
    const end = new Date(rentalEndDate);

    if (isNaN(start) || isNaN(end) || end < start) {
      req.flash('error', 'Invalid dates. End date must be on or after start date.');
      return res.redirect('/user/rentals/new');
    }

    // Calculate days (at least 1 day)
    const diffTime = Math.abs(end - start);
    const numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // 4. Build rental items and compute cost
    let baseCost = 0;
    const rentalItems = [];

    for (const item of validItems) {
      // Hanapin ang price sa database para safe (huwag magtiwala sa price galing sa form)
      const dbItem = await Item.findOne({ name: item.itemType });
      const price = dbItem ? dbItem.pricePerDay : 0;
      const qty = parseInt(item.quantity) || 1;
      const subtotal = qty * price * numberOfDays;
      
      baseCost += subtotal;
      rentalItems.push({
        itemType: item.itemType,
        quantity: qty,
        pricePerDay: price,
        subtotal: subtotal
      });
    }

    // 5. Create Rental Object
    const rental = new Rental({
      customer: req.currentUser._id,
      items: rentalItems,
      rentalStartDate: start,
      rentalEndDate: end,
      numberOfDays,
      deliveryAddress: deliveryAddress || req.currentUser.location,
      baseCost,
      extensionCost: 0,
      totalCost: baseCost,
      notes: notes || '',
      status: 'pending',
      paymentStatus: 'unpaid',
    });

    await rental.save();

    // 6. Notifications & Audit Logs
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).lean();
    const notifDocs = admins.map(a => ({
      recipient: a._id,
      type: 'RENTAL_SUBMITTED',
      title: 'New Rental Request',
      message: `${req.currentUser.fullName} submitted rental ${rental.referenceNumber}.`,
      relatedRental: rental._id,
    }));
    await Notification.insertMany(notifDocs);

    await createAuditLog(req, {
      action: 'RENTAL_CREATE',
      targetCollection: 'Rental',
      targetId: rental._id,
      description: `Customer created rental ${rental.referenceNumber}`,
    });

    req.flash('success', `Rental request ${rental.referenceNumber} submitted! Awaiting admin approval.`);
    res.redirect(`/user/rentals/${rental._id}`);

  } catch (err) {
    console.error('[Create Rental Error]:', err);
    req.flash('error', err.message || 'Could not submit rental request.');
    res.redirect('/user/rentals/new');
  }
});
// ── GET /user/rentals/:rentalId ───────────────────────────────────────────────
router.get('/rentals/:rentalId', isValidId('rentalId'), isRental, isRentalOwner, (req, res) => {
  res.render('user/rental-detail', {
    pageTitle: req.rental.referenceNumber,
    rental:    req.rental,
  });
});

// ── POST /user/rentals/:rentalId/cancel ───────────────────────────────────────
router.post('/rentals/:rentalId/cancel', isValidId('rentalId'), isRental, isRentalOwner, isRentalPending, async (req, res) => {
  try {
    req.rental.status      = 'cancelled';
    req.rental.cancelledAt = new Date();
    req.rental.cancelledBy = req.currentUser._id;
    await req.rental.save();

    // Notify customer
    await Notification.create({
      recipient:     req.currentUser._id,
      type:          'RENTAL_CANCELLED',
      title:         'Rental Cancelled',
      message:       `Your rental ${req.rental.referenceNumber} has been cancelled.`,
      relatedRental: req.rental._id,
    });

    await createAuditLog(req, {
      action:      'RENTAL_CANCEL',
      targetCollection: 'Rental',
      targetId:    req.rental._id,
      description: `Customer cancelled rental ${req.rental.referenceNumber}`,
    });

    req.flash('success', 'Rental cancelled successfully.');
    res.redirect('/user/rentals');
  } catch (err) {
    req.flash('error', 'Could not cancel rental.');
    res.redirect(`/user/rentals/${req.params.rentalId}`);
  }
});

// ── POST /user/rentals/:rentalId/extend ───────────────────────────────────────
router.post('/rentals/:rentalId/extend', isValidId('rentalId'), isRental, isRentalOwner, isRentalActive, async (req, res) => {
  try {
    const additionalDays = parseInt(req.body.additionalDays) || 1;
    const additionalCost = additionalDays * 400; // ₱400 per day

    req.rental.extensions.push({ additionalDays, additionalCost });
    req.rental.extensionCost += additionalCost;
    req.rental.totalCost     += additionalCost;

    // Extend end date
    const newEnd = new Date(req.rental.rentalEndDate);
    newEnd.setDate(newEnd.getDate() + additionalDays);
    req.rental.rentalEndDate = newEnd;
    req.rental.numberOfDays += additionalDays;

    await req.rental.save();

    // Notify admins
    const admins = await User.find({ role: { $in: ['admin','superadmin'] } }).lean();
    await Notification.insertMany(admins.map(a => ({
      recipient:     a._id,
      type:          'RENTAL_EXTENDED',
      title:         'Extension Requested',
      message:       `${req.currentUser.fullName} requested +${additionalDays} day(s) for ${req.rental.referenceNumber}.`,
      relatedRental: req.rental._id,
    })));

    await createAuditLog(req, {
      action:      'RENTAL_EXTEND',
      targetCollection: 'Rental',
      targetId:    req.rental._id,
      description: `Extension of ${additionalDays} day(s) for rental ${req.rental.referenceNumber}`,
    });

    req.flash('success', `Extension of ${additionalDays} day(s) added. Additional cost: ₱${additionalCost.toLocaleString()}.`);
    res.redirect(`/user/rentals/${req.params.rentalId}`);
  } catch (err) {
    req.flash('error', 'Could not process extension.');
    res.redirect(`/user/rentals/${req.params.rentalId}`);
  }
});

// ── GET /user/profile ─────────────────────────────────────────────────────────
router.get('/profile', (req, res) => {
  res.render('user/profile', { pageTitle: 'My Profile' });
});

// ── POST /user/profile ────────────────────────────────────────────────────────
router.post('/profile', uploadProfilePicture, async (req, res) => {
  try {
    const { fullName, username, email, phoneNumber, location } = req.body;

    const updates = { fullName, username: username.toLowerCase(), email: email.toLowerCase(), phoneNumber, location };
    if (req.file) updates.profilePicture = req.file.path;

    await User.findByIdAndUpdate(req.currentUser._id, updates, { runValidators: true });

    await createAuditLog(req, {
      action:      'USER_UPDATE',
      targetCollection: 'User',
      targetId:    req.currentUser._id,
      description: `User "${req.currentUser.username}" updated their profile`,
    });

    req.flash('success', 'Profile updated successfully.');
    res.redirect('/user/profile');
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      req.flash('error', `That ${field} is already in use.`);
    } else {
      req.flash('error', err.message || 'Could not update profile.');
    }
    res.redirect('/user/profile');
  }
});

// ── POST /user/profile/password ───────────────────────────────────────────────
router.post('/profile/password', async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      req.flash('error', 'New passwords do not match.');
      return res.redirect('/user/profile');
    }
    if (newPassword.length < 8) {
      req.flash('error', 'New password must be at least 8 characters.');
      return res.redirect('/user/profile');
    }

    const user = await User.findById(req.currentUser._id).select('+password');
    const ok   = await user.comparePassword(currentPassword);
    if (!ok) {
      req.flash('error', 'Current password is incorrect.');
      return res.redirect('/user/profile');
    }

    user.password = newPassword;
    await user.save();

    await createAuditLog(req, {
      action:      'PASSWORD_CHANGE',
      targetCollection: 'User',
      targetId:    user._id,
      description: `User "${user.username}" changed their password`,
    });

    req.flash('success', 'Password changed successfully.');
    res.redirect('/user/profile');
  } catch (err) {
    req.flash('error', 'Could not change password.');
    res.redirect('/user/profile');
  }
});

module.exports = router;
