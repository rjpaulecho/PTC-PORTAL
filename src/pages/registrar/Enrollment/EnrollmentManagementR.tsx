import React, { useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/EnrollmentManagementR.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/enrollments";

// =====================================================
// TYPES
// =====================================================

interface Enrollment {
  enrollment_id: number;

  student: {
    student_id: number;
    student_number: string;
    student_name: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    username: string | null;
    year_level: number | null;
  };

  course: {
    course_id: number | null;
    course_code: string;
    course_name: string;
  };

  section: {
    section_id: number | null;
    section_name: string | null;
    year_level: number | null;
  };

  placement: {
    assigned_section_count: number;
    section_ids: number[];
    section_names: string[];
    placed_subjects: number;
    unplaced_subjects: number;
    placement_complete: boolean;
  };

  academic_period: {
    academic_year_id: number;
    academic_year: string;
    semester_id: number;
    semester_name: string;
  };

  enrollment_status: string;

  remarks: string | null;

  approval: {
    approved_by: number | null;
    approved_by_username: string | null;
    approved_at: string | null;
  };

  total_subjects: number;
  total_units: number;
  created_at: string;
}

interface EnrollmentResponse {
  success: boolean;

  data: Enrollment[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  message?: string;
  error?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function EnrollmentManagementR() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // =====================================================
  // DATA
  // =====================================================

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // FILTERS
  // =====================================================

  const [search, setSearch] = useState("");

  const [status, setStatus] = useState("Pending");

  const [course, setCourse] = useState("All");

  const [year, setYear] = useState("All");

  const [section, setSection] = useState("All");

  const [academicYear, setAcademicYear] = useState("All");

  const [semester, setSemester] = useState("All");

  // =====================================================
  // PAGINATION
  // =====================================================

  const [currentPage, setCurrentPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  const [totalEnrollments, setTotalEnrollments] = useState(0);

  // =====================================================
  // PAGE AUTH GUARD
  // =====================================================

  useEffect(() => {
    // No session or no JWT
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    // Logged in but wrong role
    if (userRole !== "Registrar") {
      navigate(authService.getDashboardRoute(user!.role), {
        replace: true,
      });
    }
  }, [authenticated, userRole, navigate, user]);

  // =====================================================
  // FETCH ENROLLMENTS
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    const controller = new AbortController();

    const loadEnrollments = async () => {
      try {
        setLoading(true);

        setError("");

        // =============================================
        // QUERY PARAMETERS
        // =============================================

        const params = new URLSearchParams();

        params.set("page", String(currentPage));

        params.set("limit", "10");

        if (search.trim()) {
          params.set("search", search.trim());
        }

        if (status !== "All") {
          params.set("status", status);
        }

        if (course !== "All") {
          params.set("course", course);
        }

        if (year !== "All") {
          params.set("year", year);
        }

        if (section !== "All") {
          params.set("section", section);
        }

        if (academicYear !== "All") {
          params.set("academic_year", academicYear);
        }

        if (semester !== "All") {
          const semesterId = Number(semester);

          if ([1, 2].includes(semesterId)) {
            params.set("semester", semester);
          }
        }

        const requestUrl = `${API_BASE_URL}?${params.toString()}`;

        console.log("GET REGISTRAR ENROLLMENTS:", requestUrl);

        // =============================================
        // IMPORTANT:
        //
        // authFetch() automatically sends:
        //
        // Authorization:
        // Bearer <JWT>
        //
        // =============================================

        const response = await authService.authFetch(requestUrl, {
          method: "GET",

          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

        // =============================================
        // READ RESPONSE
        // =============================================

        const contentType = response.headers.get("content-type") || "";

        let data: EnrollmentResponse | null = null;

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

        // =============================================
        // 401
        // JWT missing / invalid / expired
        // =============================================

        if (response.status === 401) {
          authService.logout();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        // =============================================
        // 403
        // JWT valid but role not allowed
        // =============================================

        if (response.status === 403) {
          throw new Error(
            data?.message ||
              "You are not authorized to access Registrar enrollments.",
          );
        }

        // =============================================
        // HTTP ERROR
        // =============================================

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Request failed with status ${response.status}.`,
          );
        }

        // =============================================
        // API ERROR
        // =============================================

        if (!data?.success) {
          throw new Error(data?.message || "Failed to load enrollments.");
        }

        // =============================================
        // SUCCESS
        // =============================================

        setEnrollments(Array.isArray(data.data) ? data.data : []);

        setTotalPages(data.pagination?.totalPages || 1);

        setTotalEnrollments(data.pagination?.total || 0);
      } catch (err) {
        // Request cancelled
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("FETCH ENROLLMENTS ERROR:", err);

        setEnrollments([]);

        if (err instanceof TypeError) {
          setError(
            "Unable to connect to the enrollment server. Make sure the backend server is running on port 3000.",
          );
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load enrollment records.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadEnrollments();

    return () => {
      controller.abort();
    };
  }, [
    authenticated,
    userRole,
    currentPage,
    search,
    status,
    course,
    year,
    section,
    academicYear,
    semester,
    navigate,
  ]);

  // =====================================================
  // FILTER OPTIONS
  //
  // IDs are sent to the API, while readable labels are shown.
  // Summer is excluded defensively.
  // =====================================================

  const courseOptions = useMemo(() => {
    const map = new Map<number, string>();

    enrollments.forEach((item) => {
      if (item.course.course_id && item.course.course_code) {
        map.set(item.course.course_id, item.course.course_code);
      }
    });

    return Array.from(map.entries())
      .map(([id, label]) => ({
        id: String(id),
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [enrollments]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(
        enrollments
          .map((item) => item.student.year_level)
          .filter(
            (value): value is number => value !== null && value !== undefined,
          ),
      ),
    )
      .sort((a, b) => a - b)
      .map((value) => String(value));
  }, [enrollments]);

  const sectionOptions = useMemo(() => {
    const map = new Map<number, string>();

    enrollments.forEach((item) => {
      if (
        item.section.section_id &&
        item.section.section_name &&
        item.placement.assigned_section_count === 1
      ) {
        map.set(item.section.section_id, item.section.section_name);
      }
    });

    return Array.from(map.entries())
      .map(([id, label]) => ({
        id: String(id),
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [enrollments]);

  const academicYearOptions = useMemo(() => {
    const map = new Map<number, string>();

    enrollments.forEach((item) => {
      map.set(
        item.academic_period.academic_year_id,
        item.academic_period.academic_year,
      );
    });

    return Array.from(map.entries())
      .map(([id, label]) => ({
        id: String(id),
        label,
      }))
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [enrollments]);

  const semesterOptions = useMemo(() => {
    const map = new Map<number, string>();

    enrollments.forEach((item) => {
      const semesterId = Number(item.academic_period.semester_id);

      if ([1, 2].includes(semesterId)) {
        map.set(semesterId, item.academic_period.semester_name);
      }
    });

    return Array.from(map.entries())
      .map(([id, label]) => ({
        id: String(id),
        label,
      }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [enrollments]);

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
      setCurrentPage((previous) => previous - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((previous) => previous + 1);
    }
  };

  const getStatusClass = (value: string) => {
    return `status ${value.toLowerCase().replace(/\s+/g, "-")}`;
  };

  const pageSubjectCount = enrollments.reduce(
    (total, enrollment) => total + Number(enrollment.total_subjects || 0),
    0,
  );

  const pageUnitCount = enrollments.reduce(
    (total, enrollment) => total + Number(enrollment.total_units || 0),
    0,
  );

  const getPlacementLabel = (enrollment: Enrollment) => {
    if (enrollment.placement.placement_complete) {
      return "Placement Complete";
    }

    if (enrollment.placement.placed_subjects > 0) {
      return `${enrollment.placement.placed_subjects}/${enrollment.total_subjects} Placed`;
    }

    return "Not Assigned";
  };

  // =====================================================
  // DON'T RENDER IF NOT AUTHORIZED
  // =====================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-enrollment-management">
        {/* ===============================================
            HEADER
        =============================================== */}

        <div className="registrar-enrollment-header">
          <div>
            <h1>Enrollment Management</h1>

            <p>
              Review submitted enrollment records, Registrar-controlled
              placement, validation, and approval status.
            </p>
          </div>
        </div>

        {/* ===============================================
            STATISTICS
        =============================================== */}

        <div className="registrar-enrollment-statistics">
          <div className="registrar-enrollment-card">
            <span>Matching Enrollments</span>

            <h2>{totalEnrollments}</h2>
          </div>

          <div className="registrar-enrollment-card">
            <span>On This Page</span>

            <h2>{enrollments.length}</h2>
          </div>

          <div className="registrar-enrollment-card">
            <span>Subjects on Page</span>

            <h2>{pageSubjectCount}</h2>
          </div>

          <div className="registrar-enrollment-card">
            <span>Units on Page</span>

            <h2>{pageUnitCount}</h2>
          </div>
        </div>

        {/* ===============================================
            TOOLBAR
        =============================================== */}

        <div className="registrar-enrollment-toolbar">
          <div className="registrar-enrollment-search">
            <input
              type="text"
              placeholder="Search student number or name..."
              value={search}
              onChange={handleSearch}
            />
          </div>

          <div className="registrar-enrollment-filters">
            {/* STATUS */}

            <select
              value={status}
              onChange={(event) =>
                handleFilterChange(setStatus, event.target.value)
              }
            >
              <option value="All">All Status</option>

              <option value="Draft">Draft</option>

              <option value="Pending">Pending</option>

              <option value="Approved">Approved</option>

              <option value="Rejected">Rejected</option>

              <option value="Cancelled">Cancelled</option>
            </select>

            {/* COURSE */}

            <select
              value={course}
              onChange={(event) =>
                handleFilterChange(setCourse, event.target.value)
              }
            >
              <option value="All">All Courses</option>

              {courseOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>

            {/* YEAR */}

            <select
              value={year}
              onChange={(event) =>
                handleFilterChange(setYear, event.target.value)
              }
            >
              <option value="All">All Years</option>

              {yearOptions.map((item) => (
                <option key={item} value={item}>
                  Year {item}
                </option>
              ))}
            </select>

            {/* SECTION */}

            <select
              value={section}
              onChange={(event) =>
                handleFilterChange(setSection, event.target.value)
              }
            >
              <option value="All">All Sections</option>

              {sectionOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>

            {/* ACADEMIC YEAR */}

            <select
              value={academicYear}
              onChange={(event) =>
                handleFilterChange(setAcademicYear, event.target.value)
              }
            >
              <option value="All">All Academic Years</option>

              {academicYearOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>

            {/* SEMESTER */}

            <select
              value={
                semester === "All" || [1, 2].includes(Number(semester))
                  ? semester
                  : "All"
              }
              onChange={(event) => {
                const value = event.target.value;

                handleFilterChange(
                  setSemester,
                  value === "All" || [1, 2].includes(Number(value))
                    ? value
                    : "All",
                );
              }}
            >
              <option value="All">All Semesters</option>

              {semesterOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ===============================================
            TABLE
        =============================================== */}

        <div className="registrar-enrollment-table-wrapper">
          <div className="enrollment-table-container">
            <table className="enrollment-table">
              <thead>
                <tr>
                  <th>ID</th>

                  <th>Student Name</th>

                  <th>Student No.</th>

                  <th>Course</th>

                  <th>Year</th>

                  <th>Section</th>

                  <th>Semester</th>

                  <th>Subjects</th>

                  <th>Units</th>

                  <th>Status</th>

                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {/* LOADING */}

                {loading && (
                  <tr>
                    <td colSpan={11} className="table-message">
                      Loading enrollment records...
                    </td>
                  </tr>
                )}

                {/* ERROR */}

                {!loading && error && (
                  <tr>
                    <td colSpan={11} className="table-message error">
                      {error}
                    </td>
                  </tr>
                )}

                {/* EMPTY */}

                {!loading && !error && enrollments.length === 0 && (
                  <tr>
                    <td colSpan={11} className="table-message">
                      No enrollment records found.
                    </td>
                  </tr>
                )}

                {/* DATA */}

                {!loading &&
                  !error &&
                  enrollments.map((enrollment) => (
                    <tr key={enrollment.enrollment_id}>
                      <td>{enrollment.enrollment_id}</td>

                      <td>
                        <div className="enrollment-student-info">
                          <div className="enrollment-avatar">
                            {enrollment.student.first_name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>
                              {enrollment.student.first_name}{" "}
                              {enrollment.student.middle_name
                                ? `${enrollment.student.middle_name.charAt(
                                    0,
                                  )}. `
                                : ""}
                              {enrollment.student.last_name}
                            </strong>

                            {enrollment.student.username && (
                              <small>@{enrollment.student.username}</small>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>{enrollment.student.student_number}</td>

                      <td>{enrollment.course.course_code}</td>

                      <td>
                        {enrollment.student.year_level
                          ? `Year ${enrollment.student.year_level}`
                          : "—"}
                      </td>

                      <td>
                        <div className="enrollment-period">
                          <strong>
                            {enrollment.section.section_name || "Not Assigned"}
                          </strong>

                          <small>{getPlacementLabel(enrollment)}</small>
                        </div>
                      </td>

                      <td>
                        <div className="enrollment-period">
                          <strong>
                            {enrollment.academic_period.academic_year}
                          </strong>

                          <small>
                            {enrollment.academic_period.semester_name}
                          </small>
                        </div>
                      </td>

                      <td>{enrollment.total_subjects}</td>

                      <td>{enrollment.total_units}</td>

                      <td>
                        <span
                          className={getStatusClass(
                            enrollment.enrollment_status,
                          )}
                        >
                          {enrollment.enrollment_status}
                        </span>
                      </td>

                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="view-btn"
                            onClick={() =>
                              navigate(
                                `/registrar/enrollment/${enrollment.enrollment_id}`,
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

        {/* ===============================================
            PAGINATION
        =============================================== */}

        <div className="registrar-enrollment-pagination">
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
