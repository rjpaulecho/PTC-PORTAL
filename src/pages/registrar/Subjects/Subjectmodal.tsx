import { useEffect, useState } from "react";
import "../../../styles/SubjectmodalR.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/subjects";

interface Subject {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  units: number;
  lecture_hours: number;
  laboratory_hours: number;
  description: string | null;
  created_at: string;
}

interface SubjectModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  subject: Subject | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SubjectModal({
  isOpen,
  mode,
  subject,
  onClose,
  onSuccess,
}: SubjectModalProps) {
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [units, setUnits] = useState("");
  const [lectureHours, setLectureHours] = useState("3");
  const [laboratoryHours, setLaboratoryHours] = useState("0");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // =====================================================
  // LOAD DATA
  // =====================================================

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setError("");

    if (mode === "edit" && subject) {
      setSubjectCode(subject.subject_code);
      setSubjectName(subject.subject_name);
      setUnits(String(subject.units));
      setLectureHours(String(subject.lecture_hours));
      setLaboratoryHours(String(subject.laboratory_hours));
      setDescription(subject.description || "");
    } else {
      setSubjectCode("");
      setSubjectName("");
      setUnits("");
      setLectureHours("3");
      setLaboratoryHours("0");
      setDescription("");
    }
  }, [isOpen, mode, subject]);

  // =====================================================
  // CLOSE
  // =====================================================

  const handleClose = () => {
    if (saving) {
      return;
    }

    onClose();
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError("");

    const cleanCode = subjectCode.trim();
    const cleanName = subjectName.trim();

    if (!cleanCode) {
      setError("Subject code is required.");
      return;
    }

    if (!cleanName) {
      setError("Subject name is required.");
      return;
    }

    if (!units || Number(units) < 0) {
      setError("Please enter valid units.");
      return;
    }

    if (lectureHours === "" || Number(lectureHours) < 0) {
      setError("Please enter valid lecture hours.");
      return;
    }

    if (laboratoryHours === "" || Number(laboratoryHours) < 0) {
      setError("Please enter valid laboratory hours.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        subject_code: cleanCode,
        subject_name: cleanName,
        units: Number(units),
        lecture_hours: Number(lectureHours),
        laboratory_hours: Number(laboratoryHours),
        description: description.trim() || null,
      };

      const url =
        mode === "add"
          ? API_BASE_URL
          : `${API_BASE_URL}/${subject?.subject_id}`;

      const response = await fetch(url, {
        method: mode === "add" ? "POST" : "PUT",
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
      console.error("SAVE SUBJECT ERROR:", err);

      setError(err instanceof Error ? err.message : "Failed to save subject.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="subject-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="subject-modal" role="dialog" aria-modal="true">
        {/* HEADER */}

        <div className="subject-modal-header">
          <div>
            <h2>{mode === "add" ? "Add Subject" : "Edit Subject"}</h2>

            <p>
              {mode === "add"
                ? "Create a new subject record."
                : "Update this subject record."}
            </p>
          </div>

          <button
            type="button"
            className="subject-modal-close"
            onClick={handleClose}
            disabled={saving}
          >
            ×
          </button>
        </div>

        {/* FORM */}

        <form onSubmit={handleSubmit}>
          <div className="subject-modal-body">
            {error && <div className="subject-modal-error">{error}</div>}

            {/* CODE */}

            <div className="subject-form-group">
              <label htmlFor="subjectCode">
                Subject Code <span>*</span>
              </label>

              <input
                id="subjectCode"
                type="text"
                value={subjectCode}
                onChange={(event) => setSubjectCode(event.target.value)}
                placeholder="e.g. IT101"
                maxLength={20}
                disabled={saving}
              />
            </div>

            {/* NAME */}

            <div className="subject-form-group">
              <label htmlFor="subjectName">
                Subject Name <span>*</span>
              </label>

              <input
                id="subjectName"
                type="text"
                value={subjectName}
                onChange={(event) => setSubjectName(event.target.value)}
                placeholder="e.g. Introduction to Information Technology"
                maxLength={200}
                disabled={saving}
              />
            </div>

            {/* UNITS */}

            <div className="subject-form-row three-columns">
              <div className="subject-form-group">
                <label htmlFor="units">
                  Units <span>*</span>
                </label>

                <input
                  id="units"
                  type="number"
                  min="0"
                  step="1"
                  value={units}
                  onChange={(event) => setUnits(event.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="subject-form-group">
                <label htmlFor="lectureHours">Lecture Hours</label>

                <input
                  id="lectureHours"
                  type="number"
                  min="0"
                  step="1"
                  value={lectureHours}
                  onChange={(event) => setLectureHours(event.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="subject-form-group">
                <label htmlFor="laboratoryHours">Laboratory Hours</label>

                <input
                  id="laboratoryHours"
                  type="number"
                  min="0"
                  step="1"
                  value={laboratoryHours}
                  onChange={(event) => setLaboratoryHours(event.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            {/* DESCRIPTION */}

            <div className="subject-form-group">
              <label htmlFor="description">Description</label>

              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Enter subject description..."
                rows={4}
                disabled={saving}
              />
            </div>
          </div>

          {/* FOOTER */}

          <div className="subject-modal-footer">
            <button
              type="button"
              className="subject-modal-cancel"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="subject-modal-submit"
              disabled={saving}
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
