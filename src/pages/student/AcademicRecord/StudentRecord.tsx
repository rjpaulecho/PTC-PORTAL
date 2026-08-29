import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

import "../../../styles/StudentAcademicRecord.css";

// =====================================================
// API
// =====================================================

const API_URL = "http://localhost:3000/api/student/academic-records";

// =====================================================
// TYPES
// =====================================================

type GradeClassification = "Passed" | "Incomplete" | "Failed" | "Unknown";

interface StudentCourse {
  course_id: number;
  course_code: string;
  course_name: string;
}

interface StudentCurriculum {
  curriculum_id: number;
  curriculum_name: string;
  effective_year: number | null;
}

interface AcademicStudent {
  student_id: number;

  student_number: string;

  first_name: string;
  middle_name: string | null;
  last_name: string;

  student_name: string;

  email?: string | null;

  year_level: number;
  status: string;

  course: StudentCourse;

  curriculum: StudentCurriculum | null;
}

interface AcademicRecord {
  grade_id: number;

  enrollment_subject_id: number;
  enrollment_id: number;

  subject_id: number;
  subject_code: string;
  subject_name: string;

  units: number;

  academic_year_id: number;
  academic_year: string;

  semester_id: number;
  semester_name: string;

  enrollment_status: string;
  subject_status: string;

  prelim_grade: number | null;
  midterm_grade: number | null;
  final_grade: number | null;

  // -----------------------------------------------
  // OFFICIAL ACADEMIC RESULT
  // -----------------------------------------------

  final_rating: number | null;

  remarks: "Passed" | "Failed" | "Incomplete" | null;

  grade_status: "Draft" | "Submitted" | "Returned" | "Approved";

  classification?: GradeClassification | null;

  passed?: boolean;
  retake?: boolean;

  faculty?: {
    faculty_id: number;
    employee_number: string | null;
    faculty_name: string;
  } | null;

  approval?: {
    reviewed_by: number | null;
    reviewed_by_username: string | null;
    reviewed_at: string | null;
  } | null;

  created_at?: string | null;
  updated_at?: string | null;
}

interface AcademicRecordResponse {
  success: boolean;

  student?: AcademicStudent;

  summary?: {
    total_approved_subjects?: number;
    total_recorded_units?: number;
    passed_subjects?: number;
    incomplete_subjects?: number;
    failed_subjects?: number;
    retake_subjects?: number;
  };

  records?: AcademicRecord[];

  message?: string;
  error?: string;
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

function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toFixed(2);
}

// =====================================================
// OFFICIAL CLASSIFICATION
// =====================================================

function classifyFinalRating(value: number | null): GradeClassification {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  const rating = Number(value);

  if (!Number.isFinite(rating)) {
    return "Unknown";
  }

  if (rating >= 1 && rating <= 3) {
    return "Passed";
  }

  if (rating === 4) {
    return "Incomplete";
  }

  if (rating === 5) {
    return "Failed";
  }

  return "Unknown";
}

function getClassification(record: AcademicRecord): GradeClassification {
  if (
    record.classification === "Passed" ||
    record.classification === "Incomplete" ||
    record.classification === "Failed"
  ) {
    return record.classification;
  }

  return classifyFinalRating(record.final_rating);
}

function requiresRetake(record: AcademicRecord): boolean {
  if (typeof record.retake === "boolean") {
    return record.retake;
  }

  const result = getClassification(record);

  return result === "Failed" || result === "Incomplete";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

// =====================================================
// GROUP TYPE
// =====================================================

interface AcademicYearGroup {
  academicYearId: number;
  academicYear: string;

  semesters: SemesterGroup[];
}

interface SemesterGroup {
  semesterId: number;
  semesterName: string;

  records: AcademicRecord[];
}

// =====================================================
// COMPONENT
// =====================================================

export default function StudentRecord() {
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

  const [student, setStudent] = useState<AcademicStudent | null>(null);

  const [records, setRecords] = useState<AcademicRecord[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  // ===================================================
  // FILTERS
  // ===================================================

  const [search, setSearch] = useState("");

  const [academicYearFilter, setAcademicYearFilter] = useState("All");

  const [semesterFilter, setSemesterFilter] = useState("All");

  const [resultFilter, setResultFilter] = useState("All");

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

    if (userRole !== "Student") {
      navigate("/login", {
        replace: true,
      });
    }
  }, [authenticated, userRole, navigate]);

  // ===================================================
  // LOAD OFFICIAL ACADEMIC RECORD
  // ===================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Student") {
      return;
    }

    const controller = new AbortController();

    const loadAcademicRecord = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await authService.authFetch(API_URL, {
          method: "GET",

          signal: controller.signal,
        });

        const data = await readJsonResponse<AcademicRecordResponse>(response);

        if (response.status === 401) {
          authService.logout();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (response.status === 403) {
          throw new Error(data.message || "Student access is required.");
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || data.error || "Unable to load academic record.",
          );
        }

        // -------------------------------------------
        // DEFENSIVE FRONTEND FILTER
        //
        // Academic record must NEVER contain:
        // Draft
        // Submitted
        // Returned
        //
        // Only Approved grades are official.
        // -------------------------------------------

        const officialRecords = Array.isArray(data.records)
          ? data.records.filter(
              (record) =>
                record.grade_status === "Approved" &&
                record.enrollment_status === "Approved" &&
                [1, 2].includes(Number(record.semester_id)),
            )
          : [];

        setStudent(data.student || null);

        setRecords(officialRecords);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        console.error("LOAD STUDENT ACADEMIC RECORD ERROR:", requestError);

        setStudent(null);

        setRecords([]);

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load academic record.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadAcademicRecord();

    return () => {
      controller.abort();
    };
  }, [authenticated, userRole, navigate, refreshKey]);
  // ===================================================
  // FILTER OPTIONS
  // ===================================================

  const academicYears = useMemo(() => {
    const values = new Map<number, string>();

    records.forEach((record) => {
      values.set(record.academic_year_id, record.academic_year);
    });

    return Array.from(values.entries()).sort((a, b) => b[0] - a[0]);
  }, [records]);

  const semesters = useMemo(() => {
    const values = new Map<number, string>();

    records.forEach((record) => {
      if (record.semester_id !== 1 && record.semester_id !== 2) {
        return;
      }

      values.set(record.semester_id, record.semester_name);
    });

    return Array.from(values.entries()).sort((a, b) => a[0] - b[0]);
  }, [records]);

  // ===================================================
  // FILTERED RECORDS
  // ===================================================

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const classification = getClassification(record);

      const matchesSearch =
        !query ||
        record.subject_code.toLowerCase().includes(query) ||
        record.subject_name.toLowerCase().includes(query);

      const matchesAY =
        academicYearFilter === "All" ||
        String(record.academic_year_id) === academicYearFilter;

      const matchesSemester =
        semesterFilter === "All" ||
        String(record.semester_id) === semesterFilter;

      const matchesResult =
        resultFilter === "All" || classification === resultFilter;

      return matchesSearch && matchesAY && matchesSemester && matchesResult;
    });
  }, [records, search, academicYearFilter, semesterFilter, resultFilter]);

  // ===================================================
  // OVERALL SUMMARY
  // ===================================================

  const summary = useMemo(() => {
    const passed = records.filter(
      (record) => getClassification(record) === "Passed",
    );

    const incomplete = records.filter(
      (record) => getClassification(record) === "Incomplete",
    );

    const failed = records.filter(
      (record) => getClassification(record) === "Failed",
    );

    const retakes = records.filter(requiresRetake);

    const totalRecordedUnits = records.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    const earnedUnits = passed.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    return {
      total: records.length,

      passed: passed.length,

      incomplete: incomplete.length,

      failed: failed.length,

      retakes: retakes.length,

      totalRecordedUnits,

      earnedUnits,
    };
  }, [records]);

  // ===================================================
  // FILTERED GROUPS
  // ===================================================

  const groupedRecords = useMemo<AcademicYearGroup[]>(() => {
    const yearMap = new Map<number, AcademicYearGroup>();

    filteredRecords.forEach((record) => {
      let yearGroup = yearMap.get(record.academic_year_id);

      if (!yearGroup) {
        yearGroup = {
          academicYearId: record.academic_year_id,

          academicYear: record.academic_year,

          semesters: [],
        };

        yearMap.set(record.academic_year_id, yearGroup);
      }

      let semesterGroup = yearGroup.semesters.find(
        (semester) => semester.semesterId === record.semester_id,
      );

      if (!semesterGroup) {
        semesterGroup = {
          semesterId: record.semester_id,

          semesterName: record.semester_name,

          records: [],
        };

        yearGroup.semesters.push(semesterGroup);
      }

      semesterGroup.records.push(record);
    });

    const result = Array.from(yearMap.values());

    result.sort((a, b) => b.academicYearId - a.academicYearId);

    result.forEach((year) => {
      year.semesters.sort((a, b) => a.semesterId - b.semesterId);
    });

    return result;
  }, [filteredRecords]);

  // ===================================================
  // FILTER ACTIONS
  // ===================================================

  const clearFilters = () => {
    setSearch("");

    setAcademicYearFilter("All");

    setSemesterFilter("All");

    setResultFilter("All");
  };

  const refresh = () => {
    setRefreshKey((current) => current + 1);
  };

  // ===================================================
  // AUTH GUARD
  // ===================================================

  if (!authenticated || userRole !== "Student") {
    return null;
  }

  // ===================================================
  // UI
  // ===================================================

  return (
    <DashboardLayout>
      <main className="student-academic-record-page">
        {/* =================================================
            HEADER
        ================================================= */}

        <section className="student-record-header">
          <div>
            <span className="student-record-eyebrow">
              Student Academic Records
            </span>

            <h1>Official Academic Record</h1>

            <p>
              View your official academic history based exclusively on grades
              approved by the Program Head.
            </p>
          </div>

          <button
            type="button"
            className="student-record-refresh"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Record"}
          </button>
        </section>

        {/* =================================================
            OFFICIAL RECORD NOTICE
        ================================================= */}

        <section className="student-record-official-notice">
          <div className="student-record-official-icon">✓</div>

          <div>
            <strong>Official Grades Only</strong>

            <p>
              Draft, Submitted, and Returned grades do not appear in this
              academic record. Only Program Head-approved grades are considered
              official.
            </p>
          </div>
        </section>

        {/* =================================================
            STUDENT PROFILE
        ================================================= */}

        {student && (
          <section className="student-record-profile">
            <div className="student-record-profile-primary">
              <span>Student</span>

              <strong>{student.student_name}</strong>

              <small>{student.student_number}</small>
            </div>

            <div>
              <span>Program</span>

              <strong>{student.course.course_code}</strong>

              <small>{student.course.course_name}</small>
            </div>

            <div>
              <span>Current Year Level</span>

              <strong>Year {student.year_level}</strong>
            </div>

            <div>
              <span>Student Status</span>

              <strong>{student.status}</strong>
            </div>

            <div>
              <span>Curriculum</span>

              <strong>{student.curriculum?.curriculum_name || "—"}</strong>

              {student.curriculum?.effective_year !== null &&
                student.curriculum?.effective_year !== undefined && (
                  <small>Effective {student.curriculum.effective_year}</small>
                )}
            </div>
          </section>
        )}

        {/* =================================================
            SUMMARY
        ================================================= */}

        <section className="student-record-summary">
          <div>
            <span>Official Subjects</span>

            <strong>{summary.total}</strong>
          </div>

          <div>
            <span>Earned Units</span>

            <strong>{summary.earnedUnits}</strong>
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

          <div>
            <span>Retake Required</span>

            <strong>{summary.retakes}</strong>
          </div>
        </section>
        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <section className="student-record-error">
            <div>
              <strong>Academic record could not be loaded</strong>

              <p>{error}</p>
            </div>

            <button type="button" onClick={refresh}>
              Try Again
            </button>
          </section>
        )}

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && (
          <section className="student-record-loading">
            <div className="student-record-spinner" />

            <div>
              <strong>Loading official academic record</strong>

              <span>Retrieving approved grades and academic history...</span>
            </div>
          </section>
        )}

        {/* =================================================
            FILTERS
        ================================================= */}

        {!loading && !error && (
          <section className="student-record-filters">
            <div className="student-record-search">
              <label htmlFor="academic-record-search">Search Subject</label>

              <input
                id="academic-record-search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Subject code or description..."
              />
            </div>

            <div>
              <label>Academic Year</label>

              <select
                value={academicYearFilter}
                onChange={(event) => setAcademicYearFilter(event.target.value)}
              >
                <option value="All">All Academic Years</option>

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
                <option value="All">All Semesters</option>

                {semesters.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Academic Result</label>

              <select
                value={resultFilter}
                onChange={(event) => setResultFilter(event.target.value)}
              >
                <option value="All">All Results</option>

                <option value="Passed">Passed</option>

                <option value="Incomplete">Incomplete</option>

                <option value="Failed">Failed</option>
              </select>
            </div>

            <button
              type="button"
              className="student-record-clear-filter"
              onClick={clearFilters}
            >
              Clear
            </button>
          </section>
        )}

        {/* =================================================
            NO ACADEMIC RECORD
        ================================================= */}

        {!loading && !error && records.length === 0 && (
          <section className="student-record-empty">
            <div className="student-record-empty-icon">✓</div>

            <strong>No official grades yet</strong>

            <p>
              Your academic record will appear here after submitted grades are
              reviewed and approved by the Program Head.
            </p>
          </section>
        )}

        {/* =================================================
            FILTER EMPTY
        ================================================= */}

        {!loading &&
          !error &&
          records.length > 0 &&
          filteredRecords.length === 0 && (
            <section className="student-record-empty">
              <strong>No matching academic records</strong>

              <p>No approved subjects match the current filters.</p>

              <button type="button" onClick={clearFilters}>
                Clear Filters
              </button>
            </section>
          )}

        {/* =================================================
            ACADEMIC HISTORY
        ================================================= */}

        {!loading && !error && groupedRecords.length > 0 && (
          <section className="student-record-history">
            <div className="student-record-history-header">
              <div>
                <h2>Academic History</h2>

                <p>
                  Official approved subject attempts grouped by academic year
                  and semester.
                </p>
              </div>

              <span>
                {filteredRecords.length} record
                {filteredRecords.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="student-record-years">
              {groupedRecords.map((year) => (
                <article
                  className="student-record-year"
                  key={year.academicYearId}
                >
                  <header className="student-record-year-header">
                    <div>
                      <span>Academic Year</span>

                      <h3>{year.academicYear}</h3>
                    </div>

                    <strong>
                      {year.semesters.reduce(
                        (total, semester) => total + semester.records.length,
                        0,
                      )}{" "}
                      subject
                      {year.semesters.reduce(
                        (total, semester) => total + semester.records.length,
                        0,
                      ) === 1
                        ? ""
                        : "s"}
                    </strong>
                  </header>

                  {year.semesters.map((semester) => {
                    const semesterUnits = semester.records.reduce(
                      (total, record) => total + Number(record.units || 0),
                      0,
                    );

                    const semesterPassed = semester.records.filter(
                      (record) => getClassification(record) === "Passed",
                    ).length;

                    return (
                      <section
                        className="student-record-semester"
                        key={`${year.academicYearId}-${semester.semesterId}`}
                      >
                        <div className="student-record-semester-header">
                          <div>
                            <h4>{semester.semesterName}</h4>

                            <span>
                              {semester.records.length} subject
                              {semester.records.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          <div className="student-record-semester-stats">
                            <span>
                              Recorded Units <strong>{semesterUnits}</strong>
                            </span>

                            <span>
                              Passed <strong>{semesterPassed}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="student-record-table-wrapper">
                          <table className="student-record-table">
                            <thead>
                              <tr>
                                <th>Subject</th>

                                <th>Units</th>

                                <th>Prelim</th>

                                <th>Midterm</th>

                                <th>Final</th>

                                <th>Final Rating</th>

                                <th>Result</th>

                                <th>Academic Status</th>

                                <th>Approval</th>
                              </tr>
                            </thead>

                            <tbody>
                              {semester.records.map((record) => {
                                const classification =
                                  getClassification(record);

                                return (
                                  <tr key={record.enrollment_subject_id}>
                                    <td>
                                      <div className="student-record-subject">
                                        <strong>{record.subject_code}</strong>

                                        <span>{record.subject_name}</span>

                                        <small>
                                          ES #{record.enrollment_subject_id}
                                        </small>
                                      </div>
                                    </td>

                                    <td>
                                      <strong className="student-record-units">
                                        {record.units}
                                      </strong>
                                    </td>

                                    <td>{formatGrade(record.prelim_grade)}</td>

                                    <td>{formatGrade(record.midterm_grade)}</td>

                                    <td>{formatGrade(record.final_grade)}</td>

                                    <td>
                                      <strong className="student-record-final-rating">
                                        {formatGrade(record.final_rating)}
                                      </strong>
                                    </td>
                                    <td>
                                      <span
                                        className={`student-record-result ${classification.toLowerCase()}`}
                                      >
                                        {classification}
                                      </span>

                                      {requiresRetake(record) && (
                                        <small className="student-record-retake">
                                          Retake required
                                        </small>
                                      )}
                                    </td>

                                    <td>
                                      <span
                                        className={`student-record-subject-status ${record.subject_status.toLowerCase()}`}
                                      >
                                        {record.subject_status}
                                      </span>
                                    </td>

                                    <td>
                                      <div className="student-record-approval">
                                        <span className="student-record-approved-badge">
                                          Approved
                                        </span>

                                        {record.approval
                                          ?.reviewed_by_username && (
                                          <small>
                                            By{" "}
                                            {
                                              record.approval
                                                .reviewed_by_username
                                            }
                                          </small>
                                        )}

                                        {record.approval?.reviewed_at && (
                                          <small>
                                            {formatDateTime(
                                              record.approval.reviewed_at,
                                            )}
                                          </small>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    );
                  })}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* =================================================
            ACADEMIC RULE LEGEND
        ================================================= */}

        {!loading && !error && (
          <section className="student-record-legend">
            <div className="student-record-legend-header">
              <span>Academic Result Guide</span>

              <strong>Official Final Rating</strong>
            </div>

            <div className="student-record-legend-items">
              <div>
                <span className="student-record-legend-rating passed">
                  1.00–3.00
                </span>

                <div>
                  <strong>Passed</strong>

                  <p>Subject is successfully completed.</p>
                </div>
              </div>

              <div>
                <span className="student-record-legend-rating incomplete">
                  4.00
                </span>

                <div>
                  <strong>Incomplete</strong>

                  <p>Subject remains a retake candidate.</p>
                </div>
              </div>

              <div>
                <span className="student-record-legend-rating failed">
                  5.00
                </span>

                <div>
                  <strong>Failed</strong>

                  <p>
                    Subject must be retaken according to enrollment eligibility
                    rules.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =================================================
            RECORD FOOTER
        ================================================= */}

        {!loading && !error && records.length > 0 && (
          <section className="student-record-footer">
            <div>
              <strong>Official Academic History</strong>

              <p>
                This page reflects grades currently approved in the PTC Portal.
                Approved results are used for prerequisite checks, retake
                detection, and future enrollment eligibility.
              </p>
            </div>

            <div className="student-record-footer-stat">
              <span>Total Recorded Units</span>

              <strong>{summary.totalRecordedUnits}</strong>
            </div>
          </section>
        )}
      </main>
    </DashboardLayout>
  );
}
