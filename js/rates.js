/**
 * Tuition Rates Guide & Interactive Budget Calculator
 */

document.addEventListener('DOMContentLoaded', () => {
  loadRatesTable();
  initCalculator();
});

async function loadRatesTable() {
  const tableBody = document.getElementById('ratesTableBody');
  if (!tableBody) return;

  try {
    const rates = await api.getRates();
    tableBody.innerHTML = rates.map(r => `
      <tr>
        <td class="level-name-col">
          <strong>${r.levelName}</strong>
          <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">${r.notes || ''}</div>
        </td>
        <td>PKR ${Number(r.partTimeRateMin).toLocaleString()} - ${Number(r.partTimeRateMax).toLocaleString()} / hr</td>
        <td style="background-color: #f0fdf4; font-weight: 600; color: #166534;">
          PKR ${Number(r.fullTimeRateMin).toLocaleString()} - ${Number(r.fullTimeRateMax).toLocaleString()} / hr
        </td>
        <td style="color: #9a3412; font-weight: 700;">
          PKR ${Number(r.moeTeacherRateMin).toLocaleString()} - ${Number(r.moeTeacherRateMax).toLocaleString()} / hr
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("Error loading rates table:", e);
  }
}

function initCalculator() {
  const calcForm = document.getElementById('rateCalcForm');
  if (!calcForm) return;

  const levelSelect = document.getElementById('calcLevel');
  const tutorTypeSelect = document.getElementById('calcTutorType');
  const lessonsPerWeek = document.getElementById('calcLessons');
  const hoursPerLesson = document.getElementById('calcHours');

  async function updateCalculation() {
    const payload = {
      level: levelSelect.value,
      tutorType: tutorTypeSelect.value,
      lessonsPerWeek: parseInt(lessonsPerWeek.value, 10),
      hoursPerLesson: parseFloat(hoursPerLesson.value)
    };

    try {
      const res = await api.calculateRate(payload);
      if (res) {
        document.getElementById('resHourlyRate').textContent = `PKR ${Number(res.estimatedHourlyRateMin).toLocaleString()} - ${Number(res.estimatedHourlyRateMax).toLocaleString()} / hr`;
        document.getElementById('resWeeklyCost').textContent = `PKR ${Number(res.estimatedWeeklyCostMin).toLocaleString()} - ${Number(res.estimatedWeeklyCostMax).toLocaleString()}`;
        document.getElementById('resMonthlyCost').textContent = `PKR ${Number(res.estimatedMonthlyCostMin).toLocaleString()} - ${Number(res.estimatedMonthlyCostMax).toLocaleString()}`;
        document.getElementById('resRecommendation').textContent = res.recommendation;
      }
    } catch (e) {
      console.warn("Calculation error", e);
    }
  }

  levelSelect?.addEventListener('change', updateCalculation);
  tutorTypeSelect?.addEventListener('change', updateCalculation);
  lessonsPerWeek?.addEventListener('input', updateCalculation);
  hoursPerLesson?.addEventListener('input', updateCalculation);

  // Initial calculation trigger
  updateCalculation();
}
