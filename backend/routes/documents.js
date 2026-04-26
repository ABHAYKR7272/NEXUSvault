const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const AdmZip   = require('adm-zip');
const Diff     = require('diff');
const Document = require('../models/Document');
const { protect } = require('../middleware/auth');
const upload   = require('../middleware/upload');
const { cloudinary, uploadBufferToCloudinary } = require('../middleware/upload');


const https = require('https');
const http  = require('http');
const os    = require('os');
const crypto= require('crypto');

function downloadToTemp(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const tmp = path.join(os.tmpdir(), crypto.randomBytes(8).toString('hex'));
    const ws = fs.createWriteStream(tmp);
    const req = lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        ws.close(() => { try { fs.unlinkSync(tmp); } catch {} });
        return downloadToTemp(new URL(res.headers.location, url).toString()).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        ws.close(() => { try { fs.unlinkSync(tmp); } catch {} });
        res.resume();
        return reject(new Error('Download failed '+res.statusCode));
      }
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => resolve(tmp)));
    });
    req.on('error', (err) => { ws.close(() => { try { fs.unlinkSync(tmp); } catch {} }); reject(err); });
  });
}

async function readRemoteText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return readRemoteText(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('Fetch failed '+res.statusCode));
      let data=''; res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const router = express.Router();
router.use(protect);

const TEXT_EXTS = /\.(txt|md|json|html|htm|js|jsx|ts|tsx|py|java|css|xml|yaml|yml|csv|log|sh|rb|go|rs|cpp|c|h|php|sql|env|gitignore|editorconfig|babelrc|eslintrc)$/i;

async function processFile(file) {
  const uploaded = await uploadBufferToCloudinary(file);
  return {
    content: '',
    filePath: uploaded.secure_url,
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    isProject: false
  };
}

async function uploadZipVersionData(file) {
  const uploaded = await uploadBufferToCloudinary(file);
  return {
    isProject: true,
    projectTree: buildTreeFromZipBuffer(file.buffer),
    fileName: file.originalname,
    fileSize: file.size,
    filePath: uploaded.secure_url,
    mimeType: 'application/zip',
    content: ''
  };
}

async function buildTreeFromZipUrl(zipUrl) {
  const zipPath = await downloadToTemp(zipUrl);
  try { return buildTreeFromZipSync(zipPath); } finally { try { fs.unlinkSync(zipPath); } catch {} }
}

function buildTreeFromZipBuffer(buffer) {
  return buildTreeFromZip(new AdmZip(buffer));
}

function buildTreeFromZipSync(zipPath) {
  return buildTreeFromZip(new AdmZip(zipPath));
}

function buildTreeFromZip(zip) {
  const entries = zip.getEntries();
  const root = [];
  const dirs = {};
  entries.sort((a, b) => a.entryName.localeCompare(b.entryName));
  entries.forEach(entry => {
    const parts = entry.entryName.replace(/\/$/, '').split('/');
    let cur = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const isDir  = entry.isDirectory || !isLast;
      const curPath = parts.slice(0, i + 1).join('/');
      if (isDir) {
        if (!dirs[curPath]) {
          const node = { name: part, type: 'folder', path: curPath, children: [] };
          dirs[curPath] = node;
          cur.push(node);
        }
        cur = dirs[curPath].children;
      } else {
        let content = '', mimeType = 'application/octet-stream';
        if (TEXT_EXTS.test(part)) {
          try { content = entry.getData().toString('utf8'); } catch { content = ''; }
          mimeType = 'text/plain';
        }
        cur.push({
          name: part, type: 'file', path: curPath,
          content, mimeType,
          fileSize: entry.header.size
        });
      }
    });
  });
  return root;
}

// ── PERMISSION HELPERS ───────────────────────────────────────────────────
const isHead = (doc, user) => doc.owner.toString() === user._id.toString();

const getMember = (doc, user) =>
  doc.members.find(m => m.user.toString() === user._id.toString());

function canAccess(doc, user) {
  if (doc.visibility === 'public') return true;
  if (isHead(doc, user)) return true;
  const m = getMember(doc, user);
  return !!m && !m.isBlocked;
}

function canEdit(doc, user) {
  if (isHead(doc, user)) return true;
  const m = getMember(doc, user);
  return !!m && !m.isBlocked && m.role === 'editor';
}


function getCloudinaryPublicId(fileUrl) {
  try {
    const u = new URL(fileUrl);
    const marker = '/raw/upload/';
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length).replace(/^v\d+\//, ''));
  } catch {
    return null;
  }
}

function getCloudinaryDeliveryUrl(fileUrl, fileName, asAttachment = false) {
  const publicId = getCloudinaryPublicId(fileUrl);
  if (!publicId) return fileUrl;
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    type: 'upload',
    secure: true,
    sign_url: true,
    flags: asAttachment ? `attachment:${fileName || 'download'}` : undefined,
  });
}

// ── GET /api/documents/stats/overview ────────────────────────────────────
router.get('/stats/overview', async (req, res) => {
  try {
    const docs = await Document.find({ isArchived: false });
    const accessible = docs.filter(d => canAccess(d, req.user));
    const mine = docs.filter(d => isHead(d, req.user));
    const totalVersions = accessible.reduce((s, d) => s + d.versions.length, 0);
    const totalComments = accessible.reduce((s, d) => s + d.versions.reduce((vs, v) => vs + v.comments.length, 0), 0);
    const byCategory = accessible.reduce((acc, d) => { acc[d.category] = (acc[d.category]||0)+1; return acc; }, {});
    res.json({ success: true, stats: {
      totalDocuments: accessible.length,
      myProjects:     mine.length,
      totalVersions, totalComments,
      publicDocs:     accessible.filter(d => d.visibility === 'public').length,
      privateDocs:    accessible.filter(d => d.visibility === 'private').length,
      pendingRequests: mine.reduce((s, d) => s + d.accessRequests.filter(r => r.status === 'pending').length, 0),
      byCategory
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents ────────────────────────────────────────────────────
// ── GET /api/documents/discover?q=... — search private projects by title ──
// MUST be defined BEFORE '/:id' so Express doesn't treat "discover" as an id.
router.get('/discover', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, results: [] });
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const docs = await Document.find({ isArchived: false, visibility: 'private', title: re })
      .limit(25).sort({ updatedAt: -1 });
    const uid = req.user._id.toString();
    const results = docs.map(d => ({
      _id: d._id,
      title: d.title,
      ownerName: d.ownerName,
      memberCount: (d.members || []).filter(m => !m.isBlocked).length,
      isHead: d.owner.toString() === uid,
      isMember: (d.members || []).some(m => m.user.toString() === uid && !m.isBlocked),
      isBlocked: (d.members || []).some(m => m.user.toString() === uid && m.isBlocked),
      hasPending: (d.accessRequests || []).some(r => r.user.toString() === uid && r.status === 'pending'),
      updatedAt: d.updatedAt,
    }));
    res.json({ success: true, results, count: results.length });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { category, search, visibility } = req.query;
    let docs = await Document.find({ isArchived: false }).sort({ updatedAt: -1 });
    docs = docs.filter(d => canAccess(d, req.user));
    if (category && category !== 'all') docs = docs.filter(d => d.category === category);
    if (visibility) docs = docs.filter(d => d.visibility === visibility);
    if (search) {
      const re = new RegExp(search, 'i');
      docs = docs.filter(d => re.test(d.title) || re.test(d.description) || (d.tags || []).some(t => re.test(t)));
    }

    const list = docs.map(d => {
      const lv = d.versions.length ? d.versions[d.versions.length - 1] : null;
      const head = isHead(d, req.user);
      const m = getMember(d, req.user);
      return {
        _id: d._id, title: d.title, description: d.description,
        category: d.category, ownerName: d.ownerName, ownerId: d.owner,
        visibility: d.visibility,
        tags: d.tags, createdAt: d.createdAt, updatedAt: d.updatedAt,
        versionCount: d.versions.length,
        memberCount: d.members.length,
        starCount: (d.stars || []).length,
        isStarred: (d.stars || []).some(s => s.toString() === req.user._id.toString()),
        pendingRequests: d.accessRequests.filter(r => r.status === 'pending').length,
        isHead: head,
        userRole: head ? 'head' : (m ? m.role : 'viewer'),
        latestVersion: lv ? {
          versionNumber: lv.versionNumber, message: lv.message,
          uploaderName: lv.uploaderName, createdAt: lv.createdAt,
          fileName: lv.fileName, fileSize: lv.fileSize,
          filePath: lv.filePath, mimeType: lv.mimeType,
          isProject: lv.isProject || false
        } : null,
        totalComments: d.versions.reduce((s, v) => s + v.comments.length, 0)
      };
    });
    res.json({ success: true, count: list.length, documents: list });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/documents ───────────────────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, description, category, message, tags, visibility } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    let versionData = {
      versionNumber: '1.0',
      message: message || 'Initial version',
      uploadedBy: req.user._id,
      uploaderName: req.user.name,
      isProject: false
    };

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();

      if (ext === '.zip') {
        Object.assign(versionData, await uploadZipVersionData(req.file));
      } else {
        Object.assign(versionData, await processFile(req.file));
      }
    } else if (req.body.content) {
      versionData.content = req.body.content;
    }

    const isPrivate  = visibility === 'private';
    const accessCode = isPrivate ? Document.generateCode() : '';

    const doc = await Document.create({
      title,
      description: description || '',
      category: category || 'Other',
      owner: req.user._id,
      ownerName: req.user.name,
      visibility: visibility || 'public',
      accessCode,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      versions: [versionData]
    });

    res.status(201).json({
      success: true,
      accessCode: isPrivate ? accessCode : undefined,
      document: doc
    });

  } catch (error) {
    console.error("UPLOAD_DOCUMENT_ERROR:", {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ── GET /api/documents/:id ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    if (!canAccess(doc, req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied', requiresCode: doc.visibility === 'private' });
    }
    res.json({ success: true, document: doc, isHead: isHead(doc, req.user) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── PUT /api/documents/:id ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canEdit(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });

    const { title, description, category, tags, visibility } = req.body;
    if (title)       doc.title       = title;
    if (description !== undefined) doc.description = description;
    if (category)    doc.category    = category;
    if (tags !== undefined) doc.tags = String(tags).split(',').map(t => t.trim()).filter(Boolean);

    // Visibility change — only head
    if (visibility && visibility !== doc.visibility) {
      if (!isHead(doc, req.user)) {
        return res.status(403).json({ success: false, message: 'Only the project head can change visibility' });
      }
      doc.visibility = visibility;
      if (visibility === 'private' && !doc.accessCode) {
        doc.accessCode = Document.generateCode();
      }
      if (visibility === 'public') doc.accessCode = '';
    }
    await doc.save();
    res.json({ success: true, document: doc, accessCode: doc.accessCode || undefined });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE /api/documents/:id  — head only, hard delete ───────────────────
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) {
      return res.status(403).json({ success: false, message: 'Only the project head can delete the project' });
    }
    // Best-effort: clean up uploaded files
    doc.versions.forEach(v => {
      if (v.filePath) {
        const fp = v.filePath;
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
      }
    });
    await doc.deleteOne();
    res.json({ success: true, message: 'Project permanently deleted' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/documents/:id/star  — toggle star ───────────────────────────
router.post('/:id/star', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    const uid = req.user._id.toString();
    const idx = (doc.stars || []).findIndex(s => s.toString() === uid);
    if (idx === -1) doc.stars.push(req.user._id);
    else            doc.stars.splice(idx, 1);
    await doc.save();
    res.json({ success: true, isStarred: idx === -1, starCount: doc.stars.length });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/documents/:id/access — verify code & request access ─────────
router.post('/:id/access', async (req, res) => {
  try {
    const { code, message } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (doc.visibility !== 'private') return res.json({ success: true, message: 'Public document' });
    if (doc.accessCode !== code) {
      return res.status(401).json({ success: false, message: 'Invalid access code' });
    }
    if (isHead(doc, req.user)) {
      return res.json({ success: true, isHead: true, status: 'head' });
    }
    const existing = getMember(doc, req.user);
    if (existing) {
      if (existing.isBlocked) {
        return res.status(403).json({ success: false, message: 'You have been blocked from this project by the head' });
      }
      return res.json({ success: true, status: 'approved', role: existing.role });
    }
    const existReq = doc.accessRequests.find(r => r.user.toString() === req.user._id.toString() && r.status === 'pending');
    if (existReq) {
      return res.json({ success: true, status: 'pending', message: 'Your request is already pending approval' });
    }
    doc.accessRequests.push({
      user: req.user._id, userName: req.user.name, userEmail: req.user.email,
      status: 'pending', message: (message || '').trim().slice(0, 200)
    });
    await doc.save();
    res.json({ success: true, status: 'pending', message: 'Access request sent to project head. Awaiting approval.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/documents/:id/access-code  — head only ──────────────────────
router.post('/:id/access-code', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) return res.status(403).json({ success: false, message: 'Only the project head can regenerate the code' });
    doc.accessCode = Document.generateCode();
    await doc.save();
    res.json({ success: true, accessCode: doc.accessCode });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents/:id/requests  — head only ──────────────────────────
router.get('/:id/requests', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    res.json({ success: true, requests: doc.accessRequests, members: doc.members });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── PUT /api/documents/:id/requests/:reqId  — approve/reject ──────────────
router.put('/:id/requests/:reqId', async (req, res) => {
  try {
    const { action, role } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) return res.status(403).json({ success: false, message: 'Only the project head can approve requests' });

    const request = doc.accessRequests.id(req.params.reqId);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    request.status    = action === 'approve' ? 'approved' : 'rejected';
    request.decidedAt = new Date();

    if (action === 'approve') {
      request.role = role || 'viewer';
      const alreadyMember = doc.members.find(m => m.user.toString() === request.user.toString());
      if (!alreadyMember) {
        doc.members.push({
          user: request.user, userName: request.userName,
          email: request.userEmail, role: request.role
        });
      }
    }
    await doc.save();
    res.json({ success: true, message: action === 'approve' ? 'Access granted' : 'Request rejected' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── PUT /api/documents/:id/members/:memberId/role  — change role ──────────
router.put('/:id/members/:memberId/role', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) return res.status(403).json({ success: false, message: 'Only the project head can change roles' });
    const member = doc.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    if (!['viewer','editor'].includes(req.body.role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    member.role = req.body.role;
    await doc.save();
    res.json({ success: true, message: 'Role updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── PUT /api/documents/:id/members/:memberId/block  — toggle block ────────
router.put('/:id/members/:memberId/block', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) return res.status(403).json({ success: false, message: 'Only the project head can block members' });
    const member = doc.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    member.isBlocked = !member.isBlocked;
    await doc.save();
    res.json({
      success: true,
      isBlocked: member.isBlocked,
      message: member.isBlocked ? `${member.userName} blocked` : `${member.userName} unblocked`
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE /api/documents/:id/members/:memberId ──────────────────────────
router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) return res.status(403).json({ success: false, message: 'Only the project head can remove members' });
    doc.members.pull(req.params.memberId);
    await doc.save();
    res.json({ success: true, message: 'Member removed' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents/:id/versions ──────────────────────────────────────
router.get('/:id/versions', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    res.json({ success: true, documentTitle: doc.title, versions: doc.versions });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/documents/:id/versions ─────────────────────────────────────
router.post('/:id/versions', upload.single('file'), async (req, res) => {
  try {
    const { message, bumpType } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Version message required' });

    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canEdit(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });

    const lastVer = doc.versions.length ? doc.versions[doc.versions.length - 1] : null;
    const newVerNum = Document.bumpVersion(lastVer ? lastVer.versionNumber : '1.0', bumpType || 'minor');

    let versionData = {
      versionNumber: newVerNum, message,
      uploadedBy: req.user._id, uploaderName: req.user.name,
      content:  lastVer?.content  || '',
      filePath: lastVer?.filePath || '',
      fileName: lastVer?.fileName || '',
      fileSize: 0, mimeType: lastVer?.mimeType || 'text/plain',
      isProject: lastVer?.isProject || false,
      projectTree: lastVer?.projectTree || []
    };

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === '.zip') {
        Object.assign(versionData, await uploadZipVersionData(req.file));
        versionData.content     = '';
      } else {
        const p = await processFile(req.file);
        Object.assign(versionData, p);
        versionData.isProject   = false;
        versionData.projectTree = [];
      }
    } else if (req.body.content) {
      versionData.content = req.body.content;
    }

    doc.versions.push(versionData);
    await doc.save();
    res.status(201).json({ success: true, version: doc.versions[doc.versions.length - 1] });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE /api/documents/:id/versions/:ver  — head only ──────────────────
router.delete('/:id/versions/:ver', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isHead(doc, req.user)) {
      return res.status(403).json({ success: false, message: 'Only the project head can delete versions' });
    }
    if (doc.versions.length <= 1) {
      return res.status(400).json({ success: false, message: 'Cannot delete the only version. Delete the project instead.' });
    }
    const idx = doc.versions.findIndex(v => v.versionNumber === req.params.ver);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Version not found' });
    const ver = doc.versions[idx];
    if (ver.filePath) {
      const fp = ver.filePath;
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
    }
    doc.versions.splice(idx, 1);
    await doc.save();
    res.json({ success: true, message: `Version ${req.params.ver} deleted` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents/:id/diff ───────────────────────────────────────────
router.get('/:id/diff', async (req, res) => {
  try {
    const { v1, v2 } = req.query;
    if (!v1 || !v2) return res.status(400).json({ success: false, message: 'Provide v1 and v2' });
    const doc = await Document.findById(req.params.id);
    if (!doc || !canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });

    const verA = doc.versions.find(v => v.versionNumber === v1);
    const verB = doc.versions.find(v => v.versionNumber === v2);
    if (!verA || !verB) return res.status(404).json({ success: false, message: 'Version not found' });

    const changes = Diff.diffLines(verA.content || '', verB.content || '');
    let added = 0, removed = 0, unchanged = 0;
    changes.forEach(p => {
      if (p.added)        added     += p.count||0;
      else if (p.removed) removed   += p.count||0;
      else                unchanged += p.count||0;
    });

    res.json({
      success: true, documentTitle: doc.title,
      versionA: { number: verA.versionNumber, date: verA.createdAt, author: verA.uploaderName, message: verA.message },
      versionB: { number: verB.versionNumber, date: verB.createdAt, author: verB.uploaderName, message: verB.message },
      stats: { added, removed, unchanged }, diff: changes
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents/:id/tree-diff ──────────────────────────────────────
// Side-by-side ZIP/project tree comparison.
// Returns both trees, a flat map of file paths with status
// (added | removed | modified | same), and per-file line stats.
router.get('/:id/tree-diff', async (req, res) => {
  try {
    const { v1, v2 } = req.query;
    if (!v1 || !v2) return res.status(400).json({ success: false, message: 'Provide v1 and v2' });
    const doc = await Document.findById(req.params.id);
    if (!doc || !canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });

    const verA = doc.versions.find(v => v.versionNumber === v1);
    const verB = doc.versions.find(v => v.versionNumber === v2);
    if (!verA || !verB) return res.status(404).json({ success: false, message: 'Version not found' });

    // Helper: flatten projectTree into { fullPath: { content, fileSize, mimeType } }
    function flatten(tree, prefix = '', acc = {}) {
      (tree || []).forEach(node => {
        const full = prefix ? `${prefix}/${node.name}` : node.name;
        if (node.type === 'folder') {
          acc[full + '/'] = { type: 'folder' };
          flatten(node.children, full, acc);
        } else {
          acc[full] = {
            type: 'file',
            content: node.content || '',
            fileSize: node.fileSize || 0,
            mimeType: node.mimeType || ''
          };
        }
      });
      return acc;
    }

    const flatA = verA.isProject ? flatten(verA.projectTree)
                : { [verA.fileName || 'file']: { type:'file', content: verA.content||'', fileSize: verA.fileSize||0, mimeType: verA.mimeType||'' } };
    const flatB = verB.isProject ? flatten(verB.projectTree)
                : { [verB.fileName || 'file']: { type:'file', content: verB.content||'', fileSize: verB.fileSize||0, mimeType: verB.mimeType||'' } };

    const allPaths = Array.from(new Set([...Object.keys(flatA), ...Object.keys(flatB)])).sort();
    const fileStatus = {};
    let totals = { added: 0, removed: 0, modified: 0, same: 0 };

    allPaths.forEach(p => {
      const a = flatA[p], b = flatB[p];
      if (a && a.type === 'folder' || b && b.type === 'folder') {
        fileStatus[p] = { type: 'folder', status: (a && b) ? 'same' : (a ? 'removed' : 'added') };
        return;
      }
      if (a && !b)       { fileStatus[p] = { type:'file', status:'removed' }; totals.removed++; }
      else if (!a && b)  { fileStatus[p] = { type:'file', status:'added'   }; totals.added++; }
      else {
        const same = (a.content || '') === (b.content || '') && a.fileSize === b.fileSize;
        fileStatus[p] = { type:'file', status: same ? 'same' : 'modified' };
        same ? totals.same++ : totals.modified++;
      }
    });

    res.json({
      success: true,
      isProject: !!(verA.isProject || verB.isProject),
      versionA: { number: verA.versionNumber, message: verA.message, author: verA.uploaderName, date: verA.createdAt, tree: verA.isProject ? verA.projectTree : null, fileName: verA.fileName, content: verA.content || '' },
      versionB: { number: verB.versionNumber, message: verB.message, author: verB.uploaderName, date: verB.createdAt, tree: verB.isProject ? verB.projectTree : null, fileName: verB.fileName, content: verB.content || '' },
      fileStatus, totals
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents/:id/file-diff ──────────────────────────────────────
// Line-level diff for a specific file path inside two versions' projectTrees.
router.get('/:id/file-diff', async (req, res) => {
  try {
    const { v1, v2, path: filePath } = req.query;
    if (!v1 || !v2 || !filePath) return res.status(400).json({ success: false, message: 'Provide v1, v2 and path' });
    const doc = await Document.findById(req.params.id);
    if (!doc || !canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });

    const verA = doc.versions.find(v => v.versionNumber === v1);
    const verB = doc.versions.find(v => v.versionNumber === v2);
    if (!verA || !verB) return res.status(404).json({ success: false, message: 'Version not found' });

    function find(tree, target) {
      const segs = target.split('/');
      let nodes = tree || [];
      let node = null;
      for (let i = 0; i < segs.length; i++) {
        node = (nodes || []).find(n => n.name === segs[i]);
        if (!node) return null;
        if (i < segs.length - 1) nodes = node.children || [];
      }
      return node;
    }

    const a = verA.isProject ? find(verA.projectTree, filePath) : { content: verA.content, name: verA.fileName };
    const b = verB.isProject ? find(verB.projectTree, filePath) : { content: verB.content, name: verB.fileName };
    const contentA = (a && a.content) || '';
    const contentB = (b && b.content) || '';

    const changes = Diff.diffLines(contentA, contentB);
    let added = 0, removed = 0, unchanged = 0;
    changes.forEach(p => {
      if (p.added)        added     += p.count||0;
      else if (p.removed) removed   += p.count||0;
      else                unchanged += p.count||0;
    });

    res.json({
      success: true,
      path: filePath,
      existsA: !!a, existsB: !!b,
      contentA, contentB,
      stats: { added, removed, unchanged },
      diff: changes
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents/:id/versions/:ver/download ─────────────────────────
router.get('/:id/versions/:ver/download', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc || !canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    const version = doc.versions.find(v => v.versionNumber === req.params.ver);
    if (!version) return res.status(404).json({ success: false, message: 'Version not found' });

    if (version.filePath) {
      const fp = version.filePath;
      if (/^https?:\/\//i.test(fp)) {
        return res.redirect(getCloudinaryDeliveryUrl(fp, version.fileName || 'download', true));
      }
      if (fs.existsSync(fp)) {
        res.setHeader('Content-Disposition', `attachment; filename="${version.fileName || 'download'}"`);
        return res.sendFile(fp);
      }
    }
    res.setHeader('Content-Disposition', `attachment; filename="${version.fileName || 'file.txt'}"`);
    res.setHeader('Content-Type', version.mimeType || 'text/plain');
    res.send(version.content || '');
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/documents/:id/versions/:ver/preview ──────────────────────────
router.get('/:id/versions/:ver/preview', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc || !canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    const version = doc.versions.find(v => v.versionNumber === req.params.ver);
    if (!version) return res.status(404).json({ success: false, message: 'Version not found' });

    if (version.filePath) {
      const fp = version.filePath;
      if (/^https?:\/\//i.test(fp)) {
        return res.redirect(getCloudinaryDeliveryUrl(fp, version.fileName || 'preview', false));
      }
      if (fs.existsSync(fp)) {
        res.setHeader('Content-Type', version.mimeType || 'application/octet-stream');
        return res.sendFile(fp);
      }
    }
    res.setHeader('Content-Type', version.mimeType || 'text/plain');
    res.send(version.content || '');
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/documents/:id/versions/:ver/comments ────────────────────────
router.post('/:id/versions/:ver/comments', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'Comment text required' });
    const doc = await Document.findById(req.params.id);
    if (!doc || !canAccess(doc, req.user)) return res.status(403).json({ success: false, message: 'Access denied' });
    const version = doc.versions.find(v => v.versionNumber === req.params.ver);
    if (!version) return res.status(404).json({ success: false, message: 'Version not found' });
    version.comments.push({ user: req.user._id, userName: req.user.name, text: text.trim() });
    await doc.save();
    res.status(201).json({ success: true, comment: version.comments[version.comments.length - 1] });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE comment  — comment author or project head ──────────────────────
router.delete('/:id/versions/:ver/comments/:cid', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const version = doc.versions.find(v => v.versionNumber === req.params.ver);
    if (!version) return res.status(404).json({ success: false, message: 'Version not found' });
    const idx = version.comments.findIndex(c => c._id.toString() === req.params.cid);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (version.comments[idx].user.toString() !== req.user._id.toString() && !isHead(doc, req.user))
      return res.status(403).json({ success: false, message: 'Cannot delete this comment' });
    version.comments.splice(idx, 1);
    await doc.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
