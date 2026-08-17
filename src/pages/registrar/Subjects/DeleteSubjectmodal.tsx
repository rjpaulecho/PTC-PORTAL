import { useState } from "react";
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

const API_BASE_URL = "http://localhost:3000/api/registrar/subjects";

export default function DeleteSubjectModal({
  isOpen,
  subject,
  onClose,
  onSuccess,
}: DeleteSubjectModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen || !subject) {
    return null;
  }

  const handleDelete = async () => {
    if (!subject.subject_id) {
      setError("Invalid subject ID.");
      return;
    }

    try {
      setDeleting(true);
      setError("");

      const url = `${API_BASE_URL}/${subject.subject_id}`;

      console.log("=================================");
      console.log("DELETE SUBJECT");
      console.log("Subject ID:", subject.subject_id);
      console.log("URL:", url);
      console.log("=================================");

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      console.log("DELETE RESPONSE:", data);

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to delete subject.");
      }

      alert("Subject deleted successfully.");

      onSuccess();
    } catch (err) {
      console.error("DELETE SUBJECT ERROR:", err);

      setError(
        err instanceof Error ? err.message : "Failed to delete subject.",
      );
    } finally {
      setDeleting(false);
    }
  };

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
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-subject-modal-icon">!</div>

        <div className="delete-subject-modal-content">
          <h2>Delete Subject?</h2>

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
            subject is currently used by a curriculum, the database may prevent
            the deletion.
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
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Subject"}
          </button>
        </div>
      </div>
    </div>
  );
}
