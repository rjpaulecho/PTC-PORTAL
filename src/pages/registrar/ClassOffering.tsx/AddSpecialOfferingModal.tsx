import { useEffect, useMemo, useState } from "react";

import { authService } from "../../../services/auth.service";

// =====================================================
// API
// =====================================================

const OFFERING_API_BASE_URL = "http://localhost:3000/api/registrar/offerings";

const CURRICULUM_API_BASE_URL =
  "http://localhost:3000/api/registrar/curriculums";

// =====================================================
// SUBJECT TYPES
// =====================================================

interface SpecialSubjectOption {
  subject_id: number;

  subject_code: string;

  subject_name: string;

  units: number;

  lecture_hours: number;

  laboratory_hours: number;

  year_level?: number | null;

  semester_id?: number | null;

  semester_name?: string | null;

  source: "curriculum" | "catalog";
}

// =====================================================
// API RESPONSES
// =====================================================

interface CurriculumSubjectResponseItem {
  curriculum_subject_id?: number;

  curriculum_id?: number;

  subject_id: number;

  subject_code: string;

  subject_name: string;

  units: number;

  lecture_hours: number;

  laboratory_hours: number;

  year_level?: number;

  semester_id?: number;

  semester_name?: string;

  is_required?: number | boolean;

  display_order?: number;
}

interface CurriculumDetailsResponse {
  success: boolean;

  message?: string;

  error?: string;

  subjects?: CurriculumSubjectResponseItem[];
}

interface AvailableSubjectResponseItem {
  subject_id: number;

  subject_code: string;

  subject_name: string;

  units: number;

  lecture_hours: number;

  laboratory_hours: number;
}

interface AvailableSubjectsResponse {
  success: boolean;

  message?: string;

  error?: string;

  subjects?: AvailableSubjectResponseItem[];
}

interface CreateSpecialSectionSubjectResponse {
  success: boolean;

  message?: string;

  error?: string;

  created?: number;

  skipped?: number;

  created_count?: number;

  skipped_count?: number;

  section_subjects?: unknown[];

  section_subject?: unknown;
}

// =====================================================
// PROPS
// =====================================================

interface AddSpecialOfferingModalProps {
  open: boolean;

  academicYearId: string;

  semesterId: string;

  courseId: string;

  yearLevel: string;

  curriculumId: string;

  sectionId: string;

  academicYear: string;

  semesterName: string;

  courseCode: string;

  sectionName: string;

  defaultCapacity: number;

  existingSubjectIds: number[];

  onClose: () => void;

  onSuccess: () => void;

  onUnauthorized: () => void;
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
// NORMALIZE SUBJECT
// =====================================================

function normalizeSubject(
  item: CurriculumSubjectResponseItem | AvailableSubjectResponseItem,
  source: "curriculum" | "catalog",
): SpecialSubjectOption {
  const curriculumItem = item as CurriculumSubjectResponseItem;

  return {
    subject_id: Number(item.subject_id),

    subject_code: item.subject_code,

    subject_name: item.subject_name,

    units: Number(item.units || 0),

    lecture_hours: Number(item.lecture_hours || 0),

    laboratory_hours: Number(item.laboratory_hours || 0),

    year_level:
      typeof curriculumItem.year_level === "number"
        ? curriculumItem.year_level
        : null,

    semester_id:
      typeof curriculumItem.semester_id === "number"
        ? curriculumItem.semester_id
        : null,

    semester_name: curriculumItem.semester_name || null,

    source,
  };
}

// =====================================================
// COMPONENT
// =====================================================

export default function AddSpecialOfferingModal({
  open,

  academicYearId,

  semesterId,

  courseId,

  yearLevel,

  curriculumId,

  sectionId,

  academicYear,

  semesterName,

  courseCode,

  sectionName,

  defaultCapacity,

  existingSubjectIds,

  onClose,

  onSuccess,

  onUnauthorized,
}: AddSpecialOfferingModalProps) {
  // =====================================================
  // FORM
  // =====================================================

  const [subjectId, setSubjectId] = useState("");

  const [maxStudents, setMaxStudents] = useState("");

  const [reason, setReason] = useState("");

  // =====================================================
  // SUBJECT OPTIONS
  // =====================================================

  const [subjectOptions, setSubjectOptions] = useState<SpecialSubjectOption[]>(
    [],
  );

  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // =====================================================
  // SUBMIT STATE
  // =====================================================

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // SETUP VALIDATION
  // =====================================================

  const setupValid = useMemo(() => {
    const ids = [
      academicYearId,
      semesterId,
      courseId,
      yearLevel,
      curriculumId,
      sectionId,
    ].map(Number);

    return ids.every((value) => Number.isInteger(value) && value > 0);
  }, [
    academicYearId,
    semesterId,
    courseId,
    yearLevel,
    curriculumId,
    sectionId,
  ]);

  // =====================================================
  // RESET FORM
  // =====================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    setSubjectId("");

    setMaxStudents(
      Number.isFinite(Number(defaultCapacity)) && Number(defaultCapacity) > 0
        ? String(defaultCapacity)
        : "50",
    );

    setReason("");

    setError("");

    setLoading(false);
  }, [open, defaultCapacity]);

  // =====================================================
  // LOAD SPECIAL SUBJECT CANDIDATES
  //
  // We merge:
  // 1. all subjects already mapped to the selected curriculum
  //    across its year levels / semesters (supports retakes)
  // 2. catalog subjects not yet mapped to this curriculum
  //
  // Current-term section subjects are filtered out so the
  // Registrar cannot intentionally create a duplicate through
  // this modal.
  // =====================================================

  useEffect(() => {
    if (!open || !setupValid) {
      return;
    }

    const controller = new AbortController();

    const loadSubjects = async () => {
      try {
        setLoadingSubjects(true);

        setError("");

        const curriculumUrl = `${CURRICULUM_API_BASE_URL}/${Number(curriculumId)}`;

        const availableUrl = `${CURRICULUM_API_BASE_URL}/${Number(curriculumId)}/available-subjects`;

        console.log("LOAD SPECIAL OFFERING SUBJECTS:", {
          curriculumUrl,
          availableUrl,
        });

        const [curriculumResponse, availableResponse] = await Promise.all([
          authService.authFetch(curriculumUrl, {
            method: "GET",

            signal: controller.signal,

            headers: {
              Accept: "application/json",
            },
          }),

          authService.authFetch(availableUrl, {
            method: "GET",

            signal: controller.signal,

            headers: {
              Accept: "application/json",
            },
          }),
        ]);

        // ===============================================
        // AUTH
        // ===============================================

        if (
          curriculumResponse.status === 401 ||
          availableResponse.status === 401
        ) {
          onUnauthorized();

          return;
        }

        const curriculumData =
          await readJsonResponse<CurriculumDetailsResponse>(curriculumResponse);

        const availableData =
          await readJsonResponse<AvailableSubjectsResponse>(availableResponse);

        // ===============================================
        // ERRORS
        // ===============================================

        if (!curriculumResponse.ok || !curriculumData.success) {
          throw new Error(
            curriculumData.message ||
              curriculumData.error ||
              "Failed to load curriculum subjects.",
          );
        }

        if (!availableResponse.ok || !availableData.success) {
          throw new Error(
            availableData.message ||
              availableData.error ||
              "Failed to load subject catalog options.",
          );
        }

        // ===============================================
        // MERGE / DEDUPE
        // ===============================================

        const map = new Map<number, SpecialSubjectOption>();

        for (const item of curriculumData.subjects || []) {
          const normalized = normalizeSubject(item, "curriculum");

          if (
            Number.isInteger(normalized.subject_id) &&
            normalized.subject_id > 0
          ) {
            map.set(normalized.subject_id, normalized);
          }
        }

        for (const item of availableData.subjects || []) {
          const normalized = normalizeSubject(item, "catalog");

          if (
            Number.isInteger(normalized.subject_id) &&
            normalized.subject_id > 0 &&
            !map.has(normalized.subject_id)
          ) {
            map.set(normalized.subject_id, normalized);
          }
        }

        const existingSet = new Set(
          existingSubjectIds
            .map(Number)
            .filter((value) => Number.isInteger(value) && value > 0),
        );

        const filtered = Array.from(map.values())
          .filter((item) => !existingSet.has(item.subject_id))
          .sort((a, b) => a.subject_code.localeCompare(b.subject_code));

        setSubjectOptions(filtered);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        console.error("LOAD SPECIAL OFFERING SUBJECTS ERROR:", requestError);

        setSubjectOptions([]);

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load subjects for a special offering.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSubjects(false);
        }
      }
    };

    void loadSubjects();

    return () => {
      controller.abort();
    };
  }, [open, setupValid, curriculumId, existingSubjectIds, onUnauthorized]);

  // =====================================================
  // SELECTED SUBJECT
  // =====================================================

  const selectedSubject = useMemo(
    () =>
      subjectOptions.find((item) => String(item.subject_id) === subjectId) ||
      null,
    [subjectOptions, subjectId],
  );

  // =====================================================
  // CLOSE
  // =====================================================

  const handleClose = () => {
    if (loading) {
      return;
    }

    setError("");

    onClose();
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");

    // ===============================================
    // SETUP
    // ===============================================

    if (!setupValid) {
      setError(
        "Complete Academic Year, Semester, Course, Year Level, Curriculum, and Section first.",
      );

      return;
    }

    // ===============================================
    // SUBJECT
    // ===============================================

    const numericSubjectId = Number(subjectId);

    if (
      !Number.isInteger(numericSubjectId) ||
      numericSubjectId <= 0 ||
      !selectedSubject
    ) {
      setError("Select a valid special or retake subject.");

      return;
    }

    // ===============================================
    // CAPACITY
    // ===============================================

    const numericCapacity = Number(maxStudents);

    if (!Number.isInteger(numericCapacity) || numericCapacity <= 0) {
      setError("Maximum students must be a positive whole number.");

      return;
    }

    // ===============================================
    // REASON
    // ===============================================

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setError("A reason is required for a special or retake subject.");

      return;
    }

    try {
      setLoading(true);

      // =============================================
      // SPECIAL SECTION SUBJECT PAYLOAD
      //
      // Same section-subject endpoint as curriculum
      // preparation. Special mode uses one subject in
      // the subject_ids array and requires a reason.
      // =============================================

      const payload = {
        mode: "special" as const,

        academic_year_id: Number(academicYearId),

        semester_id: Number(semesterId),

        course_id: Number(courseId),

        year_level: Number(yearLevel),

        curriculum_id: Number(curriculumId),

        section_id: Number(sectionId),

        subject_ids: [numericSubjectId],

        max_students: numericCapacity,

        reason: trimmedReason,
      };

      console.log("CREATE SPECIAL SECTION SUBJECT:", payload);

      const response = await authService.authFetch(
        `${OFFERING_API_BASE_URL}/section-subjects`,
        {
          method: "POST",

          headers: {
            Accept: "application/json",

            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        },
      );

      const data =
        await readJsonResponse<CreateSpecialSectionSubjectResponse>(response);

      // ===============================================
      // AUTH
      // ===============================================

      if (response.status === 401) {
        onUnauthorized();

        return;
      }

      if (response.status === 403) {
        setError(
          data.message ||
            data.error ||
            "You are not authorized to create special section subjects.",
        );

        return;
      }

      // ===============================================
      // BUSINESS RULE
      // ===============================================

      if (
        response.status === 400 ||
        response.status === 409 ||
        response.status === 422
      ) {
        setError(
          data.message ||
            data.error ||
            "The special section subject could not be created.",
        );

        console.log("CREATE SPECIAL SECTION SUBJECT BLOCKED:", data);

        return;
      }

      // ===============================================
      // GENERAL ERROR
      // ===============================================

      if (!response.ok || !data.success) {
        setError(
          data.message ||
            data.error ||
            "Failed to create the special section subject.",
        );

        return;
      }

      // ===============================================
      // SUCCESS
      // ===============================================

      console.log("CREATE SPECIAL SECTION SUBJECT SUCCESS:", data);

      onSuccess();
    } catch (requestError) {
      console.error("CREATE SPECIAL SECTION SUBJECT ERROR:", requestError);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create the special section subject.",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // DO NOT RENDER
  // =====================================================

  if (!open) {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      className="class-offering-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          handleClose();
        }
      }}
    >
      <form
        className="class-offering-modal class-offering-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-special-offering-title"
        onSubmit={handleSubmit}
      >
        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="class-offering-modal-header">
          <div>
            <h2 id="add-special-offering-title">
              Add Special / Retake Subject
            </h2>

            <p>
              Create a legitimate subject exception for this section and
              academic term.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close"
            disabled={loading}
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        {/* ================================================= */}
        {/* ACADEMIC CONTEXT */}
        {/* ================================================= */}

        <div className="class-offering-modal-subject">
          <div>
            <strong>
              {courseCode || "Course"} · {sectionName || "Section"}
            </strong>

            <span>
              {" — "}
              {academicYear || "Academic Year"} · {semesterName || "Semester"}
            </span>
          </div>

          <small>Year Level {yearLevel || "—"}</small>
        </div>

        {/* ================================================= */}
        {/* ERROR */}
        {/* ================================================= */}

        {error && <div className="class-offering-error">{error}</div>}

        {/* ================================================= */}
        {/* BODY */}
        {/* ================================================= */}

        <div className="class-offering-modal-body">
          <div className="class-offering-prepare-notice">
            <strong>Whole-class / section setup</strong>

            <p>
              This creates a special section subject only. It does not assign a
              student. After creation, configure its faculty, schedule, room,
              and offering status from the Special / Retake Offerings section.
            </p>
          </div>

          <div className="class-offering-form-grid">
            {/* ============================================= */}
            {/* SUBJECT */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="special-offering-subject">Subject</label>

              <select
                id="special-offering-subject"
                value={subjectId}
                disabled={loading || loadingSubjects || !setupValid}
                onChange={(event) => {
                  setSubjectId(event.target.value);

                  setError("");
                }}
              >
                <option value="">
                  {loadingSubjects
                    ? "Loading subjects..."
                    : "Select special / retake subject"}
                </option>

                {subjectOptions.map((item) => (
                  <option key={item.subject_id} value={item.subject_id}>
                    {item.subject_code} — {item.subject_name}
                    {item.semester_name ? ` (${item.semester_name})` : ""}
                  </option>
                ))}
              </select>

              <small>
                Subjects already prepared for the current section and term are
                excluded.
              </small>
            </div>

            {/* ============================================= */}
            {/* CAPACITY */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="special-offering-capacity">
                Maximum Students
              </label>

              <input
                id="special-offering-capacity"
                type="number"
                min="1"
                step="1"
                value={maxStudents}
                disabled={loading}
                onChange={(event) => {
                  setMaxStudents(event.target.value);

                  setError("");
                }}
              />

              <small>Initial capacity for this special section subject.</small>
            </div>
          </div>

          {/* =============================================== */}
          {/* SELECTED SUBJECT INFORMATION */}
          {/* =============================================== */}

          {selectedSubject && (
            <div className="class-offering-prepare-notice">
              <strong>
                {selectedSubject.subject_code} — {selectedSubject.subject_name}
              </strong>

              <p>
                {selectedSubject.units} unit
                {selectedSubject.units !== 1 ? "s" : ""} · Lecture{" "}
                {selectedSubject.lecture_hours} hr · Laboratory{" "}
                {selectedSubject.laboratory_hours} hr
                {selectedSubject.semester_name
                  ? ` · Curriculum term: ${selectedSubject.semester_name}`
                  : ""}
              </p>

              {selectedSubject.semester_id &&
                Number(selectedSubject.semester_id) !== Number(semesterId) && (
                  <p>
                    This subject normally belongs to a different curriculum
                    semester. Special mode is required to offer it in the
                    selected term.
                  </p>
                )}
            </div>
          )}

          {/* =============================================== */}
          {/* REASON */}
          {/* =============================================== */}

          <div className="class-offering-field">
            <label htmlFor="special-offering-reason">
              Special / Retake Reason
            </label>

            <textarea
              id="special-offering-reason"
              value={reason}
              disabled={loading}
              placeholder="Example: Approved retake class for students who need CC104 during Second Semester."
              onChange={(event) => {
                setReason(event.target.value);

                setError("");
              }}
            />

            <small>
              Required. Explain the academic reason this subject must run
              outside the normal current-term curriculum setup.
            </small>
          </div>

          {/* =============================================== */}
          {/* NEXT STEP */}
          {/* =============================================== */}

          <div className="class-offering-open-requirements">
            <h3>After Creation</h3>

            <ul>
              <li>
                The special subject appears in Special / Retake Offerings.
              </li>

              <li>
                It is still a section-level class plan, not a student
                assignment.
              </li>

              <li>
                Use Create Offering to assign faculty, schedule, optional room,
                and offering capacity.
              </li>

              <li>
                Only a valid Open offering can later be used when Registrar
                assigns eligible students.
              </li>
            </ul>
          </div>
        </div>

        {/* ================================================= */}
        {/* FOOTER */}
        {/* ================================================= */}

        <div className="class-offering-modal-footer">
          <button type="button" disabled={loading} onClick={handleClose}>
            Cancel
          </button>

          <button
            type="submit"
            className="class-offering-primary-button"
            disabled={
              loading ||
              loadingSubjects ||
              !setupValid ||
              !subjectId ||
              !maxStudents ||
              !reason.trim()
            }
          >
            {loading ? "Creating..." : "Create Special Subject"}
          </button>
        </div>
      </form>
    </div>
  );
}
