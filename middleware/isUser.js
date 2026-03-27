// ─────────────────────────────────────────────────────────────────────────────
// isUser.js
// Fetches the logged-in User document from MongoDB and attaches it to:
//   - req.currentUser  → for use in controllers
//   - res.locals.currentUser → for use in EJS templates (all views)
//
// Also ensures the account is active (not deactivated/banned).
//
// Usage:
//   const { isUser } = require('../middleware/isUser');
//   router.use(isUser);           // global — apply in index.js
//   router.get('/profile', isUser, profileController);
// ─────────────────────────────────────────────────────────────────────────────

const User = require('../models/user');

// ─── Attach current user to every request (non-blocking) ─────────────────────
// Use this globally in index.js so EJS always has access to currentUser.
const attachUser = async (req, res, next) => {
  res.locals.currentUser = null;

  if (!req.session || !req.session.userId) return next();

  try {
    const user = await User.findById(req.session.userId).lean();
    if (user) {
      res.locals.currentUser = user;
      req.currentUser = user;
    } else {
      // Session references a deleted user — destroy it
      req.session.destroy();
    }
  } catch (err) {
    console.error('[attachUser] Error fetching user:', err.message);
  }
  next();
};

// ─── Guard: Must be a logged-in, active customer (role: "user") ───────────────
const isUser = async (req, res, next) => {
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
      req.flash('error', 'Your account has been deactivated. Contact support.');
      return res.redirect('/auth/login');
    }

    if (user.role !== 'user') {
      req.flash('error', 'Access denied. This area is for customers only.');
      return res.redirect('/');
    }

    req.currentUser = user;
    res.locals.currentUser = user.toSafeObject();
    next();
  } catch (err) {
    console.error('[isUser] Error:', err.message);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/auth/login');
  }
};

module.exports = { isUser, attachUser };
