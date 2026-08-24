import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import SubjectModal from "./Subjectmodal";
import DeleteSubjectModal from "./DeleteSubjectmodal";

import "../../../styles/SubjectmanagementR2.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/subjects";

interface Subject {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
  lecture_hours: number;
  laboratory_hours: number;
  description: string | null;
  created_at: string;
}

interface SubjectsResponse {
  success: boolean;

  subjects: Subject[];

  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;

  message?: string;
  error?: string;
}

export default function SubjectmanagementR() {
  const navigate = useNavigate();

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

  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // Search
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  const [limit] = useState(10);

  const [totalSubjects, setTotalSubjects] = useState(0);

  const [totalPages, setTotalPages] = useState(0);

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);

  const [modalMode, setModalMode] = useState<"add" | "edit">("add");

  // Delete Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  // =====================================================
  // AUTHORIZATION
  // =====================================================

  useEffect(() => {
    // No session or JWT
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    // Authenticated but wrong role
    if (userRole !== "Registrar") {
      if (user) {
        navigate(authService.getDashboardRoute(user.role), {
          replace: true,
        });
      } else {
        navigate("/login", {
          replace: true,
        });
      }
    }
  }, [authenticated, userRole, user, navigate]);

  // =====================================================
  // LOAD SUBJECTS
  // =====================================================

  const loadSubjects = async () => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    try {
      setLoading(true);

      setError("");

      const params = new URLSearchParams();

      params.set("page", String(page));

      params.set("limit", String(limit));

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const url = `${API_BASE_URL}?${params.toString()}`;

      console.log("LOAD SUBJECTS:", url);

      // =================================================
      // JWT AUTHENTICATED REQUEST
      //
      // authFetch automatically sends:
      //
      // Authorization: Bearer <JWT>
      // =================================================

      const response = await authService.authFetch(url, {
        method: "GET",

        headers: {
          Accept: "application/json",
        },
      });

      // =================================================
      // SAFE RESPONSE
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      let data: SubjectsResponse | null = null;

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
      // Missing / expired / invalid JWT
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
      // Logged in but not allowed
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to manage subjects.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to load subjects (${response.status}).`,
        );
      }

      // =================================================
      // API ERROR
      // =================================================

      if (!data?.success) {
        throw new Error(data?.message || "Failed to load subjects.");
      }

      // =================================================
      // SUCCESS
      // =================================================

      const loadedSubjects = Array.isArray(data.subjects) ? data.subjects : [];

      setSubjects(loadedSubjects);

      const total = Number(data.total ?? loadedSubjects.length);

      setTotalSubjects(total);

      const computedPages =
        data.totalPages !== undefined
          ? Number(data.totalPages)
          : Math.ceil(total / limit);

      setTotalPages(computedPages);
    } catch (err) {
      console.error("LOAD SUBJECTS ERROR:", err);

      setSubjects([]);

      setTotalSubjects(0);

      setTotalPages(0);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the subjects server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setError(err instanceof Error ? err.message : "Failed to load subjects.");
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // LOAD WHEN PAGE / SEARCH CHANGES
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    void loadSubjects();
  }, [page, search, authenticated, userRole]);

  // =====================================================
  // SEARCH
  // =====================================================

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);

    // Always return to first page when searching
    setPage(1);
  };

  // =====================================================
  // ADD SUBJECT
  // =====================================================

  const handleAdd = () => {
    setModalMode("add");

    setSelectedSubject(null);

    setModalOpen(true);
  };

  // =====================================================
  // EDIT SUBJECT
  // =====================================================

  const handleEdit = (subject: Subject) => {
    setModalMode("edit");

    setSelectedSubject(subject);

    setModalOpen(true);
  };

  // =====================================================
  // OPEN DELETE MODAL
  // =====================================================

  const handleDelete = (subject: Subject) => {
    setSelectedSubject(subject);

    setDeleteModalOpen(true);
  };

  // =====================================================
  // CLOSE DELETE MODAL
  // =====================================================

  const handleCloseDeleteModal = () => {
    setDeleteModalOpen(false);

    setSelectedSubject(null);
  };

  // =====================================================
  // DELETE SUCCESS
  // =====================================================

  const handleDeleteSuccess = () => {
    setDeleteModalOpen(false);

    setSelectedSubject(null);

    /*
     * If the current page only had one subject
     * and that subject was deleted, go back one page.
     */

    if (subjects.length === 1 && page > 1) {
      setPage((currentPage) => currentPage - 1);

      return;
    }

    void loadSubjects();
  };

  // =====================================================
  // ADD / EDIT SUCCESS
  // =====================================================

  const handleModalSuccess = () => {
    setModalOpen(false);

    setSelectedSubject(null);

    void loadSubjects();
  };

  // =====================================================
  // PAGINATION
  // =====================================================

  const goToPage = (newPage: number) => {
    if (newPage < 1) {
      return;
    }

    if (totalPages > 0 && newPage > totalPages) {
      return;
    }

    setPage(newPage);
  };

  const goToPreviousPage = () => {
    if (page > 1) {
      setPage((currentPage) => currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (page < totalPages) {
      setPage((currentPage) => currentPage + 1);
    }
  };

  // =====================================================
  // PAGINATION DISPLAY
  // =====================================================

  const getPaginationPages = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }

      return pages;
    }

    pages.push(1);

    if (page > 4) {
      pages.push("...");
    }

    const startPage = Math.max(2, page - 1);

    const endPage = Math.min(totalPages - 1, page + 1);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (page < totalPages - 3) {
      pages.push("...");
    }

    pages.push(totalPages);

    return pages;
  };

  // =====================================================
  // DISPLAY RANGE
  // =====================================================

  const startItem = totalSubjects === 0 ? 0 : (page - 1) * limit + 1;

  const endItem = Math.min(page * limit, totalSubjects);

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // PAGE
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-subjects-management">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="subjects-page-header">
          <div>
            <h1>Subject Management</h1>

            <p>Manage the subjects available in the academic system.</p>
          </div>

          <button
            type="button"
            className="add-subject-main-button"
            onClick={handleAdd}
          >
            + Add Subject
          </button>
        </div>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <div className="subjects-summary">
          <div className="subject-summary-card">
            <span>Total Subjects</span>

            <strong>{totalSubjects}</strong>
          </div>

          <div className="subject-summary-card">
            <span>Displayed</span>

            <strong>{subjects.length}</strong>
          </div>

          <div className="subject-summary-card">
            <span>Current Page</span>

            <strong>{totalPages > 0 ? `${page} / ${totalPages}` : "0"}</strong>
          </div>
        </div>

        {/* =================================================
            CONTENT
        ================================================= */}

        <div className="subjects-management-card">
          {/* =================================================
              TOOLBAR
          ================================================= */}

          <div className="subjects-toolbar">
            <div>
              <h2>Subjects</h2>

              <p>View and manage all registered subjects.</p>
            </div>

            <div className="subject-search">
              <input
                type="text"
                placeholder="Search code or subject name..."
                value={search}
                onChange={handleSearchChange}
              />
            </div>
          </div>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div className="subjects-error">
              <strong>Error:</strong> {error}
              <button type="button" onClick={() => void loadSubjects()}>
                Retry
              </button>
            </div>
          )}

          {/* =================================================
              LOADING
          ================================================= */}

          {loading ? (
            <div className="subjects-loading">
              <div className="subjects-spinner"></div>

              <h3>Loading subjects...</h3>

              <p>Please wait while the subject records are loaded.</p>
            </div>
          ) : subjects.length === 0 ? (
            // =================================================
            // EMPTY
            // =================================================

            <div className="subjects-empty">
              <div className="subjects-empty-icon">📚</div>

              <h3>{search ? "No matching subjects" : "No subjects found"}</h3>

              <p>
                {search
                  ? "Try another search term."
                  : "There are currently no subjects registered in the system."}
              </p>

              {!search && (
                <button type="button" onClick={handleAdd}>
                  + Add First Subject
                </button>
              )}
            </div>
          ) : (
            <>
              {/* =================================================
                  TABLE
              ================================================= */}

              <div className="subjects-table-wrapper">
                <table className="subjects-table">
                  <thead>
                    <tr>
                      <th>#</th>

                      <th>Subject Code</th>

                      <th>Subject Name</th>

                      <th>Units</th>

                      <th>Lecture</th>

                      <th>Laboratory</th>

                      <th>Description</th>

                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {subjects.map((subject, index) => (
                      <tr key={subject.subject_id}>
                        <td className="subject-number">
                          {(page - 1) * limit + index + 1}
                        </td>

                        <td className="subject-code">
                          <strong>{subject.subject_code}</strong>
                        </td>

                        <td className="subject-name">{subject.subject_name}</td>

                        <td className="subject-number-value">
                          {subject.units}
                        </td>

                        <td className="subject-number-value">
                          {subject.lecture_hours}
                        </td>

                        <td className="subject-number-value">
                          {subject.laboratory_hours}
                        </td>

                        <td className="subject-description">
                          {subject.description || "No description"}
                        </td>

                        <td>
                          <div className="subject-actions">
                            {/* EDIT */}

                            <button
                              type="button"
                              className="subject-edit-button"
                              onClick={() => handleEdit(subject)}
                            >
                              Edit
                            </button>

                            {/* DELETE */}

                            <button
                              type="button"
                              className="subject-delete-button"
                              onClick={() => handleDelete(subject)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* =================================================
                  PAGINATION
              ================================================= */}

              {totalPages > 0 && (
                <div className="subjects-pagination">
                  {/* RANGE */}

                  <div className="subjects-pagination-info">
                    Showing <strong>{startItem}</strong>
                    {" - "}
                    <strong>{endItem}</strong>
                    {" of "}
                    <strong>{totalSubjects}</strong>
                    {" subjects"}
                  </div>

                  {/* CONTROLS */}

                  <div className="subjects-pagination-controls">
                    <button
                      type="button"
                      className="pagination-button pagination-prev"
                      onClick={goToPreviousPage}
                      disabled={page === 1 || loading}
                    >
                      ← Previous
                    </button>

                    <div className="pagination-pages">
                      {getPaginationPages().map((item, index) =>
                        item === "..." ? (
                          <span
                            key={`ellipsis-${index}`}
                            className="pagination-ellipsis"
                          >
                            ...
                          </span>
                        ) : (
                          <button
                            key={item}
                            type="button"
                            className={`pagination-page ${
                              page === item ? "active" : ""
                            }`}
                            onClick={() => goToPage(item as number)}
                            disabled={loading}
                          >
                            {item}
                          </button>
                        ),
                      )}
                    </div>

                    <button
                      type="button"
                      className="pagination-button pagination-next"
                      onClick={goToNextPage}
                      disabled={
                        page === totalPages || totalPages === 0 || loading
                      }
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* =====================================================
          ADD / EDIT SUBJECT MODAL
      ===================================================== */}

      <SubjectModal
        isOpen={modalOpen}
        mode={modalMode}
        subject={selectedSubject}
        onClose={() => {
          setModalOpen(false);

          setSelectedSubject(null);
        }}
        onSuccess={handleModalSuccess}
      />

      {/* =====================================================
          DELETE SUBJECT MODAL
      ===================================================== */}

      <DeleteSubjectModal
        isOpen={deleteModalOpen}
        subject={selectedSubject}
        onClose={handleCloseDeleteModal}
        onSuccess={handleDeleteSuccess}
      />
    </DashboardLayout>
  );
}
