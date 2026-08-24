import React, { useEffect, useState } from "react";

import { authService } from "../../../services/auth.service";

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

interface DepartmentSaveResponse {
  success: boolean;
  message?: string;
  error?: string;
  department?: Department;
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
  // AUTHENTICATION
  // =====================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

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

    setError("");

    if (department) {
      setDepartmentCode(department.department_code || "");

      setDepartmentName(department.department_name || "");
    } else {
      setDepartmentCode("");

      setDepartmentName("");
    }
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

    // =================================================
    // AUTH CHECK
    // =================================================

    if (!authenticated || userRole !== "Registrar") {
      setError(
        "Your session has expired or you are not authorized to manage departments.",
      );

      return;
    }

    // =================================================
    // VALIDATION
    // =================================================

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

    // =================================================
    // EDIT VALIDATION
    // =================================================

    if (isEditMode && !department?.department_id) {
      setError("Invalid department selected for editing.");

      return;
    }

    try {
      setSaving(true);

      // =================================================
      // URL / METHOD
      // =================================================

      const url = isEditMode
        ? `${API_BASE_URL}/${department!.department_id}`
        : API_BASE_URL;

      const method = isEditMode ? "PUT" : "POST";

      console.log(isEditMode ? "UPDATE DEPARTMENT:" : "ADD DEPARTMENT:", url);

      // =================================================
      // PAYLOAD
      //
      // No user_id / role_id is sent.
      // Backend actor comes from req.user.
      // =================================================

      const payload = {
        department_code: cleanCode,

        department_name: cleanName,
      };

      // =================================================
      // JWT AUTHENTICATED REQUEST
      // =================================================

      const response = await authService.authFetch(url, {
        method,

        body: JSON.stringify(payload),
      });

      // =================================================
      // SAFE RESPONSE READ
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      let data: DepartmentSaveResponse | null = null;

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
            "You are not authorized to manage departments.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            (isEditMode
              ? `Failed to update department (${response.status}).`
              : `Failed to create department (${response.status}).`),
        );
      }

      // =================================================
      // API ERROR
      // =================================================

      if (!data?.success) {
        throw new Error(
          data?.message ||
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

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the department server. Make sure the backend is running on port 3000.",
        );

        return;
      }

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
              disabled={saving || !authenticated || userRole !== "Registrar"}
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
