import React, { useEffect, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";

import DepartmentModal from "./DepartmentModal";
import type { Department } from "./DepartmentModal";
import "../../../styles/DepartmentModal.css";
import "../../../styles/DepartmentManagementR.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/departments";

// =====================================================
// RESPONSE TYPES
// =====================================================

interface DepartmentResponse {
  success: boolean;

  data?: Department[];

  departments?: Department[];

  message?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function DepartmentManagementR() {
  const navigate = useNavigate();

  const user = authService.getSession();

  const userRole = user?.role;

  // =====================================================
  // DEPARTMENTS
  // =====================================================

  const [departments, setDepartments] = useState<Department[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // SEARCH
  // =====================================================

  const [search, setSearch] = useState("");

  // =====================================================
  // MODAL
  // =====================================================

  const [showDepartmentModal, setShowDepartmentModal] = useState(false);

  const [selectedDepartment, setSelectedDepartment] =
    useState<Department | null>(null);

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      navigate("/login");
    }
  }, [userRole, navigate]);

  // =====================================================
  // LOAD DEPARTMENTS
  // =====================================================

  const loadDepartments = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(API_BASE_URL, {
        method: "GET",

        headers: {
          Accept: "application/json",
        },
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

      const data: DepartmentResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load departments.");
      }

      // =================================================
      // SUPPORT BOTH RESPONSE FORMATS
      //
      // {
      //   success: true,
      //   data: [...]
      // }
      //
      // OR
      //
      // {
      //   success: true,
      //   departments: [...]
      // }
      // =================================================

      const loadedDepartments = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.departments)
          ? data.departments
          : [];

      setDepartments(loadedDepartments);
    } catch (err) {
      console.error("GET DEPARTMENTS ERROR:", err);

      setDepartments([]);

      setError(
        err instanceof Error ? err.message : "Unable to load departments.",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      return;
    }

    loadDepartments();
  }, [userRole]);

  // =====================================================
  // ADD DEPARTMENT
  // =====================================================

  const handleAddDepartment = () => {
    setSelectedDepartment(null);

    setShowDepartmentModal(true);
  };

  // =====================================================
  // EDIT DEPARTMENT
  // =====================================================

  const handleEditDepartment = (department: Department) => {
    setSelectedDepartment(department);

    setShowDepartmentModal(true);
  };

  // =====================================================
  // CLOSE MODAL
  // =====================================================

  const handleCloseDepartmentModal = () => {
    setShowDepartmentModal(false);

    setSelectedDepartment(null);
  };

  // =====================================================
  // MODAL SUCCESS
  // =====================================================

  const handleDepartmentSuccess = async () => {
    setShowDepartmentModal(false);

    setSelectedDepartment(null);

    await loadDepartments();
  };

  // =====================================================
  // SEARCH FILTER
  // =====================================================

  const filteredDepartments = departments.filter((department) => {
    const searchValue = search.trim().toLowerCase();

    if (!searchValue) {
      return true;
    }

    const departmentCode = department.department_code?.toLowerCase() || "";

    const departmentName = department.department_name?.toLowerCase() || "";

    return (
      departmentCode.includes(searchValue) ||
      departmentName.includes(searchValue)
    );
  });

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-department-management">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="registrar-department-header">
          <div>
            <h1>Department Management</h1>

            <p>Manage academic departments used by courses and curricula.</p>
          </div>

          <button
            type="button"
            className="add-department-btn"
            onClick={handleAddDepartment}
          >
            + Add Department
          </button>
        </div>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <div className="registrar-department-summary">
          <div className="registrar-department-card">
            <span>Total Departments</span>

            <h2>{departments.length}</h2>
          </div>

          <div className="registrar-department-card">
            <span>Showing</span>

            <h2>{filteredDepartments.length}</h2>
          </div>
        </div>

        {/* =================================================
            TOOLBAR
        ================================================= */}

        <div className="registrar-department-toolbar">
          <div className="registrar-department-search">
            <input
              type="text"
              placeholder="Search department code or name..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="refresh-department-btn"
            onClick={loadDepartments}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* =================================================
            TABLE
        ================================================= */}

        <div className="registrar-department-table-wrapper">
          <div className="department-table-container">
            <table className="department-table">
              <thead>
                <tr>
                  <th>ID</th>

                  <th>Department Code</th>

                  <th>Department Name</th>

                  <th>Created</th>

                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {/* =========================================
                    LOADING
                ========================================= */}

                {loading && (
                  <tr>
                    <td colSpan={5} className="table-message">
                      Loading departments...
                    </td>
                  </tr>
                )}

                {/* =========================================
                    ERROR
                ========================================= */}

                {!loading && error && (
                  <tr>
                    <td colSpan={5} className="table-message error">
                      {error}
                    </td>
                  </tr>
                )}

                {/* =========================================
                    EMPTY
                ========================================= */}

                {!loading && !error && filteredDepartments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="table-message">
                      {search.trim()
                        ? "No departments match your search."
                        : "No departments found."}
                    </td>
                  </tr>
                )}

                {/* =========================================
                    DATA
                ========================================= */}

                {!loading &&
                  !error &&
                  filteredDepartments.map((department) => (
                    <tr key={department.department_id}>
                      {/* ID */}

                      <td>{department.department_id}</td>

                      {/* CODE */}

                      <td>
                        <span className="department-code">
                          {department.department_code}
                        </span>
                      </td>

                      {/* NAME */}

                      <td>
                        <div className="department-name">
                          <strong>{department.department_name}</strong>
                        </div>
                      </td>

                      {/* CREATED */}

                      <td>
                        {department.created_at
                          ? new Date(department.created_at).toLocaleDateString()
                          : "—"}
                      </td>

                      {/* ACTIONS */}

                      <td>
                        <div className="department-actions">
                          <button
                            type="button"
                            className="edit-department-btn"
                            onClick={() => handleEditDepartment(department)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* =================================================
            DEPARTMENT MODAL
        ================================================= */}

        <DepartmentModal
          isOpen={showDepartmentModal}
          department={selectedDepartment}
          onClose={handleCloseDepartmentModal}
          onSuccess={handleDepartmentSuccess}
        />
      </div>
    </DashboardLayout>
  );
}
