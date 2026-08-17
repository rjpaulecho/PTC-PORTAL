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

export default function EditUser() {
  const navigate = useNavigate();
  const { id } = useParams();

  const session = authService.getSession();

  const [formData, setFormData] = useState<UserForm>({
    username: "",
    email: "",
    role: "",
    is_active: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!session || session.role !== "Admin") {
      navigate("/login");
      return;
    }

    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/${id}`);

      if (!response.ok) {
        throw new Error("Unable to load user.");
      }

      const data = await response.json();

      setFormData({
        username: data.username,
        email: data.email,
        role: data.role,
        is_active: data.is_active,
      });
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to load user.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "is_active") {
      setFormData({
        ...formData,
        is_active: value === "true",
      });
      return;
    }

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to update user.");
      }

      alert("User updated successfully.");

      navigate("/admin/users");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to update user.");
    } finally {
      setSaving(false);
    }
  };

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
            <label>Username</label>

            <input
              type="text"
              name="username"
              placeholder="Enter username"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>

            <input
              type="email"
              name="email"
              placeholder="Enter PTC email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Role</label>

            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
            >
              <option value="">Select Role</option>
              <option value="Admin">Admin</option>
              <option value="Registrar">Registrar</option>
              <option value="Faculty">Faculty</option>
              <option value="Program Head">Program Head</option>
            </select>
          </div>

          <div className="form-group">
            <label>Status</label>

            <select
              name="is_active"
              value={formData.is_active ? "true" : "false"}
              onChange={handleChange}
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
