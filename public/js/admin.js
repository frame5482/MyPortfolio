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
  initMultiFileUpload();
  initDynamicInputs();
  initLogout();
});

let authToken = localStorage.getItem('artfolio_token') || null;
let editingId = null;
let existingImages = []; // For editing — images to keep

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

// --- File Upload Preview (Main Image) ---
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

// --- Multi-File Upload (Gallery Images) ---
let pendingGalleryFiles = []; // New files to upload

function initMultiFileUpload() {
  const area = document.getElementById('multiFileUploadArea');
  const input = document.getElementById('workImages');

  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      for (const file of input.files) {
        pendingGalleryFiles.push(file);
      }
      renderMultiPreviews();
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
      for (const file of e.dataTransfer.files) {
        if (file.type.startsWith('image/')) {
          pendingGalleryFiles.push(file);
        }
      }
      renderMultiPreviews();
    }
  });
}

function renderMultiPreviews() {
  const container = document.getElementById('multiImagePreviews');
  container.innerHTML = '';

  // Existing images (when editing)
  existingImages.forEach((url, idx) => {
    const wrapper = createPreviewItem(url, 'existing', idx);
    container.appendChild(wrapper);
  });

  // New files
  pendingGalleryFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const wrapper = createPreviewItem(url, 'new', idx, file.name);
    container.appendChild(wrapper);
  });
}

function createPreviewItem(src, type, index, name) {
  const wrapper = document.createElement('div');
  wrapper.className = 'multi-preview-item';
  wrapper.innerHTML = `
    <img src="${src}" alt="Preview ${index + 1}">
    <button type="button" class="multi-preview-remove" title="ลบรูปนี้">✖</button>
    <span class="multi-preview-label">${type === 'existing' ? '📌' : '✨'} ${name || (index + 1)}</span>
  `;

  wrapper.querySelector('.multi-preview-remove').addEventListener('click', () => {
    if (type === 'existing') {
      existingImages.splice(index, 1);
    } else {
      pendingGalleryFiles.splice(index, 1);
    }
    renderMultiPreviews();
  });

  return wrapper;
}

// --- Dynamic Inputs (Videos & External Images) ---
function initDynamicInputs() {
  document.getElementById('addVideoBtn').addEventListener('click', () => {
    addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'เช่น https://www.youtube.com/watch?v=xxxxx');
  });

  document.getElementById('addExternalImageBtn').addEventListener('click', () => {
    addDynamicInput('externalImageInputsContainer', 'external_images', 'work-ext-image-input', 'ใส่ลิงก์รูปภาพเพิ่มเติม (เช่น https://...)');
  });

  // Event delegation for remove buttons
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-input-btn')) {
      e.target.closest('.dynamic-input-row').remove();
    }
  });
}

function addDynamicInput(containerId, name, className, placeholder, value = '') {
  const container = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'dynamic-input-row';
  row.style.cssText = 'display:flex; gap:10px; margin-bottom:0.5rem; animation: cardFadeIn 0.3s ease;';
  
  row.innerHTML = `
    <input type="url" name="${name}" class="${className}" placeholder="${placeholder}" value="${value}" style="flex:1;">
    <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem;">✕</button>
  `;
  container.appendChild(row);
}

function clearDynamicInputs(containerId, defaultHtml) {
  document.getElementById(containerId).innerHTML = defaultHtml;
}

// --- Upload Work ---
function initUpload() {
  const form = document.getElementById('uploadForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Collect videos
    const videoInputs = document.querySelectorAll('.work-video-input');
    const videos = Array.from(videoInputs).map(i => i.value.trim()).filter(Boolean);
    const videoUrl = videos.length > 0 ? videos[0] : ''; // use first video as main video

    // Collect external images
    const extImgInputs = document.querySelectorAll('.work-ext-image-input');
    const externalImages = Array.from(extImgInputs).map(i => i.value.trim()).filter(Boolean);

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
    videos.forEach(v => formData.append('videos', v));

    if (externalImageUrl) formData.append('external_image_url', externalImageUrl);
    externalImages.forEach(img => formData.append('external_images', img));
    
    if (imageFile) formData.append('image', imageFile);

    // Append gallery images
    pendingGalleryFiles.forEach(file => {
      formData.append('images', file);
    });

    // For editing, send list of existing images to keep
    if (editingId && existingImages.length > 0) {
      formData.append('keep_existing_images', JSON.stringify(existingImages));
    }

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/works/${editingId}` : '/api/works';

    const submitBtn = document.getElementById('submitBtn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '⏳ กำลังอัปโหลด...';
    submitBtn.disabled = true;

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
            const totalMB = (e.total / 1024 / 1024).toFixed(1);
            submitBtn.innerHTML = `⏳ กำลังอัปโหลด... ${loadedMB}/${totalMB}MB`;
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              if (xhr.status === 401) {
                authToken = null;
                localStorage.removeItem('artfolio_token');
                hideAdminPanel();
                reject({ error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
              } else {
                reject(data);
              }
            }
          } catch(err) {
            reject({ error: 'เกิดข้อผิดพลาดในการอ่านข้อมูล' });
          }
        };

        xhr.onerror = () => reject({ error: 'Network error เกิดข้อผิดพลาดในการเชื่อมต่อ' });
        xhr.send(formData);
      });

      // Upload success - Show checkmarks on previews
      const previews = document.querySelectorAll('#imagePreview.visible, #multiImagePreviews .gallery-preview-item');
      previews.forEach(el => {
        const tick = document.createElement('div');
        tick.innerHTML = '✅';
        tick.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-size:3rem; z-index:10; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5)); animation: cardFadeIn 0.3s ease;';
        el.style.position = 'relative';
        el.appendChild(tick);
      });

      if (previews.length > 0) {
        await new Promise(r => setTimeout(r, 1000)); // wait 1 sec to let user see ticks
      }

      showToast(editingId ? 'อัปเดตผลงานสำเร็จ! ✨' : 'อัปโหลดสำเร็จ! ✨');
      cancelEdit();
      loadAdminWorks();
    } catch (err) {
      console.error('Upload error:', err);
      showToast(err.error || 'เกิดข้อผิดพลาดในการอัปโหลด', 'error');
    } finally {
      submitBtn.innerHTML = originalBtnText;
      submitBtn.disabled = false;
    }
  });

  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
}

function cancelEdit() {
  editingId = null;
  existingImages = [];
  pendingGalleryFiles = [];
  document.getElementById('uploadForm').reset();
  document.getElementById('workImageUrl').value = '';
  document.getElementById('imagePreview').classList.remove('visible');
  document.getElementById('previewImg').src = '';
  document.getElementById('multiImagePreviews').innerHTML = '';
  // Reset dynamic inputs
  clearDynamicInputs('videoInputsContainer', `
    <div class="dynamic-input-row" style="display:flex; gap:10px; margin-bottom:0.5rem;">
      <input type="url" name="videos" class="work-video-input" placeholder="เช่น https://www.youtube.com/watch?v=xxxxx" style="flex:1;">
      <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem; display:none;">✕</button>
    </div>
  `);
  clearDynamicInputs('externalImageInputsContainer', `
    <div class="dynamic-input-row" style="display:flex; gap:10px; margin-bottom:0.5rem;">
      <input type="url" name="external_images" class="work-ext-image-input" placeholder="ใส่ลิงก์รูปภาพเพิ่มเติม (เช่น https://...)" style="flex:1;">
      <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem; display:none;">✕</button>
    </div>
  `);

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

    if (!Array.isArray(works) || works.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>ยังไม่มีผลงาน (หรือเชื่อมต่อฐานข้อมูลไม่ได้)</p></div>';
      return;
    }

    container.innerHTML = works.map((work, index) => {
      const thumbSrc = work.image_url || getYouTubeThumbnail(work.video_url);
      const videoBadge = work.video_url ? '<span style="color:var(--peach-dark);font-size:0.75rem;">🎬 YouTube</span>' : '';
      const imgCount = 1 + (work.images ? work.images.length : 0);
      const imgBadge = imgCount > 1 ? `<span style="color:var(--lavender-dark);font-size:0.75rem;">🖼 ${imgCount} รูป</span>` : '';
      const starBtn = `<button class="btn btn-sm ${work.is_starred ? 'btn-warning' : 'btn-secondary'}" onclick="toggleStar('${work.id}')" title="ติดดาวให้อยู่อันดับแรก">⭐</button>`;
      
      return `
      <div class="admin-work-item" data-id="${work.id}" style="${work.is_starred ? 'border-left: 4px solid gold;' : ''}" draggable="true" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)" ondragend="dragEnd(event)">
        <div style="cursor: grab; padding: 0 10px; font-size: 1.2rem; color: var(--text-lighter);">⋮⋮</div>
        <img src="${thumbSrc}" alt="${work.title}" class="admin-work-thumb" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23f0f0f0\\'/><text y=\\'50%\\' x=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'40\\'>🖼</text></svg>'">
        <div class="admin-work-info">
          <h3>${work.title}</h3>
          <p>${work.tags} ${videoBadge} ${imgBadge}</p>
        </div>
        <div style="display: flex; gap: 5px; align-items: center;">
          ${starBtn}
          <button class="btn btn-primary btn-sm" onclick="editWork('${work.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteWork('${work.id}')">🗑</button>
        </div>
      </div>
    `;
    }).join('');
  } catch (err) {
    console.error('Failed to load works:', err);
  }
}

// --- Toggle Star ---
window.toggleStar = async function(id) {
  try {
    const res = await fetch(`/api/works/${id}/star`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      loadAdminWorks();
    }
  } catch (err) {
    console.error('Toggle star error:', err);
  }
};

// --- Drag and Drop Reordering ---
let dragSource = null;

window.dragStart = function(e) {
  dragSource = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
};

window.dragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
};

window.dragEnter = function(e) {
  e.currentTarget.classList.add('drag-over');
};

window.dragLeave = function(e) {
  e.currentTarget.classList.remove('drag-over');
};

window.drop = async function(e) {
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  
  if (dragSource && dragSource !== e.currentTarget) {
    const allItems = Array.from(document.querySelectorAll('.admin-work-item'));
    const sourceIndex = allItems.indexOf(dragSource);
    const targetIndex = allItems.indexOf(e.currentTarget);
    
    const list = document.getElementById('worksList');
    if (sourceIndex < targetIndex) {
      list.insertBefore(dragSource, e.currentTarget.nextSibling);
    } else {
      list.insertBefore(dragSource, e.currentTarget);
    }
    
    // Save order
    const orderedIds = Array.from(document.querySelectorAll('.admin-work-item')).map(item => item.dataset.id);
    
    try {
      await fetch('/api/works/reorder', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderedIds })
      });
      // reload to sort starred properly
      loadAdminWorks();
    } catch (err) {
      console.error('Reorder error:', err);
    }
  }
  return false;
};

window.dragEnd = function(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.admin-work-item').forEach(el => el.classList.remove('drag-over'));
};

// --- Edit Work ---
function editWork(id) {
  const work = window.adminWorks.find(w => w.id === id);
  if (!work) return;

  editingId = id;
  document.getElementById('workTitle').value = work.title;
  document.getElementById('workDesc').value = work.description || '';
  document.getElementById('workTags').value = work.tags;
  
  // Populate videos
  document.getElementById('videoInputsContainer').innerHTML = '';
  const workVideos = work.videos && work.videos.length > 0 ? work.videos : (work.video_url ? [work.video_url] : []);
  if (workVideos.length === 0) {
    addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'เช่น https://www.youtube.com/watch?v=xxxxx');
    document.querySelector('#videoInputsContainer .remove-input-btn').style.display = 'none';
  } else {
    workVideos.forEach(v => {
      addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'เช่น https://www.youtube.com/watch?v=xxxxx', v);
    });
  }

  // Populate external image links (since images includes both local and external, we extract only external for these inputs, OR we just show them in the multiImagePreviews. Let's just reset the external image inputs because existing images are managed by the multiImagePreviews container)
  document.getElementById('externalImageInputsContainer').innerHTML = `
    <div class="dynamic-input-row" style="display:flex; gap:10px; margin-bottom:0.5rem;">
      <input type="url" name="external_images" class="work-ext-image-input" placeholder="ใส่ลิงก์รูปภาพเพิ่มเติม (เช่น https://...)" style="flex:1;">
      <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem; display:none;">✕</button>
    </div>
  `;
  
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

  // Load existing gallery images
  existingImages = work.images ? [...work.images] : [];
  pendingGalleryFiles = [];
  renderMultiPreviews();

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
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\\w-]{11})/);
  return match ? match[1] : null;
}

function getYouTubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}
