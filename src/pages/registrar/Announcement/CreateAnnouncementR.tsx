import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/announcementcreateR.css";

const ANNOUNCEMENT_API_URL =
  "http://localhost:3000/api/announcement-management";

const FILE_UPLOAD_URL = "http://localhost:3000/api/files/upload";

// =====================================================
// TYPES
// =====================================================

type Role = {
  role_id: number;
  role_name: string;
};

interface UploadResponse {
  success?: boolean;

  file_id?: number;

  file?: {
    file_id?: number;
  };

  data?: {
    file_id?: number;
  };

  message?: string;

  error?: string;
}

interface CreateAnnouncementResponse {
  success?: boolean;

  announcement_id?: number;

  message?: string;

  error?: string;
}

// =====================================================
// RECIPIENT ROLES
//
// IMPORTANT:
//
// /api/roles is currently Admin-only.
//
// Therefore Registrar should NOT call:
// GET /api/roles
//
// Replace these IDs with the actual IDs from your roles
// table if they differ.
//
// Based on the current role structure:
//
// 1 = Admin
// 2 = Registrar
// 3 = Student
// 4 = Faculty
// 5 = Program Head
//
// If your DB IDs differ, update only this array.
// =====================================================

const RECIPIENT_ROLES: Role[] = [
  {
    role_id: 1,
    role_name: "Admin",
  },
  {
    role_id: 2,
    role_name: "Registrar",
  },
  {
    role_id: 3,
    role_name: "Student",
  },
  {
    role_id: 4,
    role_name: "Faculty",
  },
  {
    role_id: 5,
    role_name: "Program Head",
  },
];

// =====================================================
// COMPONENT
// =====================================================

export default function AnnouncementCreateR() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const session = authService.getSession();

  const token = authService.getToken();

  const userRole = session?.role;

  const authenticated = Boolean(session && token);

  // =====================================================
  // FORM STATE
  // =====================================================

  const [title, setTitle] = useState("");

  const [content, setContent] = useState("");

  const [recipients, setRecipients] = useState<number[]>([]);

  const [publishDate, setPublishDate] = useState("");

  const [expiryDate, setExpiryDate] = useState("");

  const [isActive, setIsActive] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
  // FILE UPLOAD
  // =====================================================

  async function uploadFile(): Promise<number | null> {
    if (!selectedFile) {
      return null;
    }

    // ===================================================
    // AUTH CHECK
    // ===================================================

    if (!authenticated || userRole !== "Registrar") {
      throw new Error(
        "Your session has expired or you are not authorized to upload files.",
      );
    }

    const formData = new FormData();

    formData.append("file", selectedFile);

    // ===================================================
    // IMPORTANT
    //
    // DO NOT send:
    //
    // uploaded_by
    //
    // Backend should derive uploader from:
    //
    // req.user.user_id
    // ===================================================

    const response = await authService.authFetch(FILE_UPLOAD_URL, {
      method: "POST",

      body: formData,
    });

    // ===================================================
    // SAFE RESPONSE
    // ===================================================

    const contentType = response.headers.get("content-type") || "";

    let data: UploadResponse | null = null;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();

      throw new Error(
        `File server returned a non-JSON response (${response.status}): ${text.slice(
          0,
          200,
        )}`,
      );
    }

    // ===================================================
    // 401
    // ===================================================

    if (response.status === 401) {
      authService.logout();

      throw new Error("Your session has expired. Please log in again.");
    }

    // ===================================================
    // 403
    // ===================================================

    if (response.status === 403) {
      throw new Error(
        data?.message ||
          data?.error ||
          "You are not authorized to upload files.",
      );
    }

    // ===================================================
    // HTTP ERROR
    // ===================================================

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          `File upload failed (${response.status}).`,
      );
    }

    // ===================================================
    // NORMALIZE FILE ID
    // ===================================================

    const fileId = Number(
      data?.file_id ?? data?.file?.file_id ?? data?.data?.file_id,
    );

    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error(
        "File uploaded, but the server did not return a valid file ID.",
      );
    }

    return fileId;
  }

  // =====================================================
  // RECIPIENT CHANGE
  // =====================================================

  const handleRecipientChange = (roleId: number, checked: boolean) => {
    setRecipients((current) => {
      if (checked) {
        if (current.includes(roleId)) {
          return current;
        }

        return [...current, roleId];
      }

      return current.filter((id) => id !== roleId);
    });
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

    if (!authenticated || userRole !== "Registrar") {
      setError(
        "Your session has expired or you are not authorized to create announcements.",
      );

      return;
    }

    // ===================================================
    // VALIDATION
    // ===================================================

    const cleanTitle = title.trim();

    const cleanContent = content.trim();

    if (!cleanTitle) {
      setError("Title is required.");

      return;
    }

    if (!cleanContent) {
      setError("Content is required.");

      return;
    }

    if (!publishDate) {
      setError("Publish date is required.");

      return;
    }

    if (recipients.length === 0) {
      setError("Select at least one recipient.");

      return;
    }

    // ===================================================
    // DATE VALIDATION
    // ===================================================

    if (expiryDate && expiryDate < publishDate) {
      setError("Expiry date cannot be earlier than the publish date.");

      return;
    }

    try {
      setLoading(true);

      // ===================================================
      // OPTIONAL FILE UPLOAD
      // ===================================================

      let fileId: number | null = null;

      if (selectedFile) {
        fileId = await uploadFile();
      }

      // ===================================================
      // ANNOUNCEMENT PAYLOAD
      //
      // DO NOT SEND:
      //
      // created_by
      // role_id
      //
      // Backend uses:
      //
      // req.user.user_id
      // req.user.role_name
      // ===================================================

      const announcementData = {
        title: cleanTitle,

        content: cleanContent,

        publish_date: `${publishDate} 00:00:00`,

        expiry_date: expiryDate ? `${expiryDate} 23:59:59` : null,

        is_active: isActive ? 1 : 0,

        recipients,

        attachments: fileId ? [fileId] : [],
      };

      console.log("CREATE REGISTRAR ANNOUNCEMENT:", announcementData);

      // ===================================================
      // JWT AUTHENTICATED CREATE
      // ===================================================

      const response = await authService.authFetch(ANNOUNCEMENT_API_URL, {
        method: "POST",

        body: JSON.stringify(announcementData),
      });

      // ===================================================
      // SAFE RESPONSE
      // ===================================================

      const contentType = response.headers.get("content-type") || "";

      let data: CreateAnnouncementResponse | null = null;

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

      // ===================================================
      // 401
      // ===================================================

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      // ===================================================
      // 403
      // ===================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to create announcements.",
        );
      }

      // ===================================================
      // HTTP ERROR
      // ===================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to create announcement (${response.status}).`,
        );
      }

      // ===================================================
      // SUCCESS
      // ===================================================

      window.alert(data?.message || "Announcement created successfully.");

      navigate("/registrar/announcement/listR");
    } catch (err) {
      console.error("CREATE ANNOUNCEMENT ERROR:", err);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setError(
        err instanceof Error ? err.message : "Unable to create announcement.",
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !session || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-announcement-createR">
        {/* =================================================
            HEADER
        ================================================= */}

        <h1>Create Announcement</h1>

        {/* =================================================
            FORM
        ================================================= */}

        <form className="announcement-formR" onSubmit={handleSubmit}>
          {/* TITLE */}

          <div className="form-group">
            <label htmlFor="announcement-title">Title</label>

            <input
              id="announcement-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Announcement title"
              disabled={loading}
              maxLength={255}
              required
            />
          </div>

          {/* CONTENT */}

          <div className="form-group">
            <label htmlFor="announcement-content">Content</label>

            <textarea
              id="announcement-content"
              rows={8}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write announcement..."
              disabled={loading}
              required
            />
          </div>

          {/* RECIPIENTS */}

          <div className="form-group">
            <label>Recipients</label>

            <div className="recipient-list">
              {RECIPIENT_ROLES.map((role) => (
                <label key={role.role_id}>
                  <input
                    type="checkbox"
                    checked={recipients.includes(role.role_id)}
                    onChange={(event) =>
                      handleRecipientChange(role.role_id, event.target.checked)
                    }
                    disabled={loading}
                  />

                  {role.role_name}
                </label>
              ))}
            </div>
          </div>

          {/* ATTACHMENT */}

          <div className="form-group">
            <label htmlFor="announcement-file">Attachment</label>

            <input
              id="announcement-file"
              type="file"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] || null)
              }
              disabled={loading}
            />

            {selectedFile && <p>Selected: {selectedFile.name}</p>}
          </div>

          {/* STATUS */}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="announcement-status">Status</label>

              <select
                id="announcement-status"
                value={isActive ? "true" : "false"}
                onChange={(event) => setIsActive(event.target.value === "true")}
                disabled={loading}
              >
                <option value="true">Active</option>

                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          {/* DATES */}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="announcement-publish-date">Publish Date</label>

              <input
                id="announcement-publish-date"
                type="date"
                value={publishDate}
                onChange={(event) => setPublishDate(event.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="announcement-expiry-date">Expiry Date</label>

              <input
                id="announcement-expiry-date"
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                min={publishDate || undefined}
                disabled={loading}
              />
            </div>
          </div>

          {/* ERROR */}

          {error && <div className="course-modal-error">{error}</div>}

          {/* ACTIONS */}

          <div className="announcement-actions">
            <button
              type="button"
              className="announcement-btn"
              onClick={() => navigate("/registrar/announcement/listR")}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="save-btn"
              disabled={loading || !authenticated || userRole !== "Registrar"}
            >
              {loading ? "Creating..." : "Create Announcement"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
