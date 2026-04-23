require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

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

// --- Multer & Cloudinary Config ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'demo',
  api_key: process.env.CLOUDINARY_API_KEY || '1234',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'abcd'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'web-portfolio',
    allowedFormats: ['jpeg', 'png', 'jpg', 'gif', 'webp', 'svg']
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

// Multi-file upload config (up to 10 images)
const uploadMulti = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]);

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
      query = { tags: { $regex: new RegExp(`\\\\b${tag}\\\\b`, 'i') } };
    }
    const works = await Work.find(query).sort({ created_at: -1 });
    
    const mappedWorks = works.map(w => ({
      id: w._id,
      title: w.title,
      description: w.description,
      image_url: w.image_url,
      images: w.images || [],
      video_url: w.video_url,
      videos: w.videos || [],
      tags: w.tags,
      created_at: w.created_at
    }));
    res.json(mappedWorks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single work by ID
app.get('/api/works/:id', async (req, res) => {
  try {
    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }
    res.json({
      id: work._id,
      title: work.title,
      description: work.description,
      image_url: work.image_url,
      images: work.images || [],
      video_url: work.video_url,
      videos: work.videos || [],
      tags: work.tags,
      created_at: work.created_at
    });
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
app.post('/api/works', authMiddleware, (req, res, next) => {
  uploadMulti(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { title, description, tags, video_url, external_image_url } = req.body;
    if (!title || !tags) {
      return res.status(400).json({ error: 'Title and tags are required' });
    }

    // Primary image
    const mainFile = req.files && req.files['image'] ? req.files['image'][0] : null;
    const image_url = mainFile ? mainFile.path : convertDriveLink(external_image_url || '');

    if (!image_url && !video_url) {
      return res.status(400).json({ error: 'Image or YouTube URL is required' });
    }

    // Additional images
    let images = [];
    if (req.files && req.files['images']) {
      images = req.files['images'].map(f => f.path);
    }
    // Parse external image URLs if provided
    let externalImages = req.body.external_images;
    if (externalImages) {
      if (typeof externalImages === 'string') {
        try { externalImages = JSON.parse(externalImages); } catch(e) { externalImages = [externalImages]; }
      } else if (Array.isArray(externalImages)) {
        // already array
      }
      images = images.concat(externalImages.map(convertDriveLink).filter(u => u && u.trim()));
    }

    // Parse additional videos
    let parsedVideos = [];
    if (req.body.videos) {
      if (typeof req.body.videos === 'string') {
        try { parsedVideos = JSON.parse(req.body.videos); } catch(e) { parsedVideos = [req.body.videos]; }
      } else if (Array.isArray(req.body.videos)) {
        parsedVideos = req.body.videos;
      }
    }
    parsedVideos = parsedVideos.filter(u => u && u.trim());
    
    const newWork = new Work({
      title,
      description: description || '',
      image_url,
      images,
      video_url: video_url || null,
      videos: parsedVideos,
      tags
    });
    await newWork.save();

    res.json({
      id: newWork._id,
      title, description, image_url, images, video_url: video_url || null, videos: parsedVideos, tags,
      message: 'Work uploaded successfully ✨'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to convert Google Drive links
function convertDriveLink(url) {
  if (!url) return url;
  const match = url.match(/(?:drive\.google\.com\/file\/d\/|drive\.google\.com\/open\?id=)([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }
  return url;
}

// Helper to delete local or Cloudinary file
async function deleteLocalFile(fileUrl) {
  if (fileUrl && fileUrl.includes('res.cloudinary.com')) {
    try {
      // Extract public_id from Cloudinary URL (assuming folder web-portfolio/)
      const parts = fileUrl.split('/');
      const filename = parts[parts.length - 1];
      const publicId = 'web-portfolio/' + filename.split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    } catch(e) {
      console.error('Cloudinary delete error:', e);
    }
  } else if (fileUrl && fileUrl.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, fileUrl);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch(e) {}
    }
  }
}

// Delete work (auth required)
app.delete('/api/works/:id', authMiddleware, async (req, res) => {
  try {
    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }
    // Delete main image
    deleteLocalFile(work.image_url);
    // Delete additional images
    if (work.images && work.images.length > 0) {
      work.images.forEach(img => deleteLocalFile(img));
    }
    await Work.findByIdAndDelete(req.params.id);
    res.json({ message: 'Work deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit work (auth required)
app.put('/api/works/:id', authMiddleware, (req, res, next) => {
  uploadMulti(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const { title, description, tags, video_url, external_image_url } = req.body;
    if (!title || !tags) {
      return res.status(400).json({ error: 'Title and tags are required' });
    }

    // Handle main image
    let new_image_url = work.image_url;
    const mainFile = req.files && req.files['image'] ? req.files['image'][0] : null;
    if (mainFile) {
      new_image_url = mainFile.path;
      deleteLocalFile(work.image_url);
    } else if (external_image_url) {
      new_image_url = convertDriveLink(external_image_url);
      deleteLocalFile(work.image_url);
    }

    if (!new_image_url && !video_url && !work.video_url) {
      return res.status(400).json({ error: 'Image or YouTube URL is required' });
    }

    // Handle additional images
    let newImages = [];
    // Check if we should keep existing images
    let keepExisting = req.body.keep_existing_images;
    if (keepExisting) {
      if (typeof keepExisting === 'string') {
        try { keepExisting = JSON.parse(keepExisting); } catch(e) { keepExisting = [keepExisting]; }
      }
      newImages = keepExisting.filter(u => u && u.trim());
    }
    // Delete old images that are not in keepExisting
    if (work.images && work.images.length > 0) {
      work.images.forEach(img => {
        if (!newImages.includes(img)) {
          deleteLocalFile(img);
        }
      });
    }
    // Add newly uploaded images
    if (req.files && req.files['images']) {
      const uploadedImages = req.files['images'].map(f => f.path);
      newImages = newImages.concat(uploadedImages);
    }
    // Add external image URLs
    let externalImages = req.body.external_images;
    if (externalImages) {
      if (typeof externalImages === 'string') {
        try { externalImages = JSON.parse(externalImages); } catch(e) { externalImages = [externalImages]; }
      } else if (Array.isArray(externalImages)) {
          // already array
      }
      newImages = newImages.concat(externalImages.map(convertDriveLink).filter(u => u && u.trim()));
    }

    // Parse additional videos
    let parsedVideos = [];
    if (req.body.videos) {
      if (typeof req.body.videos === 'string') {
        try { parsedVideos = JSON.parse(req.body.videos); } catch(e) { parsedVideos = [req.body.videos]; }
      } else if (Array.isArray(req.body.videos)) {
        parsedVideos = req.body.videos;
      }
    }
    parsedVideos = parsedVideos.filter(u => u && u.trim());

    work.title = title;
    work.description = description || '';
    work.tags = tags;
    work.video_url = video_url || null;
    work.image_url = new_image_url;
    work.images = newImages;
    work.videos = parsedVideos;
    
    await work.save();

    res.json({
      id: work._id,
      title: work.title, 
      description: work.description, 
      image_url: work.image_url,
      images: work.images,
      video_url: work.video_url, 
      videos: work.videos,
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
