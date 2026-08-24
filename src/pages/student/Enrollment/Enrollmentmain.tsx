import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import "../../../styles/Enrollmentmain.css";

const API_BASE_URL = "http://localhost:3000/api/student/enrollments";

// ============================================================
// TYPES
// ============================================================

interface StudentSession {
  id?: number;
  user_id?: number;
  student_id?: number;
  username?: string;
  role: string;
  email?: string;
  role_id?: number;
}

interface Student {
  user_id?: number;
  username?: string;

  student_id: number;
  student_number: string;
  student_name: string;

  first_name?: string;
  middle_name?: string;
  last_name?: string;

  course_id: number;
  year_level: number;

  enrollment_type: string;
}

interface Curriculum {
  student_curriculum_id: number;
  curriculum_id: number;
  curriculum_name: string;
  effective_year: number;
  total_units: number;
  is_active: boolean;

  assigned_date?: string | null;
  status?: string | null;
  remarks?: string | null;

  course?: {
    course_id: number;
    course_code: string;
    course_name: string;
  };
}

interface EnrollmentPeriod {
  enrollment_period_id: number;
  academic_year_id: number;
  academic_year: string;
  semester_id: number;
  semester_name: string;
  status: string;

  opened_by?: number | null;
  opened_at?: string | null;

  closed_by?: number | null;
  closed_at?: string | null;

  remarks?: string | null;
}

interface Enrollment {
  enrollment_id: number;
  student_id: number;

  academic_year_id: number;
  academic_year: string;

  semester_id: number;
  semester_name: string;

  enrollment_status: string;

  remarks: string | null;

  approved_by: number | null;
  approved_at: string | null;

  created_at: string;
}

interface Section {
  section_subject_id: number;
  section_id: number;
  subject_id: number;

  subject_code?: string;
  subject_name?: string;

  section_name: string;

  course_id: number;
  year_level: number;

  academic_year_id: number;
  semester_id: number;

  max_students: number | null;
  enrolled_students?: number;
  available_slots?: number;

  status: string;
}

interface Subject {
  subject_id: number;

  subject_code: string;
  subject_name: string;

  units: number;

  lecture_hours: number;
  laboratory_hours: number;

  year_level: number | null;
  semester_id: number | null;

  is_required: boolean;
  display_order: number;

  enrollment_type: "Regular" | "Retake";

  academic_status: string;

  previous_grade: number | null;

  remarks: string | null;

  curriculum_subject_id: number | null;

  enrollment_subject_id: number | null;
  enrollment_subject_status: string | null;

  assigned_section: Section | null;

  /*
   * Kept because the backend may still return these fields.
   *
   * IMPORTANT:
   * They are intentionally NOT used for student selection.
   */
  has_available_sections?: boolean;
  available_sections?: Section[];
}

interface EnrollmentResponse {
  success: boolean;
  message?: string;

  student: Student;

  curriculum: Curriculum | null;

  enrollment_period: EnrollmentPeriod | null;

  enrollment: Enrollment | null;

  summary: {
    total_subjects: number;
    regular_subjects: number;
    retake_subjects: number;
    total_units: number;
    enrollment_type: string;
  };

  subjects: Subject[];
}

// ============================================================
// COMPONENT
// ============================================================

export default function Enrollmentmain() {
  const navigate = useNavigate();

  const [user, setUser] = useState<StudentSession | null>(null);

  const [data, setData] = useState<EnrollmentResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // ============================================================
  // GET SESSION
  // ============================================================

  useEffect(() => {
    const session = authService.getSession();

    console.log("=================================");
    console.log("STUDENT SESSION");
    console.log(session);
    console.log("=================================");

    if (!session || session.role !== "Student") {
      navigate("/login", { replace: true });
      return;
    }

    if (!session.user_id) {
      setError("Student session does not contain a user ID.");
      setLoading(false);
      return;
    }

    setUser(session);
  }, [navigate]);

  // ============================================================
  // LOAD ENROLLMENT
  // ============================================================

  useEffect(() => {
    if (!user?.user_id) {
      return;
    }

    void loadEnrollment(user.user_id);
  }, [user]);

  // ============================================================
  // LOAD ENROLLMENT DATA
  // ============================================================

  const loadEnrollment = async (userId: number) => {
    try {
      setLoading(true);
      setError("");

      console.log("=================================");
      console.log("LOADING STUDENT ENROLLMENT");
      console.log("User ID:", userId);
      console.log("Endpoint:", `${API_BASE_URL}/subjects?user_id=${userId}`);
      console.log("=================================");

      const response = await fetch(
        `${API_BASE_URL}/subjects?user_id=${userId}`,
      );

      const responseData = await response.json();

      console.log("Enrollment API status:", response.status);
      console.log("Enrollment API response:", responseData);

      if (!response.ok) {
        throw new Error(
          responseData?.message ||
            `Enrollment request failed (${response.status})`,
        );
      }

      if (!responseData.success) {
        throw new Error(responseData?.message || "Failed to load enrollment.");
      }

      setData(responseData);
    } catch (error) {
      console.error("LOAD ENROLLMENT ERROR:", error);

      if (error instanceof TypeError) {
        setError(
          "Unable to connect to the enrollment server. Make sure the backend is running on http://localhost:3000.",
        );
      } else {
        setError(
          error instanceof Error ? error.message : "Unable to load enrollment.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // DATE FORMAT
  // ============================================================

  const formatDate = (date: string | null | undefined) => {
    if (!date) {
      return "—";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // ============================================================
  // DATE + TIME
  // ============================================================

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) {
      return "—";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // ============================================================
  // YEAR LEVEL
  // ============================================================

  const getYearLabel = (year: number) => {
    if (year === 1) return "1st Year";
    if (year === 2) return "2nd Year";
    if (year === 3) return "3rd Year";
    if (year === 4) return "4th Year";

    return `${year}th Year`;
  };

  // ============================================================
  // STATUS CLASS
  // ============================================================

  const getStatusClass = (status: string | null | undefined) => {
    return status?.trim().toLowerCase().replace(/\s+/g, "-") || "unknown";
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="enrollment-main">
          <div className="enrollment-loading">
            <div className="enrollment-spinner"></div>

            <p>Loading your enrollment...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // ERROR
  // ============================================================

  if (error && !data) {
    return (
      <DashboardLayout>
        <div className="enrollment-main">
          <div className="enrollment-error-page">
            <div className="enrollment-error-icon">!</div>

            <h2>Unable to Load Enrollment</h2>

            <p>{error}</p>

            <button
              type="button"
              className="enrollment-btn primary"
              onClick={() => {
                if (user?.user_id) {
                  void loadEnrollment(user.user_id);
                }
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // NO DATA
  // ============================================================

  if (!data) {
    return (
      <DashboardLayout>
        <div className="enrollment-main">
          <div className="enrollment-error-page">
            <div className="enrollment-error-icon">!</div>

            <h2>No Enrollment Data</h2>

            <p>Unable to retrieve your enrollment information.</p>

            <button
              type="button"
              className="enrollment-btn primary"
              onClick={() => {
                if (user?.user_id) {
                  void loadEnrollment(user.user_id);
                }
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // DATA
  // ============================================================

  const {
    student,
    curriculum,
    enrollment_period,
    enrollment,
    summary,
    subjects,
  } = data;

  // ============================================================
  // SUBJECT GROUPS
  // ============================================================

  const regularSubjects = subjects.filter(
    (subject) => subject.enrollment_type === "Regular",
  );

  const retakeSubjects = subjects.filter(
    (subject) => subject.enrollment_type === "Retake",
  );

  // ============================================================
  // ENROLLMENT STATUS
  //
  // Draft
  //   ↓
  // Student submits
  //   ↓
  // Pending
  //   ↓
  // Registrar reviews
  //   ↓
  // Approved / Rejected
  //
  // IMPORTANT:
  // The student cannot modify the enrollment.
  // ============================================================

  const enrollmentStatus =
    enrollment?.enrollment_status?.trim().toLowerCase() || "";

  const enrollmentIsDraft = enrollmentStatus === "draft";

  const enrollmentIsSubmitted = enrollmentStatus === "pending";

  const enrollmentIsApproved = enrollmentStatus === "approved";

  const enrollmentIsRejected = enrollmentStatus === "rejected";

  const enrollmentIsDropped = enrollmentStatus === "dropped";

  const enrollmentPeriodIsOpen =
    enrollment_period?.status?.trim().toLowerCase() === "open";

  // ============================================================
  // CAN SUBMIT
  //
  // Student may ONLY submit a Registrar-prepared Draft.
  // ============================================================

  const canSubmitEnrollment =
    Boolean(enrollment?.enrollment_id) &&
    Boolean(enrollment_period) &&
    enrollmentPeriodIsOpen &&
    enrollmentIsDraft &&
    subjects.length > 0;

  // ============================================================
  // ASSIGNED SECTION COUNT
  //
  // Informational only.
  // It is NOT a selection control.
  // ============================================================

  const assignedSectionCount = subjects.filter(
    (subject) => subject.assigned_section !== null,
  ).length;

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <DashboardLayout>
      <div className="enrollment-main">
        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="enrollment-header">
          <div>
            <span className="enrollment-eyebrow">Student Enrollment</span>

            <h1>Enrollment</h1>

            <p>
              Review your Registrar-prepared enrollment and assigned sections.
            </p>
          </div>

          <div className="enrollment-period-badge">
            <span className="period-dot"></span>

            {enrollment_period?.status || "Closed"}
          </div>
        </div>

        {/* ====================================================
            ERROR
        ==================================================== */}

        {error && (
          <div className="enrollment-alert error">
            <span className="alert-icon">!</span>

            <div>
              <strong>Action Required</strong>

              <p>{error}</p>
            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="alert-close"
              aria-label="Close error"
            >
              ×
            </button>
          </div>
        )}

        {/* ====================================================
            SUCCESS
        ==================================================== */}

        {successMessage && (
          <div className="enrollment-alert success">
            <span className="alert-icon">✓</span>

            <div>
              <strong>Enrollment</strong>

              <p>{successMessage}</p>
            </div>

            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="alert-close"
              aria-label="Close success message"
            >
              ×
            </button>
          </div>
        )}

        {/* ====================================================
            STUDENT INFORMATION
        ==================================================== */}

        <div className="enrollment-info-grid">
          <div className="enrollment-info-card">
            <span className="info-label">Student</span>

            <strong>{student.student_name}</strong>

            <small>{student.student_number}</small>
          </div>

          <div className="enrollment-info-card">
            <span className="info-label">Course</span>

            <strong>{curriculum?.course?.course_code || "—"}</strong>

            <small>{curriculum?.course?.course_name || "—"}</small>
          </div>

          <div className="enrollment-info-card">
            <span className="info-label">Year Level</span>

            <strong>{getYearLabel(student.year_level)}</strong>

            <small>{student.enrollment_type}</small>
          </div>

          <div className="enrollment-info-card">
            <span className="info-label">Academic Period</span>

            <strong>{enrollment_period?.academic_year || "—"}</strong>

            <small>{enrollment_period?.semester_name || "—"}</small>
          </div>
        </div>

        {/* ====================================================
            SUMMARY
        ==================================================== */}

        <div className="enrollment-summary">
          <div className="summary-item">
            <span className="summary-number">{summary.total_subjects}</span>

            <span className="summary-label">Total Subjects</span>
          </div>

          <div className="summary-item">
            <span className="summary-number">{summary.regular_subjects}</span>

            <span className="summary-label">Regular</span>
          </div>

          <div className="summary-item retake">
            <span className="summary-number">{summary.retake_subjects}</span>

            <span className="summary-label">Retake</span>
          </div>

          <div className="summary-item">
            <span className="summary-number">{summary.total_units}</span>

            <span className="summary-label">Total Units</span>
          </div>

          <div className="summary-item type">
            <span className="summary-number">{summary.enrollment_type}</span>

            <span className="summary-label">Enrollment Type</span>
          </div>
        </div>

        {/* ====================================================
            ENROLLMENT STATUS
        ==================================================== */}

        <div className="enrollment-status-card">
          <div className="status-left">
            <span className="status-label">Enrollment Status</span>

            <strong
              className={`status-badge ${getStatusClass(
                enrollment?.enrollment_status,
              )}`}
            >
              {enrollment?.enrollment_status || "No Enrollment"}
            </strong>

            {enrollment?.remarks && <p>{enrollment.remarks}</p>}
          </div>

          <div className="status-right">
            <span>Created</span>

            <strong>{formatDate(enrollment?.created_at)}</strong>

            {enrollment?.approved_at && (
              <>
                <span>Approved</span>

                <strong>{formatDateTime(enrollment.approved_at)}</strong>
              </>
            )}
          </div>
        </div>

        {/* ====================================================
            DRAFT NOTICE
        ==================================================== */}

        {enrollmentIsDraft && enrollment_period && (
          <div className="enrollment-instruction">
            <div className="instruction-icon">i</div>

            <div>
              <strong>Your enrollment has been prepared</strong>

              <p>
                The Registrar has prepared your subjects and assigned sections.
                Please review your enrollment before submitting it.
              </p>

              <small>
                You cannot select, replace, transfer, add, or remove subjects or
                sections. Any enrollment correction must be handled by the
                Registrar.
              </small>
            </div>
          </div>
        )}

        {/* ====================================================
            PENDING NOTICE
        ==================================================== */}

        {enrollmentIsSubmitted && (
          <div className="enrollment-instruction">
            <div className="instruction-icon">✓</div>

            <div>
              <strong>Enrollment submitted successfully</strong>

              <p>
                Your enrollment has been submitted and is now pending Registrar
                review.
              </p>

              <small>
                Your subjects and assigned sections are locked for student
                editing. Any corrections are handled by the Registrar.
              </small>
            </div>
          </div>
        )}

        {/* ====================================================
            APPROVED NOTICE
        ==================================================== */}

        {enrollmentIsApproved && (
          <div className="enrollment-instruction">
            <div className="instruction-icon">✓</div>

            <div>
              <strong>Your enrollment has been approved</strong>

              <p>Your enrollment has been approved by the Registrar.</p>

              <small>Your enrollment is now officially approved.</small>
            </div>
          </div>
        )}

        {/* ====================================================
            REJECTED NOTICE
        ==================================================== */}

        {enrollmentIsRejected && (
          <div className="enrollment-instruction">
            <div className="instruction-icon">!</div>

            <div>
              <strong>Your enrollment was rejected</strong>

              <p>Please review the remarks provided by the Registrar.</p>

              {enrollment?.remarks && (
                <small>Registrar remarks: {enrollment.remarks}</small>
              )}
            </div>
          </div>
        )}

        {/* ====================================================
            DROPPED NOTICE
        ==================================================== */}

        {enrollmentIsDropped && (
          <div className="enrollment-instruction">
            <div className="instruction-icon">!</div>

            <div>
              <strong>Enrollment dropped</strong>

              <p>This enrollment is no longer active.</p>

              {enrollment?.remarks && (
                <small>Remarks: {enrollment.remarks}</small>
              )}
            </div>
          </div>
        )}

        {/* ====================================================
            CLOSED NOTICE
        ==================================================== */}

        {!enrollment_period && (
          <div className="enrollment-instruction">
            <div className="instruction-icon">i</div>

            <div>
              <strong>Enrollment is currently closed</strong>

              <p>
                There is currently no open enrollment period. Please check again
                when enrollment opens.
              </p>
            </div>
          </div>
        )}

        {/* ====================================================
            PERIOD EXISTS BUT NO ENROLLMENT
        ==================================================== */}

        {enrollment_period && !enrollment && (
          <div className="enrollment-instruction">
            <div className="instruction-icon">i</div>

            <div>
              <strong>Enrollment record not found</strong>

              <p>
                The enrollment period is open, but no enrollment record has been
                created for your account yet.
              </p>

              <small>
                Please contact the Registrar if you believe your enrollment
                should already be prepared.
              </small>
            </div>
          </div>
        )}

        {/* ====================================================
            SUBJECTS
        ==================================================== */}

        <div className="subjects-container">
          <div className="subjects-header">
            <div>
              <span className="enrollment-eyebrow">Prepared Enrollment</span>

              <h2>Your Subjects</h2>

              <p>
                These subjects were prepared by the Registrar/system for your
                current enrollment.
              </p>
            </div>

            <div className="selection-counter">
              {assignedSectionCount} / {subjects.length} sections assigned
            </div>
          </div>

          {/* ==================================================
              READ-ONLY NOTICE
          ================================================== */}

          {subjects.length > 0 && (
            <div className="selected-section-message">
              <span>i</span>

              <p>
                <strong>Registrar-prepared enrollment.</strong> Your subjects,
                retakes, and sections are assigned by the Registrar/system.
                <br />
                Students cannot change sections, add subjects, remove subjects,
                or transfer sections.
              </p>
            </div>
          )}

          {/* ==================================================
              NO SUBJECTS
          ================================================== */}

          {subjects.length === 0 && (
            <div className="no-sections">
              <span className="no-section-icon">—</span>

              <div>
                <strong>No subjects prepared</strong>

                <p>
                  There are currently no subjects prepared for your enrollment.
                </p>

                <small>
                  Please contact the Registrar if you believe your enrollment
                  should already be prepared.
                </small>
              </div>
            </div>
          )}

          {/* ==================================================
              REGULAR SUBJECTS
          ================================================== */}

          {regularSubjects.length > 0 && (
            <>
              <div className="subject-group-header">
                <div>
                  <span className="enrollment-eyebrow">Regular Subjects</span>

                  <h3>Current Curriculum Subjects</h3>
                </div>

                <span>
                  {regularSubjects.length} subject
                  {regularSubjects.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="subject-list">
                {[...regularSubjects]
                  .sort(
                    (a, b) =>
                      Number(a.display_order || 999999) -
                      Number(b.display_order || 999999),
                  )
                  .map((subject) => renderSubject(subject))}
              </div>
            </>
          )}

          {/* ==================================================
              RETAKE SUBJECTS
          ================================================== */}

          {retakeSubjects.length > 0 && (
            <>
              <div className="subject-group-header retake-group">
                <div>
                  <span className="enrollment-eyebrow">Retake Subjects</span>

                  <h3>Subjects Requiring Retake</h3>
                </div>

                <span>
                  {retakeSubjects.length} subject
                  {retakeSubjects.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="subject-list">
                {[...retakeSubjects]
                  .sort(
                    (a, b) =>
                      Number(a.display_order || 999999) -
                      Number(b.display_order || 999999),
                  )
                  .map((subject) => renderSubject(subject))}
              </div>
            </>
          )}
        </div>

        {/* ====================================================
            CURRICULUM
        ==================================================== */}

        {curriculum && (
          <div className="curriculum-card">
            <div>
              <span className="info-label">Curriculum</span>

              <strong>{curriculum.curriculum_name}</strong>
            </div>

            <div>
              <span className="info-label">Effective Year</span>

              <strong>{curriculum.effective_year}</strong>
            </div>

            <div>
              <span className="info-label">Curriculum Units</span>

              <strong>{curriculum.total_units}</strong>
            </div>
          </div>
        )}

        {/* ====================================================
            SUBMIT ENROLLMENT
        ==================================================== */}

        {canSubmitEnrollment && (
          <div className="enrollment-submit-card">
            <div className="enrollment-submit-content">
              <div>
                <span className="enrollment-eyebrow">Ready for Submission</span>

                <h2>Submit Enrollment</h2>

                <p>
                  Your enrollment has been prepared by the Registrar. Review
                  your subjects and assigned sections before submitting.
                </p>

                <small>
                  You are not selecting subjects or sections. The Registrar has
                  already prepared your enrollment.
                </small>

                <small>
                  Once submitted, your enrollment will be sent to the Registrar
                  for review.
                </small>
              </div>

              <button
                type="button"
                className="enrollment-btn primary enrollment-submit-btn"
                onClick={submitEnrollment}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="button-spinner"></span>
                    Submitting...
                  </>
                ) : (
                  "Submit Enrollment"
                )}
              </button>
            </div>
          </div>
        )}

        {/* ====================================================
            ALREADY SUBMITTED
        ==================================================== */}

        {enrollmentIsSubmitted && (
          <div className="enrollment-submit-card">
            <div className="enrollment-submit-content">
              <div>
                <span className="enrollment-eyebrow">Submission Complete</span>

                <h2>Enrollment Awaiting Review</h2>

                <p>
                  Your enrollment has already been submitted and is currently
                  pending Registrar review.
                </p>

                <small>No further submission is required.</small>
              </div>

              <div className="status-badge pending">
                Pending Registrar Review
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            APPROVED
        ==================================================== */}

        {enrollmentIsApproved && (
          <div className="enrollment-submit-card">
            <div className="enrollment-submit-content">
              <div>
                <span className="enrollment-eyebrow">Enrollment Complete</span>

                <h2>Enrollment Approved</h2>

                <p>
                  Your enrollment has been reviewed and approved by the
                  Registrar.
                </p>

                <small>No further action is required from you.</small>
              </div>

              <div className="status-badge approved">Approved</div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );

  // ============================================================
  // SUBMIT ENROLLMENT
  // ============================================================

  async function submitEnrollment() {
    /*
     * The frontend performs basic validation only.
     *
     * The backend remains authoritative and verifies:
     *
     * - user
     * - student
     * - enrollment
     * - enrollment period
     * - enrollment status
     * - prepared enrollment subjects
     * - Registrar-assigned sections
     */

    if (!enrollment?.enrollment_id) {
      setError("No enrollment record is available for submission.");
      return;
    }

    if (!user?.user_id) {
      setError("Student session does not contain a valid user ID.");
      return;
    }

    if (!enrollment_period) {
      setError("Enrollment is currently closed.");
      return;
    }

    if (!enrollmentPeriodIsOpen) {
      setError("The enrollment period is no longer open.");
      return;
    }

    /*
     * Only Draft can be submitted.
     *
     * Pending means the student already submitted.
     * Approved means the Registrar approved it.
     * Rejected means the Registrar rejected it.
     */
    if (!enrollmentIsDraft) {
      setError(
        `This enrollment cannot be submitted because its current status is "${enrollment.enrollment_status}".`,
      );
      return;
    }

    if (subjects.length === 0) {
      setError("There are no prepared subjects to submit.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccessMessage("");

      console.log("=================================");
      console.log("SUBMITTING STUDENT ENROLLMENT");
      console.log("Enrollment ID:", enrollment.enrollment_id);
      console.log("User ID:", user.user_id);
      console.log("=================================");

      const response = await fetch(
        `${API_BASE_URL}/${enrollment.enrollment_id}/submit`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          /*
           * IMPORTANT:
           *
           * The student sends ONLY user_id.
           *
           * DO NOT send:
           * - subjects
           * - sections
           * - retakes
           * - section IDs
           * - subject IDs
           *
           * The backend reads the Registrar-prepared
           * enrollment from the database.
           */
          body: JSON.stringify({
            user_id: user.user_id,
          }),
        },
      );

      const responseData = await response.json();

      console.log("Submit status:", response.status);
      console.log("Submit response:", responseData);

      if (!response.ok) {
        throw new Error(
          responseData?.message ||
            `Enrollment submission failed (${response.status})`,
        );
      }

      if (!responseData.success) {
        throw new Error(
          responseData?.message || "Unable to submit enrollment.",
        );
      }

      setSuccessMessage(
        responseData.message ||
          "Your enrollment has been submitted successfully and is now pending Registrar review.",
      );

      /*
       * Reload immediately.
       *
       * Before:
       * Draft
       *
       * After:
       * Pending
       *
       * Therefore:
       * - Submit button disappears
       * - Pending notice appears
       * - Subjects remain read-only
       */
      await loadEnrollment(user.user_id);
    } catch (error) {
      console.error("SUBMIT ENROLLMENT ERROR:", error);

      setError(
        error instanceof Error ? error.message : "Unable to submit enrollment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ============================================================
  // SUBJECT RENDERER
  // ============================================================

  function renderSubject(subject: Subject) {
    const assignedSection = subject.assigned_section;

    const enrollmentSubjectStatus = subject.enrollment_subject_status;

    const isRetake = subject.enrollment_type === "Retake";

    return (
      <div
        key={subject.enrollment_subject_id ?? subject.subject_id}
        className={`subject-card ${isRetake ? "retake-subject" : ""}`}
      >
        {/* ==================================================
            SUBJECT HEADER
        ================================================== */}

        <div className="subject-header">
          <div className="subject-number">
            {isRetake ? "R" : subject.display_order}
          </div>

          <div className="subject-main">
            <div className="subject-code-row">
              <span className="subject-code">{subject.subject_code}</span>

              {isRetake ? (
                <span className="subject-badge retake">Retake</span>
              ) : (
                <span className="subject-badge regular">Regular</span>
              )}
            </div>

            <h3>{subject.subject_name}</h3>

            <div className="subject-details">
              <span>{subject.units} Units</span>

              <span>Lecture: {subject.lecture_hours}h</span>

              <span>Laboratory: {subject.laboratory_hours}h</span>
            </div>
          </div>

          <div className="academic-status">
            {isRetake ? (
              <>
                <span className="status-badge failed">
                  Previous Grade: {subject.previous_grade ?? "—"}
                </span>

                {subject.remarks && <small>{subject.remarks}</small>}
              </>
            ) : (
              <span className="status-badge">{subject.academic_status}</span>
            )}
          </div>
        </div>

        {/* ==================================================
            ASSIGNED SECTION
        ================================================== */}

        <div className="section-area">
          <div className="section-area-header">
            <div>
              <strong>Assigned Section</strong>

              <span>
                {assignedSection
                  ? "Prepared by Registrar"
                  : "No section assigned yet"}
              </span>
            </div>

            {enrollmentSubjectStatus && (
              <span className="section-count">{enrollmentSubjectStatus}</span>
            )}
          </div>

          {/* ==================================================
              ASSIGNED SECTION
          ================================================== */}

          {assignedSection ? (
            <div className="assigned-section-card">
              <div className="assigned-section-main">
                <span className="section-radio" aria-label="Assigned section">
                  ✓
                </span>

                <div className="section-information">
                  <strong>{assignedSection.section_name}</strong>

                  <small>
                    {assignedSection.subject_code || subject.subject_code}
                  </small>
                </div>
              </div>

              <div className="section-capacity">
                {assignedSection.max_students &&
                assignedSection.max_students > 0 ? (
                  <>
                    <strong>
                      {assignedSection.enrolled_students ?? 0} /{" "}
                      {assignedSection.max_students}
                    </strong>

                    <small>Students</small>
                  </>
                ) : (
                  <small>Capacity unavailable</small>
                )}
              </div>

              <span className="section-status open">
                {assignedSection.status}
              </span>
            </div>
          ) : (
            <div className="no-sections">
              <span className="no-section-icon">—</span>

              <div>
                <strong>No section assigned</strong>

                <p>A section has not yet been assigned to this subject.</p>

                <small>
                  Please contact the Registrar if this subject should already
                  have an assigned section.
                </small>
              </div>
            </div>
          )}

          {/* ==================================================
              STUDENT READ-ONLY NOTICE
          ================================================== */}

          {assignedSection && (
            <div className="selected-section-message">
              <span>✓</span>

              <p>
                You are assigned to{" "}
                <strong>{assignedSection.section_name}</strong> for{" "}
                <strong>{subject.subject_code}</strong>.
                <br />
                <small>Section changes are handled by the Registrar.</small>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
}
