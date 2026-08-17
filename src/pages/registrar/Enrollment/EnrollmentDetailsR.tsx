import React, { useEffect, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate, useParams } from "react-router-dom";
import "../../../styles/EnrollmementDetailsR.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/enrollments";

// =====================================================
// TYPES
// =====================================================

interface Enrollment {
  enrollment_id: number;
  student_id: number;

  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;

  gender: string | null;
  birth_date: string | null;
  contact_number: string | null;
  year_level: number | null;

  course_id: number | null;
  course_code: string | null;

  student_section_id: number | null;
  student_section_name: string | null;

  academic_year_id: number;
  academic_year: string;

  semester_id: number;
  semester_name: string;

  enrollment_status: string;
  remarks: string | null;

  approved_by: number | null;
  approved_by_username: string | null;
  approved_at: string | null;

  created_at: string;
}

interface EnrollmentSubject {
  enrollment_subject_id: number;

  subject_id: number;
  subject_code: string;
  subject_name: string;

  units: number;
  lecture_hours: number | null;
  laboratory_hours: number | null;

  subject_status: string;

  section_id: number | null;
  section_name: string | null;

  section_subject_id: number | null;

  offering_id: number | null;

  faculty_id: number | null;
  room_id: number | null;

  schedule_days: string | null;
  schedule_time: string | null;

  max_students: number | null;
}

interface EnrollmentDetailsResponse {
  success: boolean;
  enrollment: Enrollment;
  totalSubjects: number;
  subjects: EnrollmentSubject[];
  message?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function EnrollmentDetailsR() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const user = authService.getSession();
  const userRole = user?.role;

  // =====================================================
  // STATES
  // =====================================================

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const [subjects, setSubjects] = useState<EnrollmentSubject[]>([]);

  const [totalSubjects, setTotalSubjects] = useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      navigate("/login");
    }
  }, [userRole, navigate]);

  // =====================================================
  // FETCH ENROLLMENT DETAILS
  // =====================================================

  useEffect(() => {
    if (userRole !== "Registrar") {
      return;
    }

    if (!id) {
      setError("Invalid enrollment ID.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadEnrollment = async () => {
      try {
        setLoading(true);
        setError("");

        const enrollmentId = Number(id);

        if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
          throw new Error("Invalid enrollment ID.");
        }

        const response = await fetch(`${API_BASE_URL}/${enrollmentId}`, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        const data: EnrollmentDetailsResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to fetch enrollment.");
        }

        setEnrollment(data.enrollment);
        setSubjects(Array.isArray(data.subjects) ? data.subjects : []);

        setTotalSubjects(data.totalSubjects || 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("GET ENROLLMENT DETAILS ERROR:", err);

        setEnrollment(null);
        setSubjects([]);
        setTotalSubjects(0);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load enrollment details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadEnrollment();

    return () => {
      controller.abort();
    };
  }, [id, userRole]);

  // =====================================================
  // HELPERS
  // =====================================================

  const getFullName = () => {
    if (!enrollment) {
      return "";
    }

    return [enrollment.first_name, enrollment.middle_name, enrollment.last_name]
      .filter(Boolean)
      .join(" ");
  };

  const getStatusClass = (value: string) => {
    return `status ${value.toLowerCase().replace(/\s+/g, "-")}`;
  };

  const formatDate = (value: string | null) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatSchedule = (days: string | null, time: string | null) => {
    if (!days && !time) {
      return "—";
    }

    if (!days) {
      return time || "—";
    }

    if (!time) {
      return days;
    }

    return `${days} • ${time}`;
  };

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="registrar-enrollment-details">
          <div className="enrollment-details-loading">
            Loading enrollment details...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // ERROR
  // =====================================================

  if (error || !enrollment) {
    return (
      <DashboardLayout>
        <div className="registrar-enrollment-details">
          <div className="enrollment-details-header">
            <button
              type="button"
              className="back-btn"
              onClick={() => navigate("/registrar/enrollment/management")}
            >
              ← Back
            </button>
          </div>

          <div className="enrollment-details-error">
            <h2>Unable to Load Enrollment</h2>

            <p>{error || "Enrollment record not found."}</p>

            <button
              type="button"
              className="retry-btn"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-enrollment-details">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="enrollment-details-header">
          <div>
            <button
              type="button"
              className="back-btn"
              onClick={() => navigate("/registrar/enrollment/management")}
            >
              ← Back to Enrollments
            </button>

            <h1>Enrollment Details</h1>

            <p>Review this student's current enrollment record.</p>
          </div>

          <span className={getStatusClass(enrollment.enrollment_status)}>
            {enrollment.enrollment_status}
          </span>
        </div>

        {/* =================================================
            STUDENT INFORMATION
        ================================================= */}

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <h2>Student Information</h2>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span>Student Number</span>
              <strong>{enrollment.student_number}</strong>
            </div>

            <div className="detail-item">
              <span>Student Name</span>
              <strong>{getFullName()}</strong>
            </div>

            <div className="detail-item">
              <span>Gender</span>
              <strong>{enrollment.gender || "—"}</strong>
            </div>

            <div className="detail-item">
              <span>Birth Date</span>
              <strong>{formatDate(enrollment.birth_date)}</strong>
            </div>

            <div className="detail-item">
              <span>Contact Number</span>
              <strong>{enrollment.contact_number || "—"}</strong>
            </div>
          </div>
        </div>

        {/* =================================================
            ENROLLMENT INFORMATION
        ================================================= */}

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <h2>Enrollment Information</h2>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span>Course</span>
              <strong>{enrollment.course_code || "—"}</strong>
            </div>

            <div className="detail-item">
              <span>Year Level</span>
              <strong>
                {enrollment.year_level ? `Year ${enrollment.year_level}` : "—"}
              </strong>
            </div>

            <div className="detail-item">
              <span>Section</span>
              <strong>
                {enrollment.student_section_name || "Not Assigned"}
              </strong>
            </div>

            <div className="detail-item">
              <span>Academic Year</span>
              <strong>{enrollment.academic_year}</strong>
            </div>

            <div className="detail-item">
              <span>Semester</span>
              <strong>{enrollment.semester_name}</strong>
            </div>

            <div className="detail-item">
              <span>Total Subjects</span>
              <strong>{totalSubjects}</strong>
            </div>

            <div className="detail-item">
              <span>Created</span>
              <strong>{formatDate(enrollment.created_at)}</strong>
            </div>

            <div className="detail-item">
              <span>Approved By</span>
              <strong>{enrollment.approved_by_username || "—"}</strong>
            </div>
          </div>

          {enrollment.remarks && (
            <div className="remarks-box">
              <span>Remarks</span>
              <p>{enrollment.remarks}</p>
            </div>
          )}
        </div>

        {/* =================================================
            SUBJECTS
        ================================================= */}

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <div>
              <h2>Enrolled Subjects</h2>

              <span>
                {totalSubjects} subject
                {totalSubjects !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="subjects-table-wrapper">
            <table className="subjects-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Subject</th>
                  <th>Units</th>
                  <th>Section</th>
                  <th>Schedule</th>
                  <th>Faculty</th>
                  <th>Room</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {subjects.length === 0 && (
                  <tr>
                    <td colSpan={9} className="subjects-empty">
                      No enrolled subjects found.
                    </td>
                  </tr>
                )}

                {subjects.map((subject) => (
                  <tr key={subject.enrollment_subject_id}>
                    <td>
                      <strong>{subject.subject_code}</strong>
                    </td>

                    <td>
                      <div className="subject-name-cell">
                        <strong>{subject.subject_name}</strong>

                        <small>Subject ID: {subject.subject_id}</small>
                      </div>
                    </td>

                    <td>{subject.units}</td>

                    <td>{subject.section_name || "Not Assigned"}</td>

                    <td>
                      {formatSchedule(
                        subject.schedule_days,
                        subject.schedule_time,
                      )}
                    </td>

                    <td>
                      {subject.faculty_id
                        ? `Faculty #${subject.faculty_id}`
                        : "—"}
                    </td>

                    <td>
                      {subject.room_id ? `Room #${subject.room_id}` : "—"}
                    </td>

                    <td>
                      <span className={getStatusClass(subject.subject_status)}>
                        {subject.subject_status}
                      </span>
                    </td>

                    <td>
                      <div className="subject-actions">
                        <button
                          type="button"
                          className="subject-action-btn"
                          onClick={() => {
                            console.log(
                              "Change section:",
                              subject.enrollment_subject_id,
                            );
                          }}
                        >
                          Change
                        </button>

                        <button
                          type="button"
                          className="subject-action-btn danger"
                          onClick={() => {
                            console.log(
                              "Drop subject:",
                              subject.enrollment_subject_id,
                            );
                          }}
                        >
                          Drop
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
            ACTIONS
        ================================================= */}

        <div className="enrollment-details-actions">
          <button
            type="button"
            className="reject-enrollment-btn"
            onClick={() => {
              console.log("Reject enrollment:", enrollment.enrollment_id);
            }}
          >
            Reject Enrollment
          </button>

          <button
            type="button"
            className="approve-enrollment-btn"
            onClick={() => {
              console.log("Approve enrollment:", enrollment.enrollment_id);
            }}
          >
            Approve Enrollment
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
