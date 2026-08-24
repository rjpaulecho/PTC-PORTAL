import React, { useEffect, useState } from "react";

import { authService } from "../../../services/auth.service";

import "../../../styles/CurriculumManagementR.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/curriculums";

const COURSES_API_URL =
  "http://localhost:3000/api/registrar/curriculums/courses";

// =====================================================
// TYPES
// =====================================================

interface AddCurriculumModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Course {
  course_id: number;
  course_code: string;
  course_name: string;
}

interface CourseResponse {
  success: boolean;
  data?: Course[];
  courses?: Course[];
  message?: string;
  error?: string;
}

interface CreateCurriculumResponse {
  success: boolean;
  message?: string;
  error?: string;
  curriculum_id?: number;
}

// =====================================================
// COMPONENT
// =====================================================

export default function AddCurriculumModal({
  onClose,
  onSuccess,
}: AddCurriculumModalProps) {
  // =====================================================
  // AUTH
  // =====================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // =====================================================
  // FORM STATES
  // =====================================================

  const [courseId, setCourseId] = useState("");

  const [curriculumName, setCurriculumName] = useState("");

  const [effectiveYear, setEffectiveYear] = useState(
    new Date().getFullYear().toString(),
  );

  const [totalUnits, setTotalUnits] = useState("");

  const [isActive, setIsActive] = useState("0");

  // =====================================================
  // COURSE STATES
  // =====================================================

  const [courses, setCourses] = useState<Course[]>([]);

  const [loadingCourses, setLoadingCourses] = useState(true);

  const [courseError, setCourseError] = useState("");

  // =====================================================
  // SUBMIT STATES
  // =====================================================

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // =====================================================
  // LOAD COURSES
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      setLoadingCourses(false);

      return;
    }

    const controller = new AbortController();

    const loadCourses = async () => {
      try {
        setLoadingCourses(true);

        setCourseError("");

        const response = await authService.authFetch(COURSES_API_URL, {
          method: "GET",

          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

        const contentType = response.headers.get("content-type") || "";

        let data: CourseResponse | null = null;

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

        if (response.status === 401) {
          authService.logout();

          setCourseError("Your session has expired. Please log in again.");

          return;
        }

        if (response.status === 403) {
          throw new Error(
            data?.message ||
              data?.error ||
              "You are not authorized to load courses.",
          );
        }

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.message || data?.error || "Failed to load courses.",
          );
        }

        const loadedCourses = Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.courses)
            ? data.courses
            : [];

        setCourses(loadedCourses);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("GET COURSES FOR CURRICULUM ERROR:", err);

        setCourses([]);

        setCourseError(
          err instanceof Error ? err.message : "Unable to load courses.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCourses(false);
        }
      }
    };

    void loadCourses();

    return () => {
      controller.abort();
    };
  }, [authenticated, userRole]);

  // =====================================================
  // HANDLE SUBMIT
  // =====================================================

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setSuccessMessage("");

    if (!authenticated || userRole !== "Registrar") {
      setError(
        "Your session has expired or you are not authorized to create curricula.",
      );

      return;
    }

    const parsedCourseId = Number(courseId);

    if (!Number.isInteger(parsedCourseId) || parsedCourseId <= 0) {
      setError("Please select a valid course.");

      return;
    }

    const trimmedName = curriculumName.trim();

    if (!trimmedName) {
      setError("Curriculum name is required.");

      return;
    }

    const parsedEffectiveYear = Number(effectiveYear);

    if (
      !Number.isInteger(parsedEffectiveYear) ||
      parsedEffectiveYear < 1900 ||
      parsedEffectiveYear > 2100
    ) {
      setError("Effective year must be between 1900 and 2100.");

      return;
    }

    const parsedTotalUnits = Number(totalUnits);

    if (!Number.isFinite(parsedTotalUnits) || parsedTotalUnits < 0) {
      setError(
        "Total units must be a valid number greater than or equal to 0.",
      );

      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        course_id: parsedCourseId,

        curriculum_name: trimmedName,

        effective_year: parsedEffectiveYear,

        total_units: parsedTotalUnits,

        is_active: Number(isActive) === 1 ? 1 : 0,
      };

      console.log("POST CREATE CURRICULUM:", payload);

      const response = await authService.authFetch(API_BASE_URL, {
        method: "POST",

        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";

      let data: CreateCurriculumResponse | null = null;

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

      if (response.status === 401) {
        authService.logout();

        setError("Your session has expired. Please log in again.");

        return;
      }

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to create curricula.",
        );
      }

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || data?.error || "Failed to create curriculum.",
        );
      }

      setSuccessMessage(data.message || "Curriculum created successfully.");

      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err) {
      console.error("CREATE CURRICULUM ERROR:", err);

      setError(
        err instanceof Error ? err.message : "Failed to create curriculum.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      className="curriculum-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        className="curriculum-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-curriculum-title"
      >
        <div className="curriculum-modal-header">
          <div>
            <h2 id="add-curriculum-title">Add Curriculum</h2>

            <p>Create a new curriculum for a course.</p>
          </div>

          <button
            type="button"
            className="curriculum-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="curriculum-modal-form" onSubmit={handleSubmit}>
          {error && (
            <div className="curriculum-form-message error">{error}</div>
          )}

          {successMessage && (
            <div className="curriculum-form-message success">
              {successMessage}
            </div>
          )}

          <div className="curriculum-form-group">
            <label htmlFor="curriculum-course">Course</label>

            {loadingCourses ? (
              <div className="curriculum-loading-field">Loading courses...</div>
            ) : courseError ? (
              <div className="curriculum-course-error">{courseError}</div>
            ) : (
              <select
                id="curriculum-course"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                disabled={submitting}
                required
              >
                <option value="">Select a course</option>

                {courses.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_code} — {course.course_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="curriculum-form-group">
            <label htmlFor="curriculum-name">Curriculum Name</label>

            <input
              id="curriculum-name"
              type="text"
              value={curriculumName}
              onChange={(event) => setCurriculumName(event.target.value)}
              placeholder="e.g. BSIT Revised Curriculum"
              disabled={submitting}
              maxLength={255}
              required
            />
          </div>

          <div className="curriculum-form-row">
            <div className="curriculum-form-group">
              <label htmlFor="curriculum-effective-year">Effective Year</label>

              <input
                id="curriculum-effective-year"
                type="number"
                value={effectiveYear}
                onChange={(event) => setEffectiveYear(event.target.value)}
                min="1900"
                max="2100"
                disabled={submitting}
                required
              />
            </div>

            <div className="curriculum-form-group">
              <label htmlFor="curriculum-total-units">Total Units</label>

              <input
                id="curriculum-total-units"
                type="number"
                value={totalUnits}
                onChange={(event) => setTotalUnits(event.target.value)}
                min="0"
                step="1"
                placeholder="e.g. 185"
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div className="curriculum-form-group">
            <label htmlFor="curriculum-status">Status</label>

            <select
              id="curriculum-status"
              value={isActive}
              onChange={(event) => setIsActive(event.target.value)}
              disabled={submitting}
            >
              <option value="0">Inactive</option>

              <option value="1">Active</option>
            </select>
          </div>

          <div className="curriculum-modal-actions">
            <button
              type="button"
              className="curriculum-cancel-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="curriculum-submit-btn"
              disabled={
                submitting ||
                loadingCourses ||
                courses.length === 0 ||
                !authenticated ||
                userRole !== "Registrar"
              }
            >
              {submitting ? "Creating..." : "Create Curriculum"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
