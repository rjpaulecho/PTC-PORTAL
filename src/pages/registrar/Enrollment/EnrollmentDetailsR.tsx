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

interface RawValidationPlacement {
  offering_id?: number | null;
  section_id?: number | null;
  section_subject_id?: number | null;
  section_name?: string | null;
}

interface RawValidationCapacity {
  max_students?: number | null;
  enrolled_count?: number | null;
  available_slots?: number | null;
}

interface RawValidationSubject {
  enrollment_subject_id?: number;
  subject_id?: number;
  subject_code?: string;
  subject_name?: string;
  units?: number;
  offering_id?: number | null;
  section_id?: number | null;
  section_name?: string | null;
  section_subject_id?: number | null;
  offering_status?: string | null;
  section_subject_status?: string | null;
  placement?: RawValidationPlacement;
  capacity?: RawValidationCapacity;
  academic_eligibility?: AcademicEligibility;
  valid?: boolean;
  errors?: ValidationIssue[];
}

interface RawValidationSummary {
  total_enrolled_subjects?: number;
  active_subjects?: number;
  total_units?: number;
  valid_subjects?: number;
  invalid_subjects?: number;
  error_count?: number;
  warning_count?: number;
  validation_errors?: number;
  validation_warnings?: number;
}

interface RawValidationResponse {
  success: boolean;
  message?: string;
  error?: string;
  valid?: boolean;
  can_approve?: boolean;
  ready_for_approval?: boolean;
  summary?: RawValidationSummary;
  subjects?: RawValidationSubject[];
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
  subject_filter?: number | null;
  count?: number;
  offerings?: AvailableOffering[];
  enrollment?: {
    enrollment_id: number;
    student_id: number;
    student_number: string;
    student_name: string;
    course_id: number;
    course_code: string | null;
    course_name: string | null;
    academic_year_id: number;
    academic_year: string;
    semester_id: number;
    semester_name: string;
    enrollment_status: string;
  };
  actor?: {
    user_id: number;
    username: string | null;
  };
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

interface BulkSectionOption {
  section_id: number;
  section_name: string;
  year_level: number | null;
  course_id: number | null;
  course_code: string | null;
  course_name: string | null;
  ready_subject_count: number;
  ready_offering_count: number;
}

interface BulkSectionAssignmentResponse {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;

  section?: {
    section_id: number;
    section_name: string;
  };

  summary?: {
    total_active_subjects?: number;
    regular_subjects?: number;
    assigned?: number;
    already_correct?: number;
    manual_subjects?: number;
    errors?: number;
  };

  errors?: Array<{
    subject_code?: string;
    message?: string;
    code?: string;
  }>;
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
  const [token] = useState(() => authService.getToken());

  const userRole = user?.role;
  const authenticated = Boolean(user && token);

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
  // BULK SECTION PLACEMENT
  // =====================================================

  const [bulkSectionOpen, setBulkSectionOpen] = useState(false);
  const [bulkSectionOptions, setBulkSectionOptions] = useState<
    BulkSectionOption[]
  >([]);
  const [bulkSectionOptionsLoading, setBulkSectionOptionsLoading] =
    useState(false);
  const [selectedBulkSectionId, setSelectedBulkSectionId] = useState("");
  const [bulkSectionReason, setBulkSectionReason] = useState(
    "Registrar assigned regular subjects to the selected section.",
  );
  const [bulkSectionLoading, setBulkSectionLoading] = useState(false);
  const [bulkSectionError, setBulkSectionError] = useState("");

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
  // REJECTION
  // =====================================================

  const [rejectionRemarks, setRejectionRemarks] = useState("");
  const [rejectionLoading, setRejectionLoading] = useState(false);

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
    if (!authenticated || !user) {
      authService.logout();
      navigate("/login", { replace: true });
      return;
    }

    if (userRole !== "Registrar") {
      navigate(authService.getDashboardRoute(user.role), {
        replace: true,
      });
    }
  }, [authenticated, user, userRole, navigate]);

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
    if (!authenticated || !user || userRole !== "Registrar") {
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

        const semesterId = Number(data.enrollment.academic_period.semester_id);

        if (![1, 2].includes(semesterId)) {
          throw new Error(
            "This enrollment uses an unsupported semester. The PTC Portal enrollment workflow supports only First Semester and Second Semester.",
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
  }, [
    authenticated,
    enrollmentId,
    user,
    userRole,
    refreshKey,
    handleUnauthorized,
  ]);

  // =====================================================
  // LOAD VALIDATION
  // =====================================================

  const loadValidation = useCallback(async () => {
    if (!authenticated || !enrollmentId || !user || userRole !== "Registrar") {
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

      // The Registrar validation backend currently returns the newer contract:
      //
      //   valid
      //   can_approve
      //   summary.active_subjects
      //   summary.validation_errors
      //   summary.validation_warnings
      //   subjects[].placement
      //
      // Older frontend builds expected:
      //
      //   ready_for_approval
      //   summary.valid_subjects
      //   summary.invalid_subjects
      //   summary.error_count
      //   summary.warning_count
      //
      // Normalize the API response here so the rest of this page has one
      // stable validation contract.
      const data = await readJsonResponse<RawValidationResponse>(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Failed to validate enrollment.",
        );
      }

      const rawSubjects = Array.isArray(data.subjects) ? data.subjects : [];
      const rawErrors = Array.isArray(data.errors) ? data.errors : [];
      const rawWarnings = Array.isArray(data.warnings) ? data.warnings : [];

      const normalizedSubjects: ValidationSubject[] = rawSubjects.map(
        (item: RawValidationSubject) => {
          const placement = item?.placement || {};
          const capacity = item?.capacity || {};

          return {
            enrollment_subject_id: Number(item?.enrollment_subject_id || 0),
            subject_id: Number(item?.subject_id || 0),
            subject_code: String(item?.subject_code || ""),
            subject_name: String(item?.subject_name || ""),
            units: Number(item?.units || 0),

            offering_id:
              item?.offering_id !== undefined && item?.offering_id !== null
                ? Number(item.offering_id)
                : placement?.offering_id !== undefined &&
                    placement?.offering_id !== null
                  ? Number(placement.offering_id)
                  : null,

            section_id:
              item?.section_id !== undefined && item?.section_id !== null
                ? Number(item.section_id)
                : placement?.section_id !== undefined &&
                    placement?.section_id !== null
                  ? Number(placement.section_id)
                  : null,

            section_name: item?.section_name ?? placement?.section_name ?? null,

            section_subject_id:
              item?.section_subject_id !== undefined &&
              item?.section_subject_id !== null
                ? Number(item.section_subject_id)
                : placement?.section_subject_id !== undefined &&
                    placement?.section_subject_id !== null
                  ? Number(placement.section_subject_id)
                  : null,

            offering_status: item?.offering_status ?? null,
            section_subject_status: item?.section_subject_status ?? null,

            capacity: {
              max_students: Number(capacity?.max_students || 0),
              enrolled_count: Number(capacity?.enrolled_count || 0),
              available_slots: Number(capacity?.available_slots || 0),
            },

            academic_eligibility: item?.academic_eligibility,
            valid: item?.valid === true,
            errors: Array.isArray(item?.errors) ? item.errors : [],
          };
        },
      );

      const validSubjects = normalizedSubjects.filter(
        (subject) => subject.valid,
      ).length;
      const invalidSubjects = normalizedSubjects.length - validSubjects;

      const normalizedValidation: ValidationResponse = {
        success: true,

        ready_for_approval:
          typeof data.ready_for_approval === "boolean"
            ? data.ready_for_approval
            : typeof data.can_approve === "boolean"
              ? data.can_approve
              : data.valid === true,

        summary: {
          total_enrolled_subjects: Number(
            data.summary?.total_enrolled_subjects ??
              data.summary?.active_subjects ??
              normalizedSubjects.length,
          ),

          total_units: Number(data.summary?.total_units ?? 0),

          valid_subjects: Number(data.summary?.valid_subjects ?? validSubjects),

          invalid_subjects: Number(
            data.summary?.invalid_subjects ?? invalidSubjects,
          ),

          error_count: Number(
            data.summary?.error_count ??
              data.summary?.validation_errors ??
              rawErrors.length,
          ),

          warning_count: Number(
            data.summary?.warning_count ??
              data.summary?.validation_warnings ??
              rawWarnings.length,
          ),
        },

        subjects: normalizedSubjects,
        errors: rawErrors,
        warnings: rawWarnings,
      };

      setValidation(normalizedValidation);
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
  }, [authenticated, enrollmentId, user, userRole, handleUnauthorized]);

  useEffect(() => {
    if (!enrollment || !enrollmentId) {
      return;
    }

    if (
      !["Pending", "Approved"].includes(String(enrollment.enrollment_status))
    ) {
      setValidation(null);
      setValidationError("");
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

  const selectedAssignmentOffering = useMemo(() => {
    const offeringId = Number(selectedOfferingId);

    if (!Number.isInteger(offeringId) || offeringId <= 0) {
      return null;
    }

    return (
      availableOfferings.find(
        (offering) => Number(offering.offering_id) === offeringId,
      ) || null
    );
  }, [availableOfferings, selectedOfferingId]);

  const selectedBulkSection = useMemo(() => {
    const sectionId = Number(selectedBulkSectionId);

    if (!Number.isInteger(sectionId) || sectionId <= 0) {
      return null;
    }

    return (
      bulkSectionOptions.find(
        (section) => Number(section.section_id) === sectionId,
      ) || null
    );
  }, [bulkSectionOptions, selectedBulkSectionId]);

  // =====================================================
  // OPEN ASSIGNMENT PANEL
  // =====================================================

  const openAssignment = async (subject: EnrollmentSubject) => {
    if (!enrollmentId || !enrollment) {
      return;
    }

    try {
      setSelectedSubject(subject);
      setAvailableOfferings([]);
      setSelectedOfferingId(
        subject.assignment_complete && subject.offering.offering_id
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

      if (response.status === 403) {
        throw new Error(data.message || "Registrar access is required.");
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error ||
            "Failed to load available subject offerings.",
        );
      }

      const returnedOfferings = Array.isArray(data.offerings)
        ? data.offerings.filter((offering) => {
            return (
              Number(offering.subject.subject_id) ===
                Number(subject.subject_id) &&
              Number(offering.academic_year_id) ===
                Number(enrollment.academic_period.academic_year_id) &&
              Number(offering.semester_id) ===
                Number(enrollment.academic_period.semester_id) &&
              offering.offering_status === "Open" &&
              offering.section_subject.status === "Open" &&
              offering.capacity.available_slots > 0 &&
              !offering.capacity.is_full
            );
          })
        : [];

      setAvailableOfferings(returnedOfferings);

      const currentOfferingId = subject.offering.offering_id
        ? Number(subject.offering.offering_id)
        : null;

      const currentOfferingStillAvailable =
        currentOfferingId !== null &&
        returnedOfferings.some(
          (offering) => Number(offering.offering_id) === currentOfferingId,
        );

      if (currentOfferingStillAvailable && currentOfferingId !== null) {
        setSelectedOfferingId(String(currentOfferingId));
      } else if (
        !subject.assignment_complete &&
        returnedOfferings.length === 1
      ) {
        setSelectedOfferingId(String(returnedOfferings[0].offering_id));
      } else {
        setSelectedOfferingId("");
      }
    } catch (requestError) {
      console.error("LOAD AVAILABLE OFFERINGS ERROR:", requestError);
      setAvailableOfferings([]);
      setSelectedOfferingId("");
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
  // ASSIGNMENT MODAL BEHAVIOR
  // =====================================================

  useEffect(() => {
    if (!selectedSubject) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || assignmentLoading) {
        return;
      }

      setSelectedSubject(null);
      setAvailableOfferings([]);
      setSelectedOfferingId("");
      setAssignmentReason("Assigned by Registrar.");
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedSubject, assignmentLoading]);

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

    if (!selectedAssignmentOffering) {
      setActionError(
        "The selected offering is no longer in the current READY / Open offering list. Reload the assignment choices and select again.",
      );
      return;
    }

    if (
      selectedAssignmentOffering.capacity.is_full ||
      selectedAssignmentOffering.capacity.available_slots <= 0
    ) {
      setActionError("The selected offering no longer has available capacity.");
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
  // BULK SECTION PLACEMENT
  // =====================================================

  const resetBulkSectionModal = () => {
    setBulkSectionOpen(false);
    setBulkSectionOptions([]);
    setSelectedBulkSectionId("");
    setBulkSectionReason(
      "Registrar assigned regular subjects to the selected section.",
    );
    setBulkSectionError("");
  };

  const closeBulkSectionModal = (force = false) => {
    if (!force && (bulkSectionLoading || bulkSectionOptionsLoading)) {
      return;
    }

    resetBulkSectionModal();
  };

  const openBulkSectionModal = async () => {
    if (!enrollmentId || !enrollment) {
      return;
    }

    if (enrollment.enrollment_status !== "Pending") {
      setActionError(
        "Bulk section placement is only available for Pending enrollments.",
      );
      return;
    }

    try {
      closeAssignment(true);
      setAddSubjectOpen(false);
      setBulkSectionOpen(true);
      setBulkSectionOptions([]);
      setSelectedBulkSectionId("");
      setBulkSectionError("");
      setActionError("");
      setSuccessMessage("");
      setBulkSectionOptionsLoading(true);

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/available-offerings`,
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
            "Failed to load sections available for bulk placement.",
        );
      }

      const returnedOfferings = Array.isArray(data.offerings)
        ? data.offerings.filter((offering) => {
            return (
              Number(offering.academic_year_id) ===
                Number(enrollment.academic_period.academic_year_id) &&
              Number(offering.semester_id) ===
                Number(enrollment.academic_period.semester_id) &&
              Number(offering.section.course_id) ===
                Number(enrollment.course.course_id) &&
              Number(offering.section.year_level) ===
                Number(enrollment.student.year_level) &&
              offering.offering_status === "Open" &&
              offering.section_subject.status === "Open" &&
              offering.capacity.available_slots > 0 &&
              !offering.capacity.is_full
            );
          })
        : [];

      const sectionMap = new Map<
        number,
        {
          option: BulkSectionOption;
          subjectIds: Set<number>;
        }
      >();

      for (const offering of returnedOfferings) {
        const sectionId = Number(offering.section.section_id);

        if (!Number.isInteger(sectionId) || sectionId <= 0) {
          continue;
        }

        const existing = sectionMap.get(sectionId);

        if (existing) {
          existing.option.ready_offering_count += 1;
          existing.subjectIds.add(Number(offering.subject.subject_id));
          existing.option.ready_subject_count = existing.subjectIds.size;
          continue;
        }

        sectionMap.set(sectionId, {
          option: {
            section_id: sectionId,
            section_name: offering.section.section_name,
            year_level: offering.section.year_level,
            course_id: offering.section.course_id,
            course_code: offering.section.course_code,
            course_name: offering.section.course_name,
            ready_subject_count: 1,
            ready_offering_count: 1,
          },
          subjectIds: new Set([Number(offering.subject.subject_id)]),
        });
      }

      const options = Array.from(sectionMap.values())
        .map((entry) => entry.option)
        .sort((a, b) => a.section_name.localeCompare(b.section_name));

      setBulkSectionOptions(options);

      const profileSectionId = enrollment.student_section.section_id
        ? Number(enrollment.student_section.section_id)
        : null;

      const profileSectionIsAvailable =
        profileSectionId !== null &&
        options.some(
          (section) => Number(section.section_id) === profileSectionId,
        );

      if (profileSectionIsAvailable && profileSectionId !== null) {
        setSelectedBulkSectionId(String(profileSectionId));
      } else if (options.length === 1) {
        setSelectedBulkSectionId(String(options[0].section_id));
      }
    } catch (requestError) {
      console.error("LOAD BULK SECTION OPTIONS ERROR:", requestError);
      setBulkSectionOptions([]);
      setSelectedBulkSectionId("");
      setBulkSectionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load sections available for bulk placement.",
      );
    } finally {
      setBulkSectionOptionsLoading(false);
    }
  };

  const saveBulkSectionAssignment = async () => {
    if (!enrollmentId || !selectedBulkSection) {
      setBulkSectionError("Select a valid section.");
      return;
    }

    const cleanReason =
      bulkSectionReason.trim() ||
      "Registrar assigned regular subjects to the selected section.";

    if (cleanReason.length > 255) {
      setBulkSectionError("Assignment reason must not exceed 255 characters.");
      return;
    }

    try {
      setBulkSectionLoading(true);
      setBulkSectionError("");
      setActionError("");
      setSuccessMessage("");

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/assign-section`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            section_id: selectedBulkSection.section_id,
            reason: cleanReason,
          }),
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data =
        await readJsonResponse<BulkSectionAssignmentResponse>(response);

      if (!response.ok || !data.success) {
        const detail =
          Array.isArray(data.errors) && data.errors.length > 0
            ? data.errors
                .map((item) => item.message || item.code || item.subject_code)
                .filter(Boolean)
                .join(" ")
            : "";

        throw new Error(
          [data.message || data.error, detail].filter(Boolean).join(" ") ||
            "Bulk section placement failed.",
        );
      }

      const assignedCount = data.summary?.assigned ?? 0;
      const alreadyCorrectCount = data.summary?.already_correct ?? 0;

      setSuccessMessage(
        data.message ||
          `${assignedCount} subject(s) assigned. ${alreadyCorrectCount} already correct.`,
      );

      closeBulkSectionModal(true);
      refresh();
    } catch (requestError) {
      console.error("BULK SECTION ASSIGNMENT ERROR:", requestError);

      setBulkSectionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to assign the selected section.",
      );
    } finally {
      setBulkSectionLoading(false);
    }
  };

  // =====================================================
  // BULK SECTION MODAL BEHAVIOR
  // =====================================================

  useEffect(() => {
    if (!bulkSectionOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        bulkSectionLoading ||
        bulkSectionOptionsLoading
      ) {
        return;
      }

      resetBulkSectionModal();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [bulkSectionOpen, bulkSectionLoading, bulkSectionOptionsLoading]);

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

    if (rejectionLoading) {
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
  // REJECT
  //
  // Only Pending enrollments can be rejected.
  // Registrar identity comes from the JWT on the backend.
  // The frontend sends only the required rejection remarks.
  // =====================================================

  const rejectEnrollment = async () => {
    if (!enrollmentId || !enrollment) {
      return;
    }

    if (enrollment.enrollment_status !== "Pending") {
      setActionError("Only Pending enrollments can be rejected.");
      return;
    }

    const remarks = rejectionRemarks.trim();

    if (!remarks) {
      setActionError("Rejection reason is required.");
      return;
    }

    if (remarks.length > 255) {
      setActionError("Rejection reason must not exceed 255 characters.");
      return;
    }

    const confirmed = window.confirm(
      "Reject this enrollment? The enrollment record will remain in the system and its subjects will not be deleted.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setRejectionLoading(true);
      setActionError("");
      setSuccessMessage("");

      const response = await authService.authFetch(
        `${API_BASE_URL}/${enrollmentId}/reject`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            remarks,
          }),
        },
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await readJsonResponse<MutationResponse>(response);

      if (response.status === 403) {
        throw new Error(
          data.message || data.error || "Registrar access is required.",
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Failed to reject enrollment.",
        );
      }

      setSuccessMessage(data.message || "Enrollment rejected successfully.");

      setRejectionRemarks("");
      refresh();
    } catch (requestError) {
      console.error("REJECT ENROLLMENT ERROR:", requestError);

      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to reject enrollment.",
      );
    } finally {
      setRejectionLoading(false);
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

  const officialSectionPlacements = useMemo(() => {
    const activeStatuses = new Set([
      "Enrolled",
      "Completed",
      "Failed",
      "Incomplete",
    ]);

    const map = new Map<number, string>();

    subjects.forEach((subject) => {
      if (
        activeStatuses.has(String(subject.status)) &&
        subject.section.section_id !== null &&
        subject.section.section_name
      ) {
        map.set(
          Number(subject.section.section_id),
          subject.section.section_name,
        );
      }
    });

    return Array.from(map.entries())
      .map(([sectionId, sectionName]) => ({
        sectionId,
        sectionName,
      }))
      .sort((a, b) => a.sectionName.localeCompare(b.sectionName));
  }, [subjects]);

  const officialSectionLabel =
    officialSectionPlacements.length === 0
      ? "Not Assigned"
      : officialSectionPlacements.length === 1
        ? `${officialSectionPlacements[0].sectionName} (#${officialSectionPlacements[0].sectionId})`
        : officialSectionPlacements
            .map((section) => `${section.sectionName} (#${section.sectionId})`)
            .join(", ");

  // =====================================================
  // GUARD
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
              <span>Profile Section (Reference)</span>
              <strong>
                {enrollment.student_section.section_name
                  ? `${enrollment.student_section.section_name}${
                      enrollment.student_section.section_id !== null
                        ? ` (#${enrollment.student_section.section_id})`
                        : ""
                    }`
                  : "Not Assigned"}
              </strong>
            </div>

            <div className="detail-item">
              <span>Official Enrollment Section</span>
              <strong>{officialSectionLabel}</strong>
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
              disabled={
                validationLoading ||
                !["Pending", "Approved"].includes(
                  String(enrollment.enrollment_status),
                )
              }
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

            <div className="subjects-header-actions">
              <button
                type="button"
                className="subject-action-btn bulk-section-btn"
                disabled={
                  bulkSectionLoading ||
                  bulkSectionOptionsLoading ||
                  enrollment.enrollment_status !== "Pending"
                }
                onClick={() => void openBulkSectionModal()}
              >
                {bulkSectionOptionsLoading
                  ? "Loading Sections..."
                  : "Assign Section"}
              </button>

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
                        {subject.status === "Enrolled" &&
                        ["Pending", "Approved"].includes(
                          String(enrollment.enrollment_status),
                        ) ? (
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

        {bulkSectionOpen && (
          <div
            className="assignment-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target === event.currentTarget &&
                !bulkSectionLoading &&
                !bulkSectionOptionsLoading
              ) {
                closeBulkSectionModal();
              }
            }}
          >
            <section
              className="assignment-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-section-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="assignment-modal-header">
                <div>
                  <span className="assignment-modal-eyebrow">
                    Registrar Bulk Placement
                  </span>

                  <h2 id="bulk-section-modal-title">Assign Section</h2>

                  <p>
                    Assign all regular current-term subjects to one READY
                    section. Retake and special subjects remain for individual
                    placement.
                  </p>
                </div>

                <button
                  type="button"
                  className="assignment-modal-close"
                  aria-label="Close assign section modal"
                  title="Close"
                  disabled={bulkSectionLoading || bulkSectionOptionsLoading}
                  onClick={() => closeBulkSectionModal()}
                >
                  ×
                </button>
              </div>

              <div className="assignment-modal-body">
                {bulkSectionError && (
                  <div className="assignment-modal-alert" role="alert">
                    {bulkSectionError}
                  </div>
                )}

                {bulkSectionOptionsLoading ? (
                  <div className="assignment-modal-loading">
                    <div
                      className="assignment-modal-spinner"
                      aria-hidden="true"
                    />

                    <div>
                      <strong>Loading READY sections...</strong>
                      <span>
                        Checking available offerings for this student's course,
                        year level, and academic period.
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="assignment-modal-section-heading">
                      <div>
                        <h3>Available Sections</h3>
                        <p>
                          Choose the section that should become the official
                          placement for the student's regular subjects.
                        </p>
                      </div>

                      <span className="assignment-modal-count">
                        {bulkSectionOptions.length} section
                        {bulkSectionOptions.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {bulkSectionOptions.length === 0 ? (
                      <div className="assignment-modal-empty">
                        <strong>No READY section available</strong>
                        <p>
                          The available-offerings endpoint did not return a
                          matching READY section for this Pending enrollment.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="assignment-offering-list"
                        role="radiogroup"
                        aria-label="Available sections"
                      >
                        {bulkSectionOptions.map((section) => {
                          const selected =
                            Number(selectedBulkSectionId) ===
                            Number(section.section_id);

                          const isProfileReference =
                            enrollment.student_section.section_id !== null &&
                            Number(enrollment.student_section.section_id) ===
                              Number(section.section_id);

                          return (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              key={section.section_id}
                              className={`assignment-offering-option${
                                selected ? " selected" : ""
                              }`}
                              disabled={bulkSectionLoading}
                              onClick={() => {
                                setSelectedBulkSectionId(
                                  String(section.section_id),
                                );
                                setBulkSectionError("");
                              }}
                            >
                              <div className="assignment-offering-option-top">
                                <div>
                                  <strong>{section.section_name}</strong>
                                  <span>
                                    Section #{section.section_id}
                                    {isProfileReference
                                      ? " · Profile reference"
                                      : ""}
                                  </span>
                                </div>

                                <div className="assignment-offering-option-status">
                                  <span>READY</span>
                                  <span>
                                    {section.ready_subject_count} subject
                                    {section.ready_subject_count !== 1
                                      ? "s"
                                      : ""}
                                  </span>
                                </div>
                              </div>

                              <div className="assignment-offering-meta">
                                <div>
                                  <span>Course</span>
                                  <strong>
                                    {section.course_code ||
                                      enrollment.course.course_code ||
                                      "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Year Level</span>
                                  <strong>
                                    {section.year_level
                                      ? `Year ${section.year_level}`
                                      : "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>READY Subjects</span>
                                  <strong>{section.ready_subject_count}</strong>
                                </div>

                                <div>
                                  <span>READY Offerings</span>
                                  <strong>
                                    {section.ready_offering_count}
                                  </strong>
                                </div>
                              </div>

                              <div className="assignment-offering-select-row">
                                <span
                                  className={`assignment-offering-radio${
                                    selected ? " selected" : ""
                                  }`}
                                  aria-hidden="true"
                                />

                                <strong>
                                  {selected
                                    ? "Selected"
                                    : "Select this section"}
                                </strong>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedBulkSection && (
                      <div className="assignment-selected-summary">
                        <div>
                          <span>Selected section</span>
                          <strong>{selectedBulkSection.section_name}</strong>
                        </div>

                        <div>
                          <span>Year Level</span>
                          <strong>
                            {selectedBulkSection.year_level
                              ? `Year ${selectedBulkSection.year_level}`
                              : "—"}
                          </strong>
                        </div>

                        <div>
                          <span>READY Subjects</span>
                          <strong>
                            {selectedBulkSection.ready_subject_count}
                          </strong>
                        </div>
                      </div>
                    )}

                    <label className="assignment-reason-field">
                      <span>Assignment reason</span>

                      <textarea
                        value={bulkSectionReason}
                        disabled={bulkSectionLoading}
                        rows={3}
                        maxLength={255}
                        placeholder="Reason for bulk section placement"
                        onChange={(event) =>
                          setBulkSectionReason(event.target.value)
                        }
                      />

                      <small>{bulkSectionReason.length}/255 characters</small>
                    </label>
                  </>
                )}
              </div>

              <div className="assignment-modal-footer">
                <div className="assignment-modal-footer-note">
                  {selectedBulkSection
                    ? `${selectedBulkSection.section_name} will be used for regular subjects.`
                    : "Select one READY section to continue."}
                </div>

                <div className="assignment-modal-actions">
                  <button
                    type="button"
                    className="assignment-modal-cancel"
                    disabled={bulkSectionLoading || bulkSectionOptionsLoading}
                    onClick={() => closeBulkSectionModal()}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="assignment-modal-save"
                    disabled={
                      bulkSectionLoading ||
                      bulkSectionOptionsLoading ||
                      !selectedBulkSection
                    }
                    onClick={() => void saveBulkSectionAssignment()}
                  >
                    {bulkSectionLoading
                      ? "Assigning Section..."
                      : "Assign Section"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {selectedSubject && (
          <div
            className="assignment-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !assignmentLoading) {
                closeAssignment();
              }
            }}
          >
            <section
              className="assignment-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="assignment-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="assignment-modal-header">
                <div>
                  <span className="assignment-modal-eyebrow">
                    Registrar Placement
                  </span>
                  <h2 id="assignment-modal-title">
                    {selectedSubject.assignment_complete
                      ? "Change Offering"
                      : "Assign Offering"}
                  </h2>
                  <p>
                    <strong>{selectedSubject.subject_code}</strong> —{" "}
                    {selectedSubject.subject_name} · {selectedSubject.units}{" "}
                    unit
                    {selectedSubject.units !== 1 ? "s" : ""}
                  </p>
                </div>

                <button
                  type="button"
                  className="assignment-modal-close"
                  aria-label="Close assignment modal"
                  title="Close"
                  disabled={assignmentLoading}
                  onClick={() => closeAssignment()}
                >
                  ×
                </button>
              </div>

              <div className="assignment-modal-body">
                {actionError && (
                  <div className="assignment-modal-alert" role="alert">
                    {actionError}
                  </div>
                )}

                {offeringsLoading ? (
                  <div className="assignment-modal-loading">
                    <div
                      className="assignment-modal-spinner"
                      aria-hidden="true"
                    />
                    <div>
                      <strong>Loading READY offerings...</strong>
                      <span>
                        Checking section, schedule, and available capacity.
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="assignment-modal-section-heading">
                      <div>
                        <h3>Available Offerings</h3>
                        <p>
                          Select the class placement for this enrolled subject.
                          Room is optional.
                        </p>
                      </div>

                      <span className="assignment-modal-count">
                        {availableOfferings.length} READY
                      </span>
                    </div>

                    {availableOfferings.length === 0 ? (
                      <div className="assignment-modal-empty">
                        <strong>No READY offering available</strong>
                        <p>
                          No Open offering with available capacity was returned
                          for this subject, course, and academic period.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="assignment-offering-list"
                        role="radiogroup"
                        aria-label="Available offerings"
                      >
                        {availableOfferings.map((offering) => {
                          const selected =
                            Number(selectedOfferingId) ===
                            Number(offering.offering_id);

                          return (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              key={offering.offering_id}
                              className={`assignment-offering-option${
                                selected ? " selected" : ""
                              }`}
                              disabled={assignmentLoading}
                              onClick={() => {
                                setSelectedOfferingId(
                                  String(offering.offering_id),
                                );
                                setActionError("");
                              }}
                            >
                              <div className="assignment-offering-option-top">
                                <div>
                                  <strong>
                                    {offering.section.section_name}
                                  </strong>
                                  <span>Offering #{offering.offering_id}</span>
                                </div>

                                <div className="assignment-offering-option-status">
                                  <span>READY</span>
                                  <span>{offering.offering_status}</span>
                                </div>
                              </div>

                              <div className="assignment-offering-meta">
                                <div>
                                  <span>Faculty</span>
                                  <strong>
                                    {offering.faculty.faculty_name || "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Schedule</span>
                                  <strong>
                                    {formatSchedule(
                                      offering.schedule.days,
                                      offering.schedule.time,
                                    )}
                                  </strong>
                                </div>

                                <div>
                                  <span>Room</span>
                                  <strong>
                                    {offering.room.room_name || "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Capacity</span>
                                  <strong>
                                    {offering.capacity.enrolled_count}/
                                    {offering.capacity.max_students} ·{" "}
                                    {offering.capacity.available_slots} open
                                  </strong>
                                </div>
                              </div>

                              <div className="assignment-offering-select-row">
                                <span
                                  className={`assignment-offering-radio${
                                    selected ? " selected" : ""
                                  }`}
                                  aria-hidden="true"
                                />
                                <strong>
                                  {selected
                                    ? "Selected"
                                    : "Select this offering"}
                                </strong>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedAssignmentOffering && (
                      <div className="assignment-selected-summary">
                        <div>
                          <span>Selected placement</span>
                          <strong>
                            {selectedAssignmentOffering.section.section_name}
                          </strong>
                        </div>
                        <div>
                          <span>Schedule</span>
                          <strong>
                            {formatSchedule(
                              selectedAssignmentOffering.schedule.days,
                              selectedAssignmentOffering.schedule.time,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Available slots</span>
                          <strong>
                            {
                              selectedAssignmentOffering.capacity
                                .available_slots
                            }
                          </strong>
                        </div>
                      </div>
                    )}

                    <label className="assignment-reason-field">
                      <span>Assignment reason</span>
                      <textarea
                        value={assignmentReason}
                        disabled={assignmentLoading}
                        rows={3}
                        placeholder="Reason for this placement"
                        onChange={(event) =>
                          setAssignmentReason(event.target.value)
                        }
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="assignment-modal-footer">
                <div className="assignment-modal-footer-note">
                  {selectedAssignmentOffering
                    ? `${selectedAssignmentOffering.section.section_name} is ready to assign.`
                    : "Select one READY offering to continue."}
                </div>

                <div className="assignment-modal-actions">
                  <button
                    type="button"
                    className="assignment-modal-cancel"
                    disabled={assignmentLoading}
                    onClick={() => closeAssignment()}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="assignment-modal-save"
                    disabled={
                      offeringsLoading ||
                      assignmentLoading ||
                      !selectedAssignmentOffering ||
                      selectedAssignmentOffering.capacity.is_full ||
                      selectedAssignmentOffering.capacity.available_slots <= 0
                    }
                    onClick={() => void saveAssignment()}
                  >
                    {assignmentLoading
                      ? "Saving Assignment..."
                      : selectedSubject.assignment_complete
                        ? "Save Change"
                        : "Assign Offering"}
                  </button>
                </div>
              </div>
            </section>
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
                  disabled={approvalLoading || rejectionLoading}
                  onChange={(event) => setApprovalRemarks(event.target.value)}
                />
              </div>

              <div className="remarks-box">
                <span>Rejection Reason</span>
                <textarea
                  value={rejectionRemarks}
                  maxLength={255}
                  disabled={approvalLoading || rejectionLoading}
                  placeholder="Required only when rejecting this enrollment."
                  onChange={(event) => setRejectionRemarks(event.target.value)}
                />

                <small>{rejectionRemarks.length}/255 characters</small>
              </div>

              <div className="enrollment-details-actions">
                <button
                  type="button"
                  className="subject-action-btn"
                  disabled={
                    validationLoading || approvalLoading || rejectionLoading
                  }
                  onClick={() => void loadValidation()}
                >
                  {validationLoading ? "Validating..." : "Validate Enrollment"}
                </button>

                <button
                  type="button"
                  className="reject-enrollment-btn"
                  disabled={
                    approvalLoading ||
                    rejectionLoading ||
                    !rejectionRemarks.trim()
                  }
                  onClick={() => void rejectEnrollment()}
                >
                  {rejectionLoading ? "Rejecting..." : "Reject Enrollment"}
                </button>

                <button
                  type="button"
                  className="approve-enrollment-btn"
                  disabled={
                    approvalLoading ||
                    rejectionLoading ||
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
