/**
 * Request a Tutor - Multi-Step Interactive Form Controller
 */

let currentStep = 1;
const totalSteps = 4;

document.addEventListener('DOMContentLoaded', () => {
  initWizard();
});

function initWizard() {
  const wizardForm = document.getElementById('tutorRequestWizard');
  if (!wizardForm) return;

  // Next / Prev buttons
  const nextBtns = document.querySelectorAll('.btn-wizard-next');
  const prevBtns = document.querySelectorAll('.btn-wizard-prev');

  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (validateCurrentStep()) {
        currentStep++;
        updateWizardUI();
      }
    });
  });

  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentStep--;
      updateWizardUI();
    });
  });

  // Form submission
  wizardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateCurrentStep()) return;

    const submitBtn = wizardForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Submitting Request...';
    }

    const payload = {
      studentLevel: document.getElementById('studentLevel')?.value || '',
      subjects: document.getElementById('subjects')?.value || '',
      preferredTutorType: document.getElementById('preferredTutorType')?.value || 'FULL_TIME',
      genderPreference: document.querySelector('input[name="genderPreference"]:checked')?.value || 'Any',
      lessonsPerWeek: parseInt(document.getElementById('lessonsPerWeek')?.value || '1', 10),
      hoursPerLesson: parseFloat(document.getElementById('hoursPerLesson')?.value || '1.5'),
      budgetPerHour: parseFloat(document.getElementById('budgetPerHour')?.value || '50'),
      location: document.getElementById('location')?.value || '',
      postalCode: document.getElementById('postalCode')?.value || '',
      preferredTiming: document.getElementById('preferredTiming')?.value || '',
      studentRequirements: document.getElementById('studentRequirements')?.value || '',
      parentName: document.getElementById('parentName')?.value || '',
      phone: document.getElementById('parentPhone')?.value || '',
      email: document.getElementById('parentEmail')?.value || ''
    };

    try {
      const result = await api.submitTutorRequest(payload);
      showToast(result.message || "Tutor request submitted successfully! Our coordinators are now on it.", "success");
      
      // Show confirmation screen
      document.querySelectorAll('.wizard-step-content').forEach(el => el.style.display = 'none');
      const confirmationBlock = document.getElementById('wizardConfirmation');
      if (confirmationBlock) {
        confirmationBlock.style.display = 'block';
        document.getElementById('confirmParentName').textContent = payload.parentName;
        document.getElementById('confirmPhone').textContent = payload.phone;
        document.getElementById('confirmSubject').textContent = `${payload.studentLevel} - ${payload.subjects}`;
      }
    } catch (err) {
      showToast("There was an issue submitting your request. Please try again or WhatsApp us directly.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Tutor Request';
      }
    }
  });

  // Level selector quick update
  const levelSelect = document.getElementById('studentLevel');
  const budgetInput = document.getElementById('budgetPerHour');
  if (levelSelect && budgetInput) {
    levelSelect.addEventListener('change', () => {
      const val = levelSelect.value;
      if (val.includes('Primary')) budgetInput.value = 40;
      else if (val.includes('Secondary')) budgetInput.value = 55;
      else if (val.includes('JC') || val.includes('IB')) budgetInput.value = 80;
    });
  }
}

function validateCurrentStep() {
  if (currentStep === 1) {
    const level = document.getElementById('studentLevel')?.value;
    const subjects = document.getElementById('subjects')?.value;
    if (!level) {
      showToast("Please choose student's academic level", "error");
      return false;
    }
    if (!subjects || subjects.trim() === '') {
      showToast("Please enter subjects required", "error");
      return false;
    }
  } else if (currentStep === 3) {
    const location = document.getElementById('location')?.value;
    if (!location || location.trim() === '') {
      showToast("Please specify the tuition location / MRT", "error");
      return false;
    }
  } else if (currentStep === 4) {
    const name = document.getElementById('parentName')?.value;
    const phone = document.getElementById('parentPhone')?.value;
    if (!name || name.trim() === '') {
      showToast("Please enter your name", "error");
      return false;
    }
    if (!phone || phone.trim() === '') {
      showToast("Please enter your phone number or WhatsApp", "error");
      return false;
    }
  }
  return true;
}

function updateWizardUI() {
  // Step indicator circles
  document.querySelectorAll('.wizard-step-indicator').forEach((indicator, idx) => {
    const stepNum = idx + 1;
    indicator.classList.remove('active', 'completed');
    if (stepNum === currentStep) {
      indicator.classList.add('active');
    } else if (stepNum < currentStep) {
      indicator.classList.add('completed');
    }
  });

  // Step contents
  document.querySelectorAll('.wizard-step-content').forEach(content => {
    content.style.display = 'none';
  });
  const currentContent = document.getElementById(`stepContent${currentStep}`);
  if (currentContent) {
    currentContent.style.display = 'block';
  }

  window.scrollTo({ top: 120, behavior: 'smooth' });
}
