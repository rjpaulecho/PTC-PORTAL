import React, { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/RegistrarAcademicRecord.css";

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

export default function AcademicRecordsR() {
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
  // FETCH ACADEMIC RECORDS
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

    const fetchAcademicRecords = async () => {
      try {
        setLoading(true);

        setError("");

        const requestUrl = `${API_BASE_URL}/${studentId}/academic-records`;

        console.log("GET REGISTRAR ACADEMIC RECORDS:", requestUrl);

        // =============================================
        // JWT AUTHENTICATED REQUEST
        //
        // authFetch automatically sends:
        //
        // Authorization: Bearer <JWT>
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
        // Missing / expired / invalid JWT
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
        // Authenticated but wrong role
        // =============================================

        if (response.status === 403) {
          throw new Error(
            data?.message || "You are not authorized to view academic records.",
          );
        }

        // =============================================
        // HTTP ERROR
        // =============================================

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Unable to load academic records (${response.status}).`,
          );
        }

        // =============================================
        // API ERROR
        // =============================================

        if (!data?.success) {
          throw new Error(data?.message || "Failed to load academic records.");
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

        console.error("GET ACADEMIC RECORDS ERROR:", err);

        setStudent(null);

        setRecords([]);

        if (err instanceof TypeError) {
          setError(
            "Unable to connect to the academic records server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load academic records.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchAcademicRecords();

    return () => {
      controller.abort();
    };
  }, [id, authenticated, userRole, navigate]);

  // =====================================================
  // COMPUTE TOTAL UNITS
  // =====================================================

  const totalUnits = useMemo(() => {
    return records.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );
  }, [records]);

  // =====================================================
  // AUTH RENDER GUARD
  // =====================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-acadRecR-container">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="registrar-acadRecR-header">
          <div>
            <h1>Academic Records</h1>

            <p>
              View the complete academic history and enrolled subjects of the
              selected student.
            </p>
          </div>
        </div>

        {/* =====================================================
            LOADING
        ===================================================== */}

        {loading && (
          <div className="details-message">Loading academic records...</div>
        )}

        {/* =====================================================
            ERROR
        ===================================================== */}

        {!loading && error && (
          <div className="details-message error">{error}</div>
        )}

        {/* =====================================================
            CONTENT
        ===================================================== */}

        {!loading && !error && student && (
          <>
            {/* STUDENT SUMMARY */}

            <div className="student-summary-card">
              <div className="student-summary-left">
                <div className="student-avatar">
                  {student.first_name?.charAt(0).toUpperCase() || "S"}
                </div>

                <div>
                  <h2>
                    {student.first_name}{" "}
                    {student.middle_name
                      ? `${student.middle_name.charAt(0)}. `
                      : ""}
                    {student.last_name}
                  </h2>

                  <p>{student.student_number}</p>

                  <span
                    className={`status ${(student.status || "")
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {student.status}
                  </span>
                </div>
              </div>

              <div className="student-summary-right">
                <div className="summary-item">
                  <span>Course</span>

                  <strong>{student.course_code || "-"}</strong>
                </div>

                <div className="summary-item">
                  <span>Year Level</span>

                  <strong>Year {student.year_level}</strong>
                </div>

                <div className="summary-item">
                  <span>Section</span>

                  <strong>{student.section_name || "Not Assigned"}</strong>
                </div>

                <div className="summary-item">
                  <span>Semester</span>

                  <strong>{student.semester_name || "-"}</strong>
                </div>
              </div>
            </div>

            {/* STATISTICS */}

            <div className="academic-statistics">
              <div className="academic-card">
                <span>Total Subjects</span>

                <h2>{records.length}</h2>
              </div>

              <div className="academic-card">
                <span>Total Units</span>

                <h2>{totalUnits}</h2>
              </div>

              <div className="academic-card">
                <span>Current Status</span>

                <h2>{student.status}</h2>
              </div>
            </div>

            {/* TABLE */}

            <div className="records-card">
              <h3>Academic History</h3>

              <div className="records-table-wrapper">
                <table className="records-table">
                  <thead>
                    <tr>
                      <th>Academic Year</th>

                      <th>Semester</th>

                      <th>Subject Code</th>

                      <th>Subject Name</th>

                      <th>Units</th>

                      <th>Enrollment</th>

                      <th>Subject Status</th>

                      <th>Prelim</th>

                      <th>Midterm</th>

                      <th>Final</th>

                      <th>Remarks</th>
                    </tr>
                  </thead>

                  <tbody>
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="table-message">
                          No academic records found.
                        </td>
                      </tr>
                    ) : (
                      records.map((record, index) => (
                        <tr
                          key={`${record.enrollment_id}-${record.subject_id}-${index}`}
                        >
                          <td>{record.academic_year}</td>

                          <td>{record.semester_name}</td>

                          <td>{record.subject_code}</td>

                          <td>{record.subject_name}</td>

                          <td>{record.units}</td>

                          <td>
                            <span
                              className={`status ${(
                                record.enrollment_status || ""
                              )
                                .toLowerCase()
                                .replace(/\s+/g, "-")}`}
                            >
                              {record.enrollment_status}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`status ${(record.subject_status || "")
                                .toLowerCase()
                                .replace(/\s+/g, "-")}`}
                            >
                              {record.subject_status}
                            </span>
                          </td>

                          <td>{record.prelim_grade ?? "-"}</td>

                          <td>{record.midterm_grade ?? "-"}</td>

                          <td>{record.final_grade ?? "-"}</td>

                          <td>{record.remarks ?? "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ACTION BUTTONS */}

            <div className="records-actions">
              <button
                type="button"
                className="back-btn"
                onClick={() =>
                  navigate(`/registrar/student/DetailsR/${student.student_id}`)
                }
              >
                Go to Student Profile
              </button>

              <button
                type="button"
                className="transcript-btn"
                onClick={() =>
                  navigate(
                    `/registrar/student/${student.student_id}/transcriptR`,
                  )
                }
              >
                View Transcript
              </button>

              <button
                type="button"
                className="document-btn"
                onClick={() =>
                  navigate(
                    `/registrar/student/${student.student_id}/DocumentsR`,
                  )
                }
              >
                Go to Student Documents
              </button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
