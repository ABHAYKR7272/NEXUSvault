const multer = require('multer');
const path   = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    return {
      folder: 'nexusvault',
      resource_type: 'raw', // works for ANY file type incl. zip
      public_id: `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`,
      use_filename: false,
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 }
});

module.exports = upload;
module.exports.cloudinary = cloudinary;
