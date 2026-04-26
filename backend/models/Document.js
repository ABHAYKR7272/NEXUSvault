const mongoose = require('mongoose');

// File node in a project tree
const FileNodeSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  type:      { type: String, enum: ['file','folder'], default: 'file' },
  path:      { type: String, default: '' },
  content:   { type: String, default: '' },
  filePath:  { type: String, default: '' },
  fileName:  { type: String, default: '' },
  fileSize:  { type: Number, default: 0 },
  mimeType:  { type: String, default: 'text/plain' },
  children:  []
}, { _id: true });
FileNodeSchema.add({ children: [FileNodeSchema] });

const CommentSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:  { type: String, required: true },
  text:      { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

const VersionSchema = new mongoose.Schema({
  versionNumber: { type: String, required: true },
  message:       { type: String, required: true, trim: true },
  content:  { type: String, default: '' },
  filePath: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String, default: 'text/plain' },
  isProject:   { type: Boolean, default: false },
  projectTree: [FileNodeSchema],
  uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploaderName:{ type: String, required: true },
  comments:    [CommentSchema],
  createdAt:   { type: Date, default: Date.now }
});

const AccessRequestSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:  { type: String, required: true },
  userEmail: { type: String, required: true },
  status:    { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  role:      { type: String, enum: ['viewer','editor'], default: 'viewer' },
  message:   { type: String, default: '', trim: true, maxlength: 200 },
  requestedAt:{ type: Date, default: Date.now },
  decidedAt:  { type: Date }
});

// A member added to a private project.  Head can change role + block.
const MemberSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:  { type: String, required: true },
  email:     { type: String, required: true },
  role:      { type: String, enum: ['viewer','editor'], default: 'viewer' },
  isBlocked: { type: Boolean, default: false },
  grantedAt: { type: Date, default: Date.now }
});

const DocumentSchema = new mongoose.Schema({
  title:       { type: String, required: [true,'Title is required'], trim: true, maxlength: 150 },
  description: { type: String, trim: true, default: '' },
  category:    { type: String, enum: ['Report','Proposal','Technical','Design','Legal','HR','Other'], default: 'Other' },

  // Owner = HEAD for private projects (full control)
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerName:   { type: String, required: true },

  visibility:  { type: String, enum: ['public','private'], default: 'public' },
  accessCode:  { type: String, default: '' },
  members:     [MemberSchema],
  accessRequests: [AccessRequestSchema],

  versions:    [VersionSchema],
  tags:        [{ type: String, trim: true }],
  isArchived:  { type: Boolean, default: false },

  // Engagement
  stars:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

DocumentSchema.statics.bumpVersion = function(current, type) {
  const [major, minor] = current.split('.').map(Number);
  return type === 'major' ? `${major + 1}.0` : `${major}.${minor + 1}`;
};

DocumentSchema.statics.generateCode = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = mongoose.model('Document', DocumentSchema);
