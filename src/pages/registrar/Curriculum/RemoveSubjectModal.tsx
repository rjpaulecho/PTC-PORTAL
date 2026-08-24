import { useState } from "react";

import { authService } from "../../../services/auth.service";

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

interface RemoveSubjectResponse {
  success: boolean;
  message?: string;
  error?: string;
  removed?: unknown;
}

const API_BASE_URL = "http://localhost:3000/api/registrar/curriculums";

export default function RemoveSubjectModal({
  isOpen,
  curriculumId,
  subject,
  onClose,
  onSuccess,
}: RemoveSubjectModalProps) {
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

  const [removing, setRemoving] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // HIDDEN MODAL
  // =====================================================

  if (!isOpen || !subject) {
    return null;
  }

  // =====================================================
  // REMOVE SUBJECT
  // =====================================================

  const handleRemove = async () => {
    setError("");

    // =================================================
    // AUTH CHECK
    // =================================================

    if (!authenticated || userRole !== "Registrar") {
      setError(
        "Your session has expired or you are not authorized to manage curriculum subjects.",
      );

      return;
    }

    // =================================================
    // VALIDATE CURRICULUM
    // =================================================

    const parsedCurriculumId = Number(curriculumId);

    if (!Number.isInteger(parsedCurriculumId) || parsedCurriculumId <= 0) {
      setError("Invalid curriculum ID.");

      return;
    }

    // =================================================
    // VALIDATE CURRICULUM SUBJECT
    // =================================================

    const curriculumSubjectId = Number(subject.curriculum_subject_id);

    if (!Number.isInteger(curriculumSubjectId) || curriculumSubjectId <= 0) {
      setError("Invalid curriculum subject ID.");

      return;
    }

    try {
      setRemoving(true);

      setError("");

      const url = `${API_BASE_URL}/${parsedCurriculumId}/subjects/${curriculumSubjectId}`;

      console.log("=================================");

      console.log("REMOVE CURRICULUM SUBJECT");

      console.log("Curriculum ID:", parsedCurriculumId);

      console.log("Curriculum Subject ID:", curriculumSubjectId);

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

      let data: RemoveSubjectResponse | null = null;

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

      console.log("REMOVE CURRICULUM SUBJECT RESPONSE:", data);

      // =================================================
      // 401
      // Missing / invalid / expired JWT
      // =================================================

      if (response.status === 401) {
        authService.logout();

        setError("Your session has expired. Please log in again.");

        return;
      }

      // =================================================
      // 403
      // Valid JWT, wrong role / permission
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to remove subjects from this curriculum.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to remove subject (${response.status}).`,
        );
      }

      // =================================================
      // API ERROR
      // =================================================

      if (!data?.success) {
        throw new Error(data?.message || "Failed to remove subject.");
      }

      // =================================================
      // SUCCESS
      // =================================================

      console.log("SUBJECT REMOVED:", data.removed);

      onSuccess();
    } catch (err) {
      console.error("REMOVE CURRICULUM SUBJECT ERROR:", err);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the curriculum server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setError(
        err instanceof Error ? err.message : "Failed to remove subject.",
      );
    } finally {
      setRemoving(false);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      className="remove-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !removing) {
          onClose();
        }
      }}
    >
      <div
        className="remove-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-subject-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="remove-modal-icon">!</div>

        <h2 id="remove-subject-title">Remove Subject?</h2>

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
            disabled={removing || !authenticated || userRole !== "Registrar"}
          >
            {removing ? "Removing..." : "Remove Subject"}
          </button>
        </div>
      </div>
    </div>
  );
}
