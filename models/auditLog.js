const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    // Who performed the action
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      required: true,
    },

    // What action was taken
    action: {
      type: String,
      required: true,
      enum: [
        // Auth
        'USER_REGISTER',
        'USER_LOGIN',
        'USER_LOGOUT',
        'PASSWORD_CHANGE',
        'PASSWORD_RESET',
        // Rental
        'RENTAL_CREATE',
        'RENTAL_APPROVE',
        'RENTAL_REJECT',
        'RENTAL_CANCEL',
        'RENTAL_COMPLETE',
        'RENTAL_EXTEND',
        // Items
        'ITEM_CREATE',
        'ITEM_UPDATE',
        'ITEM_DELETE',
        // User management
        'USER_UPDATE',
        'USER_DEACTIVATE',
        'USER_ROLE_CHANGE',
        // Admin
        'ADMIN_ACTION',
      ],
    },

    // What collection/document was affected
    targetCollection: {
      type: String,
      trim: true, // e.g. 'Rental', 'User', 'Item'
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Human-readable description
    description: {
      type: String,
      trim: true,
      maxlength: [500],
    },

    // Snapshot of changes (before/after)
    changes: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Request metadata
    ipAddress: {
      type: String,
      trim: true,
    },

    userAgent: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
    },

    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes for efficient superadmin queries ─────────────────────────────────
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetCollection: 1, targetId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
