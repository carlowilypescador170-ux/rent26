// ─────────────────────────────────────────────────────────────────────────────
// routes/auth.js  —  Register · Login · Logout
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const User     = require('../models/user');
const { isNotLoggedIn } = require('../middleware/isLoggedIn');
const { createAuditLog } = require('../middleware/isAuditLog');

// ── GET /auth/login ───────────────────────────────────────────────────────────
router.get('/login', isNotLoggedIn, (req, res) => {
  res.render('auth/login', { pageTitle: 'Login' });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', isNotLoggedIn, async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    req.flash('error', 'Please provide your username/email and password.');
    return res.redirect('/auth/login');
  }

  try {
    // Accept both username and email
    const user = await User.findOne({
      $or: [
        { email:    login.toLowerCase().trim() },
        { username: login.toLowerCase().trim() },
      ],
    }).select('+password');

    if (!user) {
      req.flash('error', 'Invalid credentials. Please try again.');
      return res.redirect('/auth/login');
    }

    if (!user.isActive) {
      req.flash('error', 'Your account has been deactivated. Please contact support.');
      return res.redirect('/auth/login');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      req.flash('error', 'Invalid credentials. Please try again.');
      return res.redirect('/auth/login');
    }

    // Save session
    req.session.userId = user._id.toString();
    req.session.role   = user.role;

    // Update last login
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    // Audit log
    req.currentUser = user;
    await createAuditLog(req, {
      action:      'USER_LOGIN',
      targetCollection: 'User',
      targetId:    user._id,
      description: `${user.role} "${user.username}" logged in`,
    });

    req.flash('success', `Welcome back, ${user.fullName.split(' ')[0]}!`);

    // Redirect by role
    if (user.role === 'superadmin') return res.redirect('/superadmin/dashboard');
    if (user.role === 'admin')      return res.redirect('/admin/dashboard');
    return res.redirect('/user/dashboard');

  } catch (err) {
    console.error('[Login Error]', err.message);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/auth/login');
  }
});

// ── GET /auth/register ────────────────────────────────────────────────────────
router.get('/register', isNotLoggedIn, (req, res) => {
  res.render('auth/register', { pageTitle: 'Register' });
});

// ── POST /auth/register ───────────────────────────────────────────────────────
router.post('/register', isNotLoggedIn, async (req, res) => {
  const { fullName, username, email, password, confirmPassword, phoneNumber, location } = req.body;

  // Basic validation
  const errors = [];
  if (!fullName || fullName.trim().length < 3) errors.push('Full name must be at least 3 characters.');
  if (!username || username.trim().length < 3)  errors.push('Username must be at least 3 characters.');
  if (!email)                                   errors.push('Email is required.');
  if (!phoneNumber)                             errors.push('Phone number is required.');
  if (!location)                                errors.push('Location is required.');
  if (!password || password.length < 8)         errors.push('Password must be at least 8 characters.');
  if (password !== confirmPassword)             errors.push('Passwords do not match.');

  if (errors.length > 0) {
    errors.forEach(e => req.flash('error', e));
    return res.redirect('/auth/register');
  }

  try {
    // Check duplicates
    const exists = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
    });

    if (exists) {
      const field = exists.email === email.toLowerCase() ? 'email' : 'username';
      req.flash('error', `That ${field} is already registered. Please use another.`);
      return res.redirect('/auth/register');
    }

    const newUser = new User({
      fullName:    fullName.trim(),
      username:    username.trim().toLowerCase(),
      email:       email.trim().toLowerCase(),
      password,
      phoneNumber: phoneNumber.trim(),
      location:    location.trim(),
      role:        'user',
    });

    await newUser.save();

    // Auto login after register
    req.session.userId = newUser._id.toString();
    req.session.role   = 'user';

    req.currentUser = newUser;
    await createAuditLog(req, {
      action:      'USER_REGISTER',
      targetCollection: 'User',
      targetId:    newUser._id,
      description: `New customer registered: "${newUser.username}"`,
    });

    req.flash('success', `Welcome to J&M Rentals, ${newUser.fullName.split(' ')[0]}! Your account is ready.`);
    res.redirect('/user/dashboard');

  } catch (err) {
    if (err.name === 'ValidationError') {
      Object.values(err.errors).forEach(e => req.flash('error', e.message));
      return res.redirect('/auth/register');
    }
    console.error('[Register Error]', err.message);
    req.flash('error', 'Registration failed. Please try again.');
    res.redirect('/auth/register');
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    if (req.session && req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user) {
        req.currentUser = user;
        await createAuditLog(req, {
          action:      'USER_LOGOUT',
          targetCollection: 'User',
          targetId:    user._id,
          description: `"${user.username}" logged out`,
        });
      }
    }
  } catch (_) { /* audit failure should not block logout */ }

  req.session.destroy((err) => {
    if (err) console.error('[Logout Error]', err.message);
    res.clearCookie('jmr.sid');
    res.redirect('/auth/login');
  });
});

module.exports = router;
