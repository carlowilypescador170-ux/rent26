const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        'RENTAL_SUBMITTED',    // Customer submitted a rental request
        'RENTAL_APPROVED',     // Admin approved the rental
        'RENTAL_REJECTED',     // Admin rejected the rental
        'RENTAL_REMINDER',     // Reminder: rental starts tomorrow
        'RENTAL_EXTENDED',     // Extension was approved
        'RENTAL_COMPLETED',    // Rental marked as completed
        'RENTAL_CANCELLED',    // Rental was cancelled
        'PAYMENT_REMINDER',    // Unpaid rental reminder
        'SYSTEM_ANNOUNCEMENT', // Broadcast from admin/superadmin
      ],
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100],
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500],
    },

    // Link to the relevant document
    relatedRental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rental',
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
