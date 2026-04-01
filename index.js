// ─────────────────────────────────────────────────────────────────────────────
// index.js  —  J&M Rentals — Main Server
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();

const requiredEnv = ['MONGO_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
requiredEnv.forEach((key) => {
  if (!process.env[key]) { console.error(`[FATAL] Missing env: ${key}`) }
});

const cors     = require('cors');
const express  = require('express');
const path     = require('path');
const mongoose = require('mongoose');
const ejsMate  = require('ejs-mate');
const session  = require('express-session');
const flash    = require('connect-flash');
const helmet   = require('helmet');
const morgan   = require('morgan');

const { attachUser }        = require('./middleware/isUser');
const { attachUnreadCount } = require('./middleware/isNotification');

const authRoutes         = require('./routes/auth');
const userRoutes         = require('./routes/user_route');
const adminRoutes        = require('./routes/admin_route');
const superAdminRoutes   = require('./routes/superAdmin');
const notificationRoutes = require('./routes/notification_route');

const app    = express();
const PORT   = process.env.PORT || 10000;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());

// ── DATABASE ──────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('[DB] MongoDB connected successfully'))
  .catch((err) => { console.error('[DB] Error:', err.message) });

mongoose.connection.on('disconnected', () => console.warn('[DB] MongoDB disconnected'));

// ── VIEW ENGINE ───────────────────────────────────────────────────────────────
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── SECURITY ──────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
   directives: {
  defaultSrc:    ["'self'"],
  scriptSrc:     ["'self'", "'unsafe-inline'", "'unsafe-hashes'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
  scriptSrcAttr: ["'unsafe-inline'"],
  styleSrc:      ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.jsdelivr.net'],
  fontSrc:       ["'self'", 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'data:'],
  imgSrc:        ["'self'", 'data:', 'res.cloudinary.com'],
  connectSrc:    ["'self'", 'cdn.jsdelivr.net'],
},
  },
  frameguard: { action: 'sameorigin' },
}));


// ── LOGGING & PARSING ─────────────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SESSION — simple memory store, no connect-mongo needed ───────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'jmr-fallback-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    maxAge:   1000 * 60 * 60 * 24 * 7, // 7 days
  },
  name: 'jmr.sid',
}));

// ── FLASH & LOCALS ────────────────────────────────────────────────────────────
app.use(flash());
app.use(attachUser);
app.use(attachUnreadCount);

app.use((req, res, next) => {
  res.locals.success     = req.flash('success');
  res.locals.error       = req.flash('error');
  res.locals.info        = req.flash('info');
  res.locals.appName     = 'J&M Rentals';
  res.locals.currentPath = req.path;  // ✅ this fixes "currentPath is not defined"
  next();
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/auth',          authRoutes);
app.use('/user',          userRoutes);
app.use('/admin',         adminRoutes);
app.use('/superadmin',    superAdminRoutes);
app.use('/notifications', notificationRoutes);

app.get('/', (req, res) => {
  res.render('home/index', { pageTitle: 'Welcome' });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { statusCode: 404, message: 'Page not found.' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  const statusCode = err.status || err.statusCode || 500;
  const message    = isProd ? 'Something went wrong.' : err.message || 'Internal Server Error';

  if (err.name === 'ValidationError') {
    Object.values(err.errors).forEach(e => req.flash('error', e.message));
    return res.redirect('back');
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    req.flash('error', `That ${field} is already in use.`);
    return res.redirect('back');
  }
  res.status(statusCode).render('error', { statusCode, message });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║       J&M Rentals — Server Up  🎤    ║');
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`║   ENV: ${(process.env.NODE_ENV || 'development').padEnd(28)}║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});

module.exports = app;