// ─────────────────────────────────────────────────────────────────────────────
// routes/superAdmin.js  —  Superadmin monitoring & control
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const User     = require('../models/user');
const Rental   = require('../models/rental');
const Item     = require('../models/item');
const AuditLog = require('../models/auditLog');
const { isSuperAdmin }   = require('../middleware/isSuperAdmin');
const { isAuditLog }     = require('../middleware/isAuditLog');
const { isValidId }      = require('../middleware/isValidId');
const { createAuditLog } = require('../middleware/isAuditLog');

router.use(isSuperAdmin);

// ── GET /superadmin/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [allRentals, totalUsers, totalAdmins, totalItems, auditLogs, recentLogs] = await Promise.all([
      Rental.find().lean(),
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'admin' }),
      Item.countDocuments(),
      AuditLog.countDocuments(),
      AuditLog.find()
        .populate('performedBy', 'fullName username role')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const stats = {
      totalUsers,
      totalAdmins,
      totalItems,
      auditLogs,
      totalRentals:  allRentals.length,
      pending:       allRentals.filter(r => r.status === 'pending').length,
      totalRevenue:  allRentals.filter(r => r.status === 'completed').reduce((s,r) => s + r.totalCost, 0),
    };

    // Revenue breakdown by item type
    const revenueByType = { chair: 0, table: 0, long_table: 0, videoke: 0 };
    allRentals.filter(r => r.status === 'completed').forEach(r => {
      r.items.forEach(i => {
        if (revenueByType.hasOwnProperty(i.itemType)) {
          revenueByType[i.itemType] += i.subtotal || 0;
        }
      });
    });

    res.render('superadmin/dashboard', {
      pageTitle: 'Super Admin Panel',
      stats, recentLogs, revenueByType,
    });
  } catch (err) {
    console.error('[SuperAdmin Dashboard]', err.message);
    req.flash('error', 'Could not load dashboard.');
    res.redirect('/');
  }
});

// ── GET /superadmin/audit ─────────────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const { action, role, status, page = 1 } = req.query;
    const limit = 20;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (action) filter.action = action;
    if (role)   filter.role   = role;
    if (status) filter.status = status;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'fullName username role')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.render('superadmin/audit', {
      pageTitle:      'Audit Logs',
      logs,
      currentAction:  action || '',
      currentRole:    role || '',
      currentLogStatus: status || '',
      currentPage:    parseInt(page),
      totalPages:     Math.ceil(total / limit),
    });
  } catch (err) {
    req.flash('error', 'Could not load audit logs.');
    res.redirect('/superadmin/dashboard');
  }
});

// ── GET /superadmin/users ─────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { search, role, page = 1 } = req.query;
    const limit = 15;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (role)   filter.role = role;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email:    { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.render('superadmin/users', {
      pageTitle:   'All Users',
      users,
      search:      search || '',
      filterRole:  role || '',
      currentPage: parseInt(page),
      totalPages:  Math.ceil(total / limit),
    });
  } catch (err) {
    req.flash('error', 'Could not load users.');
    res.redirect('/superadmin/dashboard');
  }
});

// ── POST /superadmin/users/:userId/toggle ─────────────────────────────────────
router.post('/users/:userId/toggle', isValidId('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) { req.flash('error', 'User not found.'); return res.redirect('/superadmin/users'); }

    user.isActive = !user.isActive;
    await user.save();

    await createAuditLog(req, {
      action:      'USER_DEACTIVATE',
      targetCollection: 'User',
      targetId:    user._id,
      description: `SuperAdmin ${user.isActive ? 'reactivated' : 'deactivated'} user "${user.username}"`,
    });

    req.flash('success', `User "${user.fullName}" ${user.isActive ? 'reactivated' : 'deactivated'}.`);
    res.redirect('/superadmin/users');
  } catch (err) {
    req.flash('error', 'Could not toggle user.');
    res.redirect('/superadmin/users');
  }
});

// ── POST /superadmin/users/:userId/role ───────────────────────────────────────
router.post('/users/:userId/role', isValidId('userId'), async (req, res) => {
  try {
    const { role } = req.body;
    const allowed  = ['user', 'admin'];
    if (!allowed.includes(role)) {
      req.flash('error', 'Invalid role.');
      return res.redirect('/superadmin/users');
    }

    const user = await User.findById(req.params.userId);
    if (!user) { req.flash('error', 'User not found.'); return res.redirect('/superadmin/users'); }
    if (user.role === 'superadmin') {
      req.flash('error', 'Cannot change superadmin role.');
      return res.redirect('/superadmin/users');
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await createAuditLog(req, {
      action:      'USER_ROLE_CHANGE',
      targetCollection: 'User',
      targetId:    user._id,
      description: `SuperAdmin changed "${user.username}" role from ${oldRole} → ${role}`,
      changes:     { before: { role: oldRole }, after: { role } },
    });

    req.flash('success', `"${user.fullName}" is now a ${role}.`);
    res.redirect('/superadmin/users');
  } catch (err) {
    req.flash('error', 'Could not change role.');
    res.redirect('/superadmin/users');
  }
});

module.exports = router;
