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

interface Student {
  student_id: number;
  student_number: string;

  first_name: string;
  middle_name: string | null;
  last_name: string;

  course_code: string;

  year_level: number;

  section_name: string;

  semester_name: string;

  status: string;
}

interface AcademicRecord {
  enrollment_id: number;

  academic_year: string;

  semester_id: number;
  semester_name: string;

  enrollment_status: string;

  subject_id: number;

  subject_code: string;
  subject_name: string;

  units: number;

  subject_status: string;

  prelim_grade: number | null;
  midterm_grade: number | null;
  final_grade: number | null;

  remarks: string | null;
}

interface AcademicResponse {
  success: boolean;

  message?: string;
  error?: string;

  student: Student;

  totalSubjects: number;

  records: AcademicRecord[];
}

// =====================================================
// COMPONENT
// =====================================================

export default function TranscriptPreviewR() {
  const navigate = useNavigate();

  const { id } = useParams<{ id: string }>();

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

  const [student, setStudent] = useState<Student | null>(null);

  const [records, setRecords] = useState<AcademicRecord[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // AUTHORIZATION
  // =====================================================

  useEffect(() => {
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

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
  // FETCH TRANSCRIPT DATA
  // =====================================================

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

        // =============================================
        // JWT AUTHENTICATED REQUEST
        // =============================================

        const response = await authService.authFetch(requestUrl, {
          method: "GET",

          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

        // =============================================
        // SAFE RESPONSE READ
        // =============================================

        const contentType = response.headers.get("content-type") || "";

        let data: AcademicResponse | null = null;

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
            data?.message || "You are not authorized to view this transcript.",
          );
        }

        // =============================================
        // HTTP ERROR
        // =============================================

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Unable to load transcript (${response.status}).`,
          );
        }

        // =============================================
        // API ERROR
        // =============================================

        if (!data?.success) {
          throw new Error(
            data?.message || "Failed to load transcript records.",
          );
        }

        // =============================================
        // SUCCESS
        // =============================================

        setStudent(data.student);

        setRecords(Array.isArray(data.records) ? data.records : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("TRANSCRIPT FETCH ERROR:", err);

        setStudent(null);

        setRecords([]);

        if (err instanceof TypeError) {
          setError(
            "Unable to connect to the transcript server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setError(
          err instanceof Error
            ? err.message
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
  }, [id, authenticated, userRole, navigate]);

  // =====================================================
  // GROUP RECORDS
  // =====================================================

  const groupedRecords = useMemo(() => {
    const grouped: Record<string, Record<string, AcademicRecord[]>> = {};

    records.forEach((record) => {
      if (!grouped[record.academic_year]) {
        grouped[record.academic_year] = {};
      }

      if (!grouped[record.academic_year][record.semester_name]) {
        grouped[record.academic_year][record.semester_name] = [];
      }

      grouped[record.academic_year][record.semester_name].push(record);
    });

    return grouped;
  }, [records]);

  // =====================================================
  // TOTAL UNITS
  // =====================================================

  const totalUnits = useMemo(() => {
    return records.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );
  }, [records]);

  // =====================================================
  // STUDENT NAME
  // =====================================================

  const studentName = useMemo(() => {
    if (!student) {
      return "";
    }

    return [student.last_name, student.first_name, student.middle_name]
      .filter(Boolean)
      .join(", ");
  }, [student]);

  // =====================================================
  // AUTH RENDER GUARD
  // =====================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="transcript-page">
          <div className="transcript-message">Loading transcript...</div>
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // ERROR
  // =====================================================

  if (error || !student) {
    return (
      <DashboardLayout>
        <div className="transcript-page">
          <div className="transcript-message error">
            {error || "Student record not found."}
          </div>

          <button
            type="button"
            className="transcript-back-btn"
            onClick={() => navigate(-1)}
          >
            Go Back
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="transcript-page">
        {/* =====================================================
            ACTION BAR
        ===================================================== */}

        <div className="transcript-action-bar">
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
              className="transcript-print-btn"
              onClick={() => window.print()}
            >
              Print
            </button>

            <button
              type="button"
              className="transcript-generate-btn"
              onClick={() => window.print()}
            >
              Generate TOR
            </button>
          </div>
        </div>

        {/* =====================================================
            TRANSCRIPT DOCUMENT
        ===================================================== */}

        <div className="transcript-document">
          {/* =====================================================
              SCHOOL HEADER
          ===================================================== */}

          <div className="transcript-header">
            <h1>PATEROS TECHNOLOGICAL COLLEGE</h1>

            <p>OFFICE OF THE REGISTRAR</p>

            <h2>TRANSCRIPT OF RECORDS</h2>
          </div>

          {/* =====================================================
              STUDENT INFORMATION
          ===================================================== */}

          <div className="transcript-student-info">
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
              <div>
                <span>Name</span>

                <strong>{studentName}</strong>
              </div>
            </div>

            <div className="student-info-row">
              <div>
                <span>Program</span>

                <strong>{student.course_code || "-"}</strong>
              </div>

              <div>
                <span>Current Year Level</span>

                <strong>Year {student.year_level}</strong>
              </div>
            </div>
          </div>

          {/* =====================================================
              ACADEMIC HISTORY
          ===================================================== */}

          <div className="transcript-academic-history">
            {Object.keys(groupedRecords).length === 0 ? (
              <div className="transcript-empty">
                No approved academic records found.
              </div>
            ) : (
              Object.entries(groupedRecords).map(
                ([academicYear, semesters]) => (
                  <div className="transcript-academic-year" key={academicYear}>
                    <h3>Academic Year {academicYear}</h3>

                    {Object.entries(semesters).map(
                      ([semesterName, semesterRecords]) => (
                        <div
                          className="transcript-semester"
                          key={`${academicYear}-${semesterName}`}
                        >
                          <h4>{semesterName}</h4>

                          <table className="transcript-table">
                            <thead>
                              <tr>
                                <th>Subject Code</th>

                                <th>Subject Description</th>

                                <th>Units</th>

                                <th>Grade</th>

                                <th>Remarks</th>
                              </tr>
                            </thead>

                            <tbody>
                              {semesterRecords.map((record) => (
                                <tr
                                  key={`${record.enrollment_id}-${record.subject_id}`}
                                >
                                  <td>{record.subject_code}</td>

                                  <td>{record.subject_name}</td>

                                  <td>{record.units}</td>

                                  <td>{record.final_grade ?? "-"}</td>

                                  <td>{record.remarks ?? "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          <div className="semester-total">
                            <strong>Semester Units:</strong>{" "}
                            {semesterRecords.reduce(
                              (total, record) =>
                                total + Number(record.units || 0),
                              0,
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                ),
              )
            )}
          </div>

          {/* =====================================================
              SUMMARY
          ===================================================== */}

          <div className="transcript-summary">
            <div>
              <span>Total Subjects</span>

              <strong>{records.length}</strong>
            </div>

            <div>
              <span>Total Units</span>

              <strong>{totalUnits}</strong>
            </div>
          </div>

          {/* =====================================================
              CERTIFICATION
          ===================================================== */}

          <div className="transcript-certification">
            <p>
              This transcript contains the academic records currently available
              and approved in the student information system.
            </p>
          </div>

          {/* =====================================================
              REGISTRAR SIGNATURE
          ===================================================== */}

          <div className="transcript-signature">
            <div className="signature-line">
              <strong>REGISTRAR</strong>

              <span>Registrar</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
