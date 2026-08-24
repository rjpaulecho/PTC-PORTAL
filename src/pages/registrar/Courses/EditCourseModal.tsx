import React, { useState } from "react";

const API_BASE_URL = "http://localhost:3000/api/registrar/courses";

interface Course {
  course_id: number;
  department_id: number;
  course_code: string;
  course_name: string;
  total_years: number;
}

interface Department {
  department_id: number;
  department_code: string;
  department_name: string;
}

interface EditCourseModalProps {
  course: Course;
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditCourseModal({
  course,
  departments,
  onClose,
  onSuccess,
}: EditCourseModalProps) {
  const [departmentId, setDepartmentId] = useState(
    String(course.department_id),
  );

  const [courseCode, setCourseCode] = useState(course.course_code);

  const [courseName, setCourseName] = useState(course.course_name);

  const [totalYears, setTotalYears] = useState(String(course.total_years));

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError("");

    if (!departmentId) {
      setError("Please select a department.");
      return;
    }

    if (!courseCode.trim()) {
      setError("Course code is required.");
      return;
    }

    if (!courseName.trim()) {
      setError("Course name is required.");
      return;
    }

    const years = Number(totalYears);

    if (!Number.isInteger(years) || years < 1 || years > 10) {
      setError("Total years must be between 1 and 10.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/${course.course_id}`, {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",

          Accept: "application/json",
        },

        body: JSON.stringify({
          department_id: Number(departmentId),

          course_code: courseCode.trim(),

          course_name: courseName.trim(),

          total_years: years,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update course.");
      }

      onSuccess();
    } catch (err) {
      console.error("UPDATE COURSE ERROR:", err);

      setError(err instanceof Error ? err.message : "Unable to update course.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="course-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="course-modal">
        <div className="course-modal-header">
          <div>
            <h2>Edit Course</h2>

            <p>Update course information.</p>
          </div>

          <button
            type="button"
            className="course-modal-close"
            onClick={onClose}
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="course-modal-form">
          <div className="course-form-group">
            <label>Department</label>

            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={loading}
            >
              <option value="">Select Department</option>

              {departments.map((department) => (
                <option
                  key={department.department_id}
                  value={String(department.department_id)}
                >
                  {department.department_code} - {department.department_name}
                </option>
              ))}
            </select>
          </div>

          <div className="course-form-group">
            <label>Course Code</label>

            <input
              type="text"
              value={courseCode}
              onChange={(event) =>
                setCourseCode(event.target.value.toUpperCase())
              }
              maxLength={20}
              disabled={loading}
            />
          </div>

          <div className="course-form-group">
            <label>Course Name</label>

            <input
              type="text"
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              maxLength={200}
              disabled={loading}
            />
          </div>

          <div className="course-form-group">
            <label>Total Years</label>

            <select
              value={totalYears}
              onChange={(event) => setTotalYears(event.target.value)}
              disabled={loading}
            >
              <option value="1">1 Year</option>

              <option value="2">2 Years</option>

              <option value="3">3 Years</option>

              <option value="4">4 Years</option>

              <option value="5">5 Years</option>

              <option value="6">6 Years</option>
            </select>
          </div>

          {error && <div className="course-modal-error">{error}</div>}

          <div className="course-modal-actions">
            <button
              type="button"
              className="course-cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="course-save-btn"
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
