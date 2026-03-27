// ─────────────────────────────────────────────────────────────────────────────
// isAuditLog.js
// Fetches an AuditLog document by :logId from route params.
// ONLY accessible by superadmin (combine with isSuperAdmin).
//
// Also exports a logging helper: createAuditLog() — call this from controllers
// after any significant action to record it automatically.
//
// Usage:
//   const { isAuditLog, createAuditLog } = require('../middleware/isAuditLog');
//
//   // View a specific log entry
//   router.get('/superadmin/audit/:logId', isSuperAdmin, isAuditLog, auditDetailController);
//
//   // In a controller, after approving a rental:
//   await createAuditLog(req, {
//     action: 'RENTAL_APPROVE',
//     targetCollection: 'Rental',
//     targetId: rental._id,
//     description: `Admin approved rental ${rental.referenceNumber}`,
//     changes: { before: { status: 'pending' }, after: { status: 'approved' } }
//   });
// ─────────────────────────────────────────────────────────────────────────────

const AuditLog = require('../models/auditLog');
const mongoose = require('mongoose');

// ─── Core: Fetch a single audit log entry ────────────────────────────────────
const isAuditLog = async (req, res, next) => {
  const { logId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    req.flash('error', 'Invalid audit log ID.');
    return res.redirect('/superadmin/audit');
  }

  try {
    const log = await AuditLog.findById(logId)
      .populate('performedBy', 'fullName username email role');

    if (!log) {
      req.flash('error', 'Audit log entry not found.');
      return res.redirect('/superadmin/audit');
    }

    req.auditLog = log;
    res.locals.auditLog = log;
    next();
  } catch (err) {
    console.error('[isAuditLog] Error:', err.message);
    req.flash('error', 'Error fetching audit log.');
    res.redirect('/superadmin/audit');
  }
};

// ─── Helper: Create an audit log entry from a controller ─────────────────────
// Returns the saved AuditLog document (or null on failure — never throws).
const createAuditLog = async (req, { action, targetCollection, targetId, description, changes, status = 'success', errorMessage = null }) => {
  try {
    if (!req.currentUser) return null;

    const log = new AuditLog({
      performedBy:      req.currentUser._id,
      role:             req.currentUser.role,
      action,
      targetCollection: targetCollection || null,
      targetId:         targetId || null,
      description:      description || '',
      changes:          changes || { before: null, after: null },
      ipAddress:        req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent:        req.headers['user-agent'] || 'unknown',
      status,
      errorMessage,
    });

    await log.save();
    return log;
  } catch (err) {
    // Audit logging should NEVER crash the app — log and continue
    console.error('[createAuditLog] Failed to write audit log:', err.message);
    return null;
  }
};

module.exports = { isAuditLog, createAuditLog };
