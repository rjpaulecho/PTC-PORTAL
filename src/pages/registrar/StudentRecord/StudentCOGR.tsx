import { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

import "../../../styles/RegistrarCertificateOfGrades.css";

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
  // OFFICIAL ACADEMIC VALUE
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
// TERM OPTION
// =====================================================

interface AcademicTermOption {
  academic_year_id: number;
  academic_year: string;

  semester_id: number;
  semester_name: string;
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
// FINAL RATING CLASSIFICATION
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
// OFFICIAL RESULT
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
// STATUS CSS
// =====================================================

function getStatusClass(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, "-") || "unknown";
}

// =====================================================
// STUDENT NAME
// =====================================================

function getStudentName(student: Student): string {
  return [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(" ");
}

// =====================================================
// COMPONENT
// =====================================================

export default function CertificateOfGradesR() {
  const navigate = useNavigate();

  const { id } = useParams<{
    id: string;
  }>();

  // ===================================================
  // AUTH
  // ===================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // ===================================================
  // DATA
  // ===================================================

  const [student, setStudent] = useState<Student | null>(null);

  const [records, setRecords] = useState<AcademicRecord[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  // ===================================================
  // SELECTED COG TERM
  // ===================================================

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<
    number | null
  >(null);

  const [selectedSemesterId, setSelectedSemesterId] = useState<number | null>(
    null,
  );

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
  // LOAD OFFICIAL GRADES
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

    const loadCOGData = async () => {
      try {
        setLoading(true);
        setError("");

        const requestUrl = `${API_BASE_URL}/${studentId}/academic-records`;

        console.log("GET REGISTRAR COG:", requestUrl);

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
          throw new Error(data.message || "Registrar access is required.");
        }

        // =============================================
        // ERROR
        // =============================================

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              data.error ||
              "Unable to load Certificate of Grades.",
          );
        }

        if (!data.student) {
          throw new Error(
            "Student information was not returned by the server.",
          );
        }

        // =============================================
        // OFFICIAL COG FILTER
        //
        // ONLY:
        //
        // Approved Enrollment
        // Approved Grade
        // final_rating exists
        // First / Second Semester
        //
        // No Summer.
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

        console.error("GET REGISTRAR COG ERROR:", requestError);

        setStudent(null);

        setRecords([]);

        if (requestError instanceof TypeError) {
          setError(
            "Unable to connect to the academic records server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load Certificate of Grades.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadCOGData();

    return () => {
      controller.abort();
    };
  }, [id, authenticated, userRole, navigate, refreshKey]);

  // ===================================================
  // AVAILABLE TERMS
  // ===================================================

  const availableTerms = useMemo<AcademicTermOption[]>(() => {
    const termMap = new Map<string, AcademicTermOption>();

    records.forEach((record) => {
      const key = `${record.academic_year_id}-${record.semester_id}`;

      if (!termMap.has(key)) {
        termMap.set(key, {
          academic_year_id: record.academic_year_id,

          academic_year: record.academic_year,

          semester_id: record.semester_id,

          semester_name: record.semester_name,
        });
      }
    });

    return Array.from(termMap.values()).sort((a, b) => {
      if (a.academic_year_id !== b.academic_year_id) {
        return b.academic_year_id - a.academic_year_id;
      }

      return b.semester_id - a.semester_id;
    });
  }, [records]);

  // ===================================================
  // DEFAULT TO LATEST OFFICIAL TERM
  // ===================================================

  useEffect(() => {
    if (availableTerms.length === 0) {
      setSelectedAcademicYearId(null);

      setSelectedSemesterId(null);

      return;
    }

    const selectedStillExists = availableTerms.some(
      (term) =>
        term.academic_year_id === selectedAcademicYearId &&
        term.semester_id === selectedSemesterId,
    );

    if (selectedStillExists) {
      return;
    }

    const latest = availableTerms[0];

    setSelectedAcademicYearId(latest.academic_year_id);

    setSelectedSemesterId(latest.semester_id);
  }, [availableTerms, selectedAcademicYearId, selectedSemesterId]);

  // ===================================================
  // SELECTED TERM
  // ===================================================

  const selectedTerm = useMemo(() => {
    return (
      availableTerms.find(
        (term) =>
          term.academic_year_id === selectedAcademicYearId &&
          term.semester_id === selectedSemesterId,
      ) || null
    );
  }, [availableTerms, selectedAcademicYearId, selectedSemesterId]);

  // ===================================================
  // COG RECORDS
  // ===================================================

  const cogRecords = useMemo(() => {
    if (selectedAcademicYearId === null || selectedSemesterId === null) {
      return [];
    }

    return records
      .filter(
        (record) =>
          record.academic_year_id === selectedAcademicYearId &&
          record.semester_id === selectedSemesterId,
      )
      .sort((a, b) => a.enrollment_subject_id - b.enrollment_subject_id);
  }, [records, selectedAcademicYearId, selectedSemesterId]);

  // ===================================================
  // SECTION FOR SELECTED TERM
  // ===================================================

  const selectedSectionName = useMemo(() => {
    const names = Array.from(
      new Set(
        cogRecords
          .map((record) => record.section_name)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (names.length === 0) {
      return "—";
    }

    if (names.length === 1) {
      return names[0];
    }

    return "Multiple Sections";
  }, [cogRecords]);

  // ===================================================
  // TERM CHANGE
  // ===================================================

  const handleTermChange = (value: string) => {
    const [academicYearId, semesterId] = value.split("-").map(Number);

    if (!Number.isInteger(academicYearId) || !Number.isInteger(semesterId)) {
      return;
    }

    setSelectedAcademicYearId(academicYearId);

    setSelectedSemesterId(semesterId);
  };

  // ===================================================
  // ACTIONS
  // ===================================================

  const refresh = () => {
    setRefreshKey((current) => current + 1);
  };

  const printCOG = () => {
    window.print();
  };

  // ===================================================
  // AUTH GUARD
  // ===================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <DashboardLayout>
      <main className="registrar-cog-page">
        {/* =================================================
            HEADER
        ================================================= */}

        <section className="registrar-cog-header">
          <div>
            <span className="registrar-cog-eyebrow">
              Registrar • Student Records
            </span>

            <h1>Certificate of Grades</h1>

            <p>
              Generate a term-based Certificate of Grades using only official
              Program Head-approved academic results.
            </p>
          </div>

          <div className="registrar-cog-header-actions">
            <button
              type="button"
              className="registrar-cog-back"
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>

            <button
              type="button"
              className="registrar-cog-refresh"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        {/* =================================================
            NOTICE
        ================================================= */}

        <section className="registrar-cog-notice">
          <div className="registrar-cog-notice-icon">✓</div>

          <div>
            <strong>Official Grades Only</strong>

            <p>
              Draft, Submitted, and Returned grades are excluded. The
              certificate uses approved enrollment, approved grades, and the
              official final rating.
            </p>
          </div>
        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <section className="registrar-cog-error">
            <div>
              <strong>Certificate of Grades could not be loaded</strong>

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
          <section className="registrar-cog-loading">
            <div className="registrar-cog-spinner" />

            <div>
              <strong>Loading Certificate of Grades</strong>

              <span>Retrieving official academic results...</span>
            </div>
          </section>
        )}

        {/* =================================================
            CONTENT
        ================================================= */}

        {!loading && !error && student && (
          <>
            {/* =============================================
                  STUDENT SUMMARY
              ============================================= */}

            <section className="registrar-cog-student-card">
              <div className="registrar-cog-student-primary">
                <div className="registrar-cog-avatar">
                  {student.first_name?.charAt(0).toUpperCase() || "S"}
                </div>

                <div>
                  <span>Student</span>

                  <h2>{getStudentName(student)}</h2>

                  <p>{student.student_number}</p>
                </div>
              </div>

              <div className="registrar-cog-student-data">
                <div>
                  <span>Program</span>

                  <strong>{student.course_code}</strong>
                </div>

                <div>
                  <span>Current Year</span>

                  <strong>Year {student.year_level}</strong>
                </div>

                <div>
                  <span>Status</span>

                  <strong
                    className={`registrar-cog-student-status ${getStatusClass(
                      student.status,
                    )}`}
                  >
                    {student.status}
                  </strong>
                </div>
              </div>
            </section>

            {/* =============================================
                  TERM SELECTOR
              ============================================= */}

            <section className="registrar-cog-toolbar">
              <div>
                <label htmlFor="cog-term">Certificate Period</label>

                <select
                  id="cog-term"
                  value={
                    selectedTerm
                      ? `${selectedTerm.academic_year_id}-${selectedTerm.semester_id}`
                      : ""
                  }
                  onChange={(event) => handleTermChange(event.target.value)}
                  disabled={availableTerms.length === 0}
                >
                  {availableTerms.length === 0 ? (
                    <option value="">No Official Terms</option>
                  ) : (
                    availableTerms.map((term) => (
                      <option
                        key={`${term.academic_year_id}-${term.semester_id}`}
                        value={`${term.academic_year_id}-${term.semester_id}`}
                      >
                        {term.academic_year} — {term.semester_name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="registrar-cog-toolbar-actions">
                <button
                  type="button"
                  className="registrar-cog-print"
                  onClick={printCOG}
                  disabled={cogRecords.length === 0}
                >
                  Print Preview
                </button>
              </div>
            </section>

            {/* =============================================
                  NO RECORD
              ============================================= */}

            {cogRecords.length === 0 && (
              <section className="registrar-cog-empty">
                <strong>No Certificate of Grades available</strong>

                <p>
                  This student has no approved grades for an official First or
                  Second Semester period yet.
                </p>
              </section>
            )}

            {/* =============================================
                  COG DOCUMENT
              ============================================= */}

            {cogRecords.length > 0 && selectedTerm && (
              <article className="cog-document">
                {/* =====================================
                        SCHOOL HEADER
                    ===================================== */}

                <header className="cog-document-header">
                  <h1>PATEROS TECHNOLOGICAL COLLEGE</h1>

                  <p>OFFICE OF THE REGISTRAR</p>

                  <h2>CERTIFICATE OF GRADES</h2>
                </header>

                {/* =====================================
                        STUDENT INFORMATION
                    ===================================== */}

                <section className="cog-student-information">
                  <div>
                    <span>Student Number</span>

                    <strong>{student.student_number}</strong>
                  </div>

                  <div>
                    <span>Student Name</span>

                    <strong>{getStudentName(student)}</strong>
                  </div>

                  <div>
                    <span>Program</span>

                    <strong>{student.course_code}</strong>
                  </div>

                  <div>
                    <span>Year Level</span>

                    <strong>Year {student.year_level}</strong>
                  </div>

                  <div>
                    <span>Section</span>

                    <strong>{selectedSectionName}</strong>
                  </div>

                  <div>
                    <span>Student Status</span>

                    <strong>{student.status}</strong>
                  </div>
                </section>

                {/* =====================================
                        PERIOD
                    ===================================== */}

                <section className="cog-period">
                  <div>
                    <span>Academic Year</span>

                    <strong>{selectedTerm.academic_year}</strong>
                  </div>

                  <div>
                    <span>Semester</span>

                    <strong>{selectedTerm.semester_name}</strong>
                  </div>
                </section>

                {/* =====================================
                        GRADES TABLE
                    ===================================== */}

                <div className="cog-table-wrapper">
                  <table className="cog-table">
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
                      {cogRecords.map((record) => {
                        const result = getClassification(record);

                        return (
                          <tr key={record.enrollment_subject_id}>
                            <td>
                              <strong>{record.subject_code}</strong>
                            </td>

                            <td>{record.subject_name}</td>

                            <td>{record.units}</td>

                            <td>
                              <strong className="cog-final-rating">
                                {formatGrade(record.final_rating)}
                              </strong>
                            </td>

                            <td>
                              <div className="cog-result-cell">
                                <span
                                  className={`cog-result ${result.toLowerCase()}`}
                                >
                                  {result}
                                </span>

                                {requiresRetake(record) && (
                                  <small>Retake Required</small>
                                )}
                              </div>
                            </td>

                            <td>
                              <span
                                className={`cog-subject-status ${getStatusClass(
                                  record.subject_status,
                                )}`}
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

                {/* =====================================
                        GRADE GUIDE
                    ===================================== */}

                <section className="cog-grade-guide">
                  <strong>Grade Interpretation</strong>

                  <span>1.00–3.00 — Passed</span>

                  <span>4.00 — Incomplete</span>

                  <span>5.00 — Failed</span>
                </section>

                {/* =====================================
                        CERTIFICATION
                    ===================================== */}

                <section className="cog-certification">
                  <p>
                    This is to certify that the grades stated above are the
                    official approved academic results recorded in the PTC
                    Student Portal for the indicated academic period.
                  </p>

                  <p>
                    Only grades approved by the Program Head from approved
                    student enrollments are included in this Certificate of
                    Grades.
                  </p>
                </section>

                {/* =====================================
                        DOCUMENT INFO
                    ===================================== */}

                <section className="cog-document-info">
                  <div>
                    <span>Student Number</span>

                    <strong>{student.student_number}</strong>
                  </div>

                  <div>
                    <span>Date Generated</span>

                    <strong>{formatDate(new Date().toISOString())}</strong>
                  </div>
                </section>

                {/* =====================================
                        SIGNATURE
                    ===================================== */}

                <section className="cog-signature">
                  <div>
                    <span />

                    <strong>REGISTRAR</strong>

                    <small>Authorized Registrar</small>
                  </div>
                </section>
              </article>
            )}

            {/* =============================================
                  NAVIGATION
              ============================================= */}

            <section className="registrar-cog-footer-actions">
              <button
                type="button"
                onClick={() =>
                  navigate(`/registrar/student/DetailsR/${student.student_id}`)
                }
              >
                Student Profile
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(`/registrar/student/${student.student_id}/AcadRecR`)
                }
              >
                Academic Records
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/registrar/student/${student.student_id}/transcriptR`,
                  )
                }
              >
                Transcript
              </button>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
