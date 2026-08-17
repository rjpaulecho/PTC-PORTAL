import { useEffect, useState } from "react";
import "../../../styles/CurriculumSubjectModal.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/curriculums";

interface CurriculumSubject {
  curriculum_subject_id: number;
  curriculum_id: number;
  subject_id: number;

  subject_code: string;
  subject_name: string;

  units: number;
  lecture_hours: number;
  laboratory_hours: number;

  year_level: number;
  semester_id: number;
  semester_name: string;

  is_required: number;
  display_order: number;
}

interface AvailableSubject {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
  lecture_hours: number;
  laboratory_hours: number;
}

interface CurriculumSubjectModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  curriculumId: number;
  subject?: CurriculumSubject | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CurriculumSubjectModal({
  isOpen,
  mode,
  curriculumId,
  subject,
  onClose,
  onSuccess,
}: CurriculumSubjectModalProps) {
  const [availableSubjects, setAvailableSubjects] = useState<
    AvailableSubject[]
  >([]);

  const [subjectId, setSubjectId] = useState("");

  const [yearLevel, setYearLevel] = useState("1");
  const [semesterId, setSemesterId] = useState("1");

  const [units, setUnits] = useState("");
  const [lectureHours, setLectureHours] = useState("");
  const [laboratoryHours, setLaboratoryHours] = useState("");

  const [isRequired, setIsRequired] = useState("1");
  const [displayOrder, setDisplayOrder] = useState("1");

  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // =====================================================
  // LOAD MODAL DATA
  // =====================================================

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setError("");

    if (mode === "edit" && subject) {
      setSubjectId(String(subject.subject_id));
      setYearLevel(String(subject.year_level));
      setSemesterId(String(subject.semester_id));
      setUnits(String(subject.units));
      setLectureHours(String(subject.lecture_hours));
      setLaboratoryHours(String(subject.laboratory_hours));
      setIsRequired(String(subject.is_required));
      setDisplayOrder(String(subject.display_order));
    } else {
      setSubjectId("");
      setYearLevel("1");
      setSemesterId("1");
      setUnits("");
      setLectureHours("");
      setLaboratoryHours("");
      setIsRequired("1");
      setDisplayOrder("1");
    }
  }, [isOpen, mode, subject]);

  // =====================================================
  // LOAD AVAILABLE SUBJECTS
  // =====================================================

  useEffect(() => {
    if (!isOpen || mode !== "add") {
      return;
    }

    let cancelled = false;

    const loadAvailableSubjects = async () => {
      try {
        setLoadingSubjects(true);
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/${curriculumId}/available-subjects`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to load available subjects.");
        }

        if (!cancelled) {
          setAvailableSubjects(data.subjects || []);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("LOAD AVAILABLE SUBJECTS ERROR:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load available subjects.",
        );
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false);
        }
      }
    };

    loadAvailableSubjects();

    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, curriculumId]);

  // =====================================================
  // AUTO-FILL SUBJECT INFORMATION
  // =====================================================

  useEffect(() => {
    if (mode !== "add" || !subjectId) {
      return;
    }

    const selected = availableSubjects.find(
      (item) => String(item.subject_id) === subjectId,
    );

    if (!selected) {
      return;
    }

    setUnits(String(selected.units));
    setLectureHours(String(selected.lecture_hours));
    setLaboratoryHours(String(selected.laboratory_hours));
  }, [subjectId, availableSubjects, mode]);

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError("");

    if (mode === "add" && !subjectId) {
      setError("Please select a subject.");
      return;
    }

    if (!units || Number(units) < 0) {
      setError("Please enter valid units.");
      return;
    }

    if (!lectureHours || Number(lectureHours) < 0) {
      setError("Please enter valid lecture hours.");
      return;
    }

    if (!laboratoryHours || Number(laboratoryHours) < 0) {
      setError("Please enter valid laboratory hours.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        subject_id:
          mode === "add" ? Number(subjectId) : Number(subject?.subject_id),

        units: Number(units),
        lecture_hours: Number(lectureHours),
        laboratory_hours: Number(laboratoryHours),

        year_level: Number(yearLevel),
        semester_id: Number(semesterId),

        is_required: Number(isRequired),
        display_order: Number(displayOrder),
      };

      const url =
        mode === "add"
          ? `${API_BASE_URL}/${curriculumId}/subjects`
          : `${API_BASE_URL}/${curriculumId}/subjects/${subject?.curriculum_subject_id}`;

      const method = mode === "add" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            `Failed to ${mode === "add" ? "add" : "update"} subject.`,
        );
      }

      onSuccess();
    } catch (err) {
      console.error("SAVE CURRICULUM SUBJECT ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${mode === "add" ? "add" : "update"} subject.`,
      );
    } finally {
      setSaving(false);
    }
  };

  // =====================================================
  // CLOSE
  // =====================================================

  const handleClose = () => {
    if (saving) {
      return;
    }

    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="curriculum-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className="curriculum-subject-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="curriculum-subject-modal-title"
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="curriculum-modal-header">
          <div>
            <h2 id="curriculum-subject-modal-title">
              {mode === "add" ? "Add Subject" : "Edit Subject"}
            </h2>

            <p>
              {mode === "add"
                ? "Add an existing subject to this curriculum."
                : "Update the subject curriculum mapping."}
            </p>
          </div>

          <button
            type="button"
            className="curriculum-modal-close"
            onClick={handleClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* =================================================
            FORM
        ================================================= */}

        <form onSubmit={handleSubmit}>
          <div className="curriculum-modal-body">
            {error && <div className="curriculum-modal-error">{error}</div>}

            {/* SUBJECT */}

            <div className="curriculum-form-group">
              <label htmlFor="subject">
                Subject <span>*</span>
              </label>

              {mode === "add" ? (
                <select
                  id="subject"
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  disabled={loadingSubjects || saving}
                >
                  <option value="">
                    {loadingSubjects
                      ? "Loading subjects..."
                      : "Select a subject"}
                  </option>

                  {availableSubjects.map((item) => (
                    <option key={item.subject_id} value={item.subject_id}>
                      {item.subject_code} — {item.subject_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="selected-subject-display">
                  <strong>{subject?.subject_code}</strong>

                  <span>{subject?.subject_name}</span>
                </div>
              )}
            </div>

            {/* YEAR + SEMESTER */}

            <div className="curriculum-form-row">
              <div className="curriculum-form-group">
                <label htmlFor="yearLevel">
                  Year Level <span>*</span>
                </label>

                <select
                  id="yearLevel"
                  value={yearLevel}
                  onChange={(event) => setYearLevel(event.target.value)}
                  disabled={saving}
                >
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
              </div>

              <div className="curriculum-form-group">
                <label htmlFor="semesterId">
                  Semester <span>*</span>
                </label>

                <select
                  id="semesterId"
                  value={semesterId}
                  onChange={(event) => setSemesterId(event.target.value)}
                  disabled={saving}
                >
                  <option value="1">1st Semester</option>
                  <option value="2">2nd Semester</option>
                </select>
              </div>
            </div>

            {/* UNITS */}

            <div className="curriculum-form-row three-columns">
              <div className="curriculum-form-group">
                <label htmlFor="units">
                  Units <span>*</span>
                </label>

                <input
                  id="units"
                  type="number"
                  min="0"
                  step="0.5"
                  value={units}
                  onChange={(event) => setUnits(event.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="curriculum-form-group">
                <label htmlFor="lectureHours">
                  Lecture Hours <span>*</span>
                </label>

                <input
                  id="lectureHours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={lectureHours}
                  onChange={(event) => setLectureHours(event.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="curriculum-form-group">
                <label htmlFor="laboratoryHours">
                  Laboratory Hours <span>*</span>
                </label>

                <input
                  id="laboratoryHours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={laboratoryHours}
                  onChange={(event) => setLaboratoryHours(event.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            {/* TYPE + ORDER */}

            <div className="curriculum-form-row">
              <div className="curriculum-form-group">
                <label htmlFor="isRequired">Subject Type</label>

                <select
                  id="isRequired"
                  value={isRequired}
                  onChange={(event) => setIsRequired(event.target.value)}
                  disabled={saving}
                >
                  <option value="1">Required</option>
                  <option value="0">Elective</option>
                </select>
              </div>

              <div className="curriculum-form-group">
                <label htmlFor="displayOrder">Display Order</label>

                <input
                  id="displayOrder"
                  type="number"
                  min="1"
                  value={displayOrder}
                  onChange={(event) => setDisplayOrder(event.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* =================================================
              FOOTER
          ================================================= */}

          <div className="curriculum-modal-footer">
            <button
              type="button"
              className="curriculum-modal-cancel"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="curriculum-modal-submit"
              disabled={saving || loadingSubjects}
            >
              {saving
                ? "Saving..."
                : mode === "add"
                  ? "Add Subject"
                  : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
