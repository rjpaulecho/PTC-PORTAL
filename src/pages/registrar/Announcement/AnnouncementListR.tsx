import { useEffect, useState } from "react";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import { useNavigate } from "react-router-dom";

import "../../../styles/announcementRegistrar.css";

const API_BASE_URL = "http://localhost:3000";

interface Announcement {
  announcement_id: number;

  title: string;

  content: string;

  created_by: string;

  publish_date: string;

  expiry_date: string | null;

  is_active: number;

  created_at: string;

  recipients: string | null;

  attachments: string | null;
}

interface AnnouncementResponse {
  success?: boolean;

  data?: Announcement[];

  announcements?: Announcement[];

  message?: string;

  error?: string;
}

export default function AnnouncementListR() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // =====================================================
  // STATE
  // =====================================================

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [loading, setLoading] = useState(true);

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

    if (userRole !== "Registrar") {
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
  // LOAD ANNOUNCEMENTS
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    const controller = new AbortController();

    const loadAnnouncements = async () => {
      try {
        setLoading(true);

        setError("");

        // =================================================
        // REGISTRAR MANAGEMENT ENDPOINT
        //
        // This page can:
        // - View all announcements
        // - Create announcements
        // - Edit announcements
        //
        // Therefore it uses:
        //
        // /api/announcement-management
        //
        // NOT:
        //
        // /api/announcements
        //
        // The shared /api/announcements route is only for
        // normal role-filtered announcement viewing.
        // =================================================

        const url = `${API_BASE_URL}/api/announcement-management`;

        console.log("GET REGISTRAR ANNOUNCEMENT MANAGEMENT:", url);

        // =================================================
        // JWT AUTHENTICATED REQUEST
        // =================================================

        const response = await authService.authFetch(url, {
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

        let data: Announcement[] | AnnouncementResponse | null = null;

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
              "You are not authorized to manage announcements.",
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
              `Failed to load announcements (${response.status}).`,
          );
        }

        // =================================================
        // NORMALIZE RESPONSE
        //
        // Supports:
        //
        // [...]
        //
        // { data: [...] }
        //
        // { announcements: [...] }
        // =================================================

        let loadedAnnouncements: Announcement[] = [];

        if (Array.isArray(data)) {
          loadedAnnouncements = data;
        } else if (data && Array.isArray(data.data)) {
          loadedAnnouncements = data.data;
        } else if (data && Array.isArray(data.announcements)) {
          loadedAnnouncements = data.announcements;
        }

        console.log("REGISTRAR MANAGEMENT ANNOUNCEMENTS:", loadedAnnouncements);

        setAnnouncements(loadedAnnouncements);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("LOAD REGISTRAR ANNOUNCEMENTS ERROR:", err);

        setAnnouncements([]);

        if (err instanceof TypeError) {
          setError(
            "Unable to connect to the announcement server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadAnnouncements();

    return () => {
      controller.abort();
    };
  }, [authenticated, userRole, navigate]);

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-announcement-listR">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="announcement-header">
          <h2>Announcement Management</h2>

          <button
            type="button"
            className="announcement-btn"
            onClick={() => navigate("/registrar/announcement/createR")}
          >
            + Create Announcement
          </button>
        </div>

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && <p>Loading announcements...</p>}

        {/* =================================================
            ERROR
        ================================================= */}

        {!loading && error && <p className="error">{error}</p>}

        {/* =================================================
            EMPTY
        ================================================= */}

        {!loading && !error && announcements.length === 0 && (
          <p>No announcements found.</p>
        )}

        {/* =================================================
            ANNOUNCEMENT LIST
        ================================================= */}

        <div className="announcement-list">
          {!loading &&
            !error &&
            announcements.map((item) => (
              <div key={item.announcement_id} className="announcement-card">
                {/* TITLE */}

                <h3>{item.title}</h3>

                {/* CONTENT PREVIEW */}

                <p>
                  {item.content && item.content.length > 150
                    ? `${item.content.substring(0, 150)}...`
                    : item.content}
                </p>

                {/* META */}

                <div className="announcement-footer">
                  <span>
                    Created by:
                    <strong> {item.created_by || "Unknown"}</strong>
                  </span>

                  <span>
                    {item.publish_date
                      ? new Date(item.publish_date).toLocaleDateString()
                      : "No publish date"}
                  </span>
                </div>

                {/* STATUS */}

                <div className="announcement-footer">
                  <span>
                    Status:
                    <strong>
                      {" "}
                      {Number(item.is_active) === 1 ? "Active" : "Inactive"}
                    </strong>
                  </span>

                  {item.recipients && (
                    <span>
                      Recipients:
                      <strong> {item.recipients}</strong>
                    </span>
                  )}
                </div>

                {/* ACTIONS */}

                <div className="announcement-actions">
                  <button
                    type="button"
                    className="announcement-btn"
                    onClick={() =>
                      navigate(
                        `/registrar/announcement/DetailR/${item.announcement_id}`,
                      )
                    }
                  >
                    View Details
                  </button>

                  <button
                    type="button"
                    className="announcement-btn"
                    onClick={() =>
                      navigate(
                        `/registrar/announcement/editR/${item.announcement_id}`,
                      )
                    }
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
