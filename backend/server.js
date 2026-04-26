require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');

const app  = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

let cached = global._mongo;
if (!cached) cached = global._mongo = { conn: null, promise: null };
async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    }).then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
app.use(async (_req, _res, next) => {
  try { await connectDB(); next(); } catch (e) { next(e); }
});

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/documents', require('./routes/documents'));
app.get('/api/health', (_req, res) => res.json({ success: true, message: 'NEXUSvault API running' }));

if (!process.env.VERCEL) {
  const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
}

// JSON 404 for any unmatched /api/* on Vercel (prevents HTML fallback)
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.use((err, _req, res, _next) => {
  console.error('ERROR:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`NEXUSvault -> http://localhost:${PORT}`)))
    .catch(err => { console.error('DB error:', err.message); process.exit(1); });
}

module.exports = app;
