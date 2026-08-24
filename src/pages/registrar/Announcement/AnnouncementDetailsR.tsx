import { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/announcementDetailR.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000";

const FILE_BASE_URL = "http://localhost:3000";

// =====================================================
// TYPES
// =====================================================

interface Recipient {
  role_id: number;
  role_name: string;
}

interface Attachment {
  file_id: number;
  original_name: string;
  file_path: string;
}

interface Announcement {
  announcement_id: number;

  title: string;

  content: string;

  created_by: string;

  publish_date: string;

  expiry_date: string | null;

  is_active: number;

  created_at: string;

  recipients: Recipient[];

  attachments: Attachment[];
}

interface AnnouncementDetailResponse {
  success?: boolean;

  data?: Announcement;

  announcement?: Announcement;

  message?: string;

  error?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function AnnouncementDetailR() {
  const navigate = useNavigate();

  const { id } = useParams<{
    id: string;
  }>();

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

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

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
  // LOAD ANNOUNCEMENT
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    const controller = new AbortController();

    const loadAnnouncement = async () => {
      try {
        setLoading(true);

        setError("");

        // =================================================
        // VALIDATE ANNOUNCEMENT ID
        // =================================================

        if (!id) {
          throw new Error("Announcement ID is missing.");
        }

        const announcementId = Number(id);

        if (!Number.isInteger(announcementId) || announcementId <= 0) {
          throw new Error("Invalid announcement ID.");
        }

        // =================================================
        // REGISTRAR MANAGEMENT ENDPOINT
        //
        // This page is part of Announcement Management.
        //
        // Therefore use:
        //
        // /api/announcement-management/:id
        //
        // NOT:
        //
        // /api/announcements/:id
        //
        // The shared endpoint is for normal role-filtered
        // announcement viewing only.
        // =================================================

        const url = `${API_BASE_URL}/api/announcement-management/${announcementId}`;

        console.log("GET REGISTRAR ANNOUNCEMENT DETAIL:", url);

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

        let data: Announcement | AnnouncementDetailResponse | null = null;

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
          const responseObject =
            data && !("announcement_id" in data) ? data : null;

          throw new Error(
            responseObject?.message ||
              responseObject?.error ||
              "You are not authorized to manage this announcement.",
          );
        }

        // =================================================
        // HTTP ERROR
        // =================================================

        if (!response.ok) {
          const responseObject =
            data && !("announcement_id" in data) ? data : null;

          throw new Error(
            responseObject?.message ||
              responseObject?.error ||
              `Failed to load announcement (${response.status}).`,
          );
        }

        // =================================================
        // NORMALIZE RESPONSE
        //
        // Supports:
        //
        // { announcement_id: ... }
        //
        // { announcement: {...} }
        //
        // { data: {...} }
        // =================================================

        let loadedAnnouncement: Announcement | null = null;

        if (data && "announcement_id" in data) {
          loadedAnnouncement = data as Announcement;
        } else if (data && data.announcement) {
          loadedAnnouncement = data.announcement;
        } else if (data && data.data) {
          loadedAnnouncement = data.data;
        }

        if (!loadedAnnouncement) {
          throw new Error("Announcement data was not returned by the server.");
        }

        // =================================================
        // NORMALIZE ARRAYS
        // =================================================

        const normalizedAnnouncement: Announcement = {
          ...loadedAnnouncement,

          recipients: Array.isArray(loadedAnnouncement.recipients)
            ? loadedAnnouncement.recipients
            : [],

          attachments: Array.isArray(loadedAnnouncement.attachments)
            ? loadedAnnouncement.attachments
            : [],
        };

        console.log("REGISTRAR ANNOUNCEMENT DETAIL:", normalizedAnnouncement);

        setAnnouncement(normalizedAnnouncement);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("LOAD ANNOUNCEMENT DETAIL ERROR:", err);

        setAnnouncement(null);

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

    void loadAnnouncement();

    return () => {
      controller.abort();
    };
  }, [id, authenticated, userRole, navigate]);

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
      <div className="registrar-announcement-detailR">
        {/* =================================================
            BACK
        ================================================= */}

        <button
          type="button"
          className="announcement-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && <p>Loading announcement...</p>}

        {/* =================================================
            ERROR
        ================================================= */}

        {!loading && error && <p className="error">{error}</p>}

        {/* =================================================
            ANNOUNCEMENT
        ================================================= */}

        {!loading && !error && announcement && (
          <div className="announcement-detail-card">
            {/* TITLE */}

            <h1>{announcement.title}</h1>

            {/* =================================================
                  META
              ================================================= */}

            <div className="announcement-meta">
              <p>
                Created by:
                <strong> {announcement.created_by || "Unknown"}</strong>
              </p>

              <p>
                Published:{" "}
                {announcement.publish_date
                  ? new Date(announcement.publish_date).toLocaleString()
                  : "No publish date"}
              </p>

              {announcement.expiry_date && (
                <p>
                  Expiry: {new Date(announcement.expiry_date).toLocaleString()}
                </p>
              )}

              <p>
                Status:{" "}
                {Number(announcement.is_active) === 1 ? "Active" : "Inactive"}
              </p>
            </div>

            <hr />

            {/* =================================================
                  CONTENT
              ================================================= */}

            <div className="announcement-content">{announcement.content}</div>

            {/* =================================================
                  RECIPIENTS
              ================================================= */}

            <div className="announcement-section">
              <h3>Recipients</h3>

              {announcement.recipients.length > 0 ? (
                <ul>
                  {announcement.recipients.map((role) => (
                    <li key={role.role_id}>{role.role_name}</li>
                  ))}
                </ul>
              ) : (
                <p>No recipients.</p>
              )}
            </div>

            {/* =================================================
                  ATTACHMENTS
              ================================================= */}

            <div className="announcement-section">
              <h3>Attachments</h3>

              {announcement.attachments.length > 0 ? (
                <div className="attachment-list">
                  {announcement.attachments.map((file) => {
                    const normalizedPath = file.file_path.replace(/\\/g, "/");

                    const attachmentUrl = `${FILE_BASE_URL}/${normalizedPath.replace(
                      /^\/+/,
                      "",
                    )}`;

                    return (
                      <div key={file.file_id} className="attachment-item">
                        📄{" "}
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.original_name}
                        </a>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>No attachments.</p>
              )}
            </div>

            {/* =================================================
                  MANAGEMENT ACTION
              ================================================= */}

            <div className="announcement-actions">
              <button
                type="button"
                className="announcement-btn"
                onClick={() =>
                  navigate(
                    `/registrar/announcement/editR/${announcement.announcement_id}`,
                  )
                }
              >
                Edit Announcement
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
