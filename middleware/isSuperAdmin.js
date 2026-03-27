// ─────────────────────────────────────────────────────────────────────────────
// isSuperAdmin.js
// Guards routes that are EXCLUSIVELY for the superadmin.
// Used for: audit logs, user role management, system-wide settings.
//
// Usage:
//   const { isSuperAdmin } = require('../middleware/isSuperAdmin');
//   router.get('/superadmin/audit', isSuperAdmin, auditLogController);
// ─────────────────────────────────────────────────────────────────────────────

const User = require('../models/user');

const isSuperAdmin = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.flash('error', 'Please log in to continue.');
    return res.redirect('/auth/login');
  }

  try {
    const user = await User.findById(req.session.userId);

    if (!user) {
      req.session.destroy();
      req.flash('error', 'Account not found.');
      return res.redirect('/auth/login');
    }

    if (!user.isActive) {
      req.session.destroy();
      req.flash('error', 'This account has been deactivated.');
      return res.redirect('/auth/login');
    }

    if (user.role !== 'superadmin') {
      req.flash('error', 'Access denied. Super Admins only.');
      // Redirect admin back to their dashboard, users to home
      if (user.role === 'admin') return res.redirect('/admin/dashboard');
      return res.redirect('/');
    }

    req.currentUser = user;
    res.locals.currentUser = user.toSafeObject();
    next();
  } catch (err) {
    console.error('[isSuperAdmin] Error:', err.message);
    req.flash('error', 'Server error. Please try again.');
    res.redirect('/');
  }
};

module.exports = { isSuperAdmin };
