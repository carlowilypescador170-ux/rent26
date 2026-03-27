const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [3, 'Full name must be at least 3 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },

    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [
        /^[a-zA-Z0-9_]+$/,
        'Username can only contain letters, numbers, and underscores',
      ],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => validator.isEmail(v),
        message: 'Please provide a valid email address',
      },
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never returned in queries by default
    },

    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      validate: {
        validator: (v) =>
          /^(\+63|0)(9\d{9})$/.test(v),
        message: 'Please provide a valid Philippine mobile number (e.g. 09XXXXXXXXX)',
      },
    },

    location: {
      type: String,
      required: [true, 'Location/address is required'],
      trim: true,
      maxlength: [255, 'Location cannot exceed 255 characters'],
    },

    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      default: 'user',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationToken: {
      type: String,
      select: false,
    },

    passwordResetToken: {
      type: String,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      select: false,
    },

    lastLogin: {
      type: Date,
    },

    profilePicture: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// email and username indexes are auto-created by unique:true — no duplicates needed.
userSchema.index({ role: 1 });

// ─── Pre-save Hook: Hash password before saving ───────────────────────────────
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ─── Instance Method: Compare password ───────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ─── Instance Method: Safe user object (no sensitive fields) ─────────────────
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
