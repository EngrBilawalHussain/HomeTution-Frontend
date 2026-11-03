/**
 * Tuition Assignments Board: View open tuition jobs and apply
 * Security: Uses escapeHtml() to eliminate XSS risks on dynamic data rendering.
 */

let allAssignments = [];

document.addEventListener('DOMContentLoaded', () => {
  loadAssignments();
  setupAssignmentFilters();
  setupApplicationModal();
});

async function loadAssignments() {
  const container = document.getElementById('assignmentsContainer');
  if (!container) return;

  container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading live assignments...</div>`;

  try {
    allAssignments = await api.getAssignments();
    renderAssignments(allAssignments);
  } catch (e) {
    container.innerHTML = `<p style="text-align: center;">Unable to load assignments.</p>`;
  }
}

function renderAssignments(assignments) {
  const container = document.getElementById('assignmentsContainer');
  const countEl = document.getElementById('assignmentCount');
  if (!container) return;

  if (countEl) {
    countEl.textContent = `${assignments.length} Available Assignments`;
  }

  if (assignments.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: white; border-radius: 12px; border: 1px dashed var(--border-color);">
        <h3>No assignments match this filter</h3>
        <p style="color: var(--text-muted); margin-top: 8px;">Check back shortly or register as a tutor to get WhatsApp assignment alerts!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = assignments.map(a => {
    let statusBadge = '<span class="badge badge-green">OPEN</span>';
    if (a.status === 'MATCHING') statusBadge = '<span class="badge badge-orange">MATCHING</span>';
    if (a.status === 'ASSIGNED') statusBadge = '<span class="badge badge-purple">ASSIGNED</span>';

    const safeCode = escapeHtml(a.code);
    const safeLevel = escapeHtml(a.level);
    const safeSubject = escapeHtml(a.subject);
    const safeRegion = escapeHtml(a.region);
    const safeLocation = escapeHtml(a.locationDetail || 'Near MRT');
    const safeFrequency = escapeHtml(a.frequency);
    const safeTutorType = escapeHtml(formatTutorType(a.preferredTutorType));
    const safeGender = escapeHtml(a.genderPreference || 'Any');
    const safeRemarks = a.remarks ? escapeHtml(a.remarks) : '';
    const safeRate = Number(a.ratePerHour).toFixed(0);
    const safeAppCount = Number(a.applicationsCount || 0);

    return `
      <div class="assignment-card">
        <div class="assignment-main">
          <div class="assignment-header">
            <span class="assignment-code">${safeCode}</span>
            ${statusBadge}
            <span style="font-size: 0.82rem; color: var(--text-muted); margin-left: auto;">
              👥 ${safeAppCount} tutors applied
            </span>
          </div>
          
          <h3 class="assignment-title">${safeLevel} - ${safeSubject}</h3>
          
          <div class="assignment-details">
            <div class="assignment-detail-item">
              <span>📍</span> <strong>${safeRegion}:</strong> ${safeLocation}
            </div>
            <div class="assignment-detail-item">
              <span>⏰</span> ${safeFrequency}
            </div>
            <div class="assignment-detail-item">
              <span>🎓</span> Prefers: ${safeTutorType}
            </div>
            <div class="assignment-detail-item">
              <span>👤</span> Gender: ${safeGender}
            </div>
          </div>

          ${safeRemarks ? `<div class="assignment-remarks"><strong>Notes:</strong> ${safeRemarks}</div>` : ''}
        </div>

        <div class="assignment-action">
          <div class="assignment-rate-display">PKR ${Number(safeRate).toLocaleString()} <span style="font-size: 0.85rem; font-weight: normal; color: var(--text-muted);">/ hr</span></div>
          <button class="btn btn-primary btn-sm" onclick="openApplyModal(${Number(a.id)})" ${a.status !== 'OPEN' ? 'disabled' : ''}>
            ${a.status === 'OPEN' ? 'Apply for Job' : 'Matching'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function setupAssignmentFilters() {
  const regionTabs = document.querySelectorAll('.region-tab');
  const levelSelect = document.getElementById('filterAssignLevel');
  const searchInput = document.getElementById('searchAssignKeyword');

  let activeRegion = 'ALL';

  function filter() {
    const level = levelSelect?.value || '';
    const query = searchInput?.value.toLowerCase().trim() || '';

    const filtered = allAssignments.filter(a => {
      const matchRegion = activeRegion === 'ALL' || a.region.toLowerCase().includes(activeRegion.toLowerCase());
      const matchLevel = !level || a.level.toLowerCase().includes(level.toLowerCase());
      const matchQuery = !query || 
        a.subject.toLowerCase().includes(query) || 
        a.code.toLowerCase().includes(query) || 
        a.locationDetail.toLowerCase().includes(query);

      return matchRegion && matchLevel && matchQuery;
    });

    renderAssignments(filtered);
  }

  regionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      regionTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeRegion = tab.dataset.region || 'ALL';
      filter();
    });
  });

  levelSelect?.addEventListener('change', filter);
  searchInput?.addEventListener('input', filter);
}

function openApplyModal(assignmentId) {
  const assignment = allAssignments.find(a => a.id === assignmentId);
  if (!assignment) return;

  document.getElementById('applyAssignmentId').value = assignment.id;
  document.getElementById('applyAssignmentCode').textContent = assignment.code;
  document.getElementById('applyAssignmentTitle').textContent = `${assignment.level} - ${assignment.subject}`;
  document.getElementById('applyAssignmentRate').textContent = `$${assignment.ratePerHour}/hr`;

  openModal('applyModal');
}

function setupApplicationModal() {
  const form = document.getElementById('assignmentApplyForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const assignmentId = document.getElementById('applyAssignmentId').value;

    const payload = {
      assignmentId: Number(assignmentId),
      tutorName: document.getElementById('tutorName').value,
      tutorPhone: document.getElementById('tutorPhone').value,
      tutorEmail: document.getElementById('tutorEmail').value,
      credentials: document.getElementById('tutorCredentials').value,
      expectedRate: parseFloat(document.getElementById('expectedRate').value || '0'),
      pitch: document.getElementById('tutorPitch').value
    };

    try {
      const res = await api.applyForAssignment(payload);
      closeModal('applyModal');
      showToast(res.message || "Application submitted! Tuition coordinator will contact you shortly.", "success");
      form.reset();

      const found = allAssignments.find(a => a.id === Number(assignmentId));
      if (found) {
        found.applicationsCount = (found.applicationsCount || 0) + 1;
        renderAssignments(allAssignments);
      }
    } catch (err) {
      showToast("Error submitting application. Please try again.", "error");
    }
  });
}
