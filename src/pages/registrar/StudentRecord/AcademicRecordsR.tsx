import { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";

import "../../../styles/RegistrarAcademicRecord.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/students";

// =====================================================
// TYPES
// =====================================================

type AcademicClassification = "Passed" | "Incomplete" | "Failed" | "Unknown";

// =====================================================
// STUDENT
// =====================================================

interface Student {
  student_id: number;
  student_number: string;

  first_name: string;
  middle_name: string | null;
  last_name: string;

  gender?: string | null;
  birth_date?: string | null;
  contact_number?: string | null;
  email?: string | null;

  course_id?: number | null;
  course_code: string;
  course_name?: string | null;

  year_level: number;

  status: string;

  section_id?: number | null;
  section_name?: string | null;

  semester_id?: number | null;
  semester_name?: string | null;

  house_no?: string | null;
  street?: string | null;
  barangay?: string | null;
  city?: string | null;
  province?: string | null;
  zip_code?: string | null;
}

// =====================================================
// ACADEMIC RECORD
// =====================================================

interface AcademicRecord {
  enrollment_id: number;

  academic_year_id: number;
  academic_year: string;

  semester_id: number;
  semester_name: string;

  enrollment_status: string;

  enrollment_subject_id: number;

  subject_id: number;
  subject_code: string;
  subject_name: string;

  units: number;

  lecture_hours?: number | null;
  laboratory_hours?: number | null;

  subject_status: string;

  offering_id?: number | null;

  section_id?: number | null;
  section_subject_id?: number | null;
  section_name?: string | null;

  grade_id: number;

  faculty_id?: number | null;

  prelim_grade: number | null;
  midterm_grade: number | null;
  final_grade: number | null;

  // =================================================
  // OFFICIAL ACADEMIC VALUE
  // =================================================

  final_rating: number | null;

  academic_result?: "Passed" | "Incomplete" | "Failed" | null;

  remarks: "Passed" | "Incomplete" | "Failed" | null;

  grade_status: "Draft" | "Submitted" | "Returned" | "Approved";

  submitted_at?: string | null;

  reviewed_by?: number | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  review_remarks?: string | null;

  grade_created_at?: string | null;
  grade_updated_at?: string | null;
}

// =====================================================
// API RESPONSE
// =====================================================

interface AcademicResponse {
  success: boolean;

  student?: Student;

  totalSubjects?: number;

  records?: AcademicRecord[];

  message?: string;
  error?: string;
}

// =====================================================
// GROUP TYPES
// =====================================================

interface SemesterGroup {
  semesterId: number;
  semesterName: string;

  records: AcademicRecord[];
}

interface AcademicYearGroup {
  academicYearId: number;
  academicYear: string;

  semesters: SemesterGroup[];
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
// FORMAT GRADE
// =====================================================

function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return numeric.toFixed(2);
}

// =====================================================
// FORMAT DATE
// =====================================================

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// =====================================================
// CLASSIFY FINAL RATING
// =====================================================
//
// Official result:
// 1.00 - 3.00 = Passed
// 4.00        = Incomplete / Retake
// 5.00        = Failed / Retake
//
// remarks does NOT replace final_rating.
// =====================================================

function classifyFinalRating(
  finalRating: number | null | undefined,
): AcademicClassification {
  if (finalRating === null || finalRating === undefined) {
    return "Unknown";
  }

  const rating = Number(finalRating);

  if (!Number.isFinite(rating)) {
    return "Unknown";
  }

  if (rating >= 1 && rating <= 3) {
    return "Passed";
  }

  if (rating === 4) {
    return "Incomplete";
  }

  if (rating === 5) {
    return "Failed";
  }

  return "Unknown";
}

// =====================================================
// OFFICIAL RESULT
// =====================================================
//
// Prefer backend academic_result.
//
// final_rating remains the fallback truth so the
// frontend stays safe if academic_result is missing.
// =====================================================

function getClassification(record: AcademicRecord): AcademicClassification {
  if (
    record.academic_result === "Passed" ||
    record.academic_result === "Incomplete" ||
    record.academic_result === "Failed"
  ) {
    return record.academic_result;
  }

  return classifyFinalRating(record.final_rating);
}

// =====================================================
// RETAKE
// =====================================================

function requiresRetake(record: AcademicRecord): boolean {
  const classification = getClassification(record);

  return classification === "Incomplete" || classification === "Failed";
}

// =====================================================
// STATUS CSS
// =====================================================

function getStatusClass(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, "-") || "unknown";
}

// =====================================================
// STUDENT NAME
// =====================================================

function getStudentName(student: Student): string {
  return [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(" ");
}

// =====================================================
// COMPONENT
// =====================================================

export default function AcademicRecordsR() {
  const navigate = useNavigate();

  const { id } = useParams<{
    id: string;
  }>();

  // ===================================================
  // AUTHENTICATION
  // ===================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // ===================================================
  // DATA STATE
  // ===================================================

  const [student, setStudent] = useState<Student | null>(null);

  const [records, setRecords] = useState<AcademicRecord[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  // ===================================================
  // FILTERS
  // ===================================================

  const [search, setSearch] = useState("");

  const [academicYearFilter, setAcademicYearFilter] = useState("All");

  const [semesterFilter, setSemesterFilter] = useState("All");

  const [resultFilter, setResultFilter] = useState("All");

  // ===================================================
  // AUTHORIZATION
  // ===================================================

  useEffect(() => {
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    if (userRole !== "Registrar") {
      if (user) {
        navigate(authService.getDashboardRoute(user.role), {
          replace: true,
        });
      } else {
        navigate("/login", {
          replace: true,
        });
      }
    }
  }, [authenticated, userRole, user, navigate]);

  // ===================================================
  // LOAD OFFICIAL ACADEMIC RECORD
  // ===================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    if (!id) {
      setError("Invalid student ID.");

      setLoading(false);

      return;
    }

    const studentId = Number(id);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      setError("Invalid student ID.");

      setLoading(false);

      return;
    }

    const controller = new AbortController();

    const loadAcademicRecords = async () => {
      try {
        setLoading(true);
        setError("");

        const requestUrl = `${API_BASE_URL}/${studentId}/academic-records`;

        console.log("GET REGISTRAR OFFICIAL ACADEMIC RECORD:", requestUrl);

        const response = await authService.authFetch(requestUrl, {
          method: "GET",

          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

        const data = await readJsonResponse<AcademicResponse>(response);

        // =============================================
        // 401
        // =============================================

        if (response.status === 401) {
          authService.logout();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        // =============================================
        // 403
        // =============================================

        if (response.status === 403) {
          throw new Error(data.message || "Registrar access is required.");
        }

        // =============================================
        // HTTP / API ERROR
        // =============================================

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || data.error || "Unable to load academic records.",
          );
        }

        if (!data.student) {
          throw new Error(
            "Student information was not returned by the server.",
          );
        }

        // =============================================
        // DEFENSIVE OFFICIAL FILTER
        //
        // Only:
        //
        // Approved Enrollment
        // Approved Grade
        // final_rating present
        // First / Second Semester
        //
        // =============================================

        const officialRecords = Array.isArray(data.records)
          ? data.records.filter(
              (record) =>
                record.enrollment_status === "Approved" &&
                record.grade_status === "Approved" &&
                record.final_rating !== null &&
                [1, 2].includes(Number(record.semester_id)),
            )
          : [];

        setStudent(data.student);

        setRecords(officialRecords);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        console.error("GET REGISTRAR ACADEMIC RECORD ERROR:", requestError);

        setStudent(null);

        setRecords([]);

        if (requestError instanceof TypeError) {
          setError(
            "Unable to connect to the academic records server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load academic records.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadAcademicRecords();

    return () => {
      controller.abort();
    };
  }, [id, authenticated, userRole, navigate, refreshKey]);

  // ===================================================
  // ACADEMIC YEAR OPTIONS
  // ===================================================

  const academicYears = useMemo(() => {
    const values = new Map<number, string>();

    records.forEach((record) => {
      values.set(record.academic_year_id, record.academic_year);
    });

    return Array.from(values.entries()).sort((a, b) => b[0] - a[0]);
  }, [records]);

  // ===================================================
  // SEMESTER OPTIONS
  // ===================================================

  const semesters = useMemo(() => {
    const values = new Map<number, string>();

    records.forEach((record) => {
      if (record.semester_id !== 1 && record.semester_id !== 2) {
        return;
      }

      values.set(record.semester_id, record.semester_name);
    });

    return Array.from(values.entries()).sort((a, b) => a[0] - b[0]);
  }, [records]);

  // ===================================================
  // FILTER RECORDS
  // ===================================================

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const classification = getClassification(record);

      const matchesSearch =
        !query ||
        record.subject_code.toLowerCase().includes(query) ||
        record.subject_name.toLowerCase().includes(query) ||
        (record.section_name || "").toLowerCase().includes(query) ||
        (record.faculty_id !== null &&
          record.faculty_id !== undefined &&
          `faculty ${record.faculty_id}`.toLowerCase().includes(query));

      const matchesAY =
        academicYearFilter === "All" ||
        String(record.academic_year_id) === academicYearFilter;

      const matchesSemester =
        semesterFilter === "All" ||
        String(record.semester_id) === semesterFilter;

      const matchesResult =
        resultFilter === "All" || classification === resultFilter;

      return matchesSearch && matchesAY && matchesSemester && matchesResult;
    });
  }, [records, search, academicYearFilter, semesterFilter, resultFilter]);

  // ===================================================
  // OFFICIAL SUMMARY
  // ===================================================

  const summary = useMemo(() => {
    const passed = records.filter(
      (record) => getClassification(record) === "Passed",
    );

    const incomplete = records.filter(
      (record) => getClassification(record) === "Incomplete",
    );

    const failed = records.filter(
      (record) => getClassification(record) === "Failed",
    );

    const retakes = records.filter(requiresRetake);

    const totalRecordedUnits = records.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    const earnedUnits = passed.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    return {
      total: records.length,

      passed: passed.length,

      incomplete: incomplete.length,

      failed: failed.length,

      retakes: retakes.length,

      totalRecordedUnits,

      earnedUnits,
    };
  }, [records]);

  // ===================================================
  // GROUP RECORDS BY AY / SEMESTER
  // ===================================================

  const groupedRecords = useMemo<AcademicYearGroup[]>(() => {
    const yearMap = new Map<number, AcademicYearGroup>();

    filteredRecords.forEach((record) => {
      let yearGroup = yearMap.get(record.academic_year_id);

      if (!yearGroup) {
        yearGroup = {
          academicYearId: record.academic_year_id,

          academicYear: record.academic_year,

          semesters: [],
        };

        yearMap.set(record.academic_year_id, yearGroup);
      }

      let semesterGroup = yearGroup.semesters.find(
        (semester) => semester.semesterId === record.semester_id,
      );

      if (!semesterGroup) {
        semesterGroup = {
          semesterId: record.semester_id,

          semesterName: record.semester_name,

          records: [],
        };

        yearGroup.semesters.push(semesterGroup);
      }

      semesterGroup.records.push(record);
    });

    const groups = Array.from(yearMap.values());

    // newest AY first
    groups.sort((a, b) => b.academicYearId - a.academicYearId);

    groups.forEach((year) => {
      year.semesters.sort((a, b) => a.semesterId - b.semesterId);
    });

    return groups;
  }, [filteredRecords]);

  // ===================================================
  // FILTER ACTIONS
  // ===================================================

  const clearFilters = () => {
    setSearch("");

    setAcademicYearFilter("All");

    setSemesterFilter("All");

    setResultFilter("All");
  };

  // ===================================================
  // REFRESH
  // ===================================================

  const refresh = () => {
    setRefreshKey((current) => current + 1);
  };

  // ===================================================
  // AUTH RENDER GUARD
  // ===================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <DashboardLayout>
      <main className="registrar-academic-record-page">
        {/* =================================================
            HEADER
        ================================================= */}

        <section className="registrar-record-header">
          <div>
            <span className="registrar-record-eyebrow">
              Registrar • Student Records
            </span>

            <h1>Official Academic Record</h1>

            <p>
              Review the student's official academic history based exclusively
              on approved grades and approved enrollment attempts.
            </p>
          </div>

          <div className="registrar-record-header-actions">
            <button
              type="button"
              className="registrar-record-back"
              onClick={() => navigate(-1)}
            >
              Back
            </button>

            <button
              type="button"
              className="registrar-record-refresh"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh Record"}
            </button>
          </div>
        </section>

        {/* =================================================
            OFFICIAL RECORD NOTICE
        ================================================= */}

        <section className="registrar-record-official-notice">
          <div className="registrar-record-official-icon">✓</div>

          <div>
            <strong>Official Academic History</strong>

            <p>
              Only Program Head-approved grades from approved enrollments appear
              here. Draft, Submitted, and Returned grades are not official
              academic records.
            </p>
          </div>
        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <section className="registrar-record-error">
            <div>
              <strong>Academic record could not be loaded</strong>

              <p>{error}</p>
            </div>

            <button type="button" onClick={refresh}>
              Try Again
            </button>
          </section>
        )}

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && (
          <section className="registrar-record-loading">
            <div className="registrar-record-spinner" />

            <div>
              <strong>Loading official academic record</strong>

              <span>Retrieving approved grade history...</span>
            </div>
          </section>
        )}

        {/* =================================================
            CONTENT
        ================================================= */}

        {!loading && !error && student && (
          <>
            {/* =============================================
                  STUDENT PROFILE
              ============================================= */}

            <section className="registrar-record-student-card">
              <div className="registrar-record-student-primary">
                <div className="registrar-record-avatar">
                  {student.first_name?.charAt(0).toUpperCase() || "S"}
                </div>

                <div>
                  <span>Student</span>

                  <h2>{getStudentName(student)}</h2>

                  <p>{student.student_number}</p>
                </div>
              </div>

              <div className="registrar-record-student-data">
                {/* PROGRAM */}

                <div>
                  <span>Program</span>

                  <strong>{student.course_code}</strong>

                  {student.course_name && <small>{student.course_name}</small>}
                </div>

                {/* YEAR */}

                <div>
                  <span>Current Year Level</span>

                  <strong>Year {student.year_level}</strong>
                </div>

                {/* STATUS */}

                <div>
                  <span>Student Status</span>

                  <strong
                    className={`registrar-record-student-status ${getStatusClass(
                      student.status,
                    )}`}
                  >
                    {student.status}
                  </strong>
                </div>

                {/* SECTION */}

                <div>
                  <span>Current Section</span>

                  <strong>{student.section_name || "Not Assigned"}</strong>

                  <small>{student.semester_name || "—"}</small>
                </div>
              </div>
            </section>

            {/* =============================================
                  SUMMARY
              ============================================= */}

            <section className="registrar-record-summary">
              <div>
                <span>Official Subjects</span>

                <strong>{summary.total}</strong>
              </div>

              <div>
                <span>Earned Units</span>

                <strong>{summary.earnedUnits}</strong>
              </div>

              <div>
                <span>Passed</span>

                <strong>{summary.passed}</strong>
              </div>

              <div>
                <span>Incomplete</span>

                <strong>{summary.incomplete}</strong>
              </div>

              <div>
                <span>Failed</span>

                <strong>{summary.failed}</strong>
              </div>

              <div>
                <span>Retake Required</span>

                <strong>{summary.retakes}</strong>
              </div>
            </section>

            {/* =============================================
                  FILTERS
              ============================================= */}

            <section className="registrar-record-filters">
              <div className="registrar-record-search">
                <label htmlFor="registrar-academic-search">Search</label>

                <input
                  id="registrar-academic-search"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Subject, section, or faculty ID..."
                />
              </div>

              <div>
                <label>Academic Year</label>

                <select
                  value={academicYearFilter}
                  onChange={(event) =>
                    setAcademicYearFilter(event.target.value)
                  }
                >
                  <option value="All">All Academic Years</option>

                  {academicYears.map(([academicYearId, label]) => (
                    <option key={academicYearId} value={academicYearId}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Semester</label>

                <select
                  value={semesterFilter}
                  onChange={(event) => setSemesterFilter(event.target.value)}
                >
                  <option value="All">All Semesters</option>

                  {semesters.map(([semesterId, label]) => (
                    <option key={semesterId} value={semesterId}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Result</label>

                <select
                  value={resultFilter}
                  onChange={(event) => setResultFilter(event.target.value)}
                >
                  <option value="All">All Results</option>

                  <option value="Passed">Passed</option>

                  <option value="Incomplete">Incomplete</option>

                  <option value="Failed">Failed</option>
                </select>
              </div>

              <button
                type="button"
                className="registrar-record-clear"
                onClick={clearFilters}
              >
                Clear
              </button>
            </section>

            {/* =============================================
                  NO OFFICIAL RECORDS
              ============================================= */}

            {records.length === 0 && (
              <section className="registrar-record-empty">
                <div className="registrar-record-empty-icon">✓</div>

                <strong>No official academic grades yet</strong>

                <p>
                  Approved grades will appear here after the Program Head
                  completes grade approval.
                </p>
              </section>
            )}

            {/* =============================================
                  NO FILTER MATCH
              ============================================= */}

            {records.length > 0 && filteredRecords.length === 0 && (
              <section className="registrar-record-empty">
                <strong>No matching academic records</strong>

                <p>No official grade records match the selected filters.</p>

                <button type="button" onClick={clearFilters}>
                  Clear Filters
                </button>
              </section>
            )}

            {/* =============================================
                  ACADEMIC HISTORY
              ============================================= */}

            {groupedRecords.length > 0 && (
              <section className="registrar-record-history">
                <div className="registrar-record-history-heading">
                  <div>
                    <h2>Academic History</h2>

                    <p>
                      Official subject attempts grouped by academic year and
                      semester.
                    </p>
                  </div>

                  <span>
                    {filteredRecords.length} record
                    {filteredRecords.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="registrar-record-year-list">
                  {groupedRecords.map((year) => (
                    <article
                      key={year.academicYearId}
                      className="registrar-record-year"
                    >
                      {/* =================================
                              ACADEMIC YEAR
                          ================================= */}

                      <header className="registrar-record-year-header">
                        <div>
                          <span>Academic Year</span>

                          <h3>{year.academicYear}</h3>
                        </div>

                        <strong>
                          {year.semesters.reduce(
                            (total, semester) =>
                              total + semester.records.length,
                            0,
                          )}{" "}
                          subject
                          {year.semesters.reduce(
                            (total, semester) =>
                              total + semester.records.length,
                            0,
                          ) === 1
                            ? ""
                            : "s"}
                        </strong>
                      </header>

                      {/* =================================
                              SEMESTERS
                          ================================= */}

                      {year.semesters.map((semester) => {
                        const semesterUnits = semester.records.reduce(
                          (total, record) => total + Number(record.units || 0),
                          0,
                        );

                        const earnedUnits = semester.records
                          .filter(
                            (record) => getClassification(record) === "Passed",
                          )
                          .reduce(
                            (total, record) =>
                              total + Number(record.units || 0),
                            0,
                          );

                        return (
                          <section
                            key={`${year.academicYearId}-${semester.semesterId}`}
                            className="registrar-record-semester"
                          >
                            {/* SEMESTER HEADER */}

                            <div className="registrar-record-semester-header">
                              <div>
                                <h4>{semester.semesterName}</h4>

                                <span>
                                  {semester.records.length} subject
                                  {semester.records.length === 1 ? "" : "s"}
                                </span>
                              </div>

                              <div className="registrar-record-semester-stats">
                                <span>
                                  Recorded Units{" "}
                                  <strong>{semesterUnits}</strong>
                                </span>

                                <span>
                                  Earned Units <strong>{earnedUnits}</strong>
                                </span>
                              </div>
                            </div>

                            {/* TABLE */}

                            <div className="registrar-record-table-wrapper">
                              <table className="registrar-record-table">
                                <thead>
                                  <tr>
                                    <th>Subject</th>

                                    <th>Section</th>

                                    <th>Units</th>

                                    <th>Prelim</th>

                                    <th>Midterm</th>

                                    <th>Final</th>

                                    <th>Final Rating</th>

                                    <th>Result</th>

                                    <th>Academic Status</th>

                                    <th>Faculty</th>

                                    <th>Approval</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {semester.records.map((record) => {
                                    const classification =
                                      getClassification(record);

                                    return (
                                      <tr key={record.enrollment_subject_id}>
                                        {/* SUBJECT */}

                                        <td>
                                          <div className="registrar-record-subject">
                                            <strong>
                                              {record.subject_code}
                                            </strong>

                                            <span>{record.subject_name}</span>

                                            <small>
                                              ES #{record.enrollment_subject_id}
                                              {" • "}
                                              Grade #{record.grade_id}
                                            </small>
                                          </div>
                                        </td>

                                        {/* SECTION */}

                                        <td>
                                          <span className="registrar-record-section">
                                            {record.section_name || "—"}
                                          </span>
                                        </td>

                                        {/* UNITS */}

                                        <td>
                                          <strong className="registrar-record-units">
                                            {record.units}
                                          </strong>
                                        </td>

                                        {/* PRELIM */}

                                        <td>
                                          {formatGrade(record.prelim_grade)}
                                        </td>

                                        {/* MIDTERM */}

                                        <td>
                                          {formatGrade(record.midterm_grade)}
                                        </td>

                                        {/* FINAL */}

                                        <td>
                                          {formatGrade(record.final_grade)}
                                        </td>

                                        {/* FINAL RATING */}

                                        <td>
                                          <strong className="registrar-record-final-rating">
                                            {formatGrade(record.final_rating)}
                                          </strong>
                                        </td>

                                        {/* RESULT */}

                                        <td>
                                          <div className="registrar-record-result-cell">
                                            <span
                                              className={`registrar-record-result ${classification.toLowerCase()}`}
                                            >
                                              {classification}
                                            </span>

                                            {requiresRetake(record) && (
                                              <small className="registrar-record-retake">
                                                Retake required
                                              </small>
                                            )}
                                          </div>
                                        </td>

                                        {/* SUBJECT STATUS */}

                                        <td>
                                          <span
                                            className={`registrar-record-subject-status ${getStatusClass(
                                              record.subject_status,
                                            )}`}
                                          >
                                            {record.subject_status}
                                          </span>
                                        </td>

                                        {/* FACULTY */}

                                        <td>
                                          <div className="registrar-record-faculty">
                                            {record.faculty_id ? (
                                              <>
                                                <strong>
                                                  Faculty #{record.faculty_id}
                                                </strong>

                                                <small>Assigned Faculty</small>
                                              </>
                                            ) : (
                                              <span>—</span>
                                            )}
                                          </div>
                                        </td>

                                        {/* APPROVAL */}

                                        <td>
                                          <div className="registrar-record-approval">
                                            <span className="registrar-record-approved">
                                              Approved
                                            </span>

                                            {record.reviewed_by_username && (
                                              <small>
                                                By {record.reviewed_by_username}
                                              </small>
                                            )}

                                            {record.reviewed_at && (
                                              <small>
                                                {formatDateTime(
                                                  record.reviewed_at,
                                                )}
                                              </small>
                                            )}

                                            {record.review_remarks && (
                                              <small className="registrar-record-review-note">
                                                {record.review_remarks}
                                              </small>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        );
                      })}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* =============================================
                  OFFICIAL RESULT GUIDE
              ============================================= */}

            <section className="registrar-record-guide">
              <div className="registrar-record-guide-heading">
                <span>Official Result Guide</span>

                <strong>Final Rating</strong>
              </div>

              <div className="registrar-record-guide-items">
                {/* PASSED */}

                <div>
                  <span className="registrar-record-guide-rating passed">
                    1.00–3.00
                  </span>

                  <div>
                    <strong>Passed</strong>

                    <p>
                      Subject is successfully completed and units are earned.
                    </p>
                  </div>
                </div>

                {/* INCOMPLETE */}

                <div>
                  <span className="registrar-record-guide-rating incomplete">
                    4.00
                  </span>

                  <div>
                    <strong>Incomplete</strong>

                    <p>Subject remains an academic retake candidate.</p>
                  </div>
                </div>

                {/* FAILED */}

                <div>
                  <span className="registrar-record-guide-rating failed">
                    5.00
                  </span>

                  <div>
                    <strong>Failed</strong>

                    <p>
                      Subject must be retaken according to enrollment and
                      prerequisite rules.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* =============================================
                  FOOTER
              ============================================= */}

            <section className="registrar-record-footer">
              <div>
                <strong>Official Academic Record</strong>

                <p>
                  These approved results are the academic truth used by the PTC
                  Portal for prerequisites, retake detection, and future
                  enrollment eligibility.
                </p>
              </div>

              {/* =========================================
                    TOTAL RECORDED UNITS
                ========================================= */}

              <div className="registrar-record-footer-units">
                <span>Recorded Units</span>

                <strong>{summary.totalRecordedUnits}</strong>
              </div>

              {/* =========================================
                    ACTIONS
                ========================================= */}

              <div className="registrar-record-actions">
                <button
                  type="button"
                  className="registrar-record-profile-button"
                  onClick={() =>
                    navigate(
                      `/registrar/student/DetailsR/${student.student_id}`,
                    )
                  }
                >
                  Student Profile
                </button>

                <button
                  type="button"
                  className="registrar-record-transcript-button"
                  onClick={() =>
                    navigate(
                      `/registrar/student/${student.student_id}/transcriptR`,
                    )
                  }
                >
                  View Transcript
                </button>

                <button
                  type="button"
                  className="registrar-record-documents-button"
                  onClick={() =>
                    navigate(
                      `/registrar/student/${student.student_id}/DocumentsR`,
                    )
                  }
                >
                  Certificate Of Registration
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
