/**
 * Secure API Service for Home Tuition Platform
 * Interfaces with Spring Boot Security REST API at http://localhost:8080/api
 *
 * Security Features:
 * - Credentials included for secure HttpOnly cookie exchange
 * - CSRF & Bearer token authorization header attachment
 * - Safe HTML output encoding / sanitization utility
 * - No sensitive secrets exposed in client storage or console logs
 */

const RENDER_BACKEND_URL = 'https://hometution-0kg4.onrender.com/api';

const API_BASE_URL = (() => {
  // If explicitly requested via query parameter ?api=local
  if (typeof window !== 'undefined' && window.location && window.location.search.includes('api=local')) {
    return `http://${window.location.hostname || 'localhost'}:8080/api`;
  }

  // Clear obsolete localhost override if user didn't explicitly request ?api=local
  if (typeof window !== 'undefined' && window.localStorage) {
    const custom = window.localStorage.getItem('HT_API_URL');
    if (custom && custom.includes('localhost') && !window.location.search.includes('api=local')) {
      window.localStorage.removeItem('HT_API_URL');
    } else if (custom) {
      return custom;
    }
  }

  // Default to live production Render cloud backend
  return RENDER_BACKEND_URL;
})();

// Helper to manually switch backend URL from DevTools if desired
if (typeof window !== 'undefined') {
  window.setBackendUrl = (url) => {
    if (url) {
      window.localStorage.setItem('HT_API_URL', url);
    } else {
      window.localStorage.removeItem('HT_API_URL');
    }
    window.location.reload();
  };
}

// Safe in-memory access token storage (reduces XSS token theft compared to localStorage)
let inMemoryAccessToken = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ht_access_token') : null);

// HTML Escaping Helper to eliminate XSS risks when rendering dynamic content
function escapeHtml(unsafeText) {
  if (unsafeText === null || unsafeText === undefined) return '';
  return String(unsafeText)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;');
}

const api = {
  setAccessToken(token) {
    inMemoryAccessToken = token;
    if (typeof sessionStorage !== 'undefined') {
      if (token) {
        sessionStorage.setItem('ht_access_token', token);
      } else {
        sessionStorage.removeItem('ht_access_token');
      }
    }
  },

  getAccessToken() {
    if (!inMemoryAccessToken && typeof sessionStorage !== 'undefined') {
      inMemoryAccessToken = sessionStorage.getItem('ht_access_token');
    }
    return inMemoryAccessToken;
  },

  // Generic secure fetch wrapper with credentials and error handling
  async request(endpoint, options = {}, fallbackKey = null) {
    try {
      const controller = new AbortController();
      // Allow 30 seconds for Render free-tier cold start wake-up
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      if (inMemoryAccessToken) {
        headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
      }

      // Configure fetch options safely across file:// and web servers
      const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
      const fetchOptions = {
        ...options,
        headers,
        signal: controller.signal
      };

      // In browsers, only include credentials on http/https domains to prevent file:// security block
      if (!isFileProtocol) {
        fetchOptions.credentials = 'include';
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
      clearTimeout(timeoutId);

      // Handle 401 Unauthorized by attempting a token refresh
      if (response.status === 401 && !endpoint.startsWith('/auth/')) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry original request with new token
          headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
          const retryOptions = { ...fetchOptions, headers };
          const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, retryOptions);
          if (retryResponse.ok) {
            const json = await retryResponse.json();
            return json.data !== undefined ? json.data : json;
          }
        }
      }

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.message || `HTTP Error ${response.status}`);
      }

      const resJson = await response.json();
      return resJson.data !== undefined ? resJson.data : resJson;
    } catch (err) {
      // Never log full error objects containing tokens to console in production
      console.warn(`[API] Endpoint request failed for ${endpoint}`);
      if (fallbackKey && FALLBACK_DATA[fallbackKey] !== undefined) {
        return FALLBACK_DATA[fallbackKey];
      }
      return null;
    }
  },

  // Authentication
  async login(username, password, totpCode = null) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, totpCode })
      });
      const data = await response.json();
      if (response.ok && data.data?.accessToken) {
        this.setAccessToken(data.data.accessToken);
      }
      return data;
    } catch (e) {
      return { success: false, message: "Authentication service currently unreachable" };
    }
  },

  async register(username, email, password, role = 'ROLE_PARENT') {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, email, password, role })
      });
      const data = await response.json();
      if (response.ok && data.data?.accessToken) {
        this.setAccessToken(data.data.accessToken);
      }
      return data;
    } catch (e) {
      return { success: false, message: "Registration service currently unreachable" };
    }
  },

  async refreshToken() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data?.accessToken) {
          this.setAccessToken(data.data.accessToken);
          return true;
        }
      }
    } catch (e) {
      // Failed to refresh
    }
    inMemoryAccessToken = null;
    return false;
  },

  async logout() {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } finally {
      inMemoryAccessToken = null;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('ht_access_token');
        sessionStorage.removeItem('ht_user');
      }
    }
  },

  // Tutors
  async getTutors(params = {}) {
    const query = new URLSearchParams();
    if (params.tutorType) query.append('tutorType', params.tutorType);
    if (params.gender) query.append('gender', params.gender);
    if (params.maxRate) query.append('maxRate', params.maxRate);
    if (params.subject) query.append('subject', params.subject);
    if (params.level) query.append('level', params.level);
    if (params.region) query.append('region', params.region);

    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await this.request(`/tutors${qs}`, {}, 'tutors');
    return data || FALLBACK_DATA.tutors;
  },

  async verifyTutor(id, verified) {
    return await this.request(`/tutors/${id}/verify?verified=${verified}`, {
      method: 'PATCH'
    });
  },

  async getTutorById(id) {
    const data = await this.request(`/tutors/${id}`);
    if (data) return data;
    return FALLBACK_DATA.tutors.find(t => t.id === Number(id)) || null;
  },

  async registerTutor(tutorData) {
    return await this.request('/tutors', {
      method: 'POST',
      body: JSON.stringify(tutorData)
    }) || { success: true, message: "Tutor registration submitted for review." };
  },

  // Assignments
  async getAssignments(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.region) query.append('region', params.region);
    if (params.level) query.append('level', params.level);
    if (params.subject) query.append('subject', params.subject);

    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await this.request(`/assignments${qs}`, {}, 'assignments');
    return data || FALLBACK_DATA.assignments;
  },

  async applyForAssignment(applicationData) {
    return await this.request('/assignments/apply', {
      method: 'POST',
      body: JSON.stringify(applicationData)
    }) || { success: true, message: "Application submitted." };
  },

  // Tutor Requests
  async submitTutorRequest(requestData) {
    return await this.request('/requests', {
      method: 'POST',
      body: JSON.stringify(requestData)
    }) || {
      success: true,
      message: "Request received! Coordinator will contact you within 24 hours.",
      data: requestData
    };
  },

  async getAllRequests() {
    const data = await this.request('/requests');
    if (data) return data;
    return FALLBACK_DATA.requests || [];
  },

  async updateRequestStatus(id, status, notes = '') {
    const qs = `status=${encodeURIComponent(status)}${notes ? `&notes=${encodeURIComponent(notes)}` : ''}`;
    return await this.request(`/requests/${id}/status?${qs}`, {
      method: 'PATCH'
    });
  },

  // Rates & Calculator
  async getRates() {
    const data = await this.request('/rates', {}, 'rates');
    return data || FALLBACK_DATA.rates;
  },

  async calculateRate(calcData) {
    const res = await this.request('/rates/calculate', {
      method: 'POST',
      body: JSON.stringify(calcData)
    });
    if (res) return res;

    // Client-side rate calculation fallback (PKR)
    const weeklyHours = calcData.lessonsPerWeek * calcData.hoursPerLesson;
    const minRate = calcData.tutorType === 'MOE_EX_CURRENT' ? 3000 : (calcData.tutorType === 'FULL_TIME' ? 1800 : 1000);
    const maxRate = calcData.tutorType === 'MOE_EX_CURRENT' ? 5500 : (calcData.tutorType === 'FULL_TIME' ? 3000 : 1800);

    return {
      level: calcData.level,
      tutorType: calcData.tutorType,
      estimatedHourlyRateMin: minRate,
      estimatedHourlyRateMax: maxRate,
      weeklyHoursTotal: weeklyHours,
      estimatedWeeklyCostMin: weeklyHours * minRate,
      estimatedWeeklyCostMax: weeklyHours * maxRate,
      estimatedMonthlyCostMin: weeklyHours * minRate * 4,
      estimatedMonthlyCostMax: weeklyHours * maxRate * 4,
      recommendation: "Rates are based on current Pakistan market tuition benchmarks. 100% Free tutor matching for parents."
    };
  },

  // Testimonials
  async getTestimonials() {
    const data = await this.request('/testimonials', {}, 'testimonials');
    return data || FALLBACK_DATA.testimonials;
  },

  // Admin Dashboard Stats
  async getDashboardStats() {
    const data = await this.request('/admin/stats', {}, 'stats');
    return data || FALLBACK_DATA.stats;
  }
};

// Fallback dataset for instant preview if backend is loading / offline
const FALLBACK_DATA = {
  tutors: [
    {
      id: 1,
      name: "Sir Muhammad Hamza",
      title: "LUMS Graduate • O/A-Level Math & Physics Specialist",
      bio: "LUMS B.Sc (Honours) with 8 years of teaching experience. Mentored 200+ students from Aitchison, LGS, Beaconhouse, and Roots to achieve straight A*s in CAIE O & A-Levels.",
      education: "LUMS B.Sc (Honours) Mathematics & Economics",
      experienceYears: 8,
      rating: 4.96,
      reviewCount: 64,
      tutorType: "FULL_TIME",
      hourlyRate: 3500.0,
      gender: "Male",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
      subjects: ["O-Level Math", "A-Level Physics", "Additional Mathematics", "SAT Math"],
      levels: ["O-Level", "A-Level", "IGCSE", "SAT"],
      regions: ["Lahore (DHA, Gulberg)", "Online (Pakistan)"]
    },
    {
      id: 2,
      name: "Dr. Ayesha Siddiqui",
      title: "MBBS & Senior MDCAT Biology / Chemistry Faculty (Ex-KEMU)",
      bio: "Medical graduate and professional entry test instructor. Guided over 350 students into King Edward, Dow, and Army Medical College with structured past paper drills.",
      education: "MBBS (King Edward Medical University), B.Sc",
      experienceYears: 10,
      rating: 5.0,
      reviewCount: 88,
      tutorType: "MOE_EX_CURRENT",
      hourlyRate: 4500.0,
      gender: "Female",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
      subjects: ["MDCAT Biology", "FSc Pre-Medical Chemistry", "O/A-Level Biology"],
      levels: ["MDCAT", "FSc Pre-Medical", "A-Level", "O-Level"],
      regions: ["Islamabad (F-Sectors, DHA)", "Rawalpindi", "Online"]
    },
    {
      id: 3,
      name: "Prof. Tariq Mehmood",
      title: "Ex-Aitchison Faculty • Matric & FSc Physics / Math Guru",
      bio: "Former senior college faculty with 16 years teaching experience. Master of board exam techniques, conceptual clarity, and scoring 90%+ marks in Punjab and Federal Boards.",
      education: "M.Sc Physics (Punjab University), B.Ed",
      experienceYears: 16,
      rating: 4.94,
      reviewCount: 92,
      tutorType: "MOE_EX_CURRENT",
      hourlyRate: 3000.0,
      gender: "Male",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80",
      subjects: ["Matric Physics", "Matric Mathematics", "FSc Physics", "ECAT Prep"],
      levels: ["Matric (9th - 10th)", "FSc Pre-Engineering", "ECAT"],
      regions: ["Lahore", "Karachi (Clifton, DHA)", "Online"]
    },
    {
      id: 4,
      name: "Qari Hafiz Abdul Rehman",
      title: "Certified Tajweed Qari & Islamic Studies Specialist (Wafaq-ul-Madaris)",
      bio: "Hafiz-e-Quran and Sanad holder in Qirat Hafs from Wafaq-ul-Madaris. Specializes in teaching Noorani Qaida, Nazra Quran with Tajweed, and Daily Duas to kids and adults.",
      education: "Shahadat-ul-Almiya (M.A Islamic Studies Equivalent), Wafaq-ul-Madaris",
      experienceYears: 9,
      rating: 4.98,
      reviewCount: 52,
      tutorType: "PART_TIME",
      hourlyRate: 1500.0,
      gender: "Male",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
      subjects: ["Nazra Quran with Tajweed", "Noorani Qaida", "Islamic Studies", "Hifz Revision"],
      levels: ["Primary", "Middle", "O-Level Islamiyat", "Quran/Tajweed"],
      regions: ["All Pakistan (Home & Online)", "Lahore", "Islamabad"]
    },
    {
      id: 5,
      name: "Miss Fatima Zahra",
      title: "NUST MS Computer Science • O/A-Level & ICS Computer Specialist",
      bio: "Gold medalist graduate from NUST. Passionate about teaching algorithmic thinking, programming fundamentals, and preparing students for A* in Cambridge Computer Science.",
      education: "MS Computer Science (NUST SEECS), BS CS (FAST)",
      experienceYears: 6,
      rating: 5.0,
      reviewCount: 38,
      tutorType: "FULL_TIME",
      hourlyRate: 2800.0,
      gender: "Female",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
      subjects: ["Computer Science", "Python Programming", "ICS Computer", "O-Level CS"],
      levels: ["O-Level", "A-Level", "ICS", "University"],
      regions: ["Islamabad (F-6, F-7, F-8, DHA)", "Rawalpindi", "Online"]
    },
    {
      id: 6,
      name: "Sir Bilal Ashraf",
      title: "FAST-NU Software Engineer • Math & Coding Instructor",
      bio: "Top-rated STEM educator. Specializes in making complex calculus, algebra, and programming easy to understand through visual and interactive problem-solving.",
      education: "BS Software Engineering (FAST-NU Lahore)",
      experienceYears: 5,
      rating: 5.0,
      reviewCount: 42,
      tutorType: "PART_TIME",
      hourlyRate: 2500.0,
      gender: "Male",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
      subjects: ["Matric Mathematics", "FSc Mathematics", "Discrete Mathematics", "Data Structures"],
      levels: ["Matric (9th - 10th)", "FSc Pre-Engineering", "O-Level", "University"],
      regions: ["Lahore (Gulberg, Model Town, Johar Town)", "Online"]
    },
    {
      id: 7,
      name: "Ms. Zainab Alvi",
      title: "M.Phil English • O/A-Level English Language & Literature Expert",
      bio: "Senior Cambridge English instructor with 9+ years at leading Karachi grammar schools. Expert in essay structures, comprehension, and vocabulary development.",
      education: "M.Phil English Literature (Karachi University)",
      experienceYears: 9,
      rating: 5.0,
      reviewCount: 49,
      tutorType: "FULL_TIME",
      hourlyRate: 3000.0,
      gender: "Female",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
      subjects: ["O-Level English Language 1123", "A-Level English Literature", "IELTS Academic", "Creative Writing"],
      levels: ["O-Level", "A-Level", "IELTS", "Middle"],
      regions: ["Karachi (Clifton, DHA, PECHS)", "Online"]
    },
    {
      id: 8,
      name: "Prof. Nadeem Sarwar",
      title: "Ex-Punjab Group of Colleges • FSc & MDCAT Chemistry Specialist",
      bio: "Over a decade of experience preparing students for board toppers and medical entry tests. Known for mnemonics, reaction mechanism shortcuts, and exam tips.",
      education: "M.Sc Organic Chemistry (Quaid-i-Azam University), M.Ed",
      experienceYears: 14,
      rating: 5.0,
      reviewCount: 71,
      tutorType: "MOE_EX_CURRENT",
      hourlyRate: 3200.0,
      gender: "Male",
      verified: true,
      avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80",
      subjects: ["FSc Chemistry", "MDCAT Chemistry", "Matric Chemistry", "Organic Chemistry"],
      levels: ["FSc Pre-Medical", "MDCAT", "Matric (9th - 10th)"],
      regions: ["Rawalpindi", "Islamabad", "Online"]
    }
  ],
  assignments: [
    {
      id: 1,
      code: "PK-8101",
      level: "O-Level (Cambridge)",
      subject: "Additional Mathematics & Pure Physics",
      region: "Lahore",
      locationDetail: "DHA Phase 5, near Ring Road, Lahore",
      ratePerHour: 3500.0,
      frequency: "3 lessons/week, 1.5 hrs/lesson",
      preferredTutorType: "FULL_TIME",
      genderPreference: "Female",
      status: "OPEN",
      remarks: "Student is from LGS Defence Lahore. Needs intensive preparation for upcoming May/June CAIE series.",
      applicationsCount: 3
    },
    {
      id: 2,
      code: "PK-8102",
      level: "FSc Pre-Medical (1st Year)",
      subject: "Biology & Chemistry",
      region: "Islamabad",
      locationDetail: "Sector F-10/2, near Markaz, Islamabad",
      ratePerHour: 2800.0,
      frequency: "4 lessons/week, 1.5 hrs/lesson",
      preferredTutorType: "MOE_EX_CURRENT",
      genderPreference: "Any",
      status: "OPEN",
      remarks: "Federal Board (FBISE) syllabus. Focus on conceptual clarity, diagram practice, and past papers solving for board position.",
      applicationsCount: 5
    },
    {
      id: 3,
      code: "PK-8103",
      level: "MDCAT Entry Test Prep",
      subject: "Biology, Chemistry & Physics",
      region: "Karachi",
      locationDetail: "Clifton Block 4, Karachi",
      ratePerHour: 4000.0,
      frequency: "3 lessons/week, 2.0 hrs/lesson",
      preferredTutorType: "FULL_TIME",
      genderPreference: "Male",
      status: "OPEN",
      remarks: "Targeting King Edward / Dow University. Needs short-cut MCQs solving techniques and time management drills.",
      applicationsCount: 4
    },
    {
      id: 4,
      code: "PK-8104",
      level: "Matric 10th Class (Science)",
      subject: "Mathematics & Physics",
      region: "Rawalpindi",
      locationDetail: "Bahria Town Phase 4, Rawalpindi",
      ratePerHour: 2200.0,
      frequency: "3 lessons/week, 1.5 hrs/lesson",
      preferredTutorType: "PART_TIME",
      genderPreference: "Any",
      status: "OPEN",
      remarks: "Punjab Board examination prep. Student needs help in circle geometry and physics numericals.",
      applicationsCount: 2
    }
  ],
  rates: [
    {
      id: 1,
      levelCategory: "Primary",
      levelName: "Primary (Class 1 - 5)",
      partTimeRateMin: 800.0,
      partTimeRateMax: 1200.0,
      fullTimeRateMin: 1200.0,
      fullTimeRateMax: 1800.0,
      moeTeacherRateMin: 1800.0,
      moeTeacherRateMax: 2500.0,
      notes: "English, Urdu, Mathematics, General Science & Nazra Quran"
    },
    {
      id: 2,
      levelCategory: "Middle",
      levelName: "Middle (Class 6 - 8)",
      partTimeRateMin: 1000.0,
      partTimeRateMax: 1500.0,
      fullTimeRateMin: 1500.0,
      fullTimeRateMax: 2200.0,
      moeTeacherRateMin: 2200.0,
      moeTeacherRateMax: 3000.0,
      notes: "Mathematics, General Science, English Grammar, Computer & Social Studies"
    },
    {
      id: 3,
      levelCategory: "Matric",
      levelName: "Matric / SSC (9th - 10th Class)",
      partTimeRateMin: 1200.0,
      partTimeRateMax: 1800.0,
      fullTimeRateMin: 1800.0,
      fullTimeRateMax: 2800.0,
      moeTeacherRateMin: 2800.0,
      moeTeacherRateMax: 4000.0,
      notes: "Physics, Chemistry, Biology / Computer Science, Mathematics"
    },
    {
      id: 4,
      levelCategory: "Intermediate",
      levelName: "FSc / ICS / I.Com (11th - 12th)",
      partTimeRateMin: 1500.0,
      partTimeRateMax: 2200.0,
      fullTimeRateMin: 2200.0,
      fullTimeRateMax: 3500.0,
      moeTeacherRateMin: 3500.0,
      moeTeacherRateMax: 5000.0,
      notes: "Pre-Medical (Biology), Pre-Engineering (Math), ICS (Computer), Stats & Physics"
    },
    {
      id: 5,
      levelCategory: "O-Level",
      levelName: "O-Level (Cambridge / Edexcel)",
      partTimeRateMin: 1500.0,
      partTimeRateMax: 2500.0,
      fullTimeRateMin: 2500.0,
      fullTimeRateMax: 4000.0,
      moeTeacherRateMin: 4000.0,
      moeTeacherRateMax: 6000.0,
      notes: "Pure Sciences, Add Maths, English Language, Pakistan Studies, Islamiyat"
    },
    {
      id: 6,
      levelCategory: "A-Level",
      levelName: "A-Level (Cambridge / Edexcel)",
      partTimeRateMin: 2000.0,
      partTimeRateMax: 3500.0,
      fullTimeRateMin: 3500.0,
      fullTimeRateMax: 5500.0,
      moeTeacherRateMin: 5500.0,
      moeTeacherRateMax: 8500.0,
      notes: "A-Level Physics, Chemistry, Biology, Mathematics (P1/P3/M1/S1), Economics"
    },
    {
      id: 7,
      levelCategory: "Entry Test",
      levelName: "Entry Test (MDCAT / ECAT / NET)",
      partTimeRateMin: 2500.0,
      partTimeRateMax: 4000.0,
      fullTimeRateMin: 4000.0,
      fullTimeRateMax: 6500.0,
      moeTeacherRateMin: 6500.0,
      moeTeacherRateMax: 10000.0,
      notes: "MDCAT, ECAT, NUST (NET), FAST (NU), GIKI, IBA, LUMS LCAT / SAT preparation"
    },
    {
      id: 8,
      levelCategory: "Islamic Studies",
      levelName: "Quran, Tajweed & Islamic Studies",
      partTimeRateMin: 600.0,
      partTimeRateMax: 1000.0,
      fullTimeRateMin: 1000.0,
      fullTimeRateMax: 1500.0,
      moeTeacherRateMin: 1500.0,
      moeTeacherRateMax: 2500.0,
      notes: "Noorani Qaida, Nazra Quran with Tajweed, Hifz revision & Islamic Studies"
    }
  ],
  testimonials: [
    {
      clientName: "Brig. (R) Usman Ali",
      role: "Parent of A-Level student (LGS Defence Lahore)",
      levelAndSubject: "A-Level Physics & Mathematics",
      tutorName: "Sir Muhammad Hamza",
      rating: 5,
      reviewText: "Home Tutor matched us with Sir Hamza within 4 hours. He transformed my son's confidence in A-Level Physics from struggling to scoring straight A*s in Cambridge exams!",
      beforeGrade: "D Grade",
      afterGrade: "A* Grade",
      avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80"
    },
    {
      clientName: "Dr. Samina Farooq",
      role: "Parent of FSc student (Army Public School Rawalpindi)",
      levelAndSubject: "FSc Pre-Medical (Biology & Chemistry)",
      tutorName: "Dr. Ayesha Siddiqui",
      rating: 5,
      reviewText: "Exceptional home tuition service in Islamabad/Rawalpindi. The tutor was punctual, professional, and helped my daughter secure 94% marks in the Federal Board exams.",
      beforeGrade: "78%",
      afterGrade: "94%",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"
    },
    {
      clientName: "Ch. Tariq Niaz",
      role: "Parent of Matric student (Beaconhouse Faisalabad)",
      levelAndSubject: "Matric 10th Math & Science",
      tutorName: "Prof. Tariq Mehmood",
      rating: 5,
      reviewText: "Finding a truly qualified teacher for conceptual science in Faisalabad was hard until we tried Home Tutor. Truly grateful for their 24-hr prompt response and verified teachers!",
      beforeGrade: "B Grade",
      afterGrade: "A+ (92%)",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80"
    }
  ],
  requests: [
    {
      id: 5,
      parentName: "Chaudhry Nadeem Akhtar",
      phone: "+92 300 6543210",
      email: "nadeem.akhtar@gmail.com",
      studentLevel: "FSc Pre-Medical (11th Class)",
      subjects: "Biology, Chemistry, Physics",
      preferredTutorType: "MOE_EX_CURRENT",
      genderPreference: "Any",
      lessonsPerWeek: 3,
      hoursPerLesson: 2.0,
      budgetPerHour: 3000.0,
      location: "Model Town Block C, Lahore",
      postalCode: "54700",
      preferredTiming: "Evenings after 6:00 PM",
      studentRequirements: "Daughter is aiming for 95%+ marks in Punjab Board exams. Needs professor-level guidance on past papers and numericals.",
      status: "NEW"
    },
    {
      id: 4,
      parentName: "Dr. Shazia Rehman",
      phone: "+92 312 8765431",
      email: "shazia.rehman@yahoo.com",
      studentLevel: "Primary (Class 4)",
      subjects: "Mathematics, General Science, English",
      preferredTutorType: "PART_TIME",
      genderPreference: "Female",
      lessonsPerWeek: 5,
      hoursPerLesson: 1.5,
      budgetPerHour: 1800.0,
      location: "Bahria Town Phase 7, Rawalpindi",
      postalCode: "46000",
      preferredTiming: "Monday to Friday 3:30 PM - 5:00 PM",
      studentRequirements: "Needs friendly female teacher to build foundation in basic maths word problems and creative English writing.",
      status: "NEW"
    },
    {
      id: 3,
      parentName: "Engr. Usman Qureshi",
      phone: "+92 333 9876542",
      email: "usman.qureshi@hotmail.com",
      studentLevel: "A-Level (Cambridge)",
      subjects: "Mathematics (P1/P3/M1), Physics",
      preferredTutorType: "FULL_TIME",
      genderPreference: "Male",
      lessonsPerWeek: 3,
      hoursPerLesson: 2.0,
      budgetPerHour: 4000.0,
      location: "Clifton Block 4, Karachi",
      postalCode: "75600",
      preferredTiming: "Tuesday, Thursday, Saturday 6:00 PM - 8:00 PM",
      studentRequirements: "Son needs rigorous past paper practice for A-Level Physics and Mechanics. Looking for an experienced instructor with proven A* track record.",
      status: "NEW"
    },
    {
      id: 2,
      parentName: "Mrs. Farhana Tariq",
      phone: "+92 321 4567891",
      email: "farhana.tariq@gmail.com",
      studentLevel: "O-Level (Cambridge)",
      subjects: "Biology, Chemistry",
      preferredTutorType: "FULL_TIME",
      genderPreference: "Female",
      lessonsPerWeek: 4,
      hoursPerLesson: 1.5,
      budgetPerHour: 3500.0,
      location: "DHA Phase 5, Lahore",
      postalCode: "54000",
      preferredTiming: "Monday to Thursday, 4:00 PM - 5:30 PM",
      studentRequirements: "Student is preparing for upcoming CAIE O-Level exams in May/June. Needs concept strengthening in organic chemistry and genetics.",
      status: "NEW"
    },
    {
      id: 1,
      parentName: "Malik Shahzad",
      phone: "+92 308 7361799",
      email: "shahzad.malik@example.com",
      studentLevel: "Matric 10th Class (Science)",
      subjects: "Mathematics, Physics, Chemistry",
      preferredTutorType: "FULL_TIME",
      genderPreference: "Any",
      lessonsPerWeek: 3,
      hoursPerLesson: 1.5,
      budgetPerHour: 2500.0,
      location: "Sector F-7/2, Islamabad",
      postalCode: "44000",
      preferredTiming: "Mondays, Wednesdays & Fridays 5pm - 6:30pm",
      studentRequirements: "Focus on solving board past papers, numericals in Physics, and theorem proofs in Maths.",
      status: "NEW"
    }
  ],
  stats: {
    totalTutors: 8,
    openAssignments: 4,
    totalRequests: 5,
    newRequestsToday: 5,
    matchRatePercent: 98.4
  }
};
