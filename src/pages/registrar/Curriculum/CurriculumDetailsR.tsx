import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";

import CurriculumSubjectModal from "./CurriculumSubjectModal";
import RemoveSubjectModal from "./RemoveSubjectModal";

import "../../../styles/CurriculumDetailR.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/curriculums";

// =====================================================
// TYPES
// =====================================================

interface Curriculum {
  curriculum_id: number;
  course_id: number;
  course_code: string;
  course_name: string;
  curriculum_name: string;
  effective_year: number;
  total_units: number;
  is_active: number;
}

export interface CurriculumSubject {
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

interface CurriculumResponse {
  success: boolean;
  curriculum: Curriculum;
  totalSubjects: number;
  mappedUnits: number;
  subjects: CurriculumSubject[];
  message?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function CurriculumDetailR() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // =====================================================
  // CURRICULUM STATE
  // =====================================================

  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);

  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);

  const [totalSubjects, setTotalSubjects] = useState(0);

  const [mappedUnits, setMappedUnits] = useState(0);

  // =====================================================
  // PAGE STATE
  // =====================================================

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // ADD / EDIT MODAL
  // =====================================================

  const [subjectModalOpen, setSubjectModalOpen] = useState(false);

  const [subjectModalMode, setSubjectModalMode] = useState<"add" | "edit">(
    "add",
  );

  const [selectedSubject, setSelectedSubject] =
    useState<CurriculumSubject | null>(null);

  // =====================================================
  // REMOVE MODAL
  // =====================================================

  const [removeModalOpen, setRemoveModalOpen] = useState(false);

  const [subjectToRemove, setSubjectToRemove] =
    useState<CurriculumSubject | null>(null);

  // =====================================================
  // AUTH CHECK
  // =====================================================

  useEffect(() => {
    const user = authService.getSession();

    if (!user || user.role !== "Registrar") {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // =====================================================
  // LOAD CURRICULUM
  // =====================================================

  const loadCurriculum = useCallback(
    async (showMainLoading = true) => {
      if (!id) {
        setError("Invalid curriculum ID.");
        setLoading(false);
        return;
      }

      const curriculumId = Number(id);

      if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
        setError("Invalid curriculum ID.");
        setLoading(false);
        return;
      }

      try {
        if (showMainLoading) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        setError("");

        const url = `${API_BASE_URL}/${curriculumId}`;

        console.log("GET CURRICULUM DETAILS:", url);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data: CurriculumResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to load curriculum details.");
        }

        setCurriculum(data.curriculum);

        setSubjects(data.subjects || []);

        setTotalSubjects(Number(data.totalSubjects || 0));

        setMappedUnits(Number(data.mappedUnits || 0));
      } catch (err) {
        console.error("LOAD CURRICULUM DETAILS ERROR:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load curriculum details.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    loadCurriculum(true);
  }, [loadCurriculum]);

  // =====================================================
  // OPEN ADD MODAL
  // =====================================================

  const handleAddSubject = () => {
    setSubjectModalMode("add");

    setSelectedSubject(null);

    setSubjectModalOpen(true);
  };

  // =====================================================
  // OPEN EDIT MODAL
  // =====================================================

  const handleEditSubject = (subject: CurriculumSubject) => {
    setSubjectModalMode("edit");

    setSelectedSubject(subject);

    setSubjectModalOpen(true);
  };

  // =====================================================
  // CLOSE SUBJECT MODAL
  // =====================================================

  const handleCloseSubjectModal = () => {
    setSubjectModalOpen(false);

    setSelectedSubject(null);
  };

  // =====================================================
  // SUBJECT SAVE SUCCESS
  // =====================================================

  const handleSubjectSuccess = async () => {
    setSubjectModalOpen(false);

    setSelectedSubject(null);

    await loadCurriculum(false);
  };

  // =====================================================
  // OPEN REMOVE MODAL
  // =====================================================

  const handleRemoveSubject = (subject: CurriculumSubject) => {
    setSubjectToRemove(subject);

    setRemoveModalOpen(true);
  };

  // =====================================================
  // CLOSE REMOVE MODAL
  // =====================================================

  const handleCloseRemoveModal = () => {
    setRemoveModalOpen(false);

    setSubjectToRemove(null);
  };

  // =====================================================
  // REMOVE SUCCESS
  // =====================================================

  const handleRemoveSuccess = async () => {
    setRemoveModalOpen(false);

    setSubjectToRemove(null);

    await loadCurriculum(false);
  };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="registrar-curriculum-detail">
          <div className="curriculum-loading">
            <div className="loading-spinner"></div>

            <h2>Loading curriculum...</h2>

            <p>Please wait while the curriculum details are being loaded.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // ERROR
  // =====================================================

  if (error) {
    return (
      <DashboardLayout>
        <div className="registrar-curriculum-detail">
          <div className="curriculum-error">
            <h2>Unable to load curriculum</h2>

            <p>{error}</p>

            <button
              type="button"
              onClick={() => navigate("/registrar/curriculum/management")}
            >
              Back to Curriculums
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // NOT FOUND
  // =====================================================

  if (!curriculum) {
    return (
      <DashboardLayout>
        <div className="registrar-curriculum-detail">
          <div className="curriculum-error">
            <h2>Curriculum not found</h2>

            <button
              type="button"
              onClick={() => navigate("/registrar/curriculum/management")}
            >
              Back to Curriculums
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // PAGE
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-curriculum-detail">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="curriculum-detail-header">
          <div>
            <button
              type="button"
              className="back-button"
              onClick={() => navigate("/registrar/curriculum/management")}
            >
              ← Back to Curriculums
            </button>

            <h1>{curriculum.curriculum_name}</h1>

            <p>
              {curriculum.course_code} — {curriculum.course_name}
            </p>
          </div>

          <div className="curriculum-status">
            {curriculum.is_active === 1 ? (
              <span className="status-active">Active</span>
            ) : (
              <span className="status-inactive">Inactive</span>
            )}
          </div>
        </div>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <div className="curriculum-summary">
          <div className="summary-card">
            <span>Course</span>

            <strong>{curriculum.course_code}</strong>
          </div>

          <div className="summary-card">
            <span>Effective Year</span>

            <strong>{curriculum.effective_year}</strong>
          </div>

          <div className="summary-card">
            <span>Total Units</span>

            <strong>{curriculum.total_units}</strong>
          </div>

          <div className="summary-card">
            <span>Mapped Subjects</span>

            <strong>{totalSubjects}</strong>
          </div>

          <div className="summary-card">
            <span>Mapped Units</span>

            <strong>{mappedUnits}</strong>
          </div>
        </div>

        {/* =================================================
            SUBJECT SECTION
        ================================================= */}

        <div className="curriculum-subject-section">
          {/* SECTION HEADER */}

          <div className="section-header">
            <div>
              <h2>Curriculum Subjects</h2>

              <p>Subjects currently mapped to this curriculum.</p>
            </div>

            <button
              type="button"
              className="add-subject-button"
              onClick={handleAddSubject}
            >
              + Add Subject
            </button>
          </div>

          {/* REFRESH INDICATOR */}

          {refreshing && (
            <div className="curriculum-refreshing">Updating curriculum...</div>
          )}

          {/* =================================================
              EMPTY
          ================================================= */}

          {subjects.length === 0 ? (
            <div className="empty-subjects">
              <h3>No subjects mapped</h3>

              <p>This curriculum does not have any subjects assigned yet.</p>

              <button
                type="button"
                className="empty-add-subject-button"
                onClick={handleAddSubject}
              >
                + Add First Subject
              </button>
            </div>
          ) : (
            <div className="curriculum-years">
              {[1, 2, 3, 4].map((year) => {
                const yearSubjects = subjects.filter(
                  (subject) => Number(subject.year_level) === year,
                );

                if (yearSubjects.length === 0) {
                  return null;
                }

                return (
                  <div className="curriculum-year" key={year}>
                    {/* YEAR */}

                    <div className="year-header">
                      <h3>
                        {year === 1 && "1st Year"}
                        {year === 2 && "2nd Year"}
                        {year === 3 && "3rd Year"}
                        {year === 4 && "4th Year"}
                      </h3>
                    </div>

                    {/* SEMESTERS */}

                    {[1, 2].map((semester) => {
                      const semesterSubjects = yearSubjects
                        .filter(
                          (subject) => Number(subject.semester_id) === semester,
                        )
                        .sort(
                          (a, b) =>
                            Number(a.display_order) - Number(b.display_order),
                        );

                      if (semesterSubjects.length === 0) {
                        return null;
                      }

                      return (
                        <div
                          className="semester-section"
                          key={`${year}-${semester}`}
                        >
                          {/* SEMESTER HEADER */}

                          <div className="semester-header">
                            <h4>
                              {semester === 1 ? "1st Semester" : "2nd Semester"}
                            </h4>

                            <span>
                              {semesterSubjects.length}{" "}
                              {semesterSubjects.length === 1
                                ? "subject"
                                : "subjects"}
                            </span>
                          </div>

                          {/* TABLE */}

                          <div className="subject-table-wrapper">
                            <table className="subject-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Code</th>
                                  <th>Subject</th>
                                  <th>Units</th>
                                  <th>Lecture</th>
                                  <th>Laboratory</th>
                                  <th>Type</th>
                                  <th>Action</th>
                                </tr>
                              </thead>

                              <tbody>
                                {semesterSubjects.map((subject, index) => (
                                  <tr key={subject.curriculum_subject_id}>
                                    {/* NUMBER */}

                                    <td>{index + 1}</td>

                                    {/* CODE */}

                                    <td>
                                      <strong>{subject.subject_code}</strong>
                                    </td>

                                    {/* SUBJECT */}

                                    <td>{subject.subject_name}</td>

                                    {/* UNITS */}

                                    <td>{subject.units}</td>

                                    {/* LECTURE */}

                                    <td>{subject.lecture_hours}</td>

                                    {/* LAB */}

                                    <td>{subject.laboratory_hours}</td>

                                    {/* TYPE */}

                                    <td>
                                      {subject.is_required === 1
                                        ? "Required"
                                        : "Elective"}
                                    </td>

                                    {/* ACTION */}

                                    <td className="subject-actions">
                                      <button
                                        type="button"
                                        className="edit-subject-button"
                                        onClick={() =>
                                          handleEditSubject(subject)
                                        }
                                      >
                                        Edit
                                      </button>

                                      <button
                                        type="button"
                                        className="delete-subject-button"
                                        onClick={() =>
                                          handleRemoveSubject(subject)
                                        }
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          ADD / EDIT SUBJECT MODAL
      ===================================================== */}

      <CurriculumSubjectModal
        isOpen={subjectModalOpen}
        mode={subjectModalMode}
        curriculumId={curriculum.curriculum_id}
        subject={selectedSubject}
        onClose={handleCloseSubjectModal}
        onSuccess={handleSubjectSuccess}
      />

      {/* =====================================================
          REMOVE SUBJECT MODAL
      ===================================================== */}

      <RemoveSubjectModal
        isOpen={removeModalOpen}
        curriculumId={curriculum.curriculum_id}
        subject={subjectToRemove}
        onClose={handleCloseRemoveModal}
        onSuccess={handleRemoveSuccess}
      />
    </DashboardLayout>
  );
}
