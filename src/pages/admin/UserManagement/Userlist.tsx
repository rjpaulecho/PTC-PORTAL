import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import "../../../styles/userlist.css";

type User = {
  user_id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
};

const API_BASE_URL = "http://localhost:3000/api/users";

export default function UserList() {
  const navigate = useNavigate();
  const session = authService.getSession();

  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || session.role !== "Admin") {
      navigate("/login");
      return;
    }

    loadUsers();
  }, [navigate, session?.role]);

  const loadUsers = async () => {
    try {
      setLoading(true);

      const response = await fetch(API_BASE_URL);

      if (!response.ok) {
        throw new Error("Failed to load users.");
      }

      const data: User[] = await response.json();

      setUsers(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // RESET PASSWORD

  const resetPassword = async (userId: number, username: string) => {
    const newPassword = window.prompt(`Enter new password for ${username}:`);

    if (!newPassword) return;

    try {
      const response = await fetch(`${API_BASE_URL}/${userId}/reset-password`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      alert("Password reset successfully.");
    } catch (error) {
      console.error(error);

      alert("Password reset failed.");
    }
  };

  // ACTIVATE / DEACTIVATE USER

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    const action = currentStatus ? "Deactivate" : "Activate";

    const confirmAction = window.confirm(`${action} this user account?`);

    if (!confirmAction) return;

    try {
      const response = await fetch(`${API_BASE_URL}/${userId}/status`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          is_active: !currentStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed updating status");
      }

      setUsers((previous) =>
        previous.map((user) =>
          user.user_id === userId
            ? {
                ...user,
                is_active: !currentStatus,
              }
            : user,
        ),
      );
    } catch (error) {
      console.error(error);

      alert("Failed to update user status.");
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();

    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <div className="admin-user-list">
        <div className="admin-user-list__header">
          <h1>User Management</h1>

          <button
            className="btn btn-primary"
            onClick={() => navigate("/admin/user/create")}
          >
            + Create User
          </button>
        </div>

        <input
          className="admin-user-list__search"
          placeholder="Search username, email or role..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <table className="admin-user-list__table">
          <thead>
            <tr>
              <th>ID</th>

              <th>Username</th>

              <th>Email</th>

              <th>Role</th>

              <th>Status</th>

              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                  }}
                >
                  Loading users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                  }}
                >
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.user_id}</td>

                  <td>{u.username}</td>

                  <td>{u.email}</td>

                  <td>
                    <span
                      className={`role-badge role-${u.role
                        .toLowerCase()
                        .replace(/\s+/g, "-")}`}
                    >
                      {u.role}
                    </span>
                  </td>

                  <td>
                    {u.is_active ? (
                      <span className="status-active">Active</span>
                    ) : (
                      <span className="status-inactive">Inactive</span>
                    )}
                  </td>

                  <td>
                    <button
                      className="btn btn-secondary"
                      onClick={() => navigate(`/admin/user/edit/${u.user_id}`)}
                    >
                      Edit
                    </button>

                    <button
                      className="btn btn-warning"
                      style={{
                        marginLeft: "8px",
                      }}
                      onClick={() => resetPassword(u.user_id, u.username)}
                    >
                      Reset Password
                    </button>

                    <button
                      className={
                        u.is_active ? "btn btn-danger" : "btn btn-success"
                      }
                      style={{
                        marginLeft: "8px",
                      }}
                      onClick={() => toggleUserStatus(u.user_id, u.is_active)}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
