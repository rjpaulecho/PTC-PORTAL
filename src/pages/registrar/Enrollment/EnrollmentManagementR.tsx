import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import "../../../styles/EnrollmentManagementR.css";

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
  };

  course: {
    course_id: number;
    course_code: string;
    course_name: string;
  };

  section: {
    section_id: number | null;
    section_name: string | null;
    year_level: number | null;
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
}

// =====================================================
// COMPONENT
// =====================================================

export default function EnrollmentManagementR() {
  const navigate = useNavigate();

  // =====================================================
  // AUTH SESSION
  // =====================================================

  const user = authService.getSession();
  const userRole = user?.role;

  // =====================================================
  // STATES
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
  // AUTHENTICATION
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      navigate("/login");
    }
  }, [userRole, navigate]);

  // =====================================================
  // FETCH ENROLLMENTS
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      return;
    }

    const controller = new AbortController();

    const loadEnrollments = async () => {
      try {
        setLoading(true);
        setError("");

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
          params.set("semester", semester);
        }

        const requestUrl = `${API_BASE_URL}?${params.toString()}`;

        console.log("GET REGISTRAR ENROLLMENTS:", requestUrl);

        const response = await fetch(requestUrl, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        // -----------------------------------------------
        // READ RESPONSE SAFELY
        // -----------------------------------------------

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

        // -----------------------------------------------
        // HTTP ERROR
        // -----------------------------------------------

        if (!response.ok) {
          throw new Error(
            data?.message || `Request failed with status ${response.status}.`,
          );
        }

        // -----------------------------------------------
        // API ERROR
        // -----------------------------------------------

        if (!data?.success) {
          throw new Error(data?.message || "Failed to load enrollments.");
        }

        // -----------------------------------------------
        // SUCCESS
        // -----------------------------------------------

        setEnrollments(Array.isArray(data.data) ? data.data : []);

        setTotalPages(data.pagination?.totalPages || 1);

        setTotalEnrollments(data.pagination?.total || 0);
      } catch (err) {
        // Ignore aborted requests
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

    loadEnrollments();

    return () => {
      controller.abort();
    };
  }, [
    userRole,
    currentPage,
    search,
    status,
    course,
    year,
    section,
    academicYear,
    semester,
  ]);

  // =====================================================
  // FILTER OPTIONS
  // =====================================================

  const courseOptions = useMemo(() => {
    return [
      "All",
      ...new Set(
        enrollments
          .map((item) => item.course.course_id.toString())
          .filter(Boolean),
      ),
    ];
  }, [enrollments]);

  const yearOptions = useMemo(() => {
    return [
      "All",
      ...new Set(
        enrollments
          .map((item) => item.section.year_level?.toString())
          .filter(Boolean) as string[],
      ),
    ];
  }, [enrollments]);

  const sectionOptions = useMemo(() => {
    return [
      "All",
      ...new Set(
        enrollments
          .map((item) => item.section.section_id?.toString())
          .filter(Boolean) as string[],
      ),
    ];
  }, [enrollments]);

  const academicYearOptions = useMemo(() => {
    return [
      "All",
      ...new Set(
        enrollments
          .map((item) => item.academic_period.academic_year_id.toString())
          .filter(Boolean),
      ),
    ];
  }, [enrollments]);

  const semesterOptions = useMemo(() => {
    return [
      "All",
      ...new Set(
        enrollments
          .map((item) => item.academic_period.semester_id.toString())
          .filter(Boolean),
      ),
    ];
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
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const getStatusClass = (value: string) => {
    return `status ${value.toLowerCase().replace(/\s+/g, "-")}`;
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
      <div className="registrar-enrollment-management">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="registrar-enrollment-header">
          <div>
            <h1>Enrollment Management</h1>

            <p>Review and manage student enrollment records.</p>
          </div>
        </div>

        {/* =================================================
            STATISTICS
        ================================================= */}

        <div className="registrar-enrollment-statistics">
          <div className="registrar-enrollment-card">
            <span>Total Enrollments</span>
            <h2>{totalEnrollments}</h2>
          </div>

          <div className="registrar-enrollment-card">
            <span>Pending</span>

            <h2>
              {status === "Pending"
                ? enrollments.length
                : enrollments.filter(
                    (item) => item.enrollment_status === "Pending",
                  ).length}
            </h2>
          </div>

          <div className="registrar-enrollment-card">
            <span>Approved</span>

            <h2>
              {
                enrollments.filter(
                  (item) => item.enrollment_status === "Approved",
                ).length
              }
            </h2>
          </div>

          <div className="registrar-enrollment-card">
            <span>Rejected</span>

            <h2>
              {
                enrollments.filter(
                  (item) => item.enrollment_status === "Rejected",
                ).length
              }
            </h2>
          </div>
        </div>

        {/* =================================================
            TOOLBAR
        ================================================= */}

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
              onChange={(e) => handleFilterChange(setStatus, e.target.value)}
            >
              <option value="All">All Status</option>

              <option value="Pending">Pending</option>

              <option value="Approved">Approved</option>

              <option value="Rejected">Rejected</option>

              <option value="Cancelled">Cancelled</option>
            </select>

            {/* COURSE */}

            <select
              value={course}
              onChange={(e) => handleFilterChange(setCourse, e.target.value)}
            >
              {courseOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All Courses" : `Course ${item}`}
                </option>
              ))}
            </select>

            {/* YEAR */}

            <select
              value={year}
              onChange={(e) => handleFilterChange(setYear, e.target.value)}
            >
              {yearOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All Years" : `Year ${item}`}
                </option>
              ))}
            </select>

            {/* SECTION */}

            <select
              value={section}
              onChange={(e) => handleFilterChange(setSection, e.target.value)}
            >
              {sectionOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All Sections" : `Section ${item}`}
                </option>
              ))}
            </select>

            {/* ACADEMIC YEAR */}

            <select
              value={academicYear}
              onChange={(e) =>
                handleFilterChange(setAcademicYear, e.target.value)
              }
            >
              {academicYearOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "All"
                    ? "All Academic Years"
                    : `Academic Year ${item}`}
                </option>
              ))}
            </select>

            {/* SEMESTER */}

            <select
              value={semester}
              onChange={(e) => handleFilterChange(setSemester, e.target.value)}
            >
              {semesterOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All Semesters" : `Semester ${item}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* =================================================
            TABLE
        ================================================= */}

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
                        {enrollment.section.year_level
                          ? `Year ${enrollment.section.year_level}`
                          : "—"}
                      </td>

                      <td>
                        {enrollment.section.section_name || "Not Assigned"}
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

        {/* =================================================
            PAGINATION
        ================================================= */}

        <div className="registrar-enrollment-pagination">
          <button
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
