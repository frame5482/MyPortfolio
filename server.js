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
const Work = require('./db/setup');

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
app.get('/api/works', async (req, res) => {
  try {
    const { tag } = req.query;
    let query = {};
    if (tag) {
      // Tags are stored as comma-separated strings, use regex for finding the tag
      query = { tags: { $regex: new RegExp(`\\\\b${tag}\\\\b`, 'i') } };
    }
    const works = await Work.find(query).sort({ created_at: -1 });
    
    // Map _id to id for frontend
    const mappedWorks = works.map(w => ({
      id: w._id,
      title: w.title,
      description: w.description,
      image_url: w.image_url,
      video_url: w.video_url,
      tags: w.tags,
      created_at: w.created_at
    }));
    res.json(mappedWorks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get unique tags
app.get('/api/tags', async (req, res) => {
  try {
    const works = await Work.find({}, 'tags');
    const tagSet = new Set();
    works.forEach(row => {
      if (row.tags) {
        row.tags.split(',').forEach(t => {
          const trimmed = t.trim();
          if (trimmed) tagSet.add(trimmed);
        });
      }
    });
    res.json([...tagSet].sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload new work (auth required)
app.post('/api/works', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, description, tags, video_url, external_image_url } = req.body;
    if (!title || !tags) {
      return res.status(400).json({ error: 'Title and tags are required' });
    }
    if (!req.file && !video_url && !external_image_url) {
      return res.status(400).json({ error: 'Image or YouTube URL is required' });
    }
    const image_url = req.file ? `/uploads/${req.file.filename}` : (external_image_url || '');
    
    const newWork = new Work({
      title,
      description: description || '',
      image_url,
      video_url: video_url || null,
      tags
    });
    await newWork.save();

    res.json({
      id: newWork._id,
      title, description, image_url, video_url: video_url || null, tags,
      message: 'Work uploaded successfully ✨'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete work (auth required)
app.delete('/api/works/:id', authMiddleware, async (req, res) => {
  try {
    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }
    // Delete image file if it's a local upload
    if (work.image_url && work.image_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, work.image_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    await Work.findByIdAndDelete(req.params.id);
    res.json({ message: 'Work deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit work (auth required)
app.put('/api/works/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const { title, description, tags, video_url, external_image_url } = req.body;
    if (!title || !tags) {
      return res.status(400).json({ error: 'Title and tags are required' });
    }

    let new_image_url = work.image_url;
    if (req.file) {
      new_image_url = `/uploads/${req.file.filename}`;
      // Delete old image if it exists and is a local file
      if (work.image_url && work.image_url.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, work.image_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    } else if (external_image_url) {
      new_image_url = external_image_url;
      // Delete old image if it was local
      if (work.image_url && work.image_url.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, work.image_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    if (!new_image_url && !video_url && !work.video_url) {
      return res.status(400).json({ error: 'Image or YouTube URL is required' });
    }

    work.title = title;
    work.description = description || '';
    work.tags = tags;
    work.video_url = video_url || null;
    work.image_url = new_image_url;
    
    await work.save();

    res.json({
      id: work._id,
      title: work.title, 
      description: work.description, 
      image_url: work.image_url, 
      video_url: work.video_url, 
      tags: work.tags,
      message: 'Work updated successfully ✨'
    });
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
