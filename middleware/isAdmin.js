// ─────────────────────────────────────────────────────────────────────────────
// isAdmin.js
// Guards routes that require admin OR superadmin access.
// Fetches the User document and validates role before proceeding.
//
// Usage:
//   const { isAdmin } = require('../middleware/isAdmin');
//   router.get('/admin/rentals', isAdmin, rentalListController);
// ─────────────────────────────────────────────────────────────────────────────

const User = require('../models/user');

const isAdmin = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.flash('error', 'Please log in to access the admin panel.');
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
      req.flash('error', 'Your admin account has been deactivated.');
      return res.redirect('/auth/login');
    }

    // Both 'admin' and 'superadmin' can access admin routes
    if (!['admin', 'superadmin'].includes(user.role)) {
      req.flash('error', 'Access denied. Admins only.');
      return res.redirect('/');
    }

    req.currentUser = user;
    res.locals.currentUser = user.toSafeObject();
    next();
  } catch (err) {
    console.error('[isAdmin] Error:', err.message);
    req.flash('error', 'Server error. Please try again.');
    res.redirect('/');
  }
};

module.exports = { isAdmin };
