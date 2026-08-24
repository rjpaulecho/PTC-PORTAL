import { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/announcementeditR.css";

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

type Attachment = {
  file_id: number;
  original_name: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
};

interface AnnouncementResponse {
  announcement_id?: number;

  title?: string;

  content?: string;

  publish_date?: string;

  expiry_date?: string | null;

  is_active?: number;

  recipients?: Role[];

  attachments?: Attachment[];

  data?: {
    announcement_id?: number;
    title?: string;
    content?: string;
    publish_date?: string;
    expiry_date?: string | null;
    is_active?: number;
    recipients?: Role[];
    attachments?: Attachment[];
  };

  announcement?: {
    announcement_id?: number;
    title?: string;
    content?: string;
    publish_date?: string;
    expiry_date?: string | null;
    is_active?: number;
    recipients?: Role[];
    attachments?: Attachment[];
  };

  message?: string;

  error?: string;
}

interface UploadResponse {
  success?: boolean;

  file_id?: number;

  file_name?: string;

  original_name?: string;

  file?: {
    file_id?: number;
    original_name?: string;
  };

  data?: {
    file_id?: number;
    original_name?: string;
  };

  message?: string;

  error?: string;
}

interface UpdateResponse {
  success?: boolean;

  message?: string;

  error?: string;
}

// =====================================================
// TEMPORARY RECIPIENT ROLES
//
// /api/roles is currently Admin-only.
//
// Replace IDs here if your database uses different IDs.
// Better long-term solution:
// GET /api/announcement-management/recipient-roles
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

export default function AnnouncementEditR() {
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

  const [title, setTitle] = useState("");

  const [content, setContent] = useState("");

  const [recipients, setRecipients] = useState<number[]>([]);

  const [publishDate, setPublishDate] = useState("");

  const [expiryDate, setExpiryDate] = useState("");

  const [isActive, setIsActive] = useState(true);

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

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

    const announcementId = Number(id);

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      setError("Invalid announcement ID.");

      setLoading(false);

      return;
    }

    const controller = new AbortController();

    const loadAnnouncement = async () => {
      try {
        setLoading(true);

        setError("");

        const response = await authService.authFetch(
          `${ANNOUNCEMENT_API_URL}/${announcementId}`,
          {
            method: "GET",

            signal: controller.signal,

            headers: {
              Accept: "application/json",
            },
          },
        );

        const contentType = response.headers.get("content-type") || "";

        let data: AnnouncementResponse | null = null;

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
              "You are not authorized to edit announcements.",
          );
        }

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Unable to load announcement (${response.status}).`,
          );
        }

        // =================================================
        // NORMALIZE RESPONSE
        // =================================================

        const announcement = data?.announcement ?? data?.data ?? data;

        if (!announcement) {
          throw new Error("Announcement data was not returned by the server.");
        }

        setTitle(String(announcement.title ?? ""));

        setContent(String(announcement.content ?? ""));

        setPublishDate(
          announcement.publish_date
            ? String(announcement.publish_date).split("T")[0]
            : "",
        );

        setExpiryDate(
          announcement.expiry_date
            ? String(announcement.expiry_date).split("T")[0]
            : "",
        );

        setIsActive(Number(announcement.is_active) === 1);

        setRecipients(
          Array.isArray(announcement.recipients)
            ? announcement.recipients
                .map((role) => Number(role.role_id))
                .filter((roleId) => Number.isInteger(roleId) && roleId > 0)
            : [],
        );

        setAttachments(
          Array.isArray(announcement.attachments)
            ? announcement.attachments
            : [],
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("LOAD ANNOUNCEMENT ERROR:", err);

        setError(
          err instanceof Error ? err.message : "Unable to load announcement.",
        );
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

      return current.filter((currentRoleId) => currentRoleId !== roleId);
    });
  };

  // =====================================================
  // REMOVE EXISTING ATTACHMENT
  // =====================================================

  const handleRemoveAttachment = (fileId: number) => {
    if (saving) {
      return;
    }

    setAttachments((current) =>
      current.filter((file) => file.file_id !== fileId),
    );
  };

  // =====================================================
  // FILE UPLOAD
  // =====================================================

  async function uploadFile(): Promise<Attachment | null> {
    if (!selectedFile) {
      return null;
    }

    if (!authenticated || userRole !== "Registrar") {
      throw new Error(
        "Your session has expired or you are not authorized to upload files.",
      );
    }

    const formData = new FormData();

    formData.append("file", selectedFile);

    // IMPORTANT:
    // Do not send uploaded_by.
    // Backend should derive uploader from req.user.user_id.

    const response = await authService.authFetch(FILE_UPLOAD_URL, {
      method: "POST",

      body: formData,
    });

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

    if (response.status === 401) {
      authService.logout();

      throw new Error("Your session has expired. Please log in again.");
    }

    if (response.status === 403) {
      throw new Error(
        data?.message ||
          data?.error ||
          "You are not authorized to upload files.",
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          `File upload failed (${response.status}).`,
      );
    }

    const fileId = Number(
      data?.file_id ?? data?.file?.file_id ?? data?.data?.file_id,
    );

    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error(
        "File uploaded, but the server did not return a valid file ID.",
      );
    }

    return {
      file_id: fileId,

      original_name:
        data?.original_name ??
        data?.file_name ??
        data?.file?.original_name ??
        data?.data?.original_name ??
        selectedFile.name,
    };
  }

  // =====================================================
  // SUBMIT
  // =====================================================

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    setError("");

    if (!authenticated || userRole !== "Registrar") {
      setError(
        "Your session has expired or you are not authorized to update announcements.",
      );

      return;
    }

    const announcementId = Number(id);

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      setError("Invalid announcement ID.");

      return;
    }

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

    if (expiryDate && expiryDate < publishDate) {
      setError("Expiry date cannot be earlier than the publish date.");

      return;
    }

    try {
      setSaving(true);

      // ===================================================
      // EXISTING ATTACHMENTS
      // ===================================================

      const attachmentIds = attachments
        .map((file) => Number(file.file_id))
        .filter((fileId) => Number.isInteger(fileId) && fileId > 0);

      // ===================================================
      // OPTIONAL NEW FILE
      // ===================================================

      if (selectedFile) {
        const uploaded = await uploadFile();

        if (uploaded && !attachmentIds.includes(uploaded.file_id)) {
          attachmentIds.push(uploaded.file_id);
        }
      }

      // ===================================================
      // PAYLOAD
      //
      // DO NOT SEND:
      //
      // updated_by
      // role_id
      //
      // Backend gets actor from req.user.
      // ===================================================

      const payload = {
        title: cleanTitle,

        content: cleanContent,

        publish_date: `${publishDate} 00:00:00`,

        expiry_date: expiryDate ? `${expiryDate} 23:59:59` : null,

        is_active: isActive ? 1 : 0,

        recipients,

        attachments: attachmentIds,
      };

      const response = await authService.authFetch(
        `${ANNOUNCEMENT_API_URL}/${announcementId}`,
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
            "You are not authorized to update announcements.",
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to update announcement (${response.status}).`,
        );
      }

      window.alert(data?.message || "Announcement updated successfully.");

      navigate("/registrar/announcement/listR");
    } catch (err) {
      console.error("UPDATE ANNOUNCEMENT ERROR:", err);

      setError(
        err instanceof Error ? err.message : "Unable to update announcement.",
      );
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !session || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="registrar-announcement-editR">
          Loading announcement...
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-announcement-editR">
        <h1>Edit Announcement</h1>

        {error && <div className="course-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="announcement-formR">
          {/* TITLE */}

          <label htmlFor="announcement-edit-title">Title</label>

          <input
            id="announcement-edit-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={saving}
            maxLength={255}
            required
          />

          {/* CONTENT */}

          <label htmlFor="announcement-edit-content">Content</label>

          <textarea
            id="announcement-edit-content"
            rows={8}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={saving}
            required
          />

          {/* RECIPIENTS */}

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
                  disabled={saving}
                />

                {role.role_name}
              </label>
            ))}
          </div>

          {/* EXISTING ATTACHMENTS */}

          <label>Existing Attachments</label>

          {attachments.length > 0 ? (
            <div className="attachment-list">
              {attachments.map((file) => (
                <div key={file.file_id} className="attachment-item">
                  <span>📄 {file.original_name}</span>

                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(file.file_id)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>No existing attachments.</p>
          )}

          {/* NEW ATTACHMENT */}

          <label htmlFor="announcement-edit-file">Add Attachment</label>

          <input
            id="announcement-edit-file"
            type="file"
            onChange={(event) =>
              setSelectedFile(event.target.files?.[0] || null)
            }
            disabled={saving}
          />

          {selectedFile && <p>Selected: {selectedFile.name}</p>}

          {/* STATUS */}

          <label htmlFor="announcement-edit-status">Status</label>

          <select
            id="announcement-edit-status"
            value={isActive ? "true" : "false"}
            onChange={(event) => setIsActive(event.target.value === "true")}
            disabled={saving}
          >
            <option value="true">Active</option>

            <option value="false">Inactive</option>
          </select>

          {/* PUBLISH DATE */}

          <label htmlFor="announcement-edit-publish-date">Publish Date</label>

          <input
            id="announcement-edit-publish-date"
            type="date"
            value={publishDate}
            onChange={(event) => setPublishDate(event.target.value)}
            disabled={saving}
            required
          />

          {/* EXPIRY DATE */}

          <label htmlFor="announcement-edit-expiry-date">Expiry Date</label>

          <input
            id="announcement-edit-expiry-date"
            type="date"
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
            min={publishDate || undefined}
            disabled={saving}
          />

          {/* ACTIONS */}

          <div className="announcement-actions">
            <button
              type="button"
              className="announcement-btn"
              onClick={() => navigate("/registrar/announcement/listR")}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || !authenticated || userRole !== "Registrar"}
              className="save-btn"
            >
              {saving ? "Updating..." : "Update Announcement"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
