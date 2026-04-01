const mongoose = require('mongoose');

// ─── Sub-schema: Each line item in a rental ───────────────────────────────────
const rentalItemSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    itemType: {
      type: String,
      enum: ['chair', 'table', 'long_table', 'videoke'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: [0],
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0],
    },
  },
  { _id: false }
);

// ─── Sub-schema: Extension history (videoke/any item day extensions) ──────────
const extensionSchema = new mongoose.Schema(
  {
    extendedAt: {
      type: Date,
      default: Date.now,
    },
    additionalDays: {
      type: Number,
      required: true,
      min: [1],
    },
    additionalCost: {
      type: Number,
      required: true,
      min: [0],
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    note: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

// ─── Main Rental Schema ───────────────────────────────────────────────────────
const rentalSchema = new mongoose.Schema(
  {
    referenceNumber: {
      type: String,
      unique: true,
      // Auto-generated: JMR-YYYYMMDD-XXXX
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer is required'],
    },

    items: {
      type: [rentalItemSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'Rental must include at least one item',
      },
    },

    rentalStartDate: {
      type: Date,
      required: [true, 'Rental start date is required'],
    },

    rentalEndDate: {
      type: Date,
      required: [true, 'Rental end date is required'],
      validate: {
        validator: function (v) {
          return v > this.rentalStartDate;
        },
        message: 'End date must be after start date',
      },
    },

    numberOfDays: {
      type: Number,
      min: [1, 'Rental must be at least 1 day'],
    },

    deliveryAddress: {
      type: String,
      required: [true, 'Delivery address is required'],
      trim: true,
    },

    // Pricing breakdown
    baseCost: {
      type: Number,
      required: true,
      min: [0],
    },

    extensionCost: {
      type: Number,
      default: 0,
      min: [0],
    },

    totalCost: {
      type: Number,
      required: true,
      min: [0],
    },

    // Status flow: pending → approved → active → completed | cancelled
    status: {
      type: String,
      enum: ['pending', 'approved', 'active', 'completed', 'cancelled', 'rejected'],
      default: 'pending',
    },

    // Admin approval
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    // Extensions (e.g. videoke +400/day)
    extensions: {
      type: [extensionSchema],
      default: [],
    },

    // Payment
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid'],
      default: 'unpaid',
    },

    paymentMethod: {
      type: String,
      enum: ['cash', 'gcash', 'bank_transfer', 'other'],
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [500],
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
rentalSchema.index({ customer: 1 });
rentalSchema.index({ status: 1 });
rentalSchema.index({ rentalStartDate: 1, rentalEndDate: 1 });

// ─── Pre-save: Auto-generate reference number ─────────────────────────────────
rentalSchema.pre('save', async function (next) {
  if (this.isNew) {
    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await mongoose.model('Rental').countDocuments();
    this.referenceNumber = `JMR-${datePart}-${String(count + 1).padStart(4, '0')}`;
  }

  // Auto-compute numberOfDays
  if (this.rentalStartDate && this.rentalEndDate) {
    const ms = this.rentalEndDate - this.rentalStartDate;
    this.numberOfDays = Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  // Auto-compute totalCost
  this.totalCost = this.baseCost + (this.extensionCost || 0);

});

module.exports = mongoose.model('Rental', rentalSchema);
