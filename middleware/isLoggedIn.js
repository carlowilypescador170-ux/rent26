// ─────────────────────────────────────────────────────────────────────────────
// isLoggedIn.js
// Verifies that a user has an active session.
// Attach to ANY route that requires authentication.
//
// Usage:
//   const { isLoggedIn } = require('../middleware/isLoggedIn');
//   router.get('/dashboard', isLoggedIn, dashboardController);
// ─────────────────────────────────────────────────────────────────────────────

const isLoggedIn = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.flash('error', 'You must be logged in to access that page.');
    return res.redirect('/auth/login');
  }
  next();
};

// ─── Redirect away from login/register if already logged in ──────────────────
const isNotLoggedIn = (req, res, next) => {
  if (req.session && req.session.userId) {
    // Redirect based on role stored in session
    const role = req.session.role || 'user';
    if (role === 'superadmin') return res.redirect('/superadmin/dashboard');
    if (role === 'admin')      return res.redirect('/admin/dashboard');
    return res.redirect('/user/dashboard');
  }
  next();
};

module.exports = { isLoggedIn, isNotLoggedIn };
