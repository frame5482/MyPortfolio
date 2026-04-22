require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database ---
const db = require('./db/setup');

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// --- Multer Config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// --- Auth ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'artfolio123';
const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
const sessions = new Map(); // token -> expiry

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const expiry = sessions.get(token);
  if (Date.now() > expiry) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  next();
}

// --- API Routes ---

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  if (!bcrypt.compareSync(password, hashedPassword)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 24 * 60 * 60 * 1000); // 24h
  res.json({ token });
});

// Get all works (optional tag filter)
app.get('/api/works', (req, res) => {
  try {
    const { tag } = req.query;
    let works;
    if (tag) {
      works = db.prepare(
        `SELECT * FROM works WHERE ',' || tags || ',' LIKE '%,' || ? || ',%' ORDER BY created_at DESC`
      ).all(tag);
    } else {
      works = db.prepare('SELECT * FROM works ORDER BY created_at DESC').all();
    }
    res.json(works);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get unique tags
app.get('/api/tags', (req, res) => {
  try {
    const rows = db.prepare('SELECT tags FROM works').all();
    const tagSet = new Set();
    rows.forEach(row => {
      row.tags.split(',').forEach(t => {
        const trimmed = t.trim();
        if (trimmed) tagSet.add(trimmed);
      });
    });
    res.json([...tagSet].sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload new work (auth required)
app.post('/api/works', authMiddleware, upload.single('image'), (req, res) => {
  try {
    const { title, description, tags, video_url } = req.body;
    if (!title || !tags) {
      return res.status(400).json({ error: 'Title and tags are required' });
    }
    if (!req.file && !video_url) {
      return res.status(400).json({ error: 'Image or YouTube URL is required' });
    }
    const image_url = req.file ? `/uploads/${req.file.filename}` : '';
    const result = db.prepare(
      'INSERT INTO works (title, description, image_url, video_url, tags) VALUES (?, ?, ?, ?, ?)'
    ).run(title, description || '', image_url, video_url || null, tags);
    res.json({
      id: result.lastInsertRowid,
      title, description, image_url, video_url: video_url || null, tags,
      message: 'Work uploaded successfully ✨'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete work (auth required)
app.delete('/api/works/:id', authMiddleware, (req, res) => {
  try {
    const work = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }
    // Delete image file if it's a local upload
    if (work.image_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, work.image_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    db.prepare('DELETE FROM works WHERE id = ?').run(req.params.id);
    res.json({ message: 'Work deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SPA Fallback ---
app.get('*', (req, res) => {
  // Serve specific HTML pages
  const page = req.path.slice(1); // remove leading /
  const htmlPath = path.join(__dirname, 'public', page.endsWith('.html') ? page : `${page}.html`);
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`\n🎨 Portfolio server running at http://localhost:${PORT}`);
  console.log(`   📁 Works page: http://localhost:${PORT}/works`);
  console.log(`   🔐 Admin page: http://localhost:${PORT}/admin\n`);
});
