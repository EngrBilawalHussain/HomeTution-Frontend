/**
 * Main application scripts: Navbar, Mobile Drawer, Toast alerts, Form helpers
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initModals();
});

// Mobile Navbar toggle
function initNavbar() {
  const hamburger = document.querySelector('.hamburger');
  const navMenu = document.querySelector('.nav-menu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      navMenu.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
        hamburger.classList.remove('open');
        navMenu.classList.remove('open');
      }
    });
  }
}

// Toast notification helper
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : '⚠';
  toast.innerHTML = `
    <span style="font-weight: 800; font-size: 1.1rem; color: ${type === 'success' ? '#10b981' : '#ef4444'}">${icon}</span>
    <span style="flex-grow: 1;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Global modal handling
function initModals() {
  const overlays = document.querySelectorAll('.modal-overlay');
  overlays.forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });

    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeModal(overlay.id);
      });
    }
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Helper formatters
function formatCurrency(amount) {
  return 'PKR ' + Number(amount || 0).toLocaleString('en-PK');
}

function formatTutorType(type) {
  switch (type) {
    case 'PART_TIME': return 'Part-Time / Student Tutor (LUMS/NUST)';
    case 'FULL_TIME': return 'Full-Time Professional Tutor';
    case 'MOE_EX_CURRENT': return 'Certified School/College Teacher';
    default: return type || 'Verified Tutor';
  }
}
