// ============================================================
// Works Page — works.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initNavScroll();
  loadTags();
  loadWorks();
  checkUrlTag();
});

let allWorks = [];
let activeTag = 'all';

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

// --- Check URL tag param ---
function checkUrlTag() {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag');
  if (tag) {
    activeTag = tag;
    // Will be set active after tags load
    setTimeout(() => {
      document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tag === tag);
      });
      renderWorks();
    }, 500);
  }
}

// --- YouTube Helpers ---
function getYouTubeId(url) {
  if (!url) return null;
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getYouTubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}

// --- Load Tags ---
async function loadTags() {
  try {
    const res = await fetch('/api/tags');
    const tags = await res.json();
    const container = document.getElementById('tagFilters');
    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'tag-btn';
      btn.dataset.tag = tag;
      btn.textContent = tag;
      btn.addEventListener('click', () => filterByTag(tag));
      container.appendChild(btn);
    });
  } catch (err) {
    console.error('Failed to load tags:', err);
  }
}

// --- Filter By Tag ---
function filterByTag(tag) {
  activeTag = tag;
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tag === tag);
  });
  renderWorks();
}

// --- Load Works ---
async function loadWorks() {
  const spinner = document.getElementById('loadingSpinner');
  const emptyState = document.getElementById('emptyState');

  try {
    const res = await fetch('/api/works');
    allWorks = await res.json();
    if (spinner) spinner.remove();

    if (allWorks.length === 0) {
      emptyState.style.display = 'block';
    } else {
      renderWorks();
    }
  } catch (err) {
    if (spinner) spinner.remove();
    console.error('Failed to load works:', err);
    emptyState.style.display = 'block';
  }
}

// --- Render Works ---
function renderWorks() {
  const grid = document.getElementById('worksGrid');
  const emptyState = document.getElementById('emptyState');

  const filtered = activeTag === 'all'
    ? allWorks
    : allWorks.filter(w => w.tags.split(',').map(t => t.trim()).includes(activeTag));

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  grid.innerHTML = '';

  filtered.forEach((work, i) => {
    const card = document.createElement('div');
    card.className = 'work-card';
    card.style.animationDelay = `${i * 0.08}s`;

    const tags = work.tags.split(',').map(t => t.trim());
    const tagsHtml = tags.map(t => `<span class="card-tag">${t}</span>`).join('');

    // Determine thumbnail: uploaded image > YouTube thumbnail
    const thumbSrc = work.image_url || getYouTubeThumbnail(work.video_url);
    const videoBadge = work.video_url ? '<span class="video-badge">▶ Video</span>' : '';

    // Image count badge
    const totalImages = 1 + (work.images ? work.images.length : 0);
    const imgCountBadge = totalImages > 1
      ? `<span class="img-count-badge">🖼 ${totalImages}</span>`
      : '';
      
    // Star badge
    const starBadge = work.is_starred ? `<div class="star-badge" title="Featured Work">⭐</div>` : '';

    const recBadge = work.is_starred ? '<span class="recommended-badge">⭐ Featured</span>' : '';

    card.innerHTML = `
      <div class="card-media">
        <img src="${thumbSrc}" alt="${work.title}" loading="lazy">
        ${videoBadge}
        ${imgCountBadge}
        ${starBadge}
      </div>
      <div class="card-body">
        <h3 class="card-title">${work.title} ${recBadge}</h3>
        <p class="card-desc">${work.description || ''}</p>
        <div class="card-tags">${tagsHtml}</div>
      </div>
    `;

    // Navigate to detail page instead of lightbox
    card.addEventListener('click', () => {
      window.location.href = `/work-detail?id=${work.id}`;
    });

    grid.appendChild(card);
  });
}

// --- "All" tag click ---
document.querySelector('.tag-btn[data-tag="all"]')?.addEventListener('click', () => filterByTag('all'));
