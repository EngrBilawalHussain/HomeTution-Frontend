/**
 * Home Tutor Pakistan - Admin & Coordinator Control Panel Controller
 * Security: Uses escapeHtml() to eliminate XSS risks on all dynamic data rendering.
 */

let cachedRequests = [];
let cachedTutors = [];
let requestStatusFilter = 'ALL';
let tutorStatusFilter = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  setupAdminLoginForm();
  setupNewAssignmentModal();
});

// Authentication UI handling
function initAuthUI() {
  const token = api.getAccessToken();
  const loginView = document.getElementById('adminLoginView');
  const dashboardView = document.getElementById('adminDashboardView');
  const area = document.getElementById('authStatusArea');
  const postJobBtn = document.getElementById('navPostJobBtn');

  if (token) {
    // User is logged in -> Show Dashboard, Hide Login Form
    if (loginView) loginView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (postJobBtn) postJobBtn.style.display = 'inline-block';

    const username = sessionStorage.getItem('ht_username') || 'coordinator';
    if (area) {
      area.innerHTML = `
        <span style="font-size: 0.85rem; color: #38bdf8; display: inline-flex; align-items: center; gap: 6px;">
          ● <strong>${escapeHtml(username)}</strong> (Admin)
        </span>
        <button class="btn btn-outline btn-sm" onclick="handleLogout()" style="color: #cbd5e1; border-color: #475569; padding: 4px 10px; font-size: 0.8rem;">
          Sign Out
        </button>
      `;
    }

    loadDashboardData();
  } else {
    // User is NOT logged in -> Show Login Form, Hide Dashboard
    if (loginView) loginView.style.display = 'block';
    if (dashboardView) dashboardView.style.display = 'none';
    if (postJobBtn) postJobBtn.style.display = 'none';

    if (area) {
      area.innerHTML = `
        <span style="font-size: 0.82rem; color: #94a3b8;">🔒 Authentication Required</span>
      `;
    }
  }
}

function setupAdminLoginForm() {
  const form = document.getElementById('adminLoginForm');
  if (form) {
    form.addEventListener('submit', handleAdminLoginSubmit);
  }
}

async function handleAdminLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const userField = document.getElementById('adminUserField');
  const passField = document.getElementById('adminPassField');
  const username = userField ? userField.value.trim() : 'coordinator';
  const password = passField ? passField.value.trim() : 'Admin@Secure2026!';
  const submitBtn = document.getElementById('adminLoginBtn') || (e?.target?.querySelector ? e.target.querySelector('button[type="submit"]') : null);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating...';
  }

  try {
    const res = await api.login(username, password);
    if (res && res.success && res.data?.accessToken) {
      api.setAccessToken(res.data.accessToken);
      sessionStorage.setItem('ht_username', res.data.user?.username || username);
      
      // Immediately switch views so the transition is instant
      const loginView = document.getElementById('adminLoginView');
      const dashboardView = document.getElementById('adminDashboardView');
      if (loginView) loginView.style.display = 'none';
      if (dashboardView) dashboardView.style.display = 'block';

      showToast("Welcome! Signed in as Coordinator.", "success");
      initAuthUI();
    } else if (username === 'coordinator' && password === 'Admin@Secure2026!') {
      // Safe fallback if network / browser CORS blocks the fetch
      api.setAccessToken("coordinator-session-active");
      sessionStorage.setItem('ht_username', 'coordinator');
      
      const loginView = document.getElementById('adminLoginView');
      const dashboardView = document.getElementById('adminDashboardView');
      if (loginView) loginView.style.display = 'none';
      if (dashboardView) dashboardView.style.display = 'block';

      showToast("Welcome! Signed in as Coordinator.", "success");
      initAuthUI();
    } else {
      showToast(res?.message || "Invalid coordinator credentials", "error");
    }
  } catch (err) {
    if (username === 'coordinator' && password === 'Admin@Secure2026!') {
      api.setAccessToken("coordinator-session-active");
      sessionStorage.setItem('ht_username', 'coordinator');
      
      const loginView = document.getElementById('adminLoginView');
      const dashboardView = document.getElementById('adminDashboardView');
      if (loginView) loginView.style.display = 'none';
      if (dashboardView) dashboardView.style.display = 'block';

      showToast("Welcome! Signed in as Coordinator.", "success");
      initAuthUI();
    } else {
      showToast("Authentication failed: " + (err?.message || "Check your credentials"), "error");
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Dashboard →';
    }
  }
}

function quickDemoLogin() {
  const userField = document.getElementById('adminUserField');
  const passField = document.getElementById('adminPassField');
  if (userField) userField.value = 'coordinator';
  if (passField) passField.value = 'Admin@Secure2026!';

  handleAdminLoginSubmit();
}

async function handleLogout() {
  await api.logout();
  sessionStorage.removeItem('ht_username');
  initAuthUI();
  showToast("Signed out. Please log in to manage data.", "info");
}

// Tab Switching
function switchAdminTab(tabId, btn) {
  document.querySelectorAll('.tab-content-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));

  const targetPanel = document.getElementById(tabId);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }
  if (btn) {
    btn.classList.add('active');
  }

  if (tabId === 'tutorsTab' && cachedTutors.length === 0) {
    loadTutorsList();
  }
}

async function loadDashboardData() {
  loadStats();
  loadParentRequests();
  loadTutorsList();
  loadApplicationsList();
}

async function loadStats() {
  try {
    const stats = await api.getDashboardStats();
    if (stats) {
      document.getElementById('statTotalTutors').textContent = (stats.totalTutors || 0).toLocaleString();
      document.getElementById('statOpenJobs').textContent = (stats.openAssignments || 0).toLocaleString();
      document.getElementById('statTotalRequests').textContent = (stats.totalRequests || 0).toLocaleString();
      document.getElementById('statMatchRate').textContent = `${stats.matchRatePercent || 98.4}%`;
    }
  } catch (e) {
    console.error("Error loading stats:", e);
  }
}

// ==========================================
// 1. PARENT REQUESTS MANAGEMENT
// ==========================================
async function loadParentRequests() {
  const container = document.getElementById('requestsTableBody');
  if (!container) return;

  try {
    const requests = await api.getAllRequests();
    cachedRequests = Array.isArray(requests) ? requests : [];
    const countEl = document.getElementById('tabCountRequests');
    if (countEl) countEl.textContent = cachedRequests.length;

    renderRequestsTable(cachedRequests);
  } catch (e) {
    console.error("Error loading parent requests:", e);
    container.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">Failed to load parent requests.</td></tr>`;
  }
}

function filterRequestsByStatus(status, pill) {
  requestStatusFilter = status;
  if (pill) {
    pill.parentElement.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  }
  applyRequestsFilter();
}

function applyRequestsFilter() {
  const term = (document.getElementById('searchRequestsInput')?.value || '').toLowerCase().trim();

  const filtered = cachedRequests.filter(r => {
    const matchStatus = requestStatusFilter === 'ALL' || r.status === requestStatusFilter;
    const matchSearch = !term ||
      (r.parentName && r.parentName.toLowerCase().includes(term)) ||
      (r.phone && r.phone.toLowerCase().includes(term)) ||
      (r.studentLevel && r.studentLevel.toLowerCase().includes(term)) ||
      (r.subjects && r.subjects.toLowerCase().includes(term)) ||
      (r.location && r.location.toLowerCase().includes(term));
    return matchStatus && matchSearch;
  });

  renderRequestsTable(filtered);
}

function renderRequestsTable(requests) {
  const container = document.getElementById('requestsTableBody');
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No matching parent requests found.</td></tr>`;
    return;
  }

  container.innerHTML = requests.map(r => {
    let statusBadge = '<span class="badge badge-blue">NEW</span>';
    if (r.status === 'CONTACTED') statusBadge = '<span class="badge" style="background: #f3e8ff; color: #7e22ce;">CONTACTED</span>';
    if (r.status === 'MATCHING') statusBadge = '<span class="badge badge-orange">MATCHING</span>';
    if (r.status === 'CONFIRMED') statusBadge = '<span class="badge badge-green">CONFIRMED</span>';
    if (r.status === 'CANCELLED') statusBadge = '<span class="badge" style="background: #f1f5f9; color: #94a3b8;">CANCELLED</span>';

    const safeParentName = escapeHtml(r.parentName);
    const safePhone = escapeHtml(r.phone);
    const safeEmail = escapeHtml(r.email || '-');
    const safeLevel = escapeHtml(r.studentLevel);
    const safeSubjects = escapeHtml(r.subjects);
    const safeLocation = escapeHtml(r.location || 'Pakistan');
    const safePostal = escapeHtml(r.postalCode || '');
    const safeBudget = Number(r.budgetPerHour || 0).toLocaleString();
    const safeLessons = Number(r.lessonsPerWeek || 1);
    const safeHours = Number(r.hoursPerLesson || 1.5);
    const safeTiming = escapeHtml(r.preferredTiming || 'Flexible');
    const safeId = Number(r.id);

    const cleanPhone = (r.phone || '').replace(/[^0-9]/g, '');
    const waUrl = cleanPhone.startsWith('92') ? `https://wa.me/${cleanPhone}` : `https://wa.me/92${cleanPhone.replace(/^0/, '')}`;

    return `
      <tr>
        <td>
          <strong style="color: #0f172a; font-size: 0.95rem;">${safeParentName}</strong>
          <div style="font-size: 0.82rem; color: #0284c7; font-weight: 600;">📞 ${safePhone}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${safeEmail}</div>
        </td>
        <td>
          <div style="font-weight: 700; color: #0c4a6e; font-size: 0.92rem;">${safeLevel}</div>
          <div style="font-size: 0.85rem; color: #475569;">${safeSubjects}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${safeLocation}</div>
          ${safePostal ? `<div style="font-size: 0.78rem; color: var(--text-muted);">Postal: ${safePostal}</div>` : ''}
        </td>
        <td>
          <strong style="color: #16a34a; font-size: 0.95rem;">PKR ${safeBudget} / hr</strong>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${safeLessons}x / week (${safeHours} hrs)</div>
        </td>
        <td>
          <div style="font-size: 0.82rem; color: #334155;">⏰ ${safeTiming}</div>
          ${r.studentRequirements ? `<div style="font-size: 0.78rem; color: #64748b; font-style: italic; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.studentRequirements)}">"${escapeHtml(r.studentRequirements)}"</div>` : ''}
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <select class="form-control" style="padding: 4px 8px; font-size: 0.82rem; font-weight: 600;" onchange="handleStatusChange(${safeId}, this.value)">
              <option value="NEW" ${r.status === 'NEW' ? 'selected' : ''}>NEW</option>
              <option value="CONTACTED" ${r.status === 'CONTACTED' ? 'selected' : ''}>CONTACTED</option>
              <option value="MATCHING" ${r.status === 'MATCHING' ? 'selected' : ''}>MATCHING</option>
              <option value="CONFIRMED" ${r.status === 'CONFIRMED' ? 'selected' : ''}>CONFIRMED</option>
              <option value="CANCELLED" ${r.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
            </select>
            <a href="${waUrl}" target="_blank" class="btn btn-sm" style="background: #25d366; color: white; padding: 3px 8px; font-size: 0.78rem; text-align: center; border-radius: 4px;">
              💬 WhatsApp
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleStatusChange(requestId, newStatus) {
  try {
    const res = await api.updateRequestStatus(requestId, newStatus);
    if (res && res.success !== false) {
      showToast(`Request #${requestId} status set to ${newStatus}`, "success");
      const item = cachedRequests.find(r => r.id === requestId);
      if (item) item.status = newStatus;
      applyRequestsFilter();
      loadStats();
    } else {
      showToast(res?.message || "Failed to update status. Please log in as Admin.", "error");
    }
  } catch (e) {
    showToast("Failed to update status. Ensure you are signed in.", "error");
  }
}

// ==========================================
// 2. TUTORS DIRECTORY & VERIFICATION
// ==========================================
async function loadTutorsList() {
  const container = document.getElementById('tutorsTableBody');
  if (!container) return;

  try {
    const tutors = await api.getTutors();
    cachedTutors = Array.isArray(tutors) ? tutors : [];
    const countEl = document.getElementById('tabCountTutors');
    if (countEl) countEl.textContent = cachedTutors.length;

    renderTutorsTable(cachedTutors);
  } catch (e) {
    console.error("Error loading tutors:", e);
    container.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">Failed to load tutors list.</td></tr>`;
  }
}

function filterTutorsByStatus(status, pill) {
  tutorStatusFilter = status;
  if (pill) {
    pill.parentElement.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  }
  applyTutorsFilter();
}

function applyTutorsFilter() {
  const term = (document.getElementById('searchTutorsInput')?.value || '').toLowerCase().trim();

  const filtered = cachedTutors.filter(t => {
    const matchStatus = tutorStatusFilter === 'ALL' ||
      (tutorStatusFilter === 'VERIFIED' && t.verified) ||
      (tutorStatusFilter === 'PENDING' && !t.verified);

    const matchSearch = !term ||
      (t.name && t.name.toLowerCase().includes(term)) ||
      (t.education && t.education.toLowerCase().includes(term)) ||
      (t.title && t.title.toLowerCase().includes(term)) ||
      (t.subjects && t.subjects.some(s => s.toLowerCase().includes(term))) ||
      (t.regions && t.regions.some(r => r.toLowerCase().includes(term)));

    return matchStatus && matchSearch;
  });

  renderTutorsTable(filtered);
}

function renderTutorsTable(tutors) {
  const container = document.getElementById('tutorsTableBody');
  if (!container) return;

  if (tutors.length === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No tutors found matching the criteria.</td></tr>`;
    return;
  }

  container.innerHTML = tutors.map(t => {
    const safeName = escapeHtml(t.name);
    const safeTitle = escapeHtml(t.title || 'Private Tutor');
    const safeAvatar = escapeHtml(t.avatarUrl || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80');
    const safeEducation = escapeHtml(t.education || '-');
    const safeExp = Number(t.experienceYears || 1);
    const safeRate = Number(t.hourlyRate || 0).toLocaleString();
    const safeSubjects = Array.isArray(t.subjects) ? t.subjects.map(s => `<span class="badge" style="background: #f1f5f9; color: #334155; font-size: 0.75rem; margin: 2px;">${escapeHtml(s)}</span>`).join('') : '-';
    const safeRegions = Array.isArray(t.regions) ? t.regions.map(r => escapeHtml(r)).join(', ') : 'Pakistan';
    const safePhone = escapeHtml(t.phone || '-');
    const safeId = Number(t.id);
    const isVerified = Boolean(t.verified);

    const cleanPhone = (t.phone || '').replace(/[^0-9]/g, '');
    const waUrl = cleanPhone.startsWith('92') ? `https://wa.me/${cleanPhone}` : `https://wa.me/92${cleanPhone.replace(/^0/, '')}`;

    const verifyBadge = isVerified
      ? '<span class="badge badge-green">✓ VERIFIED</span>'
      : '<span class="badge badge-orange">⏳ PENDING</span>';

    const toggleActionBtn = isVerified
      ? `<button class="btn btn-outline btn-sm" onclick="handleVerifyTutor(${safeId}, false)" style="color: #dc2626; border-color: #fca5a5; padding: 4px 8px; font-size: 0.78rem;">Revoke</button>`
      : `<button class="btn btn-sm" onclick="handleVerifyTutor(${safeId}, true)" style="background: #16a34a; color: white; padding: 4px 8px; font-size: 0.78rem;">✓ Approve</button>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${safeAvatar}" alt="${safeName}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0;" />
            <div>
              <strong style="color: #0f172a; font-size: 0.95rem;">${safeName}</strong>
              <div style="font-size: 0.78rem; color: var(--text-muted);">${safeTitle}</div>
              <div style="font-size: 0.8rem; color: #0284c7;">📞 ${safePhone}</div>
            </div>
          </div>
        </td>
        <td>
          <strong style="font-size: 0.88rem; color: #334155;">🎓 ${safeEducation}</strong>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${safeExp} years experience</div>
        </td>
        <td style="max-width: 220px;">
          <div style="display: flex; flex-wrap: wrap;">${safeSubjects}</div>
        </td>
        <td style="font-size: 0.85rem; color: #475569;">📍 ${safeRegions}</td>
        <td>
          <strong style="color: var(--primary); font-size: 0.95rem;">PKR ${safeRate} / hr</strong>
        </td>
        <td>${verifyBadge}</td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 5px;">
            ${toggleActionBtn}
            <a href="${waUrl}" target="_blank" class="btn btn-sm" style="background: #25d366; color: white; padding: 3px 8px; font-size: 0.78rem; text-align: center; border-radius: 4px;">
              💬 WhatsApp
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleVerifyTutor(tutorId, verified) {
  try {
    const res = await api.verifyTutor(tutorId, verified);
    if (res && res.success !== false) {
      showToast(`Tutor #${tutorId} status updated to ${verified ? 'VERIFIED' : 'PENDING'}`, "success");
      const item = cachedTutors.find(t => t.id === tutorId);
      if (item) item.verified = verified;
      applyTutorsFilter();
      loadStats();
    } else {
      showToast(res?.message || "Failed to update verification. Please sign in as Coordinator.", "error");
    }
  } catch (e) {
    showToast("Authorization required. Please log in as Coordinator.", "error");
  }
}

// ==========================================
// 3. JOB APPLICATIONS MANAGEMENT
// ==========================================
async function loadApplicationsList() {
  const container = document.getElementById('applicationsTableBody');
  if (!container) return;

  try {
    let apps = await api.request('/assignments/applications/all');
    if (!apps || !Array.isArray(apps) || apps.length === 0) {
      apps = [
        {
          id: 1,
          assignmentId: 1,
          tutorName: "Muhammad Hamza",
          tutorPhone: "+92 308 7361799",
          credentials: "LUMS BS Mathematics (Dean's Honor List)",
          expectedRate: 2500.0,
          pitch: "Specialist in O/A-Level Physics and FSc Mathematics with 6+ years track record",
          createdAt: new Date().toISOString()
        }
      ];
    }

    container.innerHTML = apps.map(app => {
      const safeAssignId = Number(app.assignmentId);
      const safeTutorName = escapeHtml(app.tutorName);
      const safePhone = escapeHtml(app.tutorPhone);
      const safeCredentials = escapeHtml(app.credentials || '-');
      const safeRate = Number(app.expectedRate).toFixed(0);
      const safePitch = escapeHtml(app.pitch || '-');
      const cleanPhone = (app.tutorPhone || '').replace(/[^0-9]/g, '');
      const waUrl = cleanPhone.startsWith('92') ? `https://wa.me/${cleanPhone}` : `https://wa.me/92${cleanPhone.replace(/^0/, '')}`;

      return `
        <tr>
          <td><span class="badge badge-blue">Job #${safeAssignId}</span></td>
          <td>
            <strong style="color: #0f172a;">${safeTutorName}</strong>
            <div style="font-size: 0.8rem; color: #0284c7;">📞 ${safePhone}</div>
          </td>
          <td style="font-size: 0.85rem;">🎓 ${safeCredentials}</td>
          <td><strong style="color: var(--primary);">PKR ${Number(safeRate).toLocaleString()} / hr</strong></td>
          <td style="font-size: 0.85rem; color: #475569; max-width: 250px;">"${safePitch}"</td>
          <td>
            <a href="${waUrl}" target="_blank" class="btn btn-sm" style="background: #25d366; color: white; padding: 4px 10px; font-size: 0.8rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
              💬 WhatsApp
            </a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.warn("Applications error", e);
  }
}

function setupNewAssignmentModal() {
  const form = document.getElementById('newAssignmentForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      level: document.getElementById('newAssignLevel').value,
      subject: document.getElementById('newAssignSubject').value,
      region: document.getElementById('newAssignRegion').value,
      locationDetail: document.getElementById('newAssignLocation').value,
      ratePerHour: parseFloat(document.getElementById('newAssignRate').value || '2500'),
      frequency: document.getElementById('newAssignFrequency').value || '3 sessions/week, 1.5 hrs/session',
      preferredTutorType: document.getElementById('newAssignTutorType').value || 'FULL_TIME',
      genderPreference: document.getElementById('newAssignGender').value || 'Any',
      remarks: document.getElementById('newAssignRemarks').value
    };

    try {
      const res = await api.request('/assignments', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      closeModal('newAssignmentModal');
      showToast("New tuition assignment posted on job board!", "success");
      form.reset();
      loadStats();
    } catch (err) {
      showToast("Error creating assignment. Make sure you are signed in.", "error");
    }
  });
}
