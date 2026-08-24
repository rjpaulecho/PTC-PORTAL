const API_BASE_URL = "http://localhost:3000";

// ======================
// User Roles
// ======================
export type UserRole =
  | "Admin"
  | "Registrar"
  | "Program Head"
  | "Faculty"
  | "Student";

// ======================
// User Session
// ======================
export interface User {
  user_id: number;
  username: string;
  email: string;
  role: UserRole;
  role_id: number;
}

// ======================
// Login Response
// ======================
export interface LoginResponse {
  message: string;
}

// ======================
// Backend Auth User
// ======================
interface BackendUser {
  user_id: number;
  username: string;
  email: string;
  role_id: number;
  role_name: UserRole;
}

// ======================
// Authentication Response
// ======================
interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  user: BackendUser;
}

// ======================
// Current User Response
// ======================
interface CurrentUserResponse {
  success: boolean;
  user: BackendUser;
}

// ======================
// Convert backend user
// ======================
function mapBackendUser(user: BackendUser): User {
  return {
    user_id: Number(user.user_id),
    username: user.username,
    email: user.email,
    role_id: Number(user.role_id),
    role: user.role_name,
  };
}

// ======================
// Authentication Service
// ======================
export const authService = {
  // =====================================================
  // STEP 1 — NORMAL LOGIN
  // Username + Password
  // =====================================================
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        username,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || "Login failed.");
    }

    return data;
  },

  // =====================================================
  // STEP 2 — VERIFY OTP
  // Successful OTP returns JWT + user
  // =====================================================
  async verifyOtp(username: string, otp: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        username,
        otp,
      }),
    });

    const data: AuthResponse & {
      error?: string;
    } = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || "OTP verification failed.");
    }

    if (!data.token) {
      throw new Error("Authentication token was not returned by the server.");
    }

    if (!data.user) {
      throw new Error("Authenticated user information was not returned.");
    }

    // Save JWT
    this.saveToken(data.token);

    // Convert backend role_name → frontend role
    const user = mapBackendUser(data.user);

    // Save frontend session
    this.saveSession(user);

    return user;
  },

  // =====================================================
  // DEVELOPMENT LOGIN
  //
  // One-click login but still:
  // - loads REAL user from database
  // - receives REAL JWT
  // - uses REAL RBAC
  //
  // Backend /auth/dev-login must be disabled in production.
  // =====================================================
  async devLogin(username: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/auth/dev-login`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        username,
      }),
    });

    const data: AuthResponse & {
      error?: string;
    } = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || data.message || "Development login failed.",
      );
    }

    if (!data.token) {
      throw new Error("Authentication token was not returned by the server.");
    }

    if (!data.user) {
      throw new Error("Development user information was not returned.");
    }

    // Save REAL JWT
    this.saveToken(data.token);

    // Convert backend response
    const user = mapBackendUser(data.user);

    // Save frontend user for UI / route guards
    this.saveSession(user);

    return user;
  },

  // =====================================================
  // AUTHENTICATED FETCH
  //
  // Use this instead of normal fetch() for protected APIs.
  // =====================================================
  async authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();

    if (!token) {
      this.logout();

      throw new Error("Authentication required. Please login again.");
    }

    const headers = new Headers(options.headers || {});

    headers.set("Authorization", `Bearer ${token}`);

    // Add JSON content type only when there is a body
    // and the caller did not already define it.
    if (
      options.body &&
      !headers.has("Content-Type") &&
      !(options.body instanceof FormData)
    ) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // JWT invalid / expired
    if (response.status === 401) {
      this.logout();
    }

    return response;
  },

  // =====================================================
  // GET CURRENT AUTHENTICATED USER
  //
  // Backend decides who the user really is.
  // =====================================================
  async getCurrentUser(): Promise<User> {
    const response = await this.authFetch(`${API_BASE_URL}/auth/me`);

    const data: CurrentUserResponse & {
      error?: string;
      message?: string;
    } = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || data.message || "Unable to verify authenticated user.",
      );
    }

    if (!data.user) {
      throw new Error("Authenticated user information was not returned.");
    }

    const user = mapBackendUser(data.user);

    // Refresh local UI session from backend truth
    this.saveSession(user);

    return user;
  },

  // =====================================================
  // TOKEN STORAGE
  // =====================================================
  saveToken(token: string): void {
    sessionStorage.setItem("access_token", token);
  },

  getToken(): string | null {
    return sessionStorage.getItem("access_token");
  },

  clearToken(): void {
    sessionStorage.removeItem("access_token");
  },

  // =====================================================
  // PENDING USERNAME
  // Used between login → OTP page
  // =====================================================
  savePendingUsername(username: string): void {
    sessionStorage.setItem("pending_username", username);
  },

  getPendingUsername(): string | null {
    return sessionStorage.getItem("pending_username");
  },

  clearPendingUsername(): void {
    sessionStorage.removeItem("pending_username");
  },

  // =====================================================
  // FRONTEND USER SESSION
  //
  // Used for:
  // - UI display
  // - role-based navigation
  // - ProtectedRoute
  //
  // NOT the security authority.
  // Backend JWT + RBAC is authoritative.
  // =====================================================
  saveSession(user: User): void {
    sessionStorage.setItem("user", JSON.stringify(user));
  },

  getSession(): User | null {
    const session = sessionStorage.getItem("user");

    if (!session) {
      return null;
    }

    try {
      return JSON.parse(session) as User;
    } catch (error) {
      console.error("INVALID USER SESSION:", error);

      this.logout();

      return null;
    }
  },

  // =====================================================
  // LOGOUT
  // =====================================================
  logout(): void {
    sessionStorage.removeItem("user");

    sessionStorage.removeItem("access_token");

    sessionStorage.removeItem("pending_username");
  },

  // =====================================================
  // AUTH HELPERS
  // =====================================================
  isLoggedIn(): boolean {
    return Boolean(this.getSession() && this.getToken());
  },

  hasRole(role: UserRole): boolean {
    const user = this.getSession();

    return user?.role === role;
  },

  // =====================================================
  // ROLE DASHBOARD
  // =====================================================
  getDashboardRoute(role: UserRole): string {
    const routes: Record<UserRole, string> = {
      Admin: "/admin/dashboard",

      Registrar: "/registrar/dashboard",

      "Program Head": "/programhead/dashboard",

      Faculty: "/faculty/dashboard",

      Student: "/student/dashboard",
    };

    return routes[role];
  },
};

export { API_BASE_URL };
