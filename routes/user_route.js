// ─────────────────────────────────────────────────────────────────────────────
// routes/user.js — Customer-facing routes (FINAL CLEAN VERSION)
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Rental = require('../models/rental');
const Item = require('../models/item');
const Notification = require('../models/notification');
const { isUser } = require('../middleware/isUser');
const { isRental, isRentalOwner, isRentalActive } = require('../middleware/isRental');
const { isValidId } = require('../middleware/isValidId');
const { uploadProfilePicture } = require('../middleware/isUpload');
const { createAuditLog } = require('../middleware/isAuditLog');

// All routes here require logged-in customer
router.use(isUser);

// ── GET /user/dashboard ───────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.currentUser._id;
        const [recentRentals, notifications, allRentals] = await Promise.all([
            Rental.find({ customer: userId }).sort({ createdAt: -1 }).limit(5).lean(),
            Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(6).lean(),
            Rental.find({ customer: userId }).lean(),
        ]);

        const stats = {
            total: allRentals.length,
            pending: allRentals.filter(r => r.status === 'pending').length,
            active: allRentals.filter(r => ['approved', 'active'].includes(r.status)).length,
            totalSpent: allRentals.reduce((sum, r) => sum + (r.totalCost || 0), 0),
        };

        res.render('user/dashboard', { pageTitle: 'My Dashboard', recentRentals, notifications, stats });
    } catch (err) {
        console.error('[User Dashboard]', err.message);
        req.flash('error', 'Could not load dashboard.');
        res.redirect('/');
    }
});

// ── GET /user/rentals ─────────────────────────────────────────────────────────
router.get('/rentals', async (req, res) => {
    try {
        const { status, page = 1 } = req.query;
        const limit = 10;
        const skip = (page - 1) * limit;
        const filter = { customer: req.currentUser._id };
        if (status && status !== 'all') filter.status = status;

        const [rentals, total] = await Promise.all([
            Rental.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Rental.countDocuments(filter),
        ]);

        res.render('user/rentals', {
            pageTitle: 'My Rentals',
            rentals,
            currentStatus: status || 'all',
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
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

// ── POST /user/rentals (THE ONLY RENTAL POST ROUTE) ───────────────────────────
router.post('/rentals', async (req, res) => {
    try {
        const { rentalStartDate, rentalEndDate, deliveryAddress, notes } = req.body;

        // Collect arrays from form
        const rawTypes = [].concat(req.body['itemType[]'] || []);
        const rawQtys  = [].concat(req.body['quantity[]'] || []);
        const rawPrices = [].concat(req.body['pricePerDay[]'] || []);

        if (rawTypes.length === 0) {
            req.flash('error', 'Please select at least one item.');
            return res.redirect('/user/rentals/new');
        }

        const start = new Date(rentalStartDate);
        const end = new Date(rentalEndDate);
        if (isNaN(start) || isNaN(end) || end < start) {
            req.flash('error', 'Invalid dates. End date must be on or after start date.');
            return res.redirect('/user/rentals/new');
        }

        const numberOfDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

        let baseCost = 0;
        const rentalItems = [];

        for (let i = 0; i < rawTypes.length; i++) {
            const qty = parseInt(rawQtys[i]) || 1;
            const price = parseFloat(rawPrices[i]) || 0;
            const subtotal = qty * price * numberOfDays;
            baseCost += subtotal;

            rentalItems.push({
                item: rawTypes[i], // Matching Database Schema 'item' path
                quantity: qty,
                pricePerDay: price,
                subtotal: subtotal
            });
        }

        const rental = new Rental({
            customer: req.currentUser._id,
            items: rentalItems,
            rentalStartDate: start,
            rentalEndDate: end,
            numberOfDays,
            deliveryAddress: deliveryAddress || req.currentUser.location,
            baseCost,
            totalCost: baseCost,
            notes: notes || '',
            status: 'pending',
            paymentStatus: 'unpaid',
        });

        await rental.save();

        // Notifications & Audit Log
        try {
            const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).lean();
            const notifDocs = admins.map(a => ({
                recipient: a._id,
                type: 'RENTAL_SUBMITTED',
                title: 'New Rental Request',
                message: `${req.currentUser.fullName} submitted rental ${rental.referenceNumber}.`,
                relatedRental: rental._id,
            }));
            await Notification.insertMany(notifDocs);
        } catch (e) { console.error('Notification Error bypassed'); }

        await createAuditLog(req, {
            action: 'RENTAL_CREATE',
            targetCollection: 'Rental',
            targetId: rental._id,
            description: `Customer created rental ${rental.referenceNumber}`,
        });

        req.flash('success', `Rental request ${rental.referenceNumber} submitted!`);
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
        rental: req.rental,
    });
});

// ── POST /user/rentals/:rentalId/extend ───────────────────────────────────────
router.post('/rentals/:rentalId/extend', isValidId('rentalId'), isRental, isRentalOwner, isRentalActive, async (req, res) => {
    try {
        const additionalDays = parseInt(req.body.additionalDays) || 1;
        const additionalCost = additionalDays * 400; // Fixed extension rate or based on item

        req.rental.extensions.push({ additionalDays, additionalCost });
        req.rental.extensionCost += additionalCost;
        req.rental.totalCost += additionalCost;

        const newEnd = new Date(req.rental.rentalEndDate);
        newEnd.setDate(newEnd.getDate() + additionalDays);
        req.rental.rentalEndDate = newEnd;
        req.rental.numberOfDays += additionalDays;

        await req.rental.save();

        req.flash('success', `Extension of ${additionalDays} day(s) added.`);
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
        req.flash('success', 'Profile updated successfully.');
        res.redirect('/user/profile');
    } catch (err) {
        req.flash('error', err.message || 'Could not update profile.');
        res.redirect('/user/profile');
    }
});

module.exports = router;