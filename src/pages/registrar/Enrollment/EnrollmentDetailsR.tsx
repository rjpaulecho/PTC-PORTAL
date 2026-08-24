import React, { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/EnrollmementDetailsR.css";

// =====================================================
// API
// =====================================================

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

  error?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function EnrollmentDetailsR() {
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

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const [subjects, setSubjects] = useState<EnrollmentSubject[]>([]);

  const [totalSubjects, setTotalSubjects] = useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // AUTHORIZATION
  // =====================================================

  useEffect(() => {
    // ---------------------------------------------------
    // No session or no JWT
    // ---------------------------------------------------

    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    // ---------------------------------------------------
    // Logged in but wrong role
    // ---------------------------------------------------

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
  // FETCH ENROLLMENT DETAILS
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    if (!id) {
      setError("Invalid enrollment ID.");

      setLoading(false);

      return;
    }

    const enrollmentId = Number(id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      setError("Invalid enrollment ID.");

      setLoading(false);

      return;
    }

    const controller = new AbortController();

    const loadEnrollment = async () => {
      try {
        setLoading(true);

        setError("");

        const requestUrl = `${API_BASE_URL}/${enrollmentId}`;

        console.log("GET REGISTRAR ENROLLMENT DETAILS:", requestUrl);

        // =============================================
        // AUTHENTICATED REQUEST
        //
        // authFetch automatically adds:
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

        let data: EnrollmentDetailsResponse | null = null;

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
        //
        // Missing / invalid / expired JWT
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
        //
        // Authenticated but wrong role
        // =============================================

        if (response.status === 403) {
          throw new Error(
            data?.message ||
              data?.error ||
              "You are not authorized to view this enrollment.",
          );
        }

        // =============================================
        // HTTP ERROR
        // =============================================

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Failed to fetch enrollment (${response.status}).`,
          );
        }

        // =============================================
        // API ERROR
        // =============================================

        if (!data?.success) {
          throw new Error(data?.message || "Failed to fetch enrollment.");
        }

        // =============================================
        // SUCCESS
        // =============================================

        setEnrollment(data.enrollment);

        setSubjects(Array.isArray(data.subjects) ? data.subjects : []);

        setTotalSubjects(Number(data.totalSubjects || 0));
      } catch (err) {
        // =============================================
        // ABORTED REQUEST
        // =============================================

        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("GET ENROLLMENT DETAILS ERROR:", err);

        setEnrollment(null);

        setSubjects([]);

        setTotalSubjects(0);

        // =============================================
        // NETWORK ERROR
        // =============================================

        if (err instanceof TypeError) {
          setError(
            "Unable to connect to the enrollment server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        // =============================================
        // NORMAL ERROR
        // =============================================

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

    void loadEnrollment();

    return () => {
      controller.abort();
    };
  }, [id, authenticated, userRole, navigate]);

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
    return `status ${(value || "").toLowerCase().replace(/\s+/g, "-")}`;
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

  const formatSchedule = (
    days: string | null,

    time: string | null,
  ) => {
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
  // SUBJECT ACTION PLACEHOLDERS
  // =====================================================

  const handleChangeSection = (subject: EnrollmentSubject) => {
    console.log("Change section:", subject.enrollment_subject_id);

    // ==================================================
    // TODO:
    //
    // Later connect this to the Registrar endpoint that
    // assigns a valid offering / section_subject /
    // section to this enrollment subject.
    //
    // This must use authService.authFetch().
    // ==================================================
  };

  const handleDropSubject = (subject: EnrollmentSubject) => {
    console.log("Drop subject:", subject.enrollment_subject_id);

    // ==================================================
    // TODO:
    //
    // Later connect this to the official Registrar
    // enrollment-subject status endpoint.
    //
    // Do not delete the academic intent blindly.
    //
    // Expected subject status:
    // DROPPED
    //
    // This must use authService.authFetch().
    // ==================================================
  };

  // =====================================================
  // ENROLLMENT ACTION PLACEHOLDERS
  // =====================================================

  const handleRejectEnrollment = () => {
    if (!enrollment) {
      return;
    }

    console.log("Reject enrollment:", enrollment.enrollment_id);

    // ==================================================
    // TODO:
    //
    // Connect to the real Registrar reject endpoint.
    //
    // When implemented:
    //
    // authService.authFetch(...)
    //
    // Backend actor:
    // req.user.user_id
    //
    // Do not send frontend approved_by / user_id.
    // ==================================================
  };

  const handleApproveEnrollment = () => {
    if (!enrollment) {
      return;
    }

    console.log("Approve enrollment:", enrollment.enrollment_id);

    // ==================================================
    // TODO:
    //
    // Connect to the final Registrar approval endpoint.
    //
    // Before approval backend must validate:
    //
    // - enrollment still Pending / Under Review
    // - enrollment period rules
    // - every subject valid
    // - section/offering assignments
    // - prerequisites
    // - capacity
    // - duplicate enrollment
    //
    // Actor must come from:
    // req.user.user_id
    // ==================================================
  };

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

            <div className="detail-item">
              <span>Approved At</span>

              <strong>{formatDate(enrollment.approved_at)}</strong>
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
                          onClick={() => handleChangeSection(subject)}
                        >
                          Change
                        </button>

                        <button
                          type="button"
                          className="subject-action-btn danger"
                          onClick={() => handleDropSubject(subject)}
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
            onClick={handleRejectEnrollment}
            disabled={enrollment.enrollment_status === "Approved"}
          >
            Reject Enrollment
          </button>

          <button
            type="button"
            className="approve-enrollment-btn"
            onClick={handleApproveEnrollment}
            disabled={
              enrollment.enrollment_status === "Approved" ||
              subjects.length === 0
            }
          >
            Approve Enrollment
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
