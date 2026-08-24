import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/createuser.css";

const API_BASE_URL = "http://localhost:3000/api/users";

// =====================================================
// TYPES
// =====================================================

interface CreateUserResponse {
  success?: boolean;

  user_id?: number;

  message?: string;

  error?: string;
}

// =====================================================
// ROLES
//
// These are role NAMES only.
//
// Do not hardcode role IDs in the frontend.
// Backend should resolve role_id by role_name.
// =====================================================

const USER_ROLES = [
  "Admin",
  "Registrar",
  "Faculty",
  "Program Head",
  "Student",
] as const;

// =====================================================
// COMPONENT
// =====================================================

export default function CreateUser() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const session = authService.getSession();

  const token = authService.getToken();

  const userRole = session?.role;

  const authenticated = Boolean(session && token);

  // =====================================================
  // STATE
  // =====================================================

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "",
  });

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // AUTHORIZATION
  // =====================================================

  useEffect(() => {
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    if (userRole !== "Admin") {
      if (userRole) {
        navigate(authService.getDashboardRoute(userRole), {
          replace: true,
        });
      } else {
        navigate("/login", {
          replace: true,
        });
      }
    }
  }, [authenticated, userRole, navigate]);

  // =====================================================
  // INPUT CHANGE
  // =====================================================

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,

      [name]: value,
    }));
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    setError("");

    // ===================================================
    // AUTH
    // ===================================================

    if (!authenticated || userRole !== "Admin") {
      setError(
        "Your session has expired or you are not authorized to create users.",
      );

      return;
    }

    // ===================================================
    // CLEAN VALUES
    // ===================================================

    const username = formData.username.trim().toUpperCase();

    const email = formData.email.trim().toLowerCase();

    const password = formData.password;

    const confirmPassword = formData.confirmPassword;

    const role = formData.role.trim();

    // ===================================================
    // VALIDATION
    // ===================================================

    if (!username) {
      setError("Username is required.");

      return;
    }

    if (!email) {
      setError("Email is required.");

      return;
    }

    if (!role) {
      setError("Please select a user role.");

      return;
    }

    if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
      setError("Invalid user role.");

      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      setError("Please enter a valid email address.");

      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");

      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");

      return;
    }

    try {
      setLoading(true);

      // =================================================
      // PAYLOAD
      //
      // Do NOT send:
      //
      // role_id
      // created_by
      // admin user_id
      //
      // Backend should:
      //
      // 1. get actor from req.user
      // 2. resolve role_id using role_name
      // =================================================

      const payload = {
        username,

        email,

        password,

        role,
      };

      // =================================================
      // JWT AUTHENTICATED POST
      // =================================================

      const response = await authService.authFetch(API_BASE_URL, {
        method: "POST",

        body: JSON.stringify(payload),
      });

      // =================================================
      // SAFE RESPONSE
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      let data: CreateUserResponse | null = null;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();

        throw new Error(
          `Server returned a non-JSON response (${response.status}): ${text.slice(
            0,
            200,
          )}`,
        );
      }

      // =================================================
      // 401
      // =================================================

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      // =================================================
      // 403
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to create users.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to create user (${response.status}).`,
        );
      }

      // =================================================
      // SUCCESS
      // =================================================

      window.alert(data?.message || "User created successfully.");

      navigate("/admin/user/list");
    } catch (err) {
      console.error("CREATE USER ERROR:", err);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the user server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !session || userRole !== "Admin") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="create-user">
        <h1>Create User</h1>

        <form onSubmit={handleSubmit}>
          {/* USERNAME */}

          <div className="form-group">
            <label htmlFor="create-user-username">Username</label>

            <input
              id="create-user-username"
              type="text"
              name="username"
              placeholder="Enter username (e.g. FACULTY01)"
              value={formData.username}
              onChange={handleChange}
              disabled={loading}
              required
            />
          </div>

          {/* EMAIL */}

          <div className="form-group">
            <label htmlFor="create-user-email">Email</label>

            <input
              id="create-user-email"
              type="email"
              name="email"
              placeholder="Enter PTC email (e.g. faculty01@ptc.edu.ph)"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              required
            />
          </div>

          {/* ROLE */}

          <div className="form-group">
            <label htmlFor="create-user-role">Role</label>

            <select
              id="create-user-role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={loading}
              required
            >
              <option value="" disabled>
                Select user role
              </option>

              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          {/* PASSWORD */}

          <div className="form-group">
            <label htmlFor="create-user-password">Password</label>

            <input
              id="create-user-password"
              type="password"
              name="password"
              placeholder="Create a temporary password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              minLength={8}
              required
            />
          </div>

          {/* CONFIRM PASSWORD */}

          <div className="form-group">
            <label htmlFor="create-user-confirm-password">
              Confirm Password
            </label>

            <input
              id="create-user-confirm-password"
              type="password"
              name="confirmPassword"
              placeholder="Re-enter the temporary password"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
              minLength={8}
              required
            />
          </div>

          <small className="form-hint">
            The user should change this password after their first login.
          </small>

          {/* ERROR */}

          {error && <p className="error-message">{error}</p>}

          {/* ACTIONS */}

          <div className="button-group">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate("/admin/user/list")}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !authenticated || userRole !== "Admin"}
            >
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
