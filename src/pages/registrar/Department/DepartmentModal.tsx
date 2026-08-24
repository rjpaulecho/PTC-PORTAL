import React, { useEffect, useState } from "react";
import "../../../styles/DepartmentModal.css";

// =====================================================
// TYPES
// =====================================================

export interface Department {
  department_id: number;
  department_code: string;
  department_name: string;
  created_at?: string;
}

interface DepartmentModalProps {
  isOpen: boolean;
  department?: Department | null;
  onClose: () => void;
  onSuccess: () => void;
}
// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/departments";

// =====================================================
// COMPONENT
// =====================================================

export default function DepartmentModal({
  isOpen,
  department,
  onClose,
  onSuccess,
}: DepartmentModalProps) {
  // =====================================================
  // STATES
  // =====================================================

  const [departmentCode, setDepartmentCode] = useState("");

  const [departmentName, setDepartmentName] = useState("");

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // EDIT / ADD MODE
  // =====================================================

  const isEditMode = Boolean(department);

  // =====================================================
  // LOAD DEPARTMENT DATA
  // =====================================================

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (department) {
      setDepartmentCode(department.department_code || "");

      setDepartmentName(department.department_name || "");
    } else {
      setDepartmentCode("");
      setDepartmentName("");
    }

    setError("");
  }, [isOpen, department]);

  // =====================================================
  // CLOSE
  // =====================================================

  const handleClose = () => {
    if (saving) {
      return;
    }

    setDepartmentCode("");
    setDepartmentName("");
    setError("");

    onClose();
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");

    // ===================================================
    // VALIDATION
    // ===================================================

    const cleanCode = departmentCode.trim();

    const cleanName = departmentName.trim();

    if (!cleanCode) {
      setError("Department code is required.");
      return;
    }

    if (!cleanName) {
      setError("Department name is required.");
      return;
    }

    if (cleanCode.length > 20) {
      setError("Department code cannot exceed 20 characters.");
      return;
    }

    if (cleanName.length > 150) {
      setError("Department name cannot exceed 150 characters.");
      return;
    }

    // ===================================================
    // REQUEST
    // ===================================================

    try {
      setSaving(true);

      const url = isEditMode
        ? `${API_BASE_URL}/${department?.department_id}`
        : API_BASE_URL;

      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,

        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          department_code: cleanCode,
          department_name: cleanName,
        }),
      });

      // =================================================
      // CHECK CONTENT TYPE
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const text = await response.text();

        throw new Error(
          `Server returned a non-JSON response (${response.status}): ${text.slice(
            0,
            200,
          )}`,
        );
      }

      // =================================================
      // RESPONSE
      // =================================================

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            (isEditMode
              ? "Failed to update department."
              : "Failed to create department."),
        );
      }

      // =================================================
      // SUCCESS
      // =================================================

      setDepartmentCode("");
      setDepartmentName("");
      setError("");

      onSuccess();
    } catch (err) {
      console.error("SAVE DEPARTMENT ERROR:", err);

      setError(
        err instanceof Error ? err.message : "Failed to save department.",
      );
    } finally {
      setSaving(false);
    }
  };

  // =====================================================
  // DO NOT RENDER
  // =====================================================

  if (!isOpen) {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      className="department-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          handleClose();
        }
      }}
    >
      <div
        className="department-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="department-modal-title"
      >
        {/* =================================================
                HEADER
            ================================================= */}

        <div className="department-modal-header">
          <div>
            <h2 id="department-modal-title">
              {isEditMode ? "Edit Department" : "Add Department"}
            </h2>

            <p>
              {isEditMode
                ? "Update the department information below."
                : "Create a new academic department."}
            </p>
          </div>

          <button
            type="button"
            className="department-modal-close"
            onClick={handleClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* =================================================
                FORM
            ================================================= */}

        <form className="department-form" onSubmit={handleSubmit}>
          {/* ERROR */}

          {error && <div className="department-form-error">{error}</div>}

          {/* =================================================
                DEPARTMENT CODE
            ================================================= */}

          <div className="department-form-group">
            <label htmlFor="department-code">Department Code</label>

            <input
              id="department-code"
              type="text"
              value={departmentCode}
              onChange={(event) => setDepartmentCode(event.target.value)}
              placeholder="e.g. CCIS"
              maxLength={20}
              disabled={saving}
              autoComplete="off"
            />

            <small>Enter the official department code.</small>
          </div>

          {/* =================================================
                DEPARTMENT NAME
            ================================================= */}

          <div className="department-form-group">
            <label htmlFor="department-name">Department Name</label>

            <input
              id="department-name"
              type="text"
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              placeholder="e.g. College of Computer Studies"
              maxLength={150}
              disabled={saving}
              autoComplete="off"
            />

            <small>Enter the complete department name.</small>
          </div>

          {/* =================================================
                ACTIONS
            ================================================= */}

          <div className="department-modal-actions">
            <button
              type="button"
              className="department-cancel-btn"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="department-save-btn"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : isEditMode
                  ? "Save Changes"
                  : "Add Department"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
