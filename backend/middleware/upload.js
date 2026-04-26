const multer = require('multer');
const path   = require('path');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 }
});

function uploadBufferToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'file';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'nexusvault',
        resource_type: 'raw',
        public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName}${ext}`,
        use_filename: false,
        unique_filename: false,
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
}

module.exports = upload;
module.exports.cloudinary = cloudinary;
module.exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
