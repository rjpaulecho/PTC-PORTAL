import { useState } from "react";

import { authService } from "../../../services/auth.service";

import "../../../styles/DeleteSubjectModalR.css";

interface Subject {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
  lecture_hours: number;
  laboratory_hours: number;
  description?: string | null;
}

interface DeleteSubjectModalProps {
  isOpen: boolean;
  subject: Subject | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface DeleteSubjectResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const API_BASE_URL = "http://localhost:3000/api/registrar/subjects";

export default function DeleteSubjectModal({
  isOpen,
  subject,
  onClose,
  onSuccess,
}: DeleteSubjectModalProps) {
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

  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // HIDDEN MODAL
  // =====================================================

  if (!isOpen || !subject) {
    return null;
  }

  // =====================================================
  // DELETE SUBJECT
  // =====================================================

  const handleDelete = async () => {
    setError("");

    // =================================================
    // AUTH CHECK
    // =================================================

    if (!authenticated || userRole !== "Registrar") {
      setError(
        "Your session has expired or you are not authorized to delete subjects.",
      );

      return;
    }

    // =================================================
    // SUBJECT VALIDATION
    // =================================================

    const subjectId = Number(subject.subject_id);

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      setError("Invalid subject ID.");

      return;
    }

    try {
      setDeleting(true);

      setError("");

      const url = `${API_BASE_URL}/${subjectId}`;

      console.log("=================================");

      console.log("DELETE SUBJECT");

      console.log("Subject ID:", subjectId);

      console.log("URL:", url);

      console.log("=================================");

      // =================================================
      // JWT AUTHENTICATED REQUEST
      //
      // authFetch automatically sends:
      //
      // Authorization: Bearer <JWT>
      // =================================================

      const response = await authService.authFetch(url, {
        method: "DELETE",

        headers: {
          Accept: "application/json",
        },
      });

      // =================================================
      // SAFE RESPONSE READ
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      let data: DeleteSubjectResponse | null = null;

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

      console.log("DELETE RESPONSE:", data);

      // =================================================
      // 401
      // =================================================

      if (response.status === 401) {
        authService.logout();

        setError("Your session has expired. Please log in again.");

        return;
      }

      // =================================================
      // 403
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to delete subjects.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to delete subject (${response.status}).`,
        );
      }

      // =================================================
      // API ERROR
      // =================================================

      if (!data?.success) {
        throw new Error(data?.message || "Failed to delete subject.");
      }

      // =================================================
      // SUCCESS
      // =================================================

      alert(data.message || "Subject deleted successfully.");

      onSuccess();
    } catch (err) {
      console.error("DELETE SUBJECT ERROR:", err);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the subject server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setError(
        err instanceof Error ? err.message : "Failed to delete subject.",
      );
    } finally {
      setDeleting(false);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      className="delete-subject-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) {
          onClose();
        }
      }}
    >
      <div
        className="delete-subject-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-subject-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-subject-modal-icon">!</div>

        <div className="delete-subject-modal-content">
          <h2 id="delete-subject-title">Delete Subject?</h2>

          <p>Are you sure you want to permanently delete this subject?</p>
        </div>

        <div className="delete-subject-info">
          <div className="delete-subject-info-main">
            <strong>{subject.subject_code}</strong>

            <span>{subject.subject_name}</span>
          </div>

          <div className="delete-subject-info-units">
            <strong>{subject.units}</strong>

            <span>{subject.units === 1 ? "unit" : "units"}</span>
          </div>
        </div>

        <div className="delete-subject-warning">
          <strong>Warning</strong>

          <p>
            This will permanently delete the subject from the system. If this
            subject is currently used by a curriculum, enrollment, prerequisite,
            section offering, or another academic record, the database or
            backend may prevent the deletion.
          </p>
        </div>

        {error && <div className="delete-subject-error">{error}</div>}

        <div className="delete-subject-modal-actions">
          <button
            type="button"
            className="delete-subject-cancel"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>

          <button
            type="button"
            className="delete-subject-confirm"
            onClick={handleDelete}
            disabled={deleting || !authenticated || userRole !== "Registrar"}
          >
            {deleting ? "Deleting..." : "Delete Subject"}
          </button>
        </div>
      </div>
    </div>
  );
}
