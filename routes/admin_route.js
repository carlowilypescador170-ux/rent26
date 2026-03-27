// ─────────────────────────────────────────────────────────────────────────────
// routes/admin.js  —  Admin panel routes
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const User     = require('../models/user');
const Rental   = require('../models/rental');
const Item     = require('../models/item');
const Notification = require('../models/notification');
const { isAdmin }  = require('../middleware/isAdmin');
const { isRental } = require('../middleware/isRental');
const { isItem }   = require('../middleware/isItem');
const { isValidId }  = require('../middleware/isValidId');
const { uploadItemImages } = require('../middleware/isUpload');
const { createAuditLog }   = require('../middleware/isAuditLog');

router.use(isAdmin);

// ── GET /admin/dashboard ──────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [allRentals, totalUsers, totalItems, pendingRentals, recentRentals] = await Promise.all([
      Rental.find().lean(),
      User.countDocuments({ role: 'user' }),
      Item.countDocuments(),
      Rental.find({ status: 'pending' })
        .populate('customer', 'fullName username phoneNumber')
        .sort({ createdAt: 1 })
        .limit(10)
        .lean(),
      Rental.find()
        .populate('customer', 'fullName username')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const stats = {
      totalUsers,
      totalItems,
      pending:       allRentals.filter(r => r.status === 'pending').length,
      approved:      allRentals.filter(r => r.status === 'approved').length,
      active:        allRentals.filter(r => r.status === 'active').length,
      completed:     allRentals.filter(r => r.status === 'completed').length,
      cancelled:     allRentals.filter(r => r.status === 'cancelled').length,
      totalRevenue:  allRentals.filter(r => r.status === 'completed').reduce((s,r) => s + r.totalCost, 0),
    };

    res.render('admin/dashboard', { pageTitle: 'Admin Dashboard', stats, pendingRentals, recentRentals });
  } catch (err) {
    console.error('[Admin Dashboard]', err.message);
    req.flash('error', 'Could not load dashboard.');
    res.redirect('/');
  }
});

// ── GET /admin/rentals ────────────────────────────────────────────────────────
router.get('/rentals', async (req, res) => {
  try {
    const { status, search, payment, page = 1 } = req.query;
    const limit = 15;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (status)  filter.status        = status;
    if (payment) filter.paymentStatus = payment;
    if (search) {
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
        ],
      }).select('_id').lean();
      filter.$or = [
        { referenceNumber: { $regex: search, $options: 'i' } },
        { customer: { $in: users.map(u => u._id) } },
      ];
    }

    const [rentals, total] = await Promise.all([
      Rental.find(filter)
        .populate('customer', 'fullName username phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit).lean(),
      Rental.countDocuments(filter),
    ]);

    res.render('admin/rentals', {
      pageTitle:      'Manage Rentals',
      rentals,
      currentStatus:  status || '',
      currentPayment: payment || '',
      search:         search || '',
      currentPage:    parseInt(page),
      totalPages:     Math.ceil(total / limit),
    });
  } catch (err) {
    req.flash('error', 'Could not load rentals.');
    res.redirect('/admin/dashboard');
  }
});

// ── GET /admin/rentals/:rentalId ──────────────────────────────────────────────
router.get('/rentals/:rentalId', isValidId('rentalId'), isRental, (req, res) => {
  res.render('admin/rental-detail', { pageTitle: req.rental.referenceNumber, rental: req.rental });
});

// ── POST /admin/rentals/:rentalId/approve ─────────────────────────────────────
router.post('/rentals/:rentalId/approve', isValidId('rentalId'), isRental, async (req, res) => {
  try {
    req.rental.status     = 'approved';
    req.rental.approvedBy = req.currentUser._id;
    req.rental.approvedAt = new Date();
    await req.rental.save();

    await Notification.create({
      recipient:     req.rental.customer._id || req.rental.customer,
      type:          'RENTAL_APPROVED',
      title:         'Rental Approved! 🎉',
      message:       `Your rental ${req.rental.referenceNumber} has been approved. Get ready for your event!`,
      relatedRental: req.rental._id,
    });

    await createAuditLog(req, {
      action:      'RENTAL_APPROVE',
      targetCollection: 'Rental',
      targetId:    req.rental._id,
      description: `Admin approved rental ${req.rental.referenceNumber}`,
      changes:     { before: { status: 'pending' }, after: { status: 'approved' } },
    });

    req.flash('success', `Rental ${req.rental.referenceNumber} approved.`);
    res.redirect('/admin/rentals');
  } catch (err) {
    req.flash('error', 'Could not approve rental.');
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  }
});

// ── POST /admin/rentals/:rentalId/reject ──────────────────────────────────────
router.post('/rentals/:rentalId/reject', isValidId('rentalId'), isRental, async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      req.flash('error', 'Please provide a reason for rejection.');
      return res.redirect(`/admin/rentals/${req.params.rentalId}`);
    }

    req.rental.status          = 'rejected';
    req.rental.rejectionReason = rejectionReason.trim();
    await req.rental.save();

    await Notification.create({
      recipient:     req.rental.customer._id || req.rental.customer,
      type:          'RENTAL_REJECTED',
      title:         'Rental Request Rejected',
      message:       `Your rental ${req.rental.referenceNumber} was rejected. Reason: ${rejectionReason}`,
      relatedRental: req.rental._id,
    });

    await createAuditLog(req, {
      action:      'RENTAL_REJECT',
      targetCollection: 'Rental',
      targetId:    req.rental._id,
      description: `Admin rejected rental ${req.rental.referenceNumber}: ${rejectionReason}`,
    });

    req.flash('success', `Rental ${req.rental.referenceNumber} rejected.`);
    res.redirect('/admin/rentals');
  } catch (err) {
    req.flash('error', 'Could not reject rental.');
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  }
});

// ── POST /admin/rentals/:rentalId/activate ────────────────────────────────────
router.post('/rentals/:rentalId/activate', isValidId('rentalId'), isRental, async (req, res) => {
  try {
    req.rental.status = 'active';
    await req.rental.save();
    req.flash('success', `Rental ${req.rental.referenceNumber} marked as active.`);
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  } catch (err) {
    req.flash('error', 'Could not activate rental.');
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  }
});

// ── POST /admin/rentals/:rentalId/complete ────────────────────────────────────
router.post('/rentals/:rentalId/complete', isValidId('rentalId'), isRental, async (req, res) => {
  try {
    req.rental.status = 'completed';
    await req.rental.save();

    await Notification.create({
      recipient:     req.rental.customer._id || req.rental.customer,
      type:          'RENTAL_COMPLETED',
      title:         'Rental Completed',
      message:       `Your rental ${req.rental.referenceNumber} is now marked as completed. Thank you!`,
      relatedRental: req.rental._id,
    });

    await createAuditLog(req, {
      action:      'RENTAL_COMPLETE',
      targetCollection: 'Rental',
      targetId:    req.rental._id,
      description: `Rental ${req.rental.referenceNumber} marked completed`,
    });

    req.flash('success', `Rental ${req.rental.referenceNumber} completed.`);
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  } catch (err) {
    req.flash('error', 'Could not complete rental.');
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  }
});

// ── POST /admin/rentals/:rentalId/payment ─────────────────────────────────────
router.post('/rentals/:rentalId/payment', isValidId('rentalId'), isRental, async (req, res) => {
  try {
    const { paymentStatus, paymentMethod } = req.body;
    req.rental.paymentStatus = paymentStatus;
    if (paymentMethod) req.rental.paymentMethod = paymentMethod;
    await req.rental.save();
    req.flash('success', 'Payment status updated.');
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  } catch (err) {
    req.flash('error', 'Could not update payment.');
    res.redirect(`/admin/rentals/${req.params.rentalId}`);
  }
});

// ── GET /admin/items ──────────────────────────────────────────────────────────
router.get('/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ name: 1 }).lean();
    res.render('admin/items', { pageTitle: 'Manage Items', items });
  } catch (err) {
    req.flash('error', 'Could not load items.');
    res.redirect('/admin/dashboard');
  }
});

// ── GET /admin/items/new ──────────────────────────────────────────────────────
router.get('/items/new', (req, res) => {
  res.render('admin/item-form', { pageTitle: 'Add New Item' });
});

// ── POST /admin/items ─────────────────────────────────────────────────────────
router.post('/items', uploadItemImages, async (req, res) => {
  try {
    const { name, displayName, pricePerDay, quantity, unit, description, notes } = req.body;
    const images = req.files ? req.files.map(f => f.path) : [];

    const item = new Item({
      name, displayName,
      pricePerDay: parseFloat(pricePerDay),
      quantity:    parseInt(quantity) || 1,
      availableQuantity: parseInt(quantity) || 1,
      unit:        unit || 'piece',
      description, notes, images,
    });

    await item.save();

    await createAuditLog(req, {
      action:      'ITEM_CREATE',
      targetCollection: 'Item',
      targetId:    item._id,
      description: `Item "${item.displayName}" created`,
    });

    req.flash('success', `Item "${item.displayName}" added successfully.`);
    res.redirect('/admin/items');
  } catch (err) {
    req.flash('error', err.message || 'Could not add item.');
    res.redirect('/admin/items/new');
  }
});

// ── GET /admin/items/:itemId/edit ─────────────────────────────────────────────
router.get('/items/:itemId/edit', isValidId('itemId'), isItem, (req, res) => {
  res.render('admin/item-form', { pageTitle: 'Edit Item', item: req.item });
});

 router.post('/delete/:itemId', isValidId('itemId'), isItem, async (req, res) => {
   await req.item.deleteOne();
  console.log(`[ITEM DELETE] Admin deleted item "${req.item.displayName}" (ID: ${req.item._id})`);
  req.flash('success', `Item "${req.item.displayName}" deleted.`);
  res.json({ success: true });
});
// ── POST /admin/items/:itemId (PUT override) ──────────────────────────────────
router.post('/items/:itemId', isValidId('itemId'), isItem, uploadItemImages, async (req, res) => {
  try {
    const { name, displayName, pricePerDay, quantity, unit, description, notes, isAvailable } = req.body;
    const updates = {
      name, displayName,
      pricePerDay:       parseFloat(pricePerDay),
      quantity:          parseInt(quantity) || 1,
      unit:              unit || 'piece',
      description, notes,
      isAvailable:       isAvailable === 'on',
    };

    if (req.files && req.files.length > 0) {
      updates.images = req.files.map(f => f.path);
    }

    await Item.findByIdAndUpdate(req.params.itemId, updates, { runValidators: true });

    await createAuditLog(req, {
      action:      'ITEM_UPDATE',
      targetCollection: 'Item',
      targetId:    req.params.itemId,
      description: `Item "${displayName}" updated`,
    });

    req.flash('success', `Item "${displayName}" updated.`);
    res.redirect('/admin/items');
  } catch (err) {
    req.flash('error', err.message || 'Could not update item.');
    res.redirect(`/admin/items/${req.params.itemId}/edit`);
  }
});

// ── POST /admin/items/:itemId/toggle ─────────────────────────────────────────
router.post('/items/:itemId/toggle', isValidId('itemId'), isItem, async (req, res) => {
  try {
    req.item.isAvailable = !req.item.isAvailable;
    await req.item.save();
    req.flash('success', `Item "${req.item.displayName}" is now ${req.item.isAvailable ? 'available' : 'unavailable'}.`);
    res.redirect('/admin/items');
  } catch (err) {
    req.flash('error', 'Could not toggle item.');
    res.redirect('/admin/items');
  }
});

// ── GET /admin/users ──────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { search, status, page = 1 } = req.query;
    const limit = 15;
    const skip  = (page - 1) * limit;

    const filter = { role: 'user' };
    if (status === 'active')   filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (search) {
      filter.$or = [
        { fullName:    { $regex: search, $options: 'i' } },
        { username:    { $regex: search, $options: 'i' } },
        { email:       { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    // Attach rental count to each user
    const userIds = users.map(u => u._id);
    const rentalCounts = await Rental.aggregate([
      { $match: { customer: { $in: userIds } } },
      { $group: { _id: '$customer', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    rentalCounts.forEach(r => { countMap[r._id.toString()] = r.count; });
    users.forEach(u => { u.rentalCount = countMap[u._id.toString()] || 0; });

    res.render('admin/users', {
      pageTitle:     'Customer Accounts',
      users,
      search:        search || '',
      currentStatus: status || '',
      currentPage:   parseInt(page),
      totalPages:    Math.ceil(total / limit),
    });
  } catch (err) {
    req.flash('error', 'Could not load users.');
    res.redirect('/admin/dashboard');
  }
});

// ── POST /admin/users/:userId/toggle ─────────────────────────────────────────
router.post('/users/:userId/toggle', isValidId('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) { req.flash('error', 'User not found.'); return res.redirect('/admin/users'); }
    user.isActive = !user.isActive;
    await user.save();

    await createAuditLog(req, {
      action:      'USER_DEACTIVATE',
      targetCollection: 'User',
      targetId:    user._id,
      description: `Admin ${user.isActive ? 'reactivated' : 'deactivated'} user "${user.username}"`,
    });

    req.flash('success', `User "${user.fullName}" ${user.isActive ? 'reactivated' : 'deactivated'}.`);
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', 'Could not toggle user.');
    res.redirect('/admin/users');
  }
});

module.exports = router;
