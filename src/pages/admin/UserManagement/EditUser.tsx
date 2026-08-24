import { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/createuser.css";

const API_BASE_URL = "http://localhost:3000/api/users";

type UserForm = {
  username: string;

  email: string;

  role: string;

  is_active: boolean;
};

interface UserResponse {
  user_id?: number;

  username?: string;

  email?: string;

  role?: string;

  is_active?: boolean;

  success?: boolean;

  data?: UserResponse;

  user?: UserResponse;

  message?: string;

  error?: string;
}

interface UpdateResponse {
  success?: boolean;

  message?: string;

  error?: string;
}

export default function EditUser() {
  const navigate = useNavigate();

  const { id } = useParams<{
    id: string;
  }>();

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

  const [formData, setFormData] = useState<UserForm>({
    username: "",

    email: "",

    role: "",

    is_active: true,
  });

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

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
  // LOAD USER
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Admin") {
      return;
    }

    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      setErrorMessage("Invalid user ID.");

      setLoading(false);

      return;
    }

    const controller = new AbortController();

    const loadUser = async () => {
      try {
        setLoading(true);

        setErrorMessage("");

        const response = await authService.authFetch(
          `${API_BASE_URL}/${userId}`,
          {
            method: "GET",

            signal: controller.signal,

            headers: {
              Accept: "application/json",
            },
          },
        );

        const contentType = response.headers.get("content-type") || "";

        let data: UserResponse | null = null;

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

        if (response.status === 401) {
          authService.logout();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (response.status === 403) {
          throw new Error(
            data?.message ||
              data?.error ||
              "You are not authorized to view this user.",
          );
        }

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Unable to load user (${response.status}).`,
          );
        }

        const loadedUser = data?.user ?? data?.data ?? data;

        if (!loadedUser) {
          throw new Error("User data was not returned by the server.");
        }

        setFormData({
          username: String(loadedUser.username ?? ""),

          email: String(loadedUser.email ?? ""),

          role: String(loadedUser.role ?? ""),

          is_active: Boolean(loadedUser.is_active),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("LOAD USER ERROR:", err);

        if (err instanceof TypeError) {
          setErrorMessage(
            "Unable to connect to the user server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load user.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadUser();

    return () => {
      controller.abort();
    };
  }, [id, authenticated, userRole, navigate]);

  // =====================================================
  // INPUT CHANGE
  // =====================================================

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    if (name === "is_active") {
      setFormData((current) => ({
        ...current,

        is_active: value === "true",
      }));

      return;
    }

    setFormData((current) => ({
      ...current,

      [name]: value,
    }));
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setErrorMessage("");

    if (!authenticated || userRole !== "Admin") {
      setErrorMessage(
        "Your session has expired or you are not authorized to update users.",
      );

      return;
    }

    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      setErrorMessage("Invalid user ID.");

      return;
    }

    const username = formData.username.trim();

    const email = formData.email.trim();

    const role = formData.role.trim();

    if (!username || !email || !role) {
      setErrorMessage("Please fill in all required fields.");

      return;
    }

    try {
      setSaving(true);

      const payload = {
        username,

        email,

        role,

        is_active: formData.is_active,
      };

      const response = await authService.authFetch(
        `${API_BASE_URL}/${userId}`,
        {
          method: "PUT",

          body: JSON.stringify(payload),
        },
      );

      const contentType = response.headers.get("content-type") || "";

      let data: UpdateResponse | null = null;

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

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to update users.",
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to update user (${response.status}).`,
        );
      }

      window.alert(data?.message || "User updated successfully.");

      navigate("/admin/user/list");
    } catch (err) {
      console.error("UPDATE USER ERROR:", err);

      if (err instanceof TypeError) {
        setErrorMessage(
          "Unable to connect to the user server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update user.",
      );
    } finally {
      setSaving(false);
    }
  };

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !session || userRole !== "Admin") {
    return null;
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="create-user">
          <h2>Loading user...</h2>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="create-user">
        <h1>Edit User</h1>

        {errorMessage && <div className="error-message">{errorMessage}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-username">Username</label>

            <input
              id="edit-username"
              type="text"
              name="username"
              placeholder="Enter username"
              value={formData.username}
              onChange={handleChange}
              disabled={saving}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-email">Email</label>

            <input
              id="edit-email"
              type="email"
              name="email"
              placeholder="Enter PTC email"
              value={formData.email}
              onChange={handleChange}
              disabled={saving}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-role">Role</label>

            <select
              id="edit-role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={saving}
              required
            >
              <option value="">Select Role</option>

              <option value="Admin">Admin</option>

              <option value="Registrar">Registrar</option>

              <option value="Faculty">Faculty</option>

              <option value="Program Head">Program Head</option>

              <option value="Student">Student</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="edit-status">Status</label>

            <select
              id="edit-status"
              name="is_active"
              value={formData.is_active ? "true" : "false"}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="true">Active</option>

              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="button-group">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate("/admin/user/list")}
              disabled={saving}
            >
              Cancel
            </button>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
