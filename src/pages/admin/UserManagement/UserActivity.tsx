import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/activitylogger.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/activity-logs";

// =====================================================
// TYPES
// =====================================================

type ActivityLog = {
  activity_id: number;

  user_id: number;

  username: string;

  role: string;

  activity_type: string;

  module_name: string;

  description: string;

  created_at: string;
};

interface ActivityLogResponse {
  success?: boolean;

  data?: ActivityLog[];

  logs?: ActivityLog[];

  message?: string;

  error?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function UserActivity() {
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

  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

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
  // LOAD ACTIVITY LOGS
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Admin") {
      return;
    }

    const controller = new AbortController();

    const loadLogs = async () => {
      try {
        setLoading(true);

        setError("");

        // =================================================
        // JWT AUTHENTICATED GET
        // =================================================

        const response = await authService.authFetch(API_BASE_URL, {
          method: "GET",

          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

        // =================================================
        // SAFE RESPONSE
        // =================================================

        const contentType = response.headers.get("content-type") || "";

        let data: ActivityLog[] | ActivityLogResponse | null = null;

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
          const responseObject = !Array.isArray(data) ? data : null;

          throw new Error(
            responseObject?.message ||
              responseObject?.error ||
              "You are not authorized to view activity logs.",
          );
        }

        // =================================================
        // HTTP ERROR
        // =================================================

        if (!response.ok) {
          const responseObject = !Array.isArray(data) ? data : null;

          throw new Error(
            responseObject?.message ||
              responseObject?.error ||
              `Unable to load activity logs (${response.status}).`,
          );
        }

        // =================================================
        // NORMALIZE RESPONSE
        //
        // Supports:
        //
        // [...]
        //
        // { logs: [...] }
        //
        // { data: [...] }
        // =================================================

        let loadedLogs: ActivityLog[] = [];

        if (Array.isArray(data)) {
          loadedLogs = data;
        } else if (data && Array.isArray(data.logs)) {
          loadedLogs = data.logs;
        } else if (data && Array.isArray(data.data)) {
          loadedLogs = data.data;
        }

        setLogs(loadedLogs);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("LOAD ACTIVITY LOGS ERROR:", err);

        setLogs([]);

        if (err instanceof TypeError) {
          setError(
            "Unable to connect to the activity log server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setError(
          err instanceof Error ? err.message : "Unable to load activity logs.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadLogs();

    return () => {
      controller.abort();
    };
  }, [authenticated, userRole, navigate]);

  // =====================================================
  // FILTER LOGS
  // =====================================================

  const filteredLogs = logs.filter((log) => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return true;
    }

    const values = [
      log.username,
      log.role,
      log.activity_type,
      log.module_name,
      log.description,
    ];

    return values.some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(query),
    );
  });

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
      <div className="admin-activity">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="admin-activity-header">
          <h1>User Activity Logs</h1>
        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && <p className="admin-manage-students__error">{error}</p>}

        {/* =================================================
            SEARCH
        ================================================= */}

        <input
          type="text"
          placeholder="Search activity..."
          className="activity-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {/* =================================================
            TABLE
        ================================================= */}

        <div className="activity-table-wrapper">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Date & Time</th>

                <th>User</th>

                <th>Role</th>

                <th>Activity</th>

                <th>Module</th>

                <th>Description</th>
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
                    Loading activity logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                    }}
                  >
                    No activity found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.activity_id}>
                    <td>
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString()
                        : "—"}
                    </td>

                    <td>{log.username}</td>

                    <td>{log.role}</td>

                    <td>
                      <span
                        className={`activity-badge ${String(
                          log.activity_type || "",
                        )
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {log.activity_type}
                      </span>
                    </td>

                    <td>{log.module_name}</td>

                    <td>{log.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
