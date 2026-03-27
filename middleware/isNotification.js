// ─────────────────────────────────────────────────────────────────────────────
// isNotification.js
// Fetches a Notification document by :notificationId from route params.
// Verifies the logged-in user is the intended recipient.
//
// Usage:
//   const { isNotification } = require('../middleware/isNotification');
//   router.patch('/notifications/:notificationId/read', isUser, isNotification, markReadController);
// ─────────────────────────────────────────────────────────────────────────────

const Notification = require('../models/notification');
const mongoose = require('mongoose');

// ─── Core: Fetch notification + verify ownership ─────────────────────────────
const isNotification = async (req, res, next) => {
  const { notificationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    req.flash('error', 'Invalid notification ID.');
    return res.redirect('back');
  }

  try {
    const notification = await Notification.findById(notificationId)
      .populate('relatedRental', 'referenceNumber status rentalStartDate rentalEndDate');

    if (!notification) {
      req.flash('error', 'Notification not found.');
      return res.redirect('back');
    }

    // Verify the recipient is the current user
    if (notification.recipient.toString() !== req.currentUser._id.toString()) {
      req.flash('error', 'You do not have access to this notification.');
      return res.redirect('back');
    }

    req.notification = notification;
    res.locals.notification = notification;
    next();
  } catch (err) {
    console.error('[isNotification] Error:', err.message);
    req.flash('error', 'Error fetching notification.');
    res.redirect('back');
  }
};

// ─── Guard: Notification must be unread ──────────────────────────────────────
const isUnreadNotification = (req, res, next) => {
  if (req.notification.isRead) {
    // Not an error — just silently pass through
    return next();
  }
  next();
};

// ─── Helper: Fetch unread count for the current user (for nav badge) ─────────
// Use as middleware on any page that shows a notification bell icon.
const attachUnreadCount = async (req, res, next) => {
  res.locals.unreadNotificationCount = 0;

  if (!req.session || !req.session.userId) return next();

  try {
    const count = await Notification.countDocuments({
      recipient: req.session.userId,
      isRead: false,
    });
    res.locals.unreadNotificationCount = count;
  } catch (err) {
    console.error('[attachUnreadCount] Error:', err.message);
  }
  next();
};

module.exports = { isNotification, isUnreadNotification, attachUnreadCount };
