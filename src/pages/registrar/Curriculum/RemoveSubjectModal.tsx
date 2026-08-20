import { useState } from "react";
import "../../../styles/RemoveSubjectModal.css";

interface CurriculumSubject {
  curriculum_subject_id: number;
  curriculum_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
}

interface RemoveSubjectModalProps {
  isOpen: boolean;
  curriculumId: number;
  subject: CurriculumSubject | null;
  onClose: () => void;
  onSuccess: () => void;
}

const API_BASE_URL = "http://localhost:3000/api/registrar/curriculums";

export default function RemoveSubjectModal({
  isOpen,
  curriculumId,
  subject,
  onClose,
  onSuccess,
}: RemoveSubjectModalProps) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen || !subject) {
    return null;
  }

  const handleRemove = async () => {
    try {
      setRemoving(true);
      setError("");

      const url =
        `${API_BASE_URL}/${curriculumId}/subjects/` +
        `${subject.curriculum_subject_id}`;

      console.log("REMOVE CURRICULUM SUBJECT:", url);

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to remove subject.");
      }

      console.log("SUBJECT REMOVED:", data.removed);

      onSuccess();
    } catch (err) {
      console.error("REMOVE CURRICULUM SUBJECT ERROR:", err);

      setError(
        err instanceof Error ? err.message : "Failed to remove subject.",
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="remove-modal-overlay">
      <div
        className="remove-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="remove-modal-icon">!</div>

        <h2>Remove Subject?</h2>

        <p className="remove-modal-description">
          Are you sure you want to remove this subject from this curriculum?
        </p>

        <div className="remove-subject-info">
          <div>
            <strong>{subject.subject_code}</strong>

            <span>{subject.subject_name}</span>
          </div>

          <small>
            {subject.units} {subject.units === 1 ? "unit" : "units"}
          </small>
        </div>

        <div className="remove-warning">
          <strong>Note:</strong>

          <span>
            This will only remove the subject from this curriculum. The subject
            itself will not be deleted from the system.
          </span>
        </div>

        {error && <div className="remove-error">{error}</div>}

        <div className="remove-modal-actions">
          <button
            type="button"
            className="remove-cancel-button"
            onClick={onClose}
            disabled={removing}
          >
            Cancel
          </button>

          <button
            type="button"
            className="remove-confirm-button"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? "Removing..." : "Remove Subject"}
          </button>
        </div>
      </div>
    </div>
  );
}
