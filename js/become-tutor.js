/**
 * Become a Tutor - Tutor Onboarding Form Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('tutorRegistrationForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Submitting Application...';
    }

    // Collect selected subjects, levels, and regions
    const checkedSubjects = Array.from(document.querySelectorAll('input[name="subjects"]:checked')).map(el => el.value);
    const checkedLevels = Array.from(document.querySelectorAll('input[name="levels"]:checked')).map(el => el.value);
    const checkedRegions = Array.from(document.querySelectorAll('input[name="regions"]:checked')).map(el => el.value);

    const payload = {
      name: document.getElementById('regName').value,
      phone: document.getElementById('regPhone').value,
      email: document.getElementById('regEmail').value,
      gender: document.querySelector('input[name="regGender"]:checked')?.value || 'Male',
      tutorType: document.getElementById('regTutorType').value,
      education: document.getElementById('regEducation').value,
      experienceYears: parseInt(document.getElementById('regExperience').value || '1', 10),
      hourlyRate: parseFloat(document.getElementById('regExpectedRate').value || '1500'),
      title: document.getElementById('regTitle').value || 'Private Home Tutor',
      bio: document.getElementById('regBio').value,
      subjects: checkedSubjects.length > 0 ? checkedSubjects : ['General Subjects'],
      levels: checkedLevels.length > 0 ? checkedLevels : ['Matric'],
      regions: checkedRegions.length > 0 ? checkedRegions : ['Lahore']
    };

    try {
      const res = await api.registerTutor(payload);
      showToast(res.message || "Tutor application received! We will verify your credentials and send assignment alerts via WhatsApp.", "success");
      
      form.style.display = 'none';
      const successCard = document.getElementById('regSuccessCard');
      if (successCard) {
        successCard.style.display = 'block';
        document.getElementById('successTutorName').textContent = payload.name;
        document.getElementById('successTutorPhone').textContent = payload.phone;
      }
    } catch (err) {
      showToast("There was an error submitting your registration. Please try again.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Tutor Application';
      }
    }
  });
});
