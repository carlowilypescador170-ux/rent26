// ─────────────────────────────────────────────────────────────────────────────
// isUpload.js
// Configures Cloudinary + Multer for file uploads.
// Provides ready-to-use upload middleware for:
//   - Single profile picture uploads (users)
//   - Single or multiple item image uploads (admin)
//
// Requires .env:
//   CLOUDINARY_CLOUD_NAME=your_cloud_name
//   CLOUDINARY_API_KEY=your_api_key
//   CLOUDINARY_API_SECRET=your_api_secret
//
// Usage:
//   const { uploadProfilePicture, uploadItemImages } = require('../middleware/isUpload');
//
//   // Upload single profile picture
//   router.post('/user/profile', isUser, uploadProfilePicture, updateProfileController);
//
//   // Upload up to 5 item images
//   router.post('/admin/items', isAdmin, uploadItemImages, createItemController);
//   // Access uploaded files: req.files (array) or req.file (single)
// ─────────────────────────────────────────────────────────────────────────────

const cloudinary  = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// ─── Configure Cloudinary ─────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Storage: Profile Pictures ───────────────────────────────────────────────
const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'jm-rentals/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
    public_id: (req) => `user-${req.session.userId}-${Date.now()}`,
  },
});

// ─── Storage: Item Images ─────────────────────────────────────────────────────
const itemStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'jm-rentals/items',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 600, crop: 'fill', quality: 'auto' }],
    public_id: (req) => `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  },
});

// ─── File filter: images only ─────────────────────────────────────────────────
const imageFileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP) are allowed.'), false);
  }
};

// ─── Multer instances ─────────────────────────────────────────────────────────
const profileUploader = multer({
  storage:    profileStorage,
  fileFilter: imageFileFilter,
  limits:     { fileSize: 2 * 1024 * 1024 }, // 2MB max
});

const itemUploader = multer({
  storage:    itemStorage,
  fileFilter: imageFileFilter,
  limits:     { fileSize: 5 * 1024 * 1024 }, // 5MB max per image
});

// ─── Export ready-to-use middleware ───────────────────────────────────────────

// Single profile picture → req.file
const uploadProfilePicture = (req, res, next) => {
  profileUploader.single('profilePicture')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.flash('error', `Upload error: ${err.message}`);
      return res.redirect('back');
    } else if (err) {
      req.flash('error', err.message || 'File upload failed.');
      return res.redirect('back');
    }
    next();
  });
};

// Up to 5 item images → req.files (array)
const uploadItemImages = (req, res, next) => {
  itemUploader.array('images', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.flash('error', `Upload error: ${err.message}`);
      return res.redirect('back');
    } else if (err) {
      req.flash('error', err.message || 'File upload failed.');
      return res.redirect('back');
    }
    next();
  });
};

// ─── Helper: Delete an image from Cloudinary by public_id ────────────────────
const deleteCloudinaryImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('[deleteCloudinaryImage] Error:', err.message);
  }
};

module.exports = {
  cloudinary,
  uploadProfilePicture,
  uploadItemImages,
  deleteCloudinaryImage,
};
