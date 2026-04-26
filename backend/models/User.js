const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [60, 'Name cannot exceed 60 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  // ── Profile fields ──────────────────────────────────────────
  title:       { type: String, trim: true, default: '' },   // e.g. "Senior Engineer"
  department:  { type: String, trim: true, default: '' },
  location:    { type: String, trim: true, default: '' },
  phone:       { type: String, trim: true, default: '' },
  website:     { type: String, trim: true, default: '' },
  bio:         { type: String, trim: true, default: '', maxlength: 280 },
  skills:      [{ type: String, trim: true }],
  avatarColor: { type: String, default: '#6366f1' },
  lastLogin:   { type: Date }
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', UserSchema);
