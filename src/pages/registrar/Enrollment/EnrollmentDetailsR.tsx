import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import "../../../styles/EnrollmementDetailsR.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/enrollments";

// =====================================================
// TYPES
// =====================================================

type EnrollmentStatus =
  | "Draft"
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Cancelled"
  | string;

interface EnrollmentDetails {
  enrollment_id: number;

  student: {
    student_id: number;
    user_id: number | null;
    student_number: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    student_name: string;
    username: string | null;
    email: string | null;
    gender: string | null;
    birth_date: string | null;
    contact_number: string | null;
    year_level: number | null;
  };

  course: {
    course_id: number | null;
    course_code: string | null;
    course_name: string | null;
  };

  student_section: {
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

  enrollment_status: EnrollmentStatus;
  remarks: string | null;

  approval: {
    approved_by: number | null;
    approved_by_username: string | null;
    approved_at: string | null;
  };

  created_at: string;
}

interface EnrollmentSubject {
  enrollment_subject_id: number;
  enrollment_id: number;

  subject_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
  lecture_hours: number | null;
  laboratory_hours: number | null;

  status: string;

  section: {
    section_id: number | null;
    section_name: string | null;
    year_level: number | null;
  };

  section_subject: {
    section_subject_id: number | null;
    status: string | null;
  };

  offering: {
    offering_id: number | null;
    status: string | null;
    schedule_days: string | null;
    schedule_time: string | null;
    max_students: number | null;
    enrolled_count: number;
    available_slots: number | null;
  };

  faculty: {
    faculty_id: number | null;
    username: string | null;
  };

  room: {
    room_id: number | null;
    room_name: string | null;
  };

  assignment_complete: boolean;
}

interface EnrollmentSummary {
  total_subjects: number;
  total_units: number;
  assigned_subjects: number;
  unassigned_subjects: number;
  all_subjects_assigned: boolean;
}

interface EnrollmentDetailsResponse {
  success: boolean;
  message?: string;
  error?: string;
  enrollment?: EnrollmentDetails;
  subjects?: EnrollmentSubject[];
  summary?: EnrollmentSummary;
}

interface ValidationIssue {
  code?: string;
  message?: string;
  category?: string;
  [key: string]: unknown;
}

interface PreviousGrade {
  grade_id?: number;
  final_grade?: number | null;
  classification?: string | null;
  result_code?: string | null;
  enrollment_id?: number | null;
  approved_by?: number | null;
  approved_at?: string | null;
}

interface PrerequisiteEvaluation {
  prerequisite_id?: number;
  subject_id?: number;
  subject_code?: string;
  subject_name?: string;
  required_for_attempt?: boolean;
  satisfied?: boolean;
  passed_grade?: number | null;
  bypassed_for_retake?: boolean;
  error?: string | null;
}

interface AcademicEligibility {
  eligible: boolean;
  attempt_type: "Regular" | "Retake" | string;
  is_retake: boolean;
  previous_grade: PreviousGrade | null;
  prerequisite_policy: string | null;
  prerequisites: PrerequisiteEvaluation[];
  errors: ValidationIssue[];
}

interface ValidationSubject {
  enrollment_subject_id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
  offering_id: number | null;
  section_id: number | null;
  section_name: string | null;
  section_subject_id: number | null;
  offering_status: string | null;
  section_subject_status: string | null;
  capacity: {
    max_students: number;
    enrolled_count: number;
    available_slots: number;
  };
  academic_eligibility?: AcademicEligibility;
  valid: boolean;
  errors: ValidationIssue[];
}

interface ValidationResponse {
  success: boolean;
  message?: string;
  error?: string;
  ready_for_approval: boolean;
  summary?: {
    total_enrolled_subjects: number;
    total_units: number;
    valid_subjects: number;
    invalid_subjects: number;
    error_count: number;
    warning_count: number;
  };
  subjects?: ValidationSubject[];
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
}

interface AvailableOffering {
  offering_id: number;

  subject: {
    subject_id: number;
    subject_code: string;
    subject_name: string;
    units: number;
    lecture_hours: number | null;
    laboratory_hours: number | null;
  };

  section: {
    section_id: number;
    section_name: string;
    year_level: number | null;
    course_id: number | null;
    course_code: string | null;
    course_name: string | null;
  };

  section_subject: {
    section_subject_id: number;
    status: string;
  };

  faculty: {
    faculty_id: number | null;
    faculty_name: string | null;
  };

  room: {
    room_id: number | null;
    room_name: string | null;
  };

  schedule: {
    days: string | null;
    time: string | null;
  };

  capacity: {
    max_students: number;
    enrolled_count: number;
    available_slots: number;
    is_full: boolean;
  };

  offering_status: string;
  academic_year_id: number;
  semester_id: number;
}

interface AvailableOfferingsResponse {
  success: boolean;
  message?: string;
  error?: string;
  count?: number;
  offerings?: AvailableOffering[];
}

interface AvailableSubjectOffering {
  offering_id: number;
  offering_status: string;

  section: {
    section_id: number;
    section_name: string;
    year_level: number | null;
    course_id: number | null;
    course_code: string | null;
    course_name: string | null;
  };

  section_subject: {
    section_subject_id: number;
    status: string;
  };

  faculty: {
    faculty_id: number | null;
    faculty_name: string | null;
  };

  room: {
    room_id: number | null;
    room_name: string | null;
  };

  schedule: {
    days: string | null;
    time: string | null;
  };

  capacity: {
    max_students: number;
    enrolled_count: number;
    available_slots: number;
    is_full: boolean;
  };

  academic_year_id: number;
  semester_id: number;
}

interface AvailableSubject {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
  lecture_hours: number | null;
  laboratory_hours: number | null;
  offering_count: number;
  available_offerings: AvailableSubjectOffering[];
  academic_eligibility?: AcademicEligibility;
}

interface AvailableSubjectsResponse {
  success: boolean;
  message?: string;
  error?: string;
  total_subjects?: number;
  total_offerings?: number;
  subjects?: AvailableSubject[];
}

interface MutationResponse {
  success: boolean;
  message?: string;
  error?: string;
  ready_for_approval?: boolean;
  validation_errors?: ValidationIssue[];
  errors?: ValidationIssue[];
  academic_eligibility?: AcademicEligibility;
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
// COMPONENT
// =====================================================

export default function EnrollmentDetailsR() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // Keep the session object stable for this page mount.
  // authService.getSession() parses sessionStorage and can return a new object
  // on every render; using that object directly in effect dependencies causes
  // the enrollment-loading effect to run again after every state update.
  const [user] = useState(() => authService.getSession());
  const userRole = user?.role;

  const enrollmentId = useMemo(() => {
    const value = Number(id);

    return Number.isInteger(value) && value > 0 ? value : null;
  }, [id]);

  // =====================================================
  // CORE DATA
  // =====================================================

  const [enrollment, setEnrollment] = useState<EnrollmentDetails | null>(null);
  const [subjects, setSubjects] = useState<EnrollmentSubject[]>([]);
  const [summary, setSummary] = useState<EnrollmentSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =====================================================
  // VALIDATION
  // =====================================================

  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState("");

  // =====================================================
  // ASSIGNMENT PANEL
  // =====================================================

  const [selectedSubject, setSelectedSubject] =
    useState<EnrollmentSubject | null>(null);
  const [availableOfferings, setAvailableOfferings] = useState<
    AvailableOffering[]
  >([]);
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState(
    "Assigned by Registrar.",
  );
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  // =====================================================
  // ADD SUBJECT PANEL
  // =====================================================

  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<
    AvailableSubject[]
  >([]);
  const [availableSubjectsLoading, setAvailableSubjectsLoading] =
    useState(false);
  const [selectedAddSubjectId, setSelectedAddSubjectId] = useState("");
  const [selectedAddOfferingId, setSelectedAddOfferingId] = useState("");
  const [addSubjectReason, setAddSubjectReason] = useState(
    "Registrar added subject.",
  );
  const [addSubjectLoading, setAddSubjectLoading] = useState(false);

  // =====================================================
  // APPROVAL
  // =====================================================

  const [approvalRemarks, setApprovalRemarks] = useState(
    "Registrar verified enrollment subjects, offerings, academic eligibility, and capacity.",
  );
  const [approvalLoading, setApprovalLoading] = useState(false);

  // =====================================================
  // FEEDBACK / REFRESH
  // =====================================================

  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // =====================================================
  // AUTH
  // =====================================================

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    if (userRole !== "Registrar") {
      navigate(authService.getDashboardRoute(user.role), {
        replace: true,
      });
    }
  }, [user, userRole, navigate]);

  const handleUnauthorized = useCallback(() => {
    authService.logout();
    navigate("/login", { replace: true });
  }, [navigate]);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  // =====================================================
  // LOAD DETAILS
  // =====================================================

  useEffect(() => {
    if (!user || userRole !== "Registrar") {
      return;
    }

    if (!enrollmentId) {
      setEnrollment(null);
      setSubjects([]);
      setSummary(null);
      setError("Invalid enrollment ID.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadEnrollment = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await authService.authFetch(
          `${API_BASE_URL}/${enrollmentId}`,
          {
            method: "GET",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        const data =
          await readJsonResponse<EnrollmentDetailsResponse>(response);

        if (response.status === 403) {
          throw new Error(data.message || "Registrar access is required.");
        }

        if (!response.ok || !data.success || !data.enrollment) {
          throw new Error(
            data.message || data.error || "Failed to fetch enrollment details.",
          );
        }

        setEnrollment(data.enrollment);
        setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
        setSummary(data.summary || null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        console.error("GET ENROLLMENT DETAILS ERROR:", requestError);

        setEnrollment(null);
        setSubjects([]);
        setSummary(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load enrollment details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadEnrollment();

    return () => controller.abort();
  }, [enrollmentId, user, userRole, refreshKey, handleUnauthorized]);

  // =====================================================
  // LOAD VALIDATION
  // =====================================================

  const loadValidation = useCallback(async () => {
    if (!enrollmentId || !user || userRole !== "Registrar") {
      return;
    }

    try {
      setValidationLoading(true);
      setValidationError("");

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/validate`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await readJsonResponse<ValidationResponse>(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Failed to validate enrollment.",
        );
      }

      setValidation(data);
    } catch (requestError) {
      console.error("VALIDATE ENROLLMENT ERROR:", requestError);
      setValidation(null);
      setValidationError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to validate enrollment.",
      );
    } finally {
      setValidationLoading(false);
    }
  }, [enrollmentId, user, userRole, handleUnauthorized]);

  useEffect(() => {
    if (!enrollment || !enrollmentId) {
      return;
    }

    void loadValidation();
  }, [enrollment, enrollmentId, refreshKey, loadValidation]);

  // =====================================================
  // VALIDATION LOOKUP
  // =====================================================

  const validationByEnrollmentSubjectId = useMemo(() => {
    const map = new Map<number, ValidationSubject>();

    for (const item of validation?.subjects || []) {
      map.set(Number(item.enrollment_subject_id), item);
    }

    return map;
  }, [validation?.subjects]);

  // =====================================================
  // OPEN ASSIGNMENT PANEL
  // =====================================================

  const openAssignment = async (subject: EnrollmentSubject) => {
    if (!enrollmentId) {
      return;
    }

    try {
      setSelectedSubject(subject);
      setAvailableOfferings([]);
      setSelectedOfferingId(
        subject.offering.offering_id
          ? String(subject.offering.offering_id)
          : "",
      );
      setAssignmentReason(
        subject.assignment_complete
          ? "Registrar changed the student's subject offering."
          : "Assigned by Registrar.",
      );
      setActionError("");
      setSuccessMessage("");
      setOfferingsLoading(true);

      const params = new URLSearchParams();
      params.set("subject_id", String(subject.subject_id));

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/available-offerings?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await readJsonResponse<AvailableOfferingsResponse>(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error ||
            "Failed to load available subject offerings.",
        );
      }

      setAvailableOfferings(
        Array.isArray(data.offerings) ? data.offerings : [],
      );
    } catch (requestError) {
      console.error("LOAD AVAILABLE OFFERINGS ERROR:", requestError);
      setAvailableOfferings([]);
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load available offerings.",
      );
    } finally {
      setOfferingsLoading(false);
    }
  };

  const closeAssignment = (force = false) => {
    if (assignmentLoading && !force) {
      return;
    }

    setSelectedSubject(null);
    setAvailableOfferings([]);
    setSelectedOfferingId("");
    setAssignmentReason("Assigned by Registrar.");
  };

  // =====================================================
  // ASSIGN / CHANGE OFFERING
  // =====================================================

  const saveAssignment = async () => {
    if (!enrollmentId || !selectedSubject) {
      return;
    }

    const offeringId = Number(selectedOfferingId);

    if (!Number.isInteger(offeringId) || offeringId <= 0) {
      setActionError("Select a valid available offering.");
      return;
    }

    try {
      setAssignmentLoading(true);
      setActionError("");
      setSuccessMessage("");

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/subjects/${selectedSubject.enrollment_subject_id}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            offering_id: offeringId,
            reason: assignmentReason.trim() || "Assigned by Registrar.",
          }),
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await readJsonResponse<MutationResponse>(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Failed to assign subject offering.",
        );
      }

      setSuccessMessage(
        data.message || "Subject offering assigned successfully.",
      );

      closeAssignment(true);
      refresh();
    } catch (requestError) {
      console.error("ASSIGN SUBJECT OFFERING ERROR:", requestError);
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to assign the selected offering.",
      );
    } finally {
      setAssignmentLoading(false);
    }
  };

  // =====================================================
  // ADD SUBJECT
  // =====================================================

  const selectedAddSubject = useMemo(() => {
    const subjectId = Number(selectedAddSubjectId);

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return null;
    }

    return (
      availableSubjects.find((subject) => subject.subject_id === subjectId) ||
      null
    );
  }, [availableSubjects, selectedAddSubjectId]);

  const selectedAddOffering = useMemo(() => {
    const offeringId = Number(selectedAddOfferingId);

    if (
      !selectedAddSubject ||
      !Number.isInteger(offeringId) ||
      offeringId <= 0
    ) {
      return null;
    }

    return (
      selectedAddSubject.available_offerings.find(
        (offering) => offering.offering_id === offeringId,
      ) || null
    );
  }, [selectedAddSubject, selectedAddOfferingId]);

  const resetAddSubjectPanel = () => {
    setAddSubjectOpen(false);
    setAvailableSubjects([]);
    setSelectedAddSubjectId("");
    setSelectedAddOfferingId("");
    setAddSubjectReason("Registrar added subject.");
  };

  const closeAddSubject = () => {
    if (addSubjectLoading || availableSubjectsLoading) {
      return;
    }

    resetAddSubjectPanel();
  };

  const openAddSubject = async () => {
    if (!enrollmentId || !enrollment) {
      return;
    }

    if (
      !["Pending", "Approved"].includes(String(enrollment.enrollment_status))
    ) {
      setActionError(
        `Subjects cannot be added while enrollment status is '${enrollment.enrollment_status}'.`,
      );
      return;
    }

    try {
      closeAssignment(true);
      setAddSubjectOpen(true);
      setAvailableSubjects([]);
      setSelectedAddSubjectId("");
      setSelectedAddOfferingId("");
      setAddSubjectReason("Registrar added subject.");
      setActionError("");
      setSuccessMessage("");
      setAvailableSubjectsLoading(true);

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/available-subjects`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await readJsonResponse<AvailableSubjectsResponse>(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error ||
            "Failed to load subjects available for addition.",
        );
      }

      setAvailableSubjects(Array.isArray(data.subjects) ? data.subjects : []);
    } catch (requestError) {
      console.error("LOAD AVAILABLE SUBJECTS ERROR:", requestError);
      setAvailableSubjects([]);
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load subjects available for addition.",
      );
    } finally {
      setAvailableSubjectsLoading(false);
    }
  };

  const addSelectedSubject = async () => {
    if (!enrollmentId || !selectedAddSubject || !selectedAddOffering) {
      setActionError("Select a subject and one of its available offerings.");
      return;
    }

    if (selectedAddSubject.academic_eligibility?.eligible === false) {
      const academicMessage = selectedAddSubject.academic_eligibility.errors
        .map((issue) => issue.message || issue.code)
        .filter(Boolean)
        .join(" ");

      setActionError(
        academicMessage || "The selected subject is not academically eligible.",
      );
      return;
    }

    try {
      setAddSubjectLoading(true);
      setActionError("");
      setSuccessMessage("");

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/subjects`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            offering_id: selectedAddOffering.offering_id,
            reason: addSubjectReason.trim() || "Registrar added subject.",
          }),
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await readJsonResponse<MutationResponse>(response);

      if (!response.ok || !data.success) {
        const issueMessages = [
          ...(Array.isArray(data.validation_errors)
            ? data.validation_errors
            : []),
          ...(Array.isArray(data.errors) ? data.errors : []),
          ...(Array.isArray(data.academic_eligibility?.errors)
            ? data.academic_eligibility.errors
            : []),
        ]
          .map((issue) => issue.message || issue.code)
          .filter(Boolean)
          .join(" ");

        throw new Error(
          issueMessages ||
            data.message ||
            data.error ||
            "Failed to add subject to enrollment.",
        );
      }

      setSuccessMessage(
        data.message || "Subject added to enrollment successfully.",
      );
      resetAddSubjectPanel();
      refresh();
    } catch (requestError) {
      console.error("ADD SUBJECT ERROR:", requestError);
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add the selected subject.",
      );
    } finally {
      setAddSubjectLoading(false);
    }
  };

  // =====================================================
  // APPROVE
  // =====================================================

  const approveEnrollment = async () => {
    if (!enrollmentId || !enrollment) {
      return;
    }

    if (enrollment.enrollment_status !== "Pending") {
      setActionError("Only Pending enrollments can be approved.");
      return;
    }

    if (!validation?.ready_for_approval) {
      setActionError(
        "Enrollment is not ready for approval. Resolve all validation errors first.",
      );
      return;
    }

    try {
      setApprovalLoading(true);
      setActionError("");
      setSuccessMessage("");

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/approve`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            remarks: approvalRemarks.trim() || undefined,
          }),
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await readJsonResponse<MutationResponse>(response);

      if (!response.ok || !data.success) {
        const validationMessages = Array.isArray(data.validation_errors)
          ? data.validation_errors
              .map((item) => item.message)
              .filter(Boolean)
              .join(" ")
          : "";

        throw new Error(
          validationMessages ||
            data.message ||
            data.error ||
            "Failed to approve enrollment.",
        );
      }

      setSuccessMessage(data.message || "Enrollment approved successfully.");

      refresh();
    } catch (requestError) {
      console.error("APPROVE ENROLLMENT ERROR:", requestError);
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to approve enrollment.",
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  // =====================================================
  // HELPERS
  // =====================================================

  const getStatusClass = (value: string) =>
    `status ${value.toLowerCase().replace(/\s+/g, "-")}`;

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
      return "Not assigned";
    }

    if (!days) {
      return time || "Not assigned";
    }

    if (!time) {
      return days;
    }

    return `${days} • ${time}`;
  };

  const getAttemptType = (subject: EnrollmentSubject) => {
    const validationSubject = validationByEnrollmentSubjectId.get(
      subject.enrollment_subject_id,
    );

    return validationSubject?.academic_eligibility?.attempt_type || "Regular";
  };

  // =====================================================
  // GUARD
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
            <p>
              Review student subjects, academic eligibility, offering
              assignments, and final enrollment validation.
            </p>
          </div>

          <span className={getStatusClass(enrollment.enrollment_status)}>
            {enrollment.enrollment_status}
          </span>
        </div>

        {successMessage && (
          <div className="remarks-box">
            <strong>{successMessage}</strong>
          </div>
        )}

        {actionError && (
          <div className="enrollment-details-error">
            <p>{actionError}</p>
          </div>
        )}

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <h2>Student Information</h2>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span>Student Number</span>
              <strong>{enrollment.student.student_number}</strong>
            </div>

            <div className="detail-item">
              <span>Student Name</span>
              <strong>{enrollment.student.student_name}</strong>
            </div>

            <div className="detail-item">
              <span>Year Level</span>
              <strong>
                {enrollment.student.year_level
                  ? `Year ${enrollment.student.year_level}`
                  : "—"}
              </strong>
            </div>

            <div className="detail-item">
              <span>Gender</span>
              <strong>{enrollment.student.gender || "—"}</strong>
            </div>

            <div className="detail-item">
              <span>Contact Number</span>
              <strong>{enrollment.student.contact_number || "—"}</strong>
            </div>

            <div className="detail-item">
              <span>Email</span>
              <strong>{enrollment.student.email || "—"}</strong>
            </div>
          </div>
        </div>

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <h2>Enrollment Information</h2>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span>Course</span>
              <strong>
                {enrollment.course.course_code || "—"}
                {enrollment.course.course_name
                  ? ` — ${enrollment.course.course_name}`
                  : ""}
              </strong>
            </div>

            <div className="detail-item">
              <span>Student Section</span>
              <strong>
                {enrollment.student_section.section_name || "Not Assigned"}
              </strong>
            </div>

            <div className="detail-item">
              <span>Academic Year</span>
              <strong>{enrollment.academic_period.academic_year}</strong>
            </div>

            <div className="detail-item">
              <span>Semester</span>
              <strong>{enrollment.academic_period.semester_name}</strong>
            </div>

            <div className="detail-item">
              <span>Total Subjects</span>
              <strong>{summary?.total_subjects ?? subjects.length}</strong>
            </div>

            <div className="detail-item">
              <span>Total Units</span>
              <strong>{summary?.total_units ?? 0}</strong>
            </div>

            <div className="detail-item">
              <span>Assigned</span>
              <strong>{summary?.assigned_subjects ?? 0}</strong>
            </div>

            <div className="detail-item">
              <span>Unassigned</span>
              <strong>{summary?.unassigned_subjects ?? 0}</strong>
            </div>

            <div className="detail-item">
              <span>Created</span>
              <strong>{formatDate(enrollment.created_at)}</strong>
            </div>

            <div className="detail-item">
              <span>Approved By</span>
              <strong>{enrollment.approval.approved_by_username || "—"}</strong>
            </div>

            <div className="detail-item">
              <span>Approved At</span>
              <strong>{formatDate(enrollment.approval.approved_at)}</strong>
            </div>
          </div>

          {enrollment.remarks && (
            <div className="remarks-box">
              <span>Remarks</span>
              <p>{enrollment.remarks}</p>
            </div>
          )}
        </div>

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <div>
              <h2>Enrollment Validation</h2>
              <span>
                Structural assignment + academic eligibility + capacity
              </span>
            </div>

            <button
              type="button"
              className="subject-action-btn"
              disabled={validationLoading}
              onClick={() => void loadValidation()}
            >
              {validationLoading ? "Validating..." : "Validate"}
            </button>
          </div>

          {validationError && (
            <div className="enrollment-details-error">
              <p>{validationError}</p>
            </div>
          )}

          {validation && (
            <div className="details-grid">
              <div className="detail-item">
                <span>Ready for Approval</span>
                <strong>{validation.ready_for_approval ? "YES" : "NO"}</strong>
              </div>

              <div className="detail-item">
                <span>Valid Subjects</span>
                <strong>{validation.summary?.valid_subjects ?? 0}</strong>
              </div>

              <div className="detail-item">
                <span>Invalid Subjects</span>
                <strong>{validation.summary?.invalid_subjects ?? 0}</strong>
              </div>

              <div className="detail-item">
                <span>Errors</span>
                <strong>{validation.summary?.error_count ?? 0}</strong>
              </div>

              <div className="detail-item">
                <span>Warnings</span>
                <strong>{validation.summary?.warning_count ?? 0}</strong>
              </div>
            </div>
          )}

          {validation && (validation.errors?.length || 0) > 0 && (
            <div className="remarks-box">
              <span>Validation Errors</span>
              <ul>
                {(validation.errors || []).map((issue, index) => (
                  <li key={`${issue.code || "error"}-${index}`}>
                    {issue.message || issue.code || "Validation error"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <div>
              <h2>Enrolled Subjects</h2>
              <span>
                {summary?.total_subjects ?? subjects.length} active subject
                {(summary?.total_subjects ?? subjects.length) !== 1 ? "s" : ""}
              </span>
            </div>

            <button
              type="button"
              className="subject-action-btn"
              disabled={
                addSubjectLoading ||
                availableSubjectsLoading ||
                !["Pending", "Approved"].includes(
                  String(enrollment.enrollment_status),
                )
              }
              onClick={() => void openAddSubject()}
            >
              {availableSubjectsLoading ? "Loading..." : "+ Add Subject"}
            </button>
          </div>

          <div className="subjects-table-wrapper">
            <table className="subjects-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Subject</th>
                  <th>Attempt</th>
                  <th>Units</th>
                  <th>Section</th>
                  <th>Schedule</th>
                  <th>Faculty</th>
                  <th>Room</th>
                  <th>Capacity</th>
                  <th>Validation</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {subjects.length === 0 && (
                  <tr>
                    <td colSpan={11} className="subjects-empty">
                      No enrolled subjects found.
                    </td>
                  </tr>
                )}

                {subjects.map((subject) => {
                  const validationSubject = validationByEnrollmentSubjectId.get(
                    subject.enrollment_subject_id,
                  );

                  const attemptType = getAttemptType(subject);

                  return (
                    <tr key={subject.enrollment_subject_id}>
                      <td>
                        <strong>{subject.subject_code}</strong>
                      </td>

                      <td>
                        <div className="subject-name-cell">
                          <strong>{subject.subject_name}</strong>
                          <small>{subject.status}</small>
                        </div>
                      </td>

                      <td>
                        <span className={getStatusClass(attemptType)}>
                          {attemptType}
                        </span>
                      </td>

                      <td>{subject.units}</td>

                      <td>{subject.section.section_name || "Not Assigned"}</td>

                      <td>
                        {formatSchedule(
                          subject.offering.schedule_days,
                          subject.offering.schedule_time,
                        )}
                      </td>

                      <td>{subject.faculty.username || "Not Assigned"}</td>

                      <td>{subject.room.room_name || "—"}</td>

                      <td>
                        {subject.offering.max_students !== null
                          ? `${subject.offering.enrolled_count}/${subject.offering.max_students}`
                          : "—"}
                      </td>

                      <td>
                        {validationLoading ? (
                          "Checking..."
                        ) : validationSubject ? (
                          <span
                            className={getStatusClass(
                              validationSubject.valid ? "Valid" : "Invalid",
                            )}
                          >
                            {validationSubject.valid ? "VALID" : "INVALID"}
                          </span>
                        ) : (
                          "—"
                        )}

                        {validationSubject &&
                          validationSubject.errors.length > 0 && (
                            <small>
                              {validationSubject.errors
                                .map((item) => item.message || item.code)
                                .filter(Boolean)
                                .join(" • ")}
                            </small>
                          )}
                      </td>

                      <td>
                        {subject.status === "Enrolled" ? (
                          <button
                            type="button"
                            className="subject-action-btn"
                            onClick={() => void openAssignment(subject)}
                          >
                            {subject.assignment_complete ? "Change" : "Assign"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {addSubjectOpen && (
          <div className="enrollment-details-card">
            <div className="details-card-header">
              <div>
                <h2>Add Subject</h2>
                <span>
                  Select an academically valid subject and one READY / Open
                  offering. The backend remains authoritative.
                </span>
              </div>
            </div>

            {availableSubjectsLoading ? (
              <div className="enrollment-details-loading">
                Loading subjects available for addition...
              </div>
            ) : (
              <>
                <div className="details-grid">
                  <div className="detail-item">
                    <span>Subject</span>
                    <select
                      value={selectedAddSubjectId}
                      disabled={addSubjectLoading}
                      onChange={(event) => {
                        setSelectedAddSubjectId(event.target.value);
                        setSelectedAddOfferingId("");
                        setActionError("");
                      }}
                    >
                      <option value="">Select subject</option>

                      {availableSubjects.map((subject) => {
                        const eligibility = subject.academic_eligibility;
                        const eligibilitySuffix = eligibility
                          ? eligibility.eligible
                            ? ` · ${eligibility.attempt_type}`
                            : " · BLOCKED"
                          : "";

                        return (
                          <option
                            key={subject.subject_id}
                            value={subject.subject_id}
                            disabled={eligibility?.eligible === false}
                          >
                            {subject.subject_code} — {subject.subject_name} ·{" "}
                            {subject.units} unit{subject.units !== 1 ? "s" : ""}
                            {eligibilitySuffix}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="detail-item">
                    <span>Offering</span>
                    <select
                      value={selectedAddOfferingId}
                      disabled={addSubjectLoading || !selectedAddSubject}
                      onChange={(event) =>
                        setSelectedAddOfferingId(event.target.value)
                      }
                    >
                      <option value="">Select offering</option>

                      {(selectedAddSubject?.available_offerings || []).map(
                        (offering) => (
                          <option
                            key={offering.offering_id}
                            value={offering.offering_id}
                          >
                            #{offering.offering_id} ·{" "}
                            {offering.section.section_name}
                            {" · "}
                            {offering.faculty.faculty_name ||
                              "Faculty not assigned"}
                            {" · "}
                            {formatSchedule(
                              offering.schedule.days,
                              offering.schedule.time,
                            )}
                            {" · "}
                            {offering.capacity.available_slots} slot
                            {offering.capacity.available_slots !== 1 ? "s" : ""}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="detail-item">
                    <span>Reason</span>
                    <textarea
                      value={addSubjectReason}
                      disabled={addSubjectLoading}
                      onChange={(event) =>
                        setAddSubjectReason(event.target.value)
                      }
                    />
                  </div>
                </div>

                {selectedAddSubject?.academic_eligibility && (
                  <div className="remarks-box">
                    <span>Academic Eligibility</span>
                    <p>
                      <strong>
                        {selectedAddSubject.academic_eligibility.eligible
                          ? "ELIGIBLE"
                          : "BLOCKED"}
                      </strong>
                      {" · "}
                      Attempt:{" "}
                      {selectedAddSubject.academic_eligibility.attempt_type ||
                        "—"}
                    </p>

                    {selectedAddSubject.academic_eligibility.previous_grade && (
                      <p>
                        Previous approved grade:{" "}
                        {selectedAddSubject.academic_eligibility.previous_grade
                          .final_grade ?? "—"}
                        {selectedAddSubject.academic_eligibility.previous_grade
                          .classification
                          ? ` (${selectedAddSubject.academic_eligibility.previous_grade.classification})`
                          : ""}
                      </p>
                    )}

                    {selectedAddSubject.academic_eligibility.errors.length >
                      0 && (
                      <ul>
                        {selectedAddSubject.academic_eligibility.errors.map(
                          (issue, index) => (
                            <li key={`${issue.code || "academic"}-${index}`}>
                              {issue.message ||
                                issue.code ||
                                "Academic validation error"}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                )}

                {availableSubjects.length === 0 && (
                  <div className="remarks-box">
                    <p>
                      No subject with an available READY / Open offering can be
                      added to this enrollment right now.
                    </p>
                  </div>
                )}

                {selectedAddSubject &&
                  selectedAddSubject.available_offerings.length === 0 && (
                    <div className="remarks-box">
                      <p>
                        The selected subject does not currently have an
                        available READY / Open offering with capacity.
                      </p>
                    </div>
                  )}

                <div className="enrollment-details-actions">
                  <button
                    type="button"
                    className="reject-enrollment-btn"
                    disabled={addSubjectLoading}
                    onClick={() => closeAddSubject()}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="approve-enrollment-btn"
                    disabled={
                      addSubjectLoading ||
                      !selectedAddSubject ||
                      !selectedAddOffering ||
                      selectedAddSubject.academic_eligibility?.eligible ===
                        false
                    }
                    onClick={() => void addSelectedSubject()}
                  >
                    {addSubjectLoading ? "Adding..." : "Add Subject"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {selectedSubject && (
          <div className="enrollment-details-card">
            <div className="details-card-header">
              <div>
                <h2>
                  {selectedSubject.assignment_complete
                    ? "Change Offering"
                    : "Assign Offering"}
                </h2>
                <span>
                  {selectedSubject.subject_code} —{" "}
                  {selectedSubject.subject_name}
                </span>
              </div>
            </div>

            {offeringsLoading ? (
              <div className="enrollment-details-loading">
                Loading available offerings...
              </div>
            ) : (
              <>
                <div className="details-grid">
                  <div className="detail-item">
                    <span>Available Offering</span>
                    <select
                      value={selectedOfferingId}
                      disabled={assignmentLoading}
                      onChange={(event) =>
                        setSelectedOfferingId(event.target.value)
                      }
                    >
                      <option value="">Select offering</option>

                      {availableOfferings.map((offering) => (
                        <option
                          key={offering.offering_id}
                          value={offering.offering_id}
                        >
                          #{offering.offering_id} ·{" "}
                          {offering.section.section_name} ·{" "}
                          {offering.faculty.faculty_name ||
                            "Faculty not assigned"}{" "}
                          ·{" "}
                          {formatSchedule(
                            offering.schedule.days,
                            offering.schedule.time,
                          )}{" "}
                          · {offering.capacity.available_slots} slot
                          {offering.capacity.available_slots !== 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="detail-item">
                    <span>Reason</span>
                    <textarea
                      value={assignmentReason}
                      disabled={assignmentLoading}
                      onChange={(event) =>
                        setAssignmentReason(event.target.value)
                      }
                    />
                  </div>
                </div>

                {availableOfferings.length === 0 && (
                  <div className="remarks-box">
                    <p>
                      No READY / Open offering is currently available for this
                      subject in the enrollment's academic period.
                    </p>
                  </div>
                )}

                <div className="enrollment-details-actions">
                  <button
                    type="button"
                    className="reject-enrollment-btn"
                    disabled={assignmentLoading}
                    onClick={() => closeAssignment()}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="approve-enrollment-btn"
                    disabled={
                      assignmentLoading ||
                      !selectedOfferingId ||
                      availableOfferings.length === 0
                    }
                    onClick={() => void saveAssignment()}
                  >
                    {assignmentLoading ? "Saving..." : "Save Assignment"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="enrollment-details-card">
          <div className="details-card-header">
            <div>
              <h2>Final Approval</h2>
              <span>
                Approval is available only when final validation has no errors.
              </span>
            </div>
          </div>

          {enrollment.enrollment_status === "Pending" ? (
            <>
              <div className="remarks-box">
                <span>Approval Remarks</span>
                <textarea
                  value={approvalRemarks}
                  disabled={approvalLoading}
                  onChange={(event) => setApprovalRemarks(event.target.value)}
                />
              </div>

              <div className="enrollment-details-actions">
                <button
                  type="button"
                  className="subject-action-btn"
                  disabled={validationLoading || approvalLoading}
                  onClick={() => void loadValidation()}
                >
                  {validationLoading ? "Validating..." : "Validate Enrollment"}
                </button>

                <button
                  type="button"
                  className="approve-enrollment-btn"
                  disabled={
                    approvalLoading ||
                    validationLoading ||
                    !validation?.ready_for_approval
                  }
                  onClick={() => void approveEnrollment()}
                >
                  {approvalLoading ? "Approving..." : "Approve Enrollment"}
                </button>
              </div>
            </>
          ) : (
            <div className="remarks-box">
              <p>
                Enrollment status is{" "}
                <strong>{enrollment.enrollment_status}</strong>. Final approval
                action is available only for Pending enrollment.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
