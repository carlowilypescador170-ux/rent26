// ─────────────────────────────────────────────────────────────────────────────
// routes/notification.js
// ─────────────────────────────────────────────────────────────────────────────
const express      = require('express');
const router       = express.Router();
const Notification = require('../models/notification');
const { isLoggedIn }      = require('../middleware/isLoggedIn');
const { isNotification }  = require('../middleware/isNotification');
const { isValidId }       = require('../middleware/isValidId');

router.use(isLoggedIn);

// ── GET /notifications ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.session.userId })
      .populate('relatedRental', 'referenceNumber status')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.render('user/notifications', {
      pageTitle: 'Notifications',
      notifications,
    });
  } catch (err) {
    req.flash('error', 'Could not load notifications.');
    res.redirect('back');
  }
});

// ── POST /notifications/:notificationId/read ──────────────────────────────────
router.post('/:notificationId/read', isValidId('notificationId'), isNotification, async (req, res) => {
  try {
    req.notification.isRead = true;
    req.notification.readAt = new Date();
    await req.notification.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// ── POST /notifications/read-all ──────────────────────────────────────────────
router.post('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.session.userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    req.flash('success', 'All notifications marked as read.');
    res.redirect('/notifications');
  } catch (err) {
    req.flash('error', 'Could not mark notifications as read.');
    res.redirect('/notifications');
  }
});

module.exports = router;
