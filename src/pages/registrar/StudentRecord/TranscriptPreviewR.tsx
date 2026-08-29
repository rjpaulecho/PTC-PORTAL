import { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

import "../../../styles/RegistrarTranscriptPreview.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/students";

// =====================================================
// TYPES
// =====================================================

type AcademicClassification = "Passed" | "Incomplete" | "Failed" | "Unknown";

// =====================================================
// STUDENT
// =====================================================

interface Student {
  student_id: number;
  student_number: string;

  first_name: string;
  middle_name: string | null;
  last_name: string;

  gender?: string | null;
  birth_date?: string | null;
  contact_number?: string | null;
  email?: string | null;

  course_id?: number | null;
  course_code: string;
  course_name?: string | null;

  year_level: number;

  status: string;

  section_id?: number | null;
  section_name?: string | null;

  semester_id?: number | null;
  semester_name?: string | null;

  house_no?: string | null;
  street?: string | null;
  barangay?: string | null;
  city?: string | null;
  province?: string | null;
  zip_code?: string | null;
}

// =====================================================
// ACADEMIC RECORD
// =====================================================

interface AcademicRecord {
  enrollment_id: number;

  academic_year_id: number;
  academic_year: string;

  semester_id: number;
  semester_name: string;

  enrollment_status: string;

  enrollment_subject_id: number;

  subject_id: number;

  subject_code: string;
  subject_name: string;

  units: number;

  lecture_hours?: number | null;
  laboratory_hours?: number | null;

  subject_status: string;

  offering_id?: number | null;

  section_id?: number | null;
  section_subject_id?: number | null;
  section_name?: string | null;

  grade_id: number;

  faculty_id?: number | null;

  prelim_grade: number | null;
  midterm_grade: number | null;
  final_grade: number | null;

  // =================================================
  // OFFICIAL RESULT
  // =================================================

  final_rating: number | null;

  academic_result?: "Passed" | "Incomplete" | "Failed" | null;

  remarks: "Passed" | "Incomplete" | "Failed" | null;

  grade_status: "Draft" | "Submitted" | "Returned" | "Approved";

  submitted_at?: string | null;

  reviewed_by?: number | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  review_remarks?: string | null;

  grade_created_at?: string | null;
  grade_updated_at?: string | null;
}

// =====================================================
// API RESPONSE
// =====================================================

interface AcademicResponse {
  success: boolean;

  student?: Student;

  totalSubjects?: number;

  records?: AcademicRecord[];

  message?: string;
  error?: string;
}

// =====================================================
// GROUP TYPES
// =====================================================

interface SemesterGroup {
  semesterId: number;
  semesterName: string;

  records: AcademicRecord[];
}

interface AcademicYearGroup {
  academicYearId: number;
  academicYear: string;

  semesters: SemesterGroup[];
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
// FORMAT GRADE
// =====================================================

function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return numeric.toFixed(2);
}

// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// =====================================================
// CLASSIFY FINAL RATING
// =====================================================
//
// 1.00 - 3.00 = Passed
// 4.00        = Incomplete / Retake
// 5.00        = Failed / Retake
//
// final_rating is the official academic value.
// =====================================================

function classifyFinalRating(
  finalRating: number | null | undefined,
): AcademicClassification {
  if (finalRating === null || finalRating === undefined) {
    return "Unknown";
  }

  const rating = Number(finalRating);

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

// =====================================================
// GET RESULT
// =====================================================
//
// Prefer backend academic_result.
//
// final_rating remains the fallback source of truth.
// =====================================================

function getClassification(record: AcademicRecord): AcademicClassification {
  if (
    record.academic_result === "Passed" ||
    record.academic_result === "Incomplete" ||
    record.academic_result === "Failed"
  ) {
    return record.academic_result;
  }

  return classifyFinalRating(record.final_rating);
}

// =====================================================
// RETAKE
// =====================================================

function requiresRetake(record: AcademicRecord): boolean {
  const result = getClassification(record);

  return result === "Incomplete" || result === "Failed";
}

// =====================================================
// STUDENT NAME
// =====================================================

function getStudentName(student: Student): string {
  const first = student.first_name?.trim() || "";

  const middle = student.middle_name?.trim() || "";

  const last = student.last_name?.trim() || "";

  const givenName = [first, middle].filter(Boolean).join(" ");

  if (last && givenName) {
    return `${last}, ${givenName}`;
  }

  return [last, givenName].filter(Boolean).join(", ") || student.student_number;
}

// =====================================================
// COMPONENT
// =====================================================

export default function TranscriptPreviewR() {
  const navigate = useNavigate();

  const { id } = useParams<{
    id: string;
  }>();

  // ===================================================
  // AUTHENTICATION
  // ===================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // ===================================================
  // STATE
  // ===================================================

  const [student, setStudent] = useState<Student | null>(null);

  const [records, setRecords] = useState<AcademicRecord[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

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

    if (userRole !== "Registrar") {
      if (userRole) {
        navigate(authService.getDashboardRoute(userRole), {
          replace: true,
        });
      } else {
        navigate("/login", {
          replace: true,
        });
      }
    }
  }, [authenticated, userRole, navigate]);

  // ===================================================
  // FETCH TRANSCRIPT DATA
  // ===================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    if (!id) {
      setError("Invalid student ID.");

      setLoading(false);

      return;
    }

    const studentId = Number(id);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      setError("Invalid student ID.");

      setLoading(false);

      return;
    }

    const controller = new AbortController();

    const fetchTranscriptData = async () => {
      try {
        setLoading(true);
        setError("");

        const requestUrl = `${API_BASE_URL}/${studentId}/academic-records`;

        console.log("GET REGISTRAR TRANSCRIPT:", requestUrl);

        const response = await authService.authFetch(requestUrl, {
          method: "GET",

          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

        const data = await readJsonResponse<AcademicResponse>(response);

        // =============================================
        // 401
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
        // =============================================

        if (response.status === 403) {
          throw new Error(
            data.message ||
              "Registrar access is required to view this transcript.",
          );
        }

        // =============================================
        // HTTP / API ERROR
        // =============================================

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              data.error ||
              `Unable to load transcript (${response.status}).`,
          );
        }

        if (!data.student) {
          throw new Error(
            "Student information was not returned by the server.",
          );
        }

        // =============================================
        // OFFICIAL TRANSCRIPT FILTER
        //
        // Transcript must contain ONLY:
        //
        // - Approved enrollment
        // - Approved grade
        // - final_rating present
        // - First Semester / Second Semester
        //
        // Summer is excluded.
        // =============================================

        const officialRecords = Array.isArray(data.records)
          ? data.records.filter(
              (record) =>
                record.enrollment_status === "Approved" &&
                record.grade_status === "Approved" &&
                record.final_rating !== null &&
                [1, 2].includes(Number(record.semester_id)),
            )
          : [];

        setStudent(data.student);

        setRecords(officialRecords);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        console.error("TRANSCRIPT FETCH ERROR:", requestError);

        setStudent(null);

        setRecords([]);

        if (requestError instanceof TypeError) {
          setError(
            "Unable to connect to the transcript server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load transcript records.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchTranscriptData();

    return () => {
      controller.abort();
    };
  }, [id, authenticated, userRole, navigate, refreshKey]);

  // ===================================================
  // GROUP OFFICIAL RECORDS
  //
  // Transcript is chronological:
  //
  // Oldest AY
  //   First Semester
  //   Second Semester
  //
  // Newest AY
  // ===================================================

  const groupedRecords = useMemo<AcademicYearGroup[]>(() => {
    const yearMap = new Map<number, AcademicYearGroup>();

    records.forEach((record) => {
      let year = yearMap.get(record.academic_year_id);

      if (!year) {
        year = {
          academicYearId: record.academic_year_id,

          academicYear: record.academic_year,

          semesters: [],
        };

        yearMap.set(record.academic_year_id, year);
      }

      let semester = year.semesters.find(
        (item) => item.semesterId === record.semester_id,
      );

      if (!semester) {
        semester = {
          semesterId: record.semester_id,

          semesterName: record.semester_name,

          records: [],
        };

        year.semesters.push(semester);
      }

      semester.records.push(record);
    });

    const groups = Array.from(yearMap.values());

    // Oldest academic year first
    groups.sort((a, b) => a.academicYearId - b.academicYearId);

    groups.forEach((year) => {
      year.semesters.sort((a, b) => a.semesterId - b.semesterId);

      year.semesters.forEach((semester) => {
        semester.records.sort(
          (a, b) => a.enrollment_subject_id - b.enrollment_subject_id,
        );
      });
    });

    return groups;
  }, [records]);

  // ===================================================
  // SUMMARY
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

    const recordedUnits = records.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    const earnedUnits = passed.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    return {
      totalSubjects: records.length,

      recordedUnits,

      earnedUnits,

      passed: passed.length,

      incomplete: incomplete.length,

      failed: failed.length,

      retakes: retakes.length,
    };
  }, [records]);

  // ===================================================
  // STUDENT NAME
  // ===================================================

  const studentName = useMemo(() => {
    if (!student) {
      return "";
    }

    return getStudentName(student);
  }, [student]);

  // ===================================================
  // ACTIONS
  // ===================================================

  const refresh = () => {
    setRefreshKey((current) => current + 1);
  };

  const printTranscript = () => {
    window.print();
  };

  // ===================================================
  // AUTH RENDER GUARD
  // ===================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // ===================================================
  // LOADING
  // ===================================================

  if (loading) {
    return (
      <DashboardLayout>
        <main className="transcript-page">
          <div className="transcript-loading">
            <div className="transcript-loading-spinner" />

            <div>
              <strong>Loading transcript</strong>

              <span>Retrieving approved academic records...</span>
            </div>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  // ===================================================
  // ERROR
  // ===================================================

  if (error || !student) {
    return (
      <DashboardLayout>
        <main className="transcript-page">
          <div className="transcript-error">
            <div>
              <strong>Transcript could not be loaded</strong>

              <p>{error || "Student record not found."}</p>
            </div>

            <div className="transcript-error-actions">
              <button
                type="button"
                className="transcript-back-btn"
                onClick={() => navigate(-1)}
              >
                Go Back
              </button>

              <button
                type="button"
                className="transcript-retry-btn"
                onClick={refresh}
              >
                Try Again
              </button>
            </div>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <DashboardLayout>
      <main className="transcript-page">
        {/* =================================================
            ACTION BAR
        ================================================= */}

        <section className="transcript-action-bar">
          <button
            type="button"
            className="transcript-back-btn"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>

          <div className="transcript-actions">
            <button
              type="button"
              className="transcript-refresh-btn"
              onClick={refresh}
            >
              Refresh
            </button>

            <button
              type="button"
              className="transcript-print-btn"
              onClick={printTranscript}
            >
              Print Preview
            </button>
          </div>
        </section>

        {/* =================================================
            OFFICIAL DATA NOTICE
        ================================================= */}

        <section className="transcript-official-notice">
          <div className="transcript-official-icon">✓</div>

          <div>
            <strong>Approved Academic Records Only</strong>

            <p>
              This transcript preview contains only approved grades from
              approved enrollments. Draft, Submitted, and Returned grades are
              excluded.
            </p>
          </div>
        </section>

        {/* =================================================
            TRANSCRIPT DOCUMENT
        ================================================= */}

        <article className="transcript-document">
          {/* ===============================================
              SCHOOL HEADER
          =============================================== */}

          <header className="transcript-header">
            <h1>PATEROS TECHNOLOGICAL COLLEGE</h1>

            <p>OFFICE OF THE REGISTRAR</p>

            <h2>TRANSCRIPT OF RECORDS</h2>

            <span className="transcript-preview-label">REGISTRAR PREVIEW</span>
          </header>

          {/* ===============================================
              STUDENT INFORMATION
          =============================================== */}

          <section className="transcript-student-info">
            <div className="student-info-row">
              <div>
                <span>Student Number</span>

                <strong>{student.student_number}</strong>
              </div>

              <div>
                <span>Student Status</span>

                <strong>{student.status}</strong>
              </div>
            </div>

            <div className="student-info-row">
              <div className="student-info-full">
                <span>Name</span>

                <strong>{studentName}</strong>
              </div>
            </div>

            <div className="student-info-row">
              <div>
                <span>Program</span>

                <strong>{student.course_code || "—"}</strong>
              </div>

              <div>
                <span>Current Year Level</span>

                <strong>Year {student.year_level}</strong>
              </div>
            </div>

            <div className="student-info-row">
              <div>
                <span>Current Section</span>

                <strong>{student.section_name || "Not Assigned"}</strong>
              </div>

              <div>
                <span>Current Semester</span>

                <strong>{student.semester_name || "—"}</strong>
              </div>
            </div>
          </section>

          {/* ===============================================
              ACADEMIC HISTORY
          =============================================== */}

          <section className="transcript-academic-history">
            {groupedRecords.length === 0 ? (
              <div className="transcript-empty">
                <strong>No approved academic records found.</strong>

                <p>
                  Approved grades will appear here after Program Head approval.
                </p>
              </div>
            ) : (
              groupedRecords.map((academicYear) => (
                <section
                  className="transcript-academic-year"
                  key={academicYear.academicYearId}
                >
                  <h3>Academic Year {academicYear.academicYear}</h3>

                  {academicYear.semesters.map((semester) => {
                    const recordedUnits = semester.records.reduce(
                      (total, record) => total + Number(record.units || 0),
                      0,
                    );

                    const earnedUnits = semester.records
                      .filter(
                        (record) => getClassification(record) === "Passed",
                      )
                      .reduce(
                        (total, record) => total + Number(record.units || 0),
                        0,
                      );

                    return (
                      <section
                        className="transcript-semester"
                        key={`${academicYear.academicYearId}-${semester.semesterId}`}
                      >
                        <div className="transcript-semester-heading">
                          <h4>{semester.semesterName}</h4>

                          <span>
                            {semester.records.length} subject
                            {semester.records.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        {/* =============================
                                TRANSCRIPT TABLE
                            ============================= */}

                        <div className="transcript-table-wrapper">
                          <table className="transcript-table">
                            <thead>
                              <tr>
                                <th>Subject Code</th>

                                <th>Subject Description</th>

                                <th>Units</th>

                                <th>Final Rating</th>

                                <th>Result</th>

                                <th>Academic Status</th>
                              </tr>
                            </thead>

                            <tbody>
                              {semester.records.map((record) => {
                                const result = getClassification(record);

                                return (
                                  <tr key={record.enrollment_subject_id}>
                                    <td>
                                      <strong className="transcript-subject-code">
                                        {record.subject_code}
                                      </strong>
                                    </td>

                                    <td>{record.subject_name}</td>

                                    <td>{record.units}</td>

                                    <td>
                                      <strong className="transcript-final-rating">
                                        {formatGrade(record.final_rating)}
                                      </strong>
                                    </td>

                                    <td>
                                      <div className="transcript-result-cell">
                                        <span
                                          className={`transcript-result ${result.toLowerCase()}`}
                                        >
                                          {result}
                                        </span>

                                        {requiresRetake(record) && (
                                          <small className="transcript-retake">
                                            Retake Required
                                          </small>
                                        )}
                                      </div>
                                    </td>

                                    <td>
                                      <span
                                        className={`transcript-subject-status ${record.subject_status
                                          .toLowerCase()
                                          .replace(/\s+/g, "-")}`}
                                      >
                                        {record.subject_status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* =============================
                                SEMESTER SUMMARY
                            ============================= */}

                        <div className="transcript-semester-summary">
                          <div>
                            <span>Recorded Units</span>

                            <strong>{recordedUnits}</strong>
                          </div>

                          <div>
                            <span>Earned Units</span>

                            <strong>{earnedUnits}</strong>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </section>
              ))
            )}
          </section>

          {/* ===============================================
              OVERALL SUMMARY
          =============================================== */}

          <section className="transcript-summary">
            <div>
              <span>Official Subjects</span>

              <strong>{summary.totalSubjects}</strong>
            </div>

            <div>
              <span>Recorded Units</span>

              <strong>{summary.recordedUnits}</strong>
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
          </section>

          {/* ===============================================
              RESULT GUIDE
          =============================================== */}

          <section className="transcript-grade-guide">
            <strong>Grade Interpretation</strong>

            <div className="transcript-grade-guide-items">
              <span>
                <b>1.00–3.00</b> Passed
              </span>

              <span>
                <b>4.00</b> Incomplete
              </span>

              <span>
                <b>5.00</b> Failed
              </span>
            </div>
          </section>

          {/* ===============================================
              CERTIFICATION
          =============================================== */}

          <section className="transcript-certification">
            <p>
              This transcript preview contains academic records currently marked
              official in the PTC Student Portal. Only Program Head-approved
              grades from approved enrollments are included.
            </p>

            <p className="transcript-certification-note">
              This screen is a Registrar preview. Formal release of an official
              Transcript of Records remains subject to Registrar verification
              and document issuance procedures.
            </p>
          </section>

          {/* ===============================================
              DOCUMENT INFORMATION
          =============================================== */}

          <section className="transcript-document-info">
            <div>
              <span>Student Number</span>

              <strong>{student.student_number}</strong>
            </div>

            <div>
              <span>Preview Date</span>

              <strong>{formatDate(new Date().toISOString())}</strong>
            </div>
          </section>

          {/* ===============================================
              REGISTRAR SIGNATURE
          =============================================== */}

          <section className="transcript-signature">
            <div className="signature-line">
              <strong>REGISTRAR</strong>

              <span>Authorized Registrar</span>
            </div>
          </section>
        </article>
      </main>
    </DashboardLayout>
  );
}
