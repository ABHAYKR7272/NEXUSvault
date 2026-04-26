const express  = require('express');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const Document = require('../models/Document');
const { protect } = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#6366f1','#ec4899','#22d3ee','#a78bfa','#f59e0b','#f97316','#22c55e','#ef4444'];

const safeUser = (user) => ({
  _id:         user._id,
  name:        user.name,
  email:       user.email,
  title:       user.title       || '',
  department:  user.department  || '',
  location:    user.location    || '',
  phone:       user.phone       || '',
  website:     user.website     || '',
  bio:         user.bio         || '',
  skills:      user.skills      || [],
  avatarColor: user.avatarColor || '#6366f1',
  lastLogin:   user.lastLogin,
  createdAt:   user.createdAt
});

const sendToken = (user, statusCode, res) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
  res.status(statusCode).json({ success: true, token, user: safeUser(user) });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, department, title, phone, bio } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const user = await User.create({
      name, email, password,
      title:      title      || '',
      department: department || '',
      phone:      phone      || '',
      bio:        bio        || '',
      avatarColor,
      lastLogin: new Date()
    });
    sendToken(user, 201, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    sendToken(user, 200, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user: safeUser(user) });
});

// PUT /api/auth/profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, title, department, location, phone, website, bio, skills, avatarColor } = req.body;
    const user = await User.findById(req.user._id);
    if (name !== undefined)        user.name        = name;
    if (title !== undefined)       user.title       = title;
    if (department !== undefined)  user.department  = department;
    if (location !== undefined)    user.location    = location;
    if (phone !== undefined)       user.phone       = phone;
    if (website !== undefined)     user.website     = website;
    if (bio !== undefined)         user.bio         = bio;
    if (avatarColor)               user.avatarColor = avatarColor;
    if (Array.isArray(skills))     user.skills      = skills.map(s => String(s).trim()).filter(Boolean).slice(0, 12);
    await user.save();
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/password
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both current and new password are required' });
    }
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/users  — list (any logged-in user)
router.get('/users', protect, async (_req, res) => {
  try {
    const users = await User.find().sort('name');
    res.json({ success: true, users: users.map(safeUser) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/users/:id  — public profile of any user (with their public projects + stats)
router.get('/users/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const docs = await Document.find({ owner: user._id, isArchived: false });
    const publicDocs = docs.filter(d => d.visibility === 'public');
    const stats = {
      totalProjects:  docs.length,
      publicProjects: publicDocs.length,
      privateProjects: docs.length - publicDocs.length,
      totalVersions:  docs.reduce((s, d) => s + d.versions.length, 0),
      totalStars:     docs.reduce((s, d) => s + (d.stars?.length || 0), 0)
    };
    const recent = publicDocs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6)
      .map(d => ({
        _id: d._id, title: d.title, description: d.description,
        category: d.category, updatedAt: d.updatedAt,
        versionCount: d.versions.length
      }));

    res.json({ success: true, user: safeUser(user), stats, recentProjects: recent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
