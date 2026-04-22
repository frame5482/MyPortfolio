// ============================================================
// Admin Page — admin.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initNavScroll();
  checkAuth();
  initLogin();
  initUpload();
  initFileUpload();
  initLogout();
});

let authToken = localStorage.getItem('artfolio_token') || null;
let editingId = null;

// --- Navigation ---
function initNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => links.classList.remove('open'));
    });
  }
}

function initNavScroll() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  });
}

// --- Toast ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : '❌'} ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Auth Check ---
function checkAuth() {
  if (authToken) {
    showAdminPanel();
    loadAdminWorks();
  }
}

function showAdminPanel() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('uploadSection').classList.add('visible');
  document.getElementById('worksListSection').classList.add('visible');
  document.getElementById('adminTopbar').classList.add('visible');
}

function hideAdminPanel() {
  document.getElementById('loginSection').style.display = '';
  document.getElementById('uploadSection').classList.remove('visible');
  document.getElementById('worksListSection').classList.remove('visible');
  document.getElementById('adminTopbar').classList.remove('visible');
}

// --- Login ---
function initLogin() {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'รหัสผ่านไม่ถูกต้อง', 'error');
        return;
      }
      authToken = data.token;
      localStorage.setItem('artfolio_token', authToken);
      showToast('เข้าสู่ระบบสำเร็จ! ✨');
      showAdminPanel();
      loadAdminWorks();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  });
}

// --- Logout ---
function initLogout() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('artfolio_token');
    hideAdminPanel();
    document.getElementById('passwordInput').value = '';
    showToast('ออกจากระบบแล้ว');
  });
}

// --- File Upload Preview ---
function initFileUpload() {
  const area = document.getElementById('fileUploadArea');
  const input = document.getElementById('workImage');
  const preview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');

  input.addEventListener('change', () => {
    if (input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        preview.classList.add('visible');
      };
      reader.readAsDataURL(input.files[0]);
    }
  });

  const removeImgBtn = document.getElementById('removeImgBtn');
  if (removeImgBtn) {
    removeImgBtn.addEventListener('click', () => {
      input.value = '';
      document.getElementById('workImageUrl').value = '';
      previewImg.src = '';
      preview.classList.remove('visible');
    });
  }

  const workImageUrl = document.getElementById('workImageUrl');
  workImageUrl.addEventListener('input', () => {
    if (workImageUrl.value.trim()) {
      previewImg.src = workImageUrl.value.trim();
      preview.classList.add('visible');
      input.value = ''; // clear file if url is entered
    } else if (!input.files[0]) {
      preview.classList.remove('visible');
    }
  });

  // Drag & drop
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('dragover');
  });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });
}

// --- Upload Work ---
function initUpload() {
  const form = document.getElementById('uploadForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const videoUrl = document.getElementById('workVideo').value.trim();
    const imageFile = document.getElementById('workImage').files[0];
    const externalImageUrl = document.getElementById('workImageUrl').value.trim();

    if (!imageFile && !videoUrl && !externalImageUrl) {
      showToast('กรุณาใส่รูปภาพ หรือ YouTube URL', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('title', document.getElementById('workTitle').value);
    formData.append('description', document.getElementById('workDesc').value);
    formData.append('tags', document.getElementById('workTags').value);
    if (videoUrl) formData.append('video_url', videoUrl);
    if (externalImageUrl) formData.append('external_image_url', externalImageUrl);
    if (imageFile) formData.append('image', imageFile);

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/works/${editingId}` : '/api/works';

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          authToken = null;
          localStorage.removeItem('artfolio_token');
          hideAdminPanel();
          showToast('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
          return;
        }
        showToast(data.error || 'อัปโหลดล้มเหลว', 'error');
        return;
      }
      showToast(editingId ? 'อัปเดตผลงานสำเร็จ! ✨' : 'อัปโหลดสำเร็จ! ✨');
      cancelEdit();
      loadAdminWorks();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  });

  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
}

function cancelEdit() {
  editingId = null;
  document.getElementById('uploadForm').reset();
  document.getElementById('workImageUrl').value = '';
  document.getElementById('imagePreview').classList.remove('visible');
  document.getElementById('previewImg').src = '';
  document.getElementById('submitBtn').innerHTML = '✨ อัปโหลด';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.querySelector('.upload-card h2').textContent = '📤 อัปโหลดผลงานใหม่';
}

// --- Load Admin Works List ---
async function loadAdminWorks() {
  try {
    const res = await fetch('/api/works');
    const works = await res.json();
    const container = document.getElementById('worksList');

    window.adminWorks = works; // Store globally for editing

    if (works.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>ยังไม่มีผลงาน</p></div>';
      return;
    }

    container.innerHTML = works.map(work => {
      const thumbSrc = work.image_url || getYouTubeThumbnail(work.video_url);
      const videoBadge = work.video_url ? '<span style="color:var(--peach-dark);font-size:0.75rem;">🎬 YouTube</span>' : '';
      return `
      <div class="admin-work-item" data-id="${work.id}">
        <img src="${thumbSrc}" alt="${work.title}" class="admin-work-thumb" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23f0f0f0\\'/><text y=\\'50%\\' x=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'40\\'>🖼</text></svg>'">
        <div class="admin-work-info">
          <h3>${work.title}</h3>
          <p>${work.tags} ${videoBadge}</p>
        </div>
        <div style="display: flex; gap: 5px;">
          <button class="btn btn-primary btn-sm" onclick="editWork('${work.id}')">✏️ แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteWork('${work.id}')">🗑 ลบ</button>
        </div>
      </div>
    `;
    }).join('');
  } catch (err) {
    console.error('Failed to load works:', err);
  }
}

// --- Edit Work ---
function editWork(id) {
  const work = window.adminWorks.find(w => w.id === id);
  if (!work) return;

  editingId = id;
  document.getElementById('workTitle').value = work.title;
  document.getElementById('workDesc').value = work.description || '';
  document.getElementById('workTags').value = work.tags;
  document.getElementById('workVideo').value = work.video_url || '';
  
  if (work.image_url && work.image_url.startsWith('http')) {
    document.getElementById('workImageUrl').value = work.image_url;
  } else {
    document.getElementById('workImageUrl').value = '';
  }

  if (work.image_url) {
    document.getElementById('previewImg').src = work.image_url;
    document.getElementById('imagePreview').classList.add('visible');
  } else {
    document.getElementById('imagePreview').classList.remove('visible');
  }

  document.getElementById('submitBtn').innerHTML = '💾 บันทึกการแก้ไข';
  document.getElementById('cancelEditBtn').style.display = 'block';
  document.querySelector('.upload-card h2').textContent = '✏️ แก้ไขผลงาน';
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Delete Work ---
async function deleteWork(id) {
  if (!confirm('ต้องการลบผลงานนี้จริงๆ หรือ?')) return;
  try {
    const res = await fetch(`/api/works/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) {
      const data = await res.json();
      if (res.status === 401) {
        authToken = null;
        localStorage.removeItem('artfolio_token');
        hideAdminPanel();
        showToast('Session หมดอายุ', 'error');
        return;
      }
      showToast(data.error || 'ลบล้มเหลว', 'error');
      return;
    }
    showToast('ลบผลงานสำเร็จ');
    loadAdminWorks();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

// --- YouTube Helpers ---
function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

function getYouTubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}
