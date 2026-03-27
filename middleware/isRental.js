// ─────────────────────────────────────────────────────────────────────────────
// isRental.js
// Fetches a Rental document by :rentalId from the route params.
// Attaches it to req.rental for downstream controllers.
// Optionally validates ownership (customer) or status constraints.
//
// Usage:
//   const { isRental, isRentalOwner, isRentalPending } = require('../middleware/isRental');
//
//   // Fetch rental for any authenticated user (admin can see all)
//   router.get('/rentals/:rentalId', isLoggedIn, isRental, controller);
//
//   // Fetch rental + verify the logged-in user owns it
//   router.post('/rentals/:rentalId/cancel', isUser, isRental, isRentalOwner, controller);
//
//   // Fetch rental + verify it's still pending (for approval actions)
//   router.post('/admin/rentals/:rentalId/approve', isAdmin, isRental, isRentalPending, controller);
// ─────────────────────────────────────────────────────────────────────────────

const Rental = require('../models/rental');
const mongoose = require('mongoose');

// ─── Core: Fetch rental and attach to req ────────────────────────────────────
const isRental = async (req, res, next) => {
  const { rentalId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(rentalId)) {
    req.flash('error', 'Invalid rental ID.');
    return res.redirect('back');
  }

  try {
    const rental = await Rental.findById(rentalId)
      .populate('customer', 'fullName email username phoneNumber location')
      .populate('items.item', 'displayName name pricePerDay')
      .populate('approvedBy', 'fullName username')
      .populate('extensions.approvedBy', 'fullName username');

    if (!rental) {
      req.flash('error', 'Rental not found.');
      return res.redirect('back');
    }

    req.rental = rental;
    res.locals.rental = rental;
    next();
  } catch (err) {
    console.error('[isRental] Error:', err.message);
    req.flash('error', 'Error fetching rental details.');
    res.redirect('back');
  }
};

// ─── Guard: Logged-in user must be the rental's customer ─────────────────────
const isRentalOwner = (req, res, next) => {
  if (!req.rental || !req.currentUser) {
    req.flash('error', 'Unauthorized.');
    return res.redirect('/user/rentals');
  }

  const customerId = req.rental.customer._id
    ? req.rental.customer._id.toString()
    : req.rental.customer.toString();

  if (customerId !== req.currentUser._id.toString()) {
    req.flash('error', 'You do not have permission to access this rental.');
    return res.redirect('/user/rentals');
  }

  next();
};

// ─── Guard: Rental must be in 'pending' status ────────────────────────────────
const isRentalPending = (req, res, next) => {
  if (req.rental.status !== 'pending') {
    req.flash('error', `This rental cannot be modified. Current status: ${req.rental.status}.`);
    return res.redirect('back');
  }
  next();
};

// ─── Guard: Rental must be 'approved' or 'active' ────────────────────────────
const isRentalActive = (req, res, next) => {
  if (!['approved', 'active'].includes(req.rental.status)) {
    req.flash('error', `Action not allowed. Rental status is: ${req.rental.status}.`);
    return res.redirect('back');
  }
  next();
};

// ─── Guard: Rental must not be cancelled or completed ────────────────────────
const isRentalModifiable = (req, res, next) => {
  const blocked = ['cancelled', 'completed', 'rejected'];
  if (blocked.includes(req.rental.status)) {
    req.flash('error', `This rental is already ${req.rental.status} and cannot be changed.`);
    return res.redirect('back');
  }
  next();
};

module.exports = {
  isRental,
  isRentalOwner,
  isRentalPending,
  isRentalActive,
  isRentalModifiable,
};
