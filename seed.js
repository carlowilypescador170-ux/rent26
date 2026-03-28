// ─────────────────────────────────────────────────────────────────────────────
// seed.js
// Drops the current users and populates the database with dummy accounts.
// Run this file once to set up your initial roles.
//
// Usage:
//   node seed.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user'); // Adjust this path if necessary

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('[FATAL] Missing MONGO_URI in .env file.');
  
}

// ─── Dummy Data matching userSchema ──────────────────────────────────────────
const dummyUsers = [
  {
    fullName: 'Clark Kent',
    username: 'superadmin_clark',
    email: 'superadmin@jmrentals.com',
    password: 'password123', // Will be hashed by userSchema.pre('save')
    phoneNumber: '09123456789', // Matches PH regex
    location: 'Metropolis, Central Luzon',
    role: 'superadmin',
    isActive: true,
  },
  {
    fullName: 'Bruce Wayne',
    username: 'admin_bruce',
    email: 'admin@jmrentals.com',
    password: 'password123',
    phoneNumber: '09876543210',
    location: 'Gotham City, Metro Manila',
    role: 'admin',
    isActive: true,
  },
  {
    fullName: 'Diana Prince',
    username: 'user_diana',
    email: 'user@jmrentals.com',
    password: 'password123',
    phoneNumber: '09112223333',
    location: 'Themyscira, Palawan',
    role: 'user',
    isActive: true,
  },
  {
    fullName: 'Arthur Curry',
    username: 'banned_arthur',
    email: 'banned@jmrentals.com',
    password: 'password123',
    phoneNumber: '09998887777',
    location: 'Atlantis, Cebu',
    role: 'user',
    isActive: false, // Tests the deactivated account middleware
  }
];

// ─── Seed Logic ──────────────────────────────────────────────────────────────
const seedDatabase = async () => {
  try {
    console.log('[SEED] Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('[SEED] Connected successfully.');

    console.log('[SEED] Clearing existing users...');
    await User.deleteMany({});
    console.log('[SEED] Users cleared.');

    console.log('[SEED] Inserting dummy accounts...');
    // Using .create() so Mongoose pre-save hooks (like bcrypt hashing) run
    for (const userData of dummyUsers) {
      const user = await User.create(userData);
      console.log(`  -> Created [${user.role}]: ${user.username} (${user.email}) | Active: ${user.isActive}`);
    }

    console.log('[SEED] Seeding complete! 🎉');
  } catch (err) {
    console.error('[SEED] Error during seeding:', err.message);
    if (err.errors) {
      // Print specific validation errors if they occur
      Object.values(err.errors).forEach(e => console.error(`   - Validation Error: ${e.message}`));
    }
  } finally {
    console.log('[SEED] Closing database connection...');
    await mongoose.connection.close();
    
  }
};

seedDatabase();