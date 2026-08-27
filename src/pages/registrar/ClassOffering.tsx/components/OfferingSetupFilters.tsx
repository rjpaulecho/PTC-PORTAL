// =====================================================
// TYPES
// =====================================================

export interface AcademicYearOption {
  academic_year_id: number;
  academic_year: string;
  is_current?: boolean;
}

export interface SemesterOption {
  semester_id: number;
  semester_name: string;
}

export interface CourseOption {
  course_id: number;
  course_code: string;
  course_name: string;
  total_years?: number;
}

export interface CurriculumOption {
  curriculum_id: number;
  course_id?: number;

  curriculum_name: string;
  effective_year: number;

  is_active?: boolean;
}

export interface SectionOption {
  section_id: number;
  section_name: string;

  course_id?: number;
  course_code?: string;

  year_level: number;

  max_students?: number;
}

// =====================================================
// PROPS
// =====================================================

interface OfferingSetupFiltersProps {
  academicYears: AcademicYearOption[];

  semesters: SemesterOption[];

  courses: CourseOption[];

  yearLevels: number[];

  curricula: CurriculumOption[];

  sections: SectionOption[];

  academicYearId: string;

  semesterId: string;

  courseId: string;

  yearLevel: string;

  curriculumId: string;

  sectionId: string;

  loading?: boolean;

  onAcademicYearChange: (value: string) => void;

  onSemesterChange: (value: string) => void;

  onCourseChange: (value: string) => void;

  onYearLevelChange: (value: string) => void;

  onCurriculumChange: (value: string) => void;

  onSectionChange: (value: string) => void;
}

// =====================================================
// COMPONENT
// =====================================================

export default function OfferingSetupFilters({
  academicYears,
  semesters,
  courses,
  yearLevels,
  curricula,
  sections,

  academicYearId,
  semesterId,
  courseId,
  yearLevel,
  curriculumId,
  sectionId,

  loading = false,

  onAcademicYearChange,
  onSemesterChange,
  onCourseChange,
  onYearLevelChange,
  onCurriculumChange,
  onSectionChange,
}: OfferingSetupFiltersProps) {
  // =====================================================
  // CASCADE STATE
  //
  // Academic Year
  //      ↓
  // Semester
  //      ↓
  // Course
  //      ↓
  // Year Level
  //      ↓
  // Curriculum
  //      ↓
  // Section
  //
  // The parent component remains responsible for clearing
  // child selections whenever a parent selection changes.
  // =====================================================

  const semesterDisabled = loading || !academicYearId;

  const courseDisabled = loading || !academicYearId || !semesterId;

  const yearLevelDisabled =
    loading || !academicYearId || !semesterId || !courseId;

  const curriculumDisabled =
    loading || !academicYearId || !semesterId || !courseId || !yearLevel;

  const sectionDisabled =
    loading ||
    !academicYearId ||
    !semesterId ||
    !courseId ||
    !yearLevel ||
    !curriculumId;

  // =====================================================
  // ACTIVE CURRICULA
  //
  // setup-data should already be authoritative, but if the
  // backend includes an inactive curriculum in the returned
  // options, do not allow it to be newly selected.
  // =====================================================

  const selectableCurricula = curricula.filter(
    (curriculum) => curriculum.is_active !== false,
  );

  // =====================================================
  // COMPONENT
  // =====================================================

  return (
    <section className="class-offering-section">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="class-offering-section-header">
        <div>
          <h2>Academic Term &amp; Section</h2>

          <p>
            Select the academic term, program, curriculum, and section to
            configure.
          </p>
        </div>
      </div>

      {/* ================================================= */}
      {/* INITIAL LOADING */}
      {/* ================================================= */}

      {loading && academicYears.length === 0 ? (
        <div className="class-offering-loading">Loading offering setup...</div>
      ) : (
        <div className="class-offering-filter-grid">
          {/* ============================================= */}
          {/* ACADEMIC YEAR */}
          {/* ============================================= */}

          <div className="class-offering-field">
            <label htmlFor="offering-academic-year">Academic Year</label>

            <select
              id="offering-academic-year"
              value={academicYearId}
              disabled={loading}
              onChange={(event) => onAcademicYearChange(event.target.value)}
            >
              <option value="">
                {academicYears.length === 0
                  ? "No Academic Years Available"
                  : "Select Academic Year"}
              </option>

              {academicYears.map((year) => (
                <option
                  key={year.academic_year_id}
                  value={String(year.academic_year_id)}
                >
                  {year.academic_year}
                  {year.is_current ? " — Current" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* ============================================= */}
          {/* SEMESTER */}
          {/* ============================================= */}

          <div className="class-offering-field">
            <label htmlFor="offering-semester">Semester</label>

            <select
              id="offering-semester"
              value={semesterId}
              disabled={semesterDisabled}
              onChange={(event) => onSemesterChange(event.target.value)}
            >
              <option value="">
                {!academicYearId
                  ? "Select Academic Year First"
                  : semesters.length === 0
                    ? "No Semesters Available"
                    : "Select Semester"}
              </option>

              {semesters.map((semester) => (
                <option
                  key={semester.semester_id}
                  value={String(semester.semester_id)}
                >
                  {semester.semester_name}
                </option>
              ))}
            </select>
          </div>

          {/* ============================================= */}
          {/* COURSE */}
          {/* ============================================= */}

          <div className="class-offering-field">
            <label htmlFor="offering-course">Course</label>

            <select
              id="offering-course"
              value={courseId}
              disabled={courseDisabled}
              onChange={(event) => onCourseChange(event.target.value)}
            >
              <option value="">
                {!semesterId
                  ? "Select Semester First"
                  : courses.length === 0
                    ? "No Courses Available"
                    : "Select Course"}
              </option>

              {courses.map((course) => (
                <option key={course.course_id} value={String(course.course_id)}>
                  {course.course_code} — {course.course_name}
                </option>
              ))}
            </select>
          </div>

          {/* ============================================= */}
          {/* YEAR LEVEL */}
          {/* ============================================= */}

          <div className="class-offering-field">
            <label htmlFor="offering-year-level">Year Level</label>

            <select
              id="offering-year-level"
              value={yearLevel}
              disabled={yearLevelDisabled}
              onChange={(event) => onYearLevelChange(event.target.value)}
            >
              <option value="">
                {!courseId
                  ? "Select Course First"
                  : yearLevels.length === 0
                    ? "No Year Levels Available"
                    : "Select Year Level"}
              </option>

              {yearLevels.map((level) => (
                <option key={level} value={String(level)}>
                  Year {level}
                </option>
              ))}
            </select>
          </div>

          {/* ============================================= */}
          {/* CURRICULUM */}
          {/* ============================================= */}

          <div className="class-offering-field">
            <label htmlFor="offering-curriculum">Curriculum</label>

            <select
              id="offering-curriculum"
              value={curriculumId}
              disabled={curriculumDisabled}
              onChange={(event) => onCurriculumChange(event.target.value)}
            >
              <option value="">
                {!yearLevel
                  ? "Select Year Level First"
                  : selectableCurricula.length === 0
                    ? "No Active Curricula Available"
                    : "Select Curriculum"}
              </option>

              {selectableCurricula.map((curriculum) => (
                <option
                  key={curriculum.curriculum_id}
                  value={String(curriculum.curriculum_id)}
                >
                  {curriculum.curriculum_name} ({curriculum.effective_year})
                </option>
              ))}
            </select>
          </div>

          {/* ============================================= */}
          {/* SECTION */}
          {/* ============================================= */}

          <div className="class-offering-field">
            <label htmlFor="offering-section">Section</label>

            <select
              id="offering-section"
              value={sectionId}
              disabled={sectionDisabled}
              onChange={(event) => onSectionChange(event.target.value)}
            >
              <option value="">
                {!curriculumId
                  ? "Select Curriculum First"
                  : sections.length === 0
                    ? "No Sections Available"
                    : "Select Section"}
              </option>

              {sections.map((section) => (
                <option
                  key={section.section_id}
                  value={String(section.section_id)}
                >
                  {section.section_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </section>
  );
}
