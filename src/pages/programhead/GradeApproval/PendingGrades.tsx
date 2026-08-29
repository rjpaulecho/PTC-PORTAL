import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

import "../../../styles/PendingGrades.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/program-head/grades";

// =====================================================
// TYPES
// =====================================================

interface ProgramHeadInfo {
  program_head_id: number;
  faculty_id: number | null;
  user_id: number;

  employee_number: string;
  username: string;
  program_head_name: string;

  department: {
    department_id: number;
    department_code: string;
    department_name: string;
  };
}

interface SubmittedGrade {
  grade_id: number;
  enrollment_subject_id: number;

  grade_status: "Submitted";

  grades: {
    prelim_grade: number | null;
    midterm_grade: number | null;
    final_grade: number | null;
    final_rating: number | null;

    remarks: "Passed" | "Failed" | "Incomplete" | null;
  };

  student: {
    student_id: number;
    student_number: string;

    first_name: string;
    middle_name: string | null;
    last_name: string;

    full_name: string;

    enrollment_id: number;
    enrollment_status: string;
    subject_status: string;
  };

  faculty: {
    faculty_id: number;
    employee_number: string;

    first_name: string;
    middle_name: string | null;
    last_name: string;

    faculty_name: string;
    email: string | null;
  };

  class: {
    offering_id: number;
    offering_status: string;

    subject: {
      subject_id: number;
      subject_code: string;
      subject_name: string;
      units: number;
    };

    section: {
      section_id: number;
      section_name: string;
      year_level: number;

      course: {
        course_id: number;
        course_code: string;
        course_name: string;
      };
    };

    academic_period: {
      academic_year_id: number;
      academic_year: string;
      is_current_academic_year: boolean;

      semester_id: number;
      semester_name: string;
    };

    schedule: {
      days: string | null;
      time: string | null;
    };
  };

  submitted_at: string | null;

  review: {
    reviewed_by: number | null;
    reviewed_at: string | null;
    review_remarks: string | null;
  };

  created_at: string | null;
  updated_at: string | null;
}

interface SubmittedGradesResponse {
  success: boolean;

  program_head?: ProgramHeadInfo;

  filters?: {
    academic_year_id: number | null;
    semester_id: number | null;
  };

  summary?: {
    total_submitted: number;
  };

  grades?: SubmittedGrade[];

  message?: string;
  error?: string;
}

interface MutationResponse {
  success: boolean;

  message?: string;
  error?: string;
}

interface ActionNotice {
  type: "success" | "error";
  message: string;
}

// =====================================================
// SAFE JSON
// =====================================================

async function readJsonResponse<T>(response: Response): Promise<T> {
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

  return response.json() as Promise<T>;
}

// =====================================================
// HELPERS
// =====================================================

function formatGrade(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number(value).toFixed(2);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatDays(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  return value
    .split(",")
    .map((item) => {
      const day = item.trim();

      if (!day) {
        return "";
      }

      return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(", ");
}

function getRemarkClass(
  remark: "Passed" | "Failed" | "Incomplete" | null,
): string {
  if (!remark) {
    return "none";
  }

  return remark.toLowerCase();
}

// =====================================================
// COMPONENT
// =====================================================

export default function PendingGrades() {
  const navigate = useNavigate();

  // ===================================================
  // AUTH
  // ===================================================

  const session = authService.getSession();

  const token = authService.getToken();

  const authenticated = Boolean(session && token);

  const userRole = session?.role;

  // ===================================================
  // DATA
  // ===================================================

  const [programHead, setProgramHead] = useState<ProgramHeadInfo | null>(null);

  const [grades, setGrades] = useState<SubmittedGrade[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  // ===================================================
  // FILTERS
  // ===================================================

  const [search, setSearch] = useState("");

  const [academicYearFilter, setAcademicYearFilter] = useState("All");

  const [semesterFilter, setSemesterFilter] = useState("All");

  const [courseFilter, setCourseFilter] = useState("All");

  const [facultyFilter, setFacultyFilter] = useState("All");

  // ===================================================
  // ACTION STATE
  // ===================================================

  const [actionGradeId, setActionGradeId] = useState<number | null>(null);

  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);

  // ===================================================
  // RETURN MODAL
  // ===================================================

  const [returnGrade, setReturnGrade] = useState<SubmittedGrade | null>(null);

  const [returnReason, setReturnReason] = useState("");

  const [returnError, setReturnError] = useState("");

  // ===================================================
  // AUTHORIZATION
  // ===================================================

  useEffect(() => {
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    if (userRole !== "Program Head") {
      if (session) {
        navigate(authService.getDashboardRoute(session.role), {
          replace: true,
        });
      }
    }
  }, [authenticated, userRole, session, navigate]);
  // ===================================================
  // LOAD SUBMITTED GRADES
  // ===================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Program Head") {
      return;
    }

    const controller = new AbortController();

    const loadSubmittedGrades = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await authService.authFetch(
          `${API_BASE_URL}/submitted`,
          {
            method: "GET",

            signal: controller.signal,
          },
        );

        const data = await readJsonResponse<SubmittedGradesResponse>(response);

        if (response.status === 401) {
          authService.logout();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (response.status === 403) {
          throw new Error(data.message || "Program Head access is required.");
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || data.error || "Unable to load submitted grades.",
          );
        }

        // -------------------------------------------
        // SUMMER DEFENSIVE EXCLUSION
        // -------------------------------------------
        //
        // Normal PTC workflow supports only:
        // semester_id 1 = First Semester
        // semester_id 2 = Second Semester
        //
        // -------------------------------------------

        const loadedGrades = Array.isArray(data.grades)
          ? data.grades.filter(
              (grade) =>
                grade.grade_status === "Submitted" &&
                [1, 2].includes(
                  Number(grade.class.academic_period.semester_id),
                ),
            )
          : [];

        setProgramHead(data.program_head || null);

        setGrades(loadedGrades);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "LOAD PROGRAM HEAD SUBMITTED GRADES ERROR:",
          requestError,
        );

        setProgramHead(null);

        setGrades([]);

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load submitted grades.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadSubmittedGrades();

    return () => {
      controller.abort();
    };
  }, [authenticated, userRole, navigate, refreshKey]);

  // ===================================================
  // FILTER OPTIONS
  // ===================================================

  const academicYears = useMemo(() => {
    const values = new Map<number, string>();

    grades.forEach((grade) => {
      values.set(
        grade.class.academic_period.academic_year_id,

        grade.class.academic_period.academic_year,
      );
    });

    return Array.from(values.entries()).sort((a, b) => b[0] - a[0]);
  }, [grades]);

  const semesters = useMemo(() => {
    const values = new Map<number, string>();

    grades.forEach((grade) => {
      const semesterId = Number(grade.class.academic_period.semester_id);

      if (semesterId !== 1 && semesterId !== 2) {
        return;
      }

      values.set(
        semesterId,

        grade.class.academic_period.semester_name,
      );
    });

    return Array.from(values.entries()).sort((a, b) => a[0] - b[0]);
  }, [grades]);

  const courses = useMemo(() => {
    return Array.from(
      new Map(
        grades.map((grade) => [
          grade.class.section.course.course_id,

          grade.class.section.course.course_code,
        ]),
      ).entries(),
    ).sort((a, b) => a[1].localeCompare(b[1]));
  }, [grades]);

  const faculties = useMemo(() => {
    return Array.from(
      new Map(
        grades.map((grade) => [
          grade.faculty.faculty_id,

          grade.faculty.faculty_name,
        ]),
      ).entries(),
    ).sort((a, b) => a[1].localeCompare(b[1]));
  }, [grades]);

  // ===================================================
  // FILTERED QUEUE
  // ===================================================

  const filteredGrades = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return grades.filter((grade) => {
      const matchesSearch =
        !normalizedSearch ||
        grade.student.student_number.toLowerCase().includes(normalizedSearch) ||
        grade.student.full_name.toLowerCase().includes(normalizedSearch) ||
        grade.class.subject.subject_code
          .toLowerCase()
          .includes(normalizedSearch) ||
        grade.class.subject.subject_name
          .toLowerCase()
          .includes(normalizedSearch) ||
        grade.class.section.section_name
          .toLowerCase()
          .includes(normalizedSearch) ||
        grade.faculty.faculty_name.toLowerCase().includes(normalizedSearch);

      const matchesAY =
        academicYearFilter === "All" ||
        String(grade.class.academic_period.academic_year_id) ===
          academicYearFilter;

      const matchesSemester =
        semesterFilter === "All" ||
        String(grade.class.academic_period.semester_id) === semesterFilter;

      const matchesCourse =
        courseFilter === "All" ||
        String(grade.class.section.course.course_id) === courseFilter;

      const matchesFaculty =
        facultyFilter === "All" ||
        String(grade.faculty.faculty_id) === facultyFilter;

      return (
        matchesSearch &&
        matchesAY &&
        matchesSemester &&
        matchesCourse &&
        matchesFaculty
      );
    });
  }, [
    grades,
    search,
    academicYearFilter,
    semesterFilter,
    courseFilter,
    facultyFilter,
  ]);

  // ===================================================
  // SUMMARY
  // ===================================================

  const summary = useMemo(() => {
    const classIds = new Set<number>();

    const facultyIds = new Set<number>();

    filteredGrades.forEach((grade) => {
      classIds.add(grade.class.offering_id);

      facultyIds.add(grade.faculty.faculty_id);
    });

    return {
      totalPending: filteredGrades.length,

      classes: classIds.size,

      faculties: facultyIds.size,

      passed: filteredGrades.filter(
        (grade) => grade.grades.remarks === "Passed",
      ).length,

      incomplete: filteredGrades.filter(
        (grade) => grade.grades.remarks === "Incomplete",
      ).length,

      failed: filteredGrades.filter(
        (grade) => grade.grades.remarks === "Failed",
      ).length,
    };
  }, [filteredGrades]);

  // ===================================================
  // CLEAR FILTERS
  // ===================================================

  const clearFilters = () => {
    setSearch("");

    setAcademicYearFilter("All");

    setSemesterFilter("All");

    setCourseFilter("All");

    setFacultyFilter("All");
  };

  // ===================================================
  // REFRESH
  // ===================================================

  const refreshQueue = () => {
    setActionNotice(null);

    setRefreshKey((current) => current + 1);
  };

  // ===================================================
  // APPROVE
  // ===================================================

  const approveGrade = async (grade: SubmittedGrade) => {
    const confirmed = window.confirm(
      `Approve the submitted grade for ${grade.student.student_number} - ${grade.student.full_name}?\n\nSubject: ${grade.class.subject.subject_code}\nFinal Rating: ${formatGrade(
        grade.grades.final_rating,
      )}\nRemarks: ${
        grade.grades.remarks || "—"
      }\n\nApproved grades become official and locked.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionGradeId(grade.grade_id);

      setActionNotice(null);

      const response = await authService.authFetch(
        `${API_BASE_URL}/${grade.grade_id}/approve`,
        {
          method: "PATCH",
        },
      );

      const data = await readJsonResponse<MutationResponse>(response);

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Unable to approve grade.",
        );
      }

      setActionNotice({
        type: "success",

        message: data.message || "Grade approved successfully.",
      });

      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      console.error("PROGRAM HEAD APPROVE GRADE ERROR:", requestError);

      setActionNotice({
        type: "error",

        message:
          requestError instanceof Error
            ? requestError.message
            : "Unable to approve grade.",
      });
    } finally {
      setActionGradeId(null);
    }
  };

  // ===================================================
  // OPEN RETURN MODAL
  // ===================================================

  const openReturnModal = (grade: SubmittedGrade) => {
    setReturnGrade(grade);

    setReturnReason("");

    setReturnError("");
  };

  // ===================================================
  // CLOSE RETURN MODAL
  // ===================================================

  const closeReturnModal = () => {
    if (actionGradeId !== null) {
      return;
    }

    setReturnGrade(null);

    setReturnReason("");

    setReturnError("");
  };

  // ===================================================
  // RETURN GRADE
  // ===================================================

  const submitReturn = async () => {
    if (!returnGrade) {
      return;
    }

    const reason = returnReason.trim();

    if (!reason) {
      setReturnError("A return reason is required.");

      return;
    }

    if (reason.length > 500) {
      setReturnError("Return reason cannot exceed 500 characters.");

      return;
    }

    try {
      setActionGradeId(returnGrade.grade_id);

      setReturnError("");

      setActionNotice(null);

      const response = await authService.authFetch(
        `${API_BASE_URL}/${returnGrade.grade_id}/return`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            review_remarks: reason,
          }),
        },
      );

      const data = await readJsonResponse<MutationResponse>(response);

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Unable to return grade.",
        );
      }

      setActionNotice({
        type: "success",

        message: data.message || "Grade returned to Faculty successfully.",
      });

      setReturnGrade(null);

      setReturnReason("");

      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      console.error("PROGRAM HEAD RETURN GRADE ERROR:", requestError);

      setReturnError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to return grade.",
      );
    } finally {
      setActionGradeId(null);
    }
  };

  // ===================================================
  // ESC CLOSE RETURN MODAL
  // ===================================================

  useEffect(() => {
    if (!returnGrade) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && actionGradeId === null) {
        closeReturnModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);

      document.body.style.overflow = originalOverflow;
    };
  }, [returnGrade, actionGradeId]);

  // ===================================================
  // AUTH RENDER GUARD
  // ===================================================

  if (!authenticated || userRole !== "Program Head") {
    return null;
  }
  return (
    <DashboardLayout>
      <main className="program-head-pending-grades-page">
        {/* =================================================
            HEADER
        ================================================= */}

        <section className="program-head-grades-header">
          <div>
            <span className="program-head-grades-eyebrow">Program Head</span>

            <h1>Pending Grade Approvals</h1>

            <p>
              Review Faculty-submitted grades within your department before they
              become official academic results.
            </p>
          </div>

          <button
            type="button"
            className="program-head-grades-refresh"
            onClick={refreshQueue}
            disabled={loading || actionGradeId !== null}
          >
            {loading ? "Refreshing..." : "Refresh Queue"}
          </button>
        </section>

        {/* =================================================
            PROGRAM HEAD INFO
        ================================================= */}

        {programHead && (
          <section className="program-head-review-profile">
            <div>
              <span>Program Head</span>

              <strong>{programHead.program_head_name}</strong>
            </div>

            <div>
              <span>Employee Number</span>

              <strong>{programHead.employee_number}</strong>
            </div>

            <div>
              <span>Department</span>

              <strong>{programHead.department.department_code}</strong>

              <small>{programHead.department.department_name}</small>
            </div>
          </section>
        )}

        {/* =================================================
            ACTION NOTICE
        ================================================= */}

        {actionNotice && (
          <section
            className={`program-head-action-notice ${actionNotice.type}`}
          >
            <strong>
              {actionNotice.type === "success"
                ? "Grade review updated"
                : "Grade review failed"}
            </strong>

            <p>{actionNotice.message}</p>
          </section>
        )}

        {/* =================================================
            SUMMARY
        ================================================= */}

        <section className="program-head-grade-summary">
          <div>
            <span>Pending Review</span>

            <strong>{summary.totalPending}</strong>
          </div>

          <div>
            <span>Classes</span>

            <strong>{summary.classes}</strong>
          </div>

          <div>
            <span>Faculty</span>

            <strong>{summary.faculties}</strong>
          </div>

          <div>
            <span>Passed</span>

            <strong>{summary.passed}</strong>
          </div>

          <div>
            <span>Incomplete</span>

            <strong>{summary.incomplete}</strong>
          </div>

          <div>
            <span>Failed</span>

            <strong>{summary.failed}</strong>
          </div>
        </section>

        {/* =================================================
            FILTERS
        ================================================= */}

        <section className="program-head-grade-filters">
          <div className="program-head-grade-search">
            <label htmlFor="program-head-grade-search">Search</label>

            <input
              id="program-head-grade-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Student, subject, section, faculty..."
            />
          </div>

          <div>
            <label>Academic Year</label>

            <select
              value={academicYearFilter}
              onChange={(event) => setAcademicYearFilter(event.target.value)}
            >
              <option value="All">All</option>

              {academicYears.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Semester</label>

            <select
              value={semesterFilter}
              onChange={(event) => setSemesterFilter(event.target.value)}
            >
              <option value="All">All</option>

              {semesters.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Course</label>

            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
            >
              <option value="All">All</option>

              {courses.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Faculty</label>

            <select
              value={facultyFilter}
              onChange={(event) => setFacultyFilter(event.target.value)}
            >
              <option value="All">All</option>

              {faculties.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="program-head-filter-clear"
            onClick={clearFilters}
          >
            Clear
          </button>
        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <section className="program-head-grade-error">
            <div>
              <strong>Pending grades could not be loaded</strong>

              <p>{error}</p>
            </div>

            <button type="button" onClick={refreshQueue}>
              Try Again
            </button>
          </section>
        )}

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && (
          <section className="program-head-grade-loading">
            <div className="program-head-grade-spinner" />

            <div>
              <strong>Loading submitted grades</strong>

              <span>Retrieving grades awaiting your department review...</span>
            </div>
          </section>
        )}

        {/* =================================================
            EMPTY
        ================================================= */}

        {!loading && !error && filteredGrades.length === 0 && (
          <section className="program-head-grade-empty">
            <strong>No pending grade approvals</strong>

            <p>
              There are no Faculty-submitted grades matching the current
              filters.
            </p>

            {grades.length > 0 && (
              <button type="button" onClick={clearFilters}>
                Clear Filters
              </button>
            )}
          </section>
        )}

        {/* =================================================
            REVIEW TABLE
        ================================================= */}

        {!loading && !error && filteredGrades.length > 0 && (
          <section className="program-head-grade-queue">
            <div className="program-head-grade-queue-header">
              <div>
                <h2>Submitted Grades</h2>

                <p>
                  Review each submitted grade before approving it as an official
                  academic result.
                </p>
              </div>

              <span>{filteredGrades.length} pending</span>
            </div>

            <div className="program-head-grade-table-wrapper">
              <table className="program-head-grade-table">
                <thead>
                  <tr>
                    <th>Student</th>

                    <th>Class</th>

                    <th>Faculty</th>

                    <th>Prelim</th>

                    <th>Midterm</th>

                    <th>Final</th>

                    <th>Final Rating</th>

                    <th>Remarks</th>

                    <th>Submitted</th>

                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredGrades.map((grade) => {
                    const busy = actionGradeId === grade.grade_id;

                    return (
                      <tr key={grade.grade_id}>
                        <td>
                          <div className="program-head-review-student">
                            <strong>{grade.student.full_name}</strong>

                            <span>{grade.student.student_number}</span>

                            <small>ES #{grade.enrollment_subject_id}</small>
                          </div>
                        </td>

                        <td>
                          <div className="program-head-review-class">
                            <strong>{grade.class.subject.subject_code}</strong>

                            <span>{grade.class.subject.subject_name}</span>

                            <small>
                              {grade.class.section.section_name}
                              {" • "}
                              {grade.class.section.course.course_code}
                              {" • "}
                              {grade.class.academic_period.academic_year}
                              {" • "}
                              {grade.class.academic_period.semester_name}
                            </small>
                          </div>
                        </td>

                        <td>
                          <div className="program-head-review-faculty">
                            <strong>{grade.faculty.faculty_name}</strong>

                            <small>{grade.faculty.employee_number}</small>
                          </div>
                        </td>
                        <td>
                          <span className="program-head-grade-value">
                            {formatGrade(grade.grades.prelim_grade)}
                          </span>
                        </td>

                        <td>
                          <span className="program-head-grade-value">
                            {formatGrade(grade.grades.midterm_grade)}
                          </span>
                        </td>

                        <td>
                          <span className="program-head-grade-value">
                            {formatGrade(grade.grades.final_grade)}
                          </span>
                        </td>

                        <td>
                          <strong className="program-head-final-rating">
                            {formatGrade(grade.grades.final_rating)}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={`program-head-grade-remark ${getRemarkClass(
                              grade.grades.remarks,
                            )}`}
                          >
                            {grade.grades.remarks || "—"}
                          </span>
                        </td>

                        <td>
                          <div className="program-head-submitted-time">
                            <strong>Submitted</strong>

                            <span>{formatDateTime(grade.submitted_at)}</span>

                            <small>
                              {formatDays(grade.class.schedule.days)}
                              {" • "}
                              {grade.class.schedule.time || "No schedule"}
                            </small>
                          </div>
                        </td>

                        <td>
                          <div className="program-head-grade-actions">
                            <button
                              type="button"
                              className="program-head-return-button"
                              onClick={() => openReturnModal(grade)}
                              disabled={busy}
                            >
                              Return
                            </button>

                            <button
                              type="button"
                              className="program-head-approve-button"
                              onClick={() => void approveGrade(grade)}
                              disabled={busy}
                            >
                              {busy ? "Processing..." : "Approve"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* =================================================
            REVIEW WORKFLOW
        ================================================= */}

        {!loading && !error && (
          <section className="program-head-review-workflow">
            <div>
              <span>1</span>

              <div>
                <strong>Faculty Submits</strong>

                <p>Submitted grades enter the Program Head review queue.</p>
              </div>
            </div>

            <div>
              <span>2</span>

              <div>
                <strong>Review</strong>

                <p>Verify the grade components, final rating, and remarks.</p>
              </div>
            </div>

            <div>
              <span>3</span>

              <div>
                <strong>Approve</strong>

                <p>
                  Approval makes the grade official and permanently locks it.
                </p>
              </div>
            </div>

            <div>
              <span>4</span>

              <div>
                <strong>Return</strong>

                <p>
                  Returned grades go back to Faculty for correction and
                  resubmission.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* =================================================
            RETURN MODAL
        ================================================= */}

        {returnGrade && (
          <div
            className="program-head-return-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeReturnModal();
              }
            }}
          >
            <section
              className="program-head-return-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="program-head-return-title"
            >
              <div className="program-head-return-modal-header">
                <div>
                  <span>Return Grade</span>

                  <h2 id="program-head-return-title">Return to Faculty</h2>

                  <p>Explain what the Faculty needs to review or correct.</p>
                </div>

                <button
                  type="button"
                  className="program-head-return-close"
                  onClick={closeReturnModal}
                  disabled={actionGradeId !== null}
                  aria-label="Close return grade modal"
                >
                  ×
                </button>
              </div>

              <div className="program-head-return-grade-summary">
                <div>
                  <span>Student</span>

                  <strong>{returnGrade.student.full_name}</strong>

                  <small>{returnGrade.student.student_number}</small>
                </div>

                <div>
                  <span>Subject</span>

                  <strong>{returnGrade.class.subject.subject_code}</strong>

                  <small>{returnGrade.class.subject.subject_name}</small>
                </div>

                <div>
                  <span>Faculty</span>

                  <strong>{returnGrade.faculty.faculty_name}</strong>

                  <small>{returnGrade.faculty.employee_number}</small>
                </div>

                <div>
                  <span>Final Rating</span>

                  <strong>
                    {formatGrade(returnGrade.grades.final_rating)}
                  </strong>

                  <small>{returnGrade.grades.remarks || "No remarks"}</small>
                </div>
              </div>

              <div className="program-head-return-field">
                <div className="program-head-return-label">
                  <label htmlFor="program-head-return-reason">
                    Return Reason
                  </label>

                  <span>
                    {returnReason.length}
                    /500
                  </span>
                </div>

                <textarea
                  id="program-head-return-reason"
                  value={returnReason}
                  onChange={(event) => {
                    const value = event.target.value;

                    if (value.length <= 500) {
                      setReturnReason(value);

                      setReturnError("");
                    }
                  }}
                  disabled={actionGradeId !== null}
                  maxLength={500}
                  rows={6}
                  placeholder="Example: Please verify the final rating before resubmitting."
                  autoFocus
                />

                <small>
                  A clear reason is required so the Faculty knows what needs
                  correction.
                </small>
              </div>

              {returnError && (
                <div className="program-head-return-error">{returnError}</div>
              )}

              <div className="program-head-return-modal-actions">
                <button
                  type="button"
                  className="program-head-return-cancel"
                  onClick={closeReturnModal}
                  disabled={actionGradeId !== null}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="program-head-return-confirm"
                  onClick={() => void submitReturn()}
                  disabled={actionGradeId !== null || !returnReason.trim()}
                >
                  {actionGradeId === returnGrade.grade_id
                    ? "Returning..."
                    : "Return to Faculty"}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
