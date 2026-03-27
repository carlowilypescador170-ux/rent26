const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      enum: {
        values: ['chair', 'table', 'long_table', 'videoke'],
        message: '{VALUE} is not a valid item type',
      },
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
      // e.g. "Monobloc Chair", "Round Table", "Videoke Machine Unit 1"
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    pricePerDay: {
      type: Number,
      required: [true, 'Price per day is required'],
      min: [0, 'Price cannot be negative'],
      // Defaults based on J&M pricing:
      // chair      → 7.00
      // table      → 50.00
      // long_table → 100.00
      // videoke    → 400.00
    },

    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative'],
      default: 1,
    },

    availableQuantity: {
      type: Number,
      min: [0, 'Available quantity cannot be negative'],
      default: function () {
        return this.quantity;
      },
    },

    unit: {
      type: String,
      enum: ['piece', 'set', 'unit'],
      default: 'piece',
    },

    images: [
      {
        type: String, // URL or file path
      },
    ],

    isAvailable: {
      type: Boolean,
      default: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [300, 'Notes cannot exceed 300 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
itemSchema.index({ name: 1 });
itemSchema.index({ isAvailable: 1 });

// ─── Virtual: Is stock sufficient? ───────────────────────────────────────────
itemSchema.virtual('inStock').get(function () {
  return this.availableQuantity > 0;
});

module.exports = mongoose.model('Item', itemSchema);
