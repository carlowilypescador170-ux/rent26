// ─────────────────────────────────────────────────────────────────────────────
// index.js  —  J&M Rentals — Main Server (fully wired)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();

const requiredEnv = ['MONGO_URI', 'SESSION_SECRET',];
requiredEnv.forEach((key) => {
  if (!process.env[key]) { console.error(`[FATAL] Missing env: ${key}`); process.exit(1); }
});

const express    = require('express');
const path       = require('path');
const mongoose   = require('mongoose');
const ejsMate    = require('ejs-mate');
const session    = require('express-session');
const { MongoStore } = require('connect-mongo');
const flash      = require('connect-flash');
const helmet     = require('helmet');
const morgan     = require('morgan');

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
const session = require('express-session');

app.set('trust proxy', 1); // IMPORTANT for Render HTTPS
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,      // REQUIRED on Render
    httpOnly: true
  }
}));
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('[DB] MongoDB connected successfully'))
  .catch((err) => { console.error('[DB] Error:', err.message)});

mongoose.connection.on('disconnected', () => console.warn('[DB] MongoDB disconnected'));

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.jsdelivr.net'],
      // 👇 Added 'cdn.jsdelivr.net' right here so Bootstrap Icons can load
      fontSrc:    ["'self'", 'fonts.gstatic.com', 'cdn.jsdelivr.net'],
      imgSrc:     ["'self'", 'data:', 'res.cloudinary.com'],
      connectSrc: ["'self'"],
    },
  },
  frameguard: { action: 'sameorigin' },
}));

app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  store: new MongoStore({
    mongoUrl:       process.env.MONGO_URI,
    dbName:         'rental26',
    collectionName: 'sessions',
    ttl:            60 * 60 * 24 * 7,
    autoRemove:     'native',
  }),
  cookie: { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
  name: 'jmr.sid',
}));

app.use(flash());
app.use(attachUser);
app.use(attachUnreadCount);

app.use((req, res, next) => {
  res.locals.success     = req.flash('success');
  res.locals.error       = req.flash('error');
  res.locals.info        = req.flash('info');
  res.locals.appName     = 'J&M Rentals';
  res.locals.currentPath = req.path;
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
