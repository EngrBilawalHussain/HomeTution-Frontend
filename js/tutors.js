/**
 * Tutors Directory: Search, Filters, Profile Rendering, Request modal
 * Security: Uses escapeHtml() on all dynamic content to prevent XSS.
 */

let allTutors = [];

document.addEventListener('DOMContentLoaded', () => {
  loadTutors();
  setupFilters();
  setupRequestTutorModal();
});

async function loadTutors() {
  const container = document.getElementById('tutorsGrid');
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
      <p>Loading verified tutors...</p>
    </div>
  `;

  try {
    allTutors = await api.getTutors();
    renderTutors(allTutors);
  } catch (e) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">Unable to load tutors. Please try again.</p>`;
  }
}

function renderTutors(tutors) {
  const container = document.getElementById('tutorsGrid');
  const countEl = document.getElementById('tutorsCount');
  if (!container) return;

  if (countEl) {
    countEl.textContent = `Showing ${tutors.length} verified tutors`;
  }

  if (tutors.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: white; border-radius: 12px; border: 1px dashed var(--border-color);">
        <h3 style="margin-bottom: 8px;">No matching tutors found</h3>
        <p style="color: var(--text-muted); margin-bottom: 20px;">Try adjusting your filter criteria or let our coordinators match you directly.</p>
        <a href="request-tutor.html" class="btn btn-primary">Request Custom Tutor Match</a>
      </div>
    `;
    return;
  }

  container.innerHTML = tutors.map(tutor => {
    const subjectsHtml = tutor.subjects.map(s => `<span class="tutor-tag">${escapeHtml(s)}</span>`).join('');
    const levelsHtml = tutor.levels.map(l => `<span class="tutor-tag" style="background:#e0f2fe; color:#0369a1;">${escapeHtml(l)}</span>`).join('');
    
    let badgeClass = 'badge-blue';
    if (tutor.tutorType === 'MOE_EX_CURRENT') badgeClass = 'badge-orange';
    if (tutor.tutorType === 'FULL_TIME') badgeClass = 'badge-green';

    const safeAvatar = escapeHtml(tutor.avatarUrl);
    const safeName = escapeHtml(tutor.name);
    const safeTitle = escapeHtml(tutor.title);
    const safeEducation = escapeHtml(tutor.education);
    const safeBio = escapeHtml(tutor.bio);
    const safeRate = Number(tutor.hourlyRate).toFixed(0);

    return `
      <div class="tutor-card">
        <div class="tutor-header">
          <img src="${safeAvatar}" alt="${safeName}" class="tutor-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'" />
          <div class="tutor-info">
            <h3>${safeName} ${tutor.verified ? '<span class="verified-icon" title="Identity & Qualifications Verified">✓</span>' : ''}</h3>
            <p class="tutor-title">${safeTitle}</p>
            <div class="tutor-rating">
              <span>★ ${Number(tutor.rating).toFixed(2)}</span>
              <span style="color: var(--text-muted); font-weight: normal;">(${Number(tutor.reviewCount)} reviews)</span>
              <span class="badge ${badgeClass}" style="margin-left: auto;">${escapeHtml(formatTutorType(tutor.tutorType).split(' ')[0])}</span>
            </div>
          </div>
        </div>

        <div style="font-size: 0.85rem; color: #475569; margin-bottom: 12px; font-weight: 500;">
          🎓 ${safeEducation} • ${Number(tutor.experienceYears)} yrs experience
        </div>

        <div class="tutor-tags">
          ${subjectsHtml}
          ${levelsHtml}
        </div>

        <p class="tutor-bio">${safeBio}</p>

        <div class="tutor-footer">
          <div class="tutor-rate">
            PKR ${Number(safeRate).toLocaleString()} <span>/ hr</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openRequestTutorModal(${Number(tutor.id)})">
            Request Tutor
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function setupFilters() {
  const searchInput = document.getElementById('searchQuery');
  const levelFilter = document.getElementById('filterLevel');
  const typeFilter = document.getElementById('filterType');
  const regionFilter = document.getElementById('filterRegion');
  const maxRateInput = document.getElementById('filterMaxRate');
  const rateValueDisplay = document.getElementById('maxRateDisplay');

  function applyFilters() {
    const query = searchInput?.value.toLowerCase().trim() || '';
    const level = levelFilter?.value || '';
    const type = typeFilter?.value || '';
    const region = regionFilter?.value || '';
    const maxRate = maxRateInput ? parseFloat(maxRateInput.value) : 150;

    if (rateValueDisplay && maxRateInput) {
      rateValueDisplay.textContent = `$${maxRate}/hr`;
    }

    const filtered = allTutors.filter(t => {
      const matchQuery = !query || 
        t.name.toLowerCase().includes(query) || 
        t.title.toLowerCase().includes(query) || 
        t.subjects.some(s => s.toLowerCase().includes(query)) ||
        t.education.toLowerCase().includes(query);

      const matchLevel = !level || t.levels.some(l => l.toLowerCase().includes(level.toLowerCase()));
      const matchType = !type || t.tutorType === type;
      const matchRegion = !region || t.regions.some(r => r.toLowerCase().includes(region.toLowerCase()));
      const matchRate = t.hourlyRate <= maxRate;

      return matchQuery && matchLevel && matchType && matchRegion && matchRate;
    });

    renderTutors(filtered);
  }

  searchInput?.addEventListener('input', applyFilters);
  levelFilter?.addEventListener('change', applyFilters);
  typeFilter?.addEventListener('change', applyFilters);
  regionFilter?.addEventListener('change', applyFilters);
  maxRateInput?.addEventListener('input', applyFilters);

  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (levelFilter) levelFilter.value = '';
      if (typeFilter) typeFilter.value = '';
      if (regionFilter) regionFilter.value = '';
      if (maxRateInput) maxRateInput.value = 150;
      if (rateValueDisplay) rateValueDisplay.textContent = '$150/hr';
      renderTutors(allTutors);
    });
  }
}

function openRequestTutorModal(tutorId) {
  const tutor = allTutors.find(t => t.id === tutorId);
  if (!tutor) return;

  const modal = document.getElementById('tutorModal');
  if (!modal) return;

  document.getElementById('modalTutorId').value = tutor.id;
  document.getElementById('modalTutorName').textContent = tutor.name;
  document.getElementById('modalTutorTitle').textContent = tutor.title;
  document.getElementById('modalTutorRate').textContent = `$${tutor.hourlyRate}/hr`;
  document.getElementById('modalTutorAvatar').src = tutor.avatarUrl;

  openModal('tutorModal');
}

function setupRequestTutorModal() {
  const form = document.getElementById('modalRequestForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tutorId = document.getElementById('modalTutorId').value;
    const tutor = allTutors.find(t => t.id === Number(tutorId));

    const payload = {
      parentName: document.getElementById('modalParentName').value,
      phone: document.getElementById('modalParentPhone').value,
      email: document.getElementById('modalParentEmail').value,
      studentLevel: document.getElementById('modalStudentLevel').value,
      subjects: document.getElementById('modalSubjects').value,
      location: document.getElementById('modalLocation').value,
      budgetPerHour: tutor ? tutor.hourlyRate : 50,
      studentRequirements: `Requested specific tutor: ${tutor ? tutor.name : 'ID ' + tutorId}`,
      preferredTutorType: tutor ? tutor.tutorType : 'FULL_TIME'
    };

    try {
      const res = await api.submitTutorRequest(payload);
      closeModal('tutorModal');
      showToast(res.message || `Request submitted! Coordinator will connect with you.`, "success");
      form.reset();
    } catch (err) {
      showToast("Error sending request. Please WhatsApp coordinator directly.", "error");
    }
  });
}
