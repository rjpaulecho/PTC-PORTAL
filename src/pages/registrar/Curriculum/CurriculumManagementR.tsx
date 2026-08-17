import React, { useEffect, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import "../../../styles/CurriculumManagementR.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/curriculums";

// =====================================================
// TYPES
// =====================================================

interface Curriculum {
  curriculum_id: number;
  course_id: number;
  course_code: string;
  course_name: string;

  curriculum_name: string;
  effective_year: number;
  total_units: number;
  is_active: number;

  subject_count: number;
}

interface CurriculumResponse {
  success: boolean;
  data: Curriculum[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  message?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function CurriculumManagementR() {
  const navigate = useNavigate();

  const user = authService.getSession();
  const userRole = user?.role;

  // =====================================================
  // STATES
  // =====================================================

  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // FILTERS
  // =====================================================

  const [search, setSearch] = useState("");

  const [course, setCourse] = useState("All");

  const [effectiveYear, setEffectiveYear] = useState("All");

  const [activeStatus, setActiveStatus] = useState("All");

  // =====================================================
  // PAGINATION
  // =====================================================

  const [currentPage, setCurrentPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  const [totalCurriculums, setTotalCurriculums] = useState(0);

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      navigate("/login");
    }
  }, [userRole, navigate]);

  // =====================================================
  // FETCH CURRICULUMS
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      return;
    }

    const controller = new AbortController();

    const loadCurriculums = async () => {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();

        params.set("page", String(currentPage));

        params.set("limit", "10");

        if (search.trim()) {
          params.set("search", search.trim());
        }

        if (course !== "All") {
          params.set("course", course);
        }

        if (effectiveYear !== "All") {
          params.set("effective_year", effectiveYear);
        }

        if (activeStatus !== "All") {
          params.set("is_active", activeStatus);
        }

        const requestUrl = `${API_BASE_URL}?${params.toString()}`;

        console.log("GET REGISTRAR CURRICULUMS:", requestUrl);

        const response = await fetch(requestUrl, {
          method: "GET",
          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

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

        const data: CurriculumResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to load curricula.");
        }

        setCurriculums(Array.isArray(data.data) ? data.data : []);

        setTotalPages(data.pagination?.totalPages || 1);

        setTotalCurriculums(data.pagination?.total || 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("GET CURRICULUMS ERROR:", err);

        setCurriculums([]);

        setError(
          err instanceof Error ? err.message : "Unable to load curricula.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadCurriculums();

    return () => {
      controller.abort();
    };
  }, [userRole, currentPage, search, course, effectiveYear, activeStatus]);

  // =====================================================
  // FILTER OPTIONS
  // =====================================================

  const courseOptions = Array.from(
    new Set(
      curriculums.map((item) => item.course_id.toString()).filter(Boolean),
    ),
  );

  const yearOptions = Array.from(
    new Set(
      curriculums.map((item) => item.effective_year.toString()).filter(Boolean),
    ),
  ).sort((a, b) => Number(b) - Number(a));

  // =====================================================
  // HANDLERS
  // =====================================================

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);

    setCurrentPage(1);
  };

  const handleFilterChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string,
  ) => {
    setter(value);
    setCurrentPage(1);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const getStatusClass = (isActive: number) => {
    return isActive === 1
      ? "curriculum-status active"
      : "curriculum-status inactive";
  };

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
      <div className="registrar-curriculum-management">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="registrar-curriculum-header">
          <div>
            <h1>Curriculum Management</h1>

            <p>Manage course curricula and their subject mappings.</p>
          </div>
        </div>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <div className="registrar-curriculum-summary">
          <div className="registrar-curriculum-card">
            <span>Total Curricula</span>

            <h2>{totalCurriculums}</h2>
          </div>

          <div className="registrar-curriculum-card">
            <span>Active</span>

            <h2>{curriculums.filter((item) => item.is_active === 1).length}</h2>
          </div>

          <div className="registrar-curriculum-card">
            <span>Inactive</span>

            <h2>{curriculums.filter((item) => item.is_active === 0).length}</h2>
          </div>
        </div>

        {/* =================================================
            TOOLBAR
        ================================================= */}

        <div className="registrar-curriculum-toolbar">
          <div className="registrar-curriculum-search">
            <input
              type="text"
              placeholder="Search curriculum or course..."
              value={search}
              onChange={handleSearch}
            />
          </div>

          <div className="registrar-curriculum-filters">
            {/* COURSE */}

            <select
              value={course}
              onChange={(e) => handleFilterChange(setCourse, e.target.value)}
            >
              <option value="All">All Courses</option>

              {courseOptions.map((item) => (
                <option key={item} value={item}>
                  Course {item}
                </option>
              ))}
            </select>

            {/* EFFECTIVE YEAR */}

            <select
              value={effectiveYear}
              onChange={(e) =>
                handleFilterChange(setEffectiveYear, e.target.value)
              }
            >
              <option value="All">All Years</option>

              {yearOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            {/* STATUS */}

            <select
              value={activeStatus}
              onChange={(e) =>
                handleFilterChange(setActiveStatus, e.target.value)
              }
            >
              <option value="All">All Status</option>

              <option value="1">Active</option>

              <option value="0">Inactive</option>
            </select>
          </div>
        </div>

        {/* =================================================
            TABLE
        ================================================= */}

        <div className="registrar-curriculum-table-wrapper">
          <div className="curriculum-table-container">
            <table className="curriculum-table">
              <thead>
                <tr>
                  <th>ID</th>

                  <th>Course</th>

                  <th>Curriculum</th>

                  <th>Effective Year</th>

                  <th>Units</th>

                  <th>Subjects</th>

                  <th>Status</th>

                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {/* LOADING */}

                {loading && (
                  <tr>
                    <td colSpan={8} className="table-message">
                      Loading curricula...
                    </td>
                  </tr>
                )}

                {/* ERROR */}

                {!loading && error && (
                  <tr>
                    <td colSpan={8} className="table-message error">
                      {error}
                    </td>
                  </tr>
                )}

                {/* EMPTY */}

                {!loading && !error && curriculums.length === 0 && (
                  <tr>
                    <td colSpan={8} className="table-message">
                      No curricula found.
                    </td>
                  </tr>
                )}

                {/* DATA */}

                {!loading &&
                  !error &&
                  curriculums.map((curriculum) => (
                    <tr key={curriculum.curriculum_id}>
                      {/* ID */}

                      <td>{curriculum.curriculum_id}</td>

                      {/* COURSE */}

                      <td>
                        <div className="curriculum-course">
                          <strong>{curriculum.course_code}</strong>

                          <small>{curriculum.course_name}</small>
                        </div>
                      </td>

                      {/* CURRICULUM */}

                      <td>
                        <div className="curriculum-name">
                          <strong>{curriculum.curriculum_name}</strong>

                          <small>SY {curriculum.effective_year}</small>
                        </div>
                      </td>

                      {/* YEAR */}

                      <td>{curriculum.effective_year}</td>

                      {/* UNITS */}

                      <td>{curriculum.total_units}</td>

                      {/* SUBJECTS */}

                      <td>{curriculum.subject_count}</td>

                      {/* STATUS */}

                      <td>
                        <span className={getStatusClass(curriculum.is_active)}>
                          {curriculum.is_active === 1 ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* ACTION */}

                      <td>
                        <div className="curriculum-actions">
                          <button
                            type="button"
                            className="view-btn"
                            onClick={() =>
                              navigate(
                                `/registrar/curriculum/${curriculum.curriculum_id}`,
                              )
                            }
                          >
                            View
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
            PAGINATION
        ================================================= */}

        <div className="registrar-curriculum-pagination">
          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={handlePreviousPage}
          >
            Previous
          </button>

          <div className="page-numbers">
            {Array.from(
              {
                length: totalPages,
              },
              (_, index) => index + 1,
            ).map((page) => (
              <button
                type="button"
                key={page}
                className={
                  currentPage === page
                    ? "pagination-btn active-page"
                    : "pagination-btn"
                }
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={handleNextPage}
          >
            Next
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
