// ─────────────────────────────────────────────────────────────────────────────
// isItem.js
// Fetches an Item document by :itemId from route params.
// Attaches it to req.item for downstream controllers.
//
// Usage:
//   const { isItem, isItemAvailable } = require('../middleware/isItem');
//
//   // Fetch item for view/edit
//   router.get('/items/:itemId', isItem, itemViewController);
//
//   // Fetch item + verify it's available before renting
//   router.post('/rentals/new', isUser, isItem, isItemAvailable, createRentalController);
// ─────────────────────────────────────────────────────────────────────────────

const Item = require('../models/item');
const mongoose = require('mongoose');

// ─── Core: Fetch item by ID ───────────────────────────────────────────────────
const isItem = async (req, res, next) => {
  const { itemId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    req.flash('error', 'Invalid item ID.');
    return res.redirect('back');
  }

  try {
    const item = await Item.findById(itemId);

    if (!item) {
      req.flash('error', 'Item not found.');
      return res.redirect('back');
    }

    req.item = item;
    res.locals.item = item;
    next();
  } catch (err) {
    console.error('[isItem] Error:', err.message);
    req.flash('error', 'Error fetching item details.');
    res.redirect('back');
  }
};

// ─── Guard: Item must be marked available ────────────────────────────────────
const isItemAvailable = (req, res, next) => {
  if (!req.item.isAvailable) {
    req.flash('error', `"${req.item.displayName}" is currently not available for rent.`);
    return res.redirect('back');
  }
  next();
};

// ─── Guard: Item must have sufficient stock for requested quantity ────────────
const isItemInStock = (req, res, next) => {
  const requested = parseInt(req.body.quantity) || 1;

  if (req.item.availableQuantity < requested) {
    req.flash(
      'error',
      `Not enough stock for "${req.item.displayName}". Available: ${req.item.availableQuantity}, Requested: ${requested}.`
    );
    return res.redirect('back');
  }
  next();
};

module.exports = { isItem, isItemAvailable, isItemInStock };
