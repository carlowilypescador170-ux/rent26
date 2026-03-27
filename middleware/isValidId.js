// ─────────────────────────────────────────────────────────────────────────────
// isValidId.js
// Generic MongoDB ObjectId validator for any route param.
// Use this as a lightweight guard before hitting the database,
// especially on routes where the model fetcher isn't yet applied.
//
// Usage:
//   const { isValidId } = require('../middleware/isValidId');
//
//   // Validate :rentalId before any async DB call
//   router.get('/rentals/:rentalId', isValidId('rentalId'), isRental, controller);
//
//   // Validate :userId
//   router.delete('/users/:userId', isSuperAdmin, isValidId('userId'), deleteUserController);
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

/**
 * Returns an Express middleware that validates req.params[paramName]
 * as a valid MongoDB ObjectId.
 *
 * @param {string} paramName - The name of the route param to validate (e.g. 'rentalId')
 */
const isValidId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', `Invalid ${paramName}. Please try again.`);
      return res.redirect('back');
    }

    next();
  };
};

module.exports = { isValidId };
