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

// Middleware to ensure user is logged in
router.use(isUser);

// ── DASHBOARD ──
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
        req.flash('error', 'Could not load dashboard.');
        res.redirect('/');
    }
});

// ── RENTALS LIST ──
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

// ── NEW RENTAL FORM ──
router.get('/rentals/new', async (req, res) => {
    try {
        const items = await Item.find({ isAvailable: true }).lean();
        res.render('user/new-rental', { pageTitle: 'New Rental Request', items });
    } catch (err) {
        req.flash('error', 'Could not load rental form.');
        res.redirect('/user/rentals');
    }
});

// ── CREATE RENTAL (THE FIX FOR THE "ITEM REQUIRED" ERROR) ──
router.post('/rentals', async (req, res) => {
    try {
        const { rentalStartDate, rentalEndDate, deliveryAddress, notes } = req.body;

        // 1. Capture the arrays from the frontend script
        const rawTypes = [].concat(req.body['itemType[]'] || []);
        const rawQtys  = [].concat(req.body['quantity[]'] || []);
        const rawPrices = [].concat(req.body['pricePerDay[]'] || []);

        if (rawTypes.length === 0) {
            req.flash('error', 'Please select at least one item.');
            return res.redirect('/user/rentals/new');
        }

        const start = new Date(rentalStartDate);
        const end = new Date(rentalEndDate);
        const numberOfDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

        let baseCost = 0;
        const rentalItems = [];

        // 2. Map the data to the Schema requirements
        for (let i = 0; i < rawTypes.length; i++) {
            const qty = parseInt(rawQtys[i]) || 1;
            const price = parseFloat(rawPrices[i]) || 0;
            const subtotal = qty * price * numberOfDays;
            
            baseCost += subtotal;

            rentalItems.push({
                item: rawTypes[i], // This satisfies: "Path item is required"
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
            paymentStatus: 'unpaid'
        });

        await rental.save(); // This should now work!

        // Notify Admin
        const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).lean();
        if (admins.length > 0) {
            const notifs = admins.map(admin => ({
                recipient: admin._id,
                type: 'RENTAL_SUBMITTED',
                title: 'New Rental Request',
                message: `${req.currentUser.fullName} submitted a rental request.`,
                relatedRental: rental._id
            }));
            await Notification.insertMany(notifs);
        }

        req.flash('success', `Rental ${rental.referenceNumber} submitted!`);
        res.redirect(`/user/rentals/${rental._id}`);

    } catch (err) {
        console.error("RENTAL_SUBMIT_ERROR:", err);
        req.flash('error', err.message);
        res.redirect('/user/rentals/new');
    }
});

// ── VIEW RENTAL DETAIL ──
router.get('/rentals/:rentalId', isValidId('rentalId'), isRental, isRentalOwner, (req, res) => {
    res.render('user/rental-detail', {
        pageTitle: req.rental.referenceNumber,
        rental: req.rental
    });
});

// ── PROFILE ──
router.get('/profile', (req, res) => {
    res.render('user/profile', { pageTitle: 'My Profile' });
});

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