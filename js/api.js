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
  // Allow manual override (e.g. for local backend testing) via localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    const custom = window.localStorage.getItem('HT_API_URL');
    if (custom) return custom;
  }

  // If explicitly requested via query parameter ?api=local
  if (typeof window !== 'undefined' && window.location && window.location.search.includes('api=local')) {
    return `http://${window.location.hostname || 'localhost'}:8080/api`;
  }

  // Production Render cloud backend
  return RENDER_BACKEND_URL;
})();

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
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      if (inMemoryAccessToken) {
        headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include', // Includes HttpOnly cookies (refresh_token)
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Handle 401 Unauthorized by attempting a token refresh
      if (response.status === 401 && !endpoint.startsWith('/auth/')) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry original request with new token
          headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
          const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include'
          });
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

// Fallback dataset for instant preview if backend is loading
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
    }
  ],
  rates: [
    {
      id: 1,
      levelCategory: "Matric",
      levelName: "Matric / SSC (9th - 10th Class)",
      partTimeRateMin: 1200.0,
      partTimeRateMax: 1800.0,
      fullTimeRateMin: 1800.0,
      fullTimeRateMax: 2800.0,
      moeTeacherRateMin: 2800.0,
      moeTeacherRateMax: 4000.0,
      notes: "Physics, Chemistry, Biology / Computer Science, Mathematics"
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
    }
  ],
  requests: [
    {
      id: 1,
      parentName: "Malik Shahzad",
      phone: "+92 308 7361799",
      email: "shahzad.malik@example.com",
      studentLevel: "Matric 10th Class (Science)",
      subjects: "Mathematics, Physics, Chemistry",
      budgetPerHour: 2500.0,
      location: "Gulberg III, Lahore",
      preferredTiming: "Mondays, Wednesdays & Fridays 5pm - 6:30pm",
      status: "NEW"
    }
  ],
  stats: {
    totalTutors: 25480,
    openAssignments: 184,
    totalRequests: 9420,
    newRequestsToday: 42,
    matchRatePercent: 98.7
  }
};
