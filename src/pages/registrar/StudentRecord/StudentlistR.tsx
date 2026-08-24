import React, { useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import "../../../styles/RegistrarStudentlist.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/students";

// =====================================================
// TYPES
// =====================================================

interface Student {
  student_id: number;
  student_number: string;

  first_name: string;
  middle_name: string | null;
  last_name: string;

  gender: string;
  birth_date: string;
  contact_number: string;

  email: string;

  course_id: number;
  course_code: string;

  year_level: number;

  section_id: number;
  section_name: string;

  semester_id: number;
  semester_name: string;

  status: string;

  house_no: string | null;
  street: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  zip_code: string | null;
}

interface StudentResponse {
  success: boolean;

  message?: string;
  error?: string;

  page: number;
  limit: number;

  count: number;
  totalStudents: number;
  totalPages: number;

  students: Student[];
}

interface Statistics {
  total: number;
  regular: number;
  executive: number;
  scholarship: number;
}

// =====================================================
// COMPONENT
// =====================================================

export default function StudentListR() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // =====================================================
  // STATES
  // =====================================================

  const [students, setStudents] = useState<Student[]>([]);

  const [statistics, setStatistics] = useState<Statistics>({
    total: 0,
    regular: 0,
    executive: 0,
    scholarship: 0,
  });

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // FILTERS
  // =====================================================

  const [search, setSearch] = useState("");

  const [selectedCourse, setSelectedCourse] = useState("All");

  const [selectedYear, setSelectedYear] = useState("All");

  const [selectedSection, setSelectedSection] = useState("All");

  // =====================================================
  // PAGINATION
  // =====================================================

  const studentsPerPage = 10;

  const [currentPage, setCurrentPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  // =====================================================
  // AUTH GUARD
  // =====================================================

  useEffect(() => {
    // ---------------------------------------------------
    // NO USER OR NO JWT
    // ---------------------------------------------------

    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    // ---------------------------------------------------
    // USER EXISTS BUT WRONG ROLE
    // ---------------------------------------------------

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
  }, [authenticated, userRole, navigate]);

  // =====================================================
  // FETCH STUDENTS
  // =====================================================

  useEffect(() => {
    // Do not make API request
    // if authentication is missing
    // or role is incorrect.

    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    const controller = new AbortController();

    const fetchStudents = async () => {
      try {
        setLoading(true);
        setError("");

        // =============================================
        // QUERY PARAMETERS
        // =============================================

        const params = new URLSearchParams();

        params.append("page", currentPage.toString());

        params.append("limit", studentsPerPage.toString());

        if (search.trim()) {
          params.append("search", search.trim());
        }

        if (selectedCourse !== "All") {
          params.append("course", selectedCourse);
        }

        if (selectedYear !== "All") {
          params.append("year", selectedYear);
        }

        if (selectedSection !== "All") {
          params.append("section", selectedSection);
        }

        const requestUrl = `${API_BASE_URL}?${params.toString()}`;

        console.log("GET REGISTRAR STUDENTS:", requestUrl);

        // =============================================
        // AUTHENTICATED REQUEST
        //
        // authFetch automatically adds:
        //
        // Authorization:
        // Bearer <JWT>
        // =============================================

        const response = await authService.authFetch(requestUrl, {
          method: "GET",

          signal: controller.signal,

          headers: {
            Accept: "application/json",
          },
        });

        // =============================================
        // RESPONSE
        // =============================================

        let data: StudentResponse | null = null;

        const contentType = response.headers.get("content-type") || "";

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

        // =============================================
        // 401
        //
        // JWT missing / expired / invalid
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
        //
        // Authenticated but not Registrar
        // =============================================

        if (response.status === 403) {
          throw new Error(
            data?.message ||
              "You are not authorized to access student records.",
          );
        }

        // =============================================
        // OTHER HTTP ERROR
        // =============================================

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Failed to load students (${response.status}).`,
          );
        }

        // =============================================
        // API ERROR
        // =============================================

        if (!data?.success) {
          throw new Error(data?.message || "Failed to load students.");
        }

        // =============================================
        // SUCCESS
        // =============================================

        const studentData = Array.isArray(data.students) ? data.students : [];

        setStudents(studentData);

        setTotalPages(data.totalPages || 1);

        // =============================================
        // COMPUTE STATISTICS
        // =============================================

        let regular = 0;
        let executive = 0;
        let scholarship = 0;

        studentData.forEach((student) => {
          const course = (student.course_code || "").toLowerCase();

          if (course.includes("executive")) {
            executive++;
          } else if (course.includes("scholar")) {
            scholarship++;
          } else {
            regular++;
          }
        });

        setStatistics({
          total: data.totalStudents || 0,

          regular,

          executive,

          scholarship,
        });
      } catch (err) {
        // =============================================
        // ABORTED REQUEST
        // =============================================

        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("GET REGISTRAR STUDENTS ERROR:", err);

        setStudents([]);

        setStatistics({
          total: 0,
          regular: 0,
          executive: 0,
          scholarship: 0,
        });

        // =============================================
        // NETWORK ERROR
        // =============================================

        if (err instanceof TypeError) {
          setError(
            "Unable to connect to the student records server. Make sure the backend is running on port 3000.",
          );

          return;
        }

        // =============================================
        // NORMAL ERROR
        // =============================================

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load student records.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchStudents();

    return () => {
      controller.abort();
    };
  }, [
    authenticated,
    userRole,
    currentPage,
    search,
    selectedCourse,
    selectedYear,
    selectedSection,
    navigate,
  ]);

  // =====================================================
  // FILTER OPTIONS
  // =====================================================

  const courseOptions = useMemo(() => {
    return [
      "All",

      ...new Set(
        students.map((student) => student.course_code).filter(Boolean),
      ),
    ];
  }, [students]);

  const yearOptions = useMemo(() => {
    return [
      "All",

      ...new Set(
        students
          .map((student) => student.year_level?.toString())
          .filter(Boolean) as string[],
      ),
    ];
  }, [students]);

  const sectionOptions = useMemo(() => {
    return [
      "All",

      ...new Set(
        students.map((student) => student.section_name).filter(Boolean),
      ),
    ];
  }, [students]);

  // =====================================================
  // SEARCH HANDLER
  // =====================================================

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);

    setCurrentPage(1);
  };

  // =====================================================
  // FILTER HANDLERS
  // =====================================================

  const handleCourseChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCourse(event.target.value);

    setCurrentPage(1);
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(event.target.value);

    setCurrentPage(1);
  };

  const handleSectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSection(event.target.value);

    setCurrentPage(1);
  };

  // =====================================================
  // PAGINATION
  // =====================================================

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((previous) => previous - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((previous) => previous + 1);
    }
  };

  // =====================================================
  // AUTH RENDER GUARD
  // =====================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-listR-container">
        {/* ===============================================
            HEADER
        =============================================== */}

        <div className="registrar-listR-header">
          <div>
            <h1>Student Records</h1>

            <p>
              Manage and view all registered students and their academic
              information.
            </p>
          </div>
        </div>

        {/* ===============================================
            STATISTICS
        =============================================== */}

        <div className="registrar-listR-statistics">
          <div className="registrar-listR-card">
            <span>Total Students</span>

            <h2>{statistics.total}</h2>
          </div>

          <div className="registrar-listR-card">
            <span>Regular</span>

            <h2>{statistics.regular}</h2>
          </div>

          <div className="registrar-listR-card">
            <span>Executive</span>

            <h2>{statistics.executive}</h2>
          </div>

          <div className="registrar-listR-card">
            <span>Scholarship</span>

            <h2>{statistics.scholarship}</h2>
          </div>
        </div>

        {/* ===============================================
            TOOLBAR
        =============================================== */}

        <div className="registrar-listR-toolbar">
          <div className="registrar-listR-search">
            <input
              type="text"
              placeholder="Search student number or name..."
              value={search}
              onChange={handleSearch}
            />
          </div>

          <div className="registrar-listR-filters">
            {/* COURSE */}

            <select value={selectedCourse} onChange={handleCourseChange}>
              {courseOptions.map((course) => (
                <option key={course} value={course}>
                  {course === "All" ? "All Courses" : course}
                </option>
              ))}
            </select>

            {/* YEAR */}

            <select value={selectedYear} onChange={handleYearChange}>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year === "All" ? "All Years" : `Year ${year}`}
                </option>
              ))}
            </select>

            {/* SECTION */}

            <select value={selectedSection} onChange={handleSectionChange}>
              {sectionOptions.map((section) => (
                <option key={section} value={section}>
                  {section === "All" ? "All Sections" : section}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ===============================================
            TABLE
        =============================================== */}

        <div className="registrar-listR-table-wrapper">
          <div className="student-table-container">
            <table className="student-table">
              <thead>
                <tr>
                  <th>ID</th>

                  <th>Student Name</th>

                  <th>Student No.</th>

                  <th>Course</th>

                  <th>Year</th>

                  <th>Section</th>

                  <th>Status</th>

                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {/* LOADING */}

                {loading && (
                  <tr>
                    <td colSpan={8} className="table-message">
                      Loading student records...
                    </td>
                  </tr>
                )}

                {/* ERROR */}

                {!loading && error && (
                  <tr>
                    <td colSpan={8} className="table-message error">
                      {error}
                    </td>
                  </tr>
                )}

                {/* EMPTY */}

                {!loading && !error && students.length === 0 && (
                  <tr>
                    <td colSpan={8} className="table-message">
                      No student records found.
                    </td>
                  </tr>
                )}

                {/* STUDENTS */}

                {!loading &&
                  !error &&
                  students.map((student) => (
                    <tr key={student.student_id}>
                      <td>{student.student_id}</td>

                      <td>
                        <div className="student-info">
                          <div className="student-avatar">
                            {student.first_name?.charAt(0).toUpperCase() || "S"}
                          </div>

                          <div>
                            <strong>
                              {student.first_name}{" "}
                              {student.middle_name
                                ? `${student.middle_name.charAt(0)}. `
                                : ""}
                              {student.last_name}
                            </strong>

                            <small>{student.email}</small>
                          </div>
                        </div>
                      </td>

                      <td>{student.student_number}</td>

                      <td>{student.course_code}</td>

                      <td>Year {student.year_level}</td>

                      <td>{student.section_name || "Not Assigned"}</td>

                      <td>
                        <span
                          className={`status ${(student.status || "")
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {student.status}
                        </span>
                      </td>

                      <td>
                        <div className="action-buttons">
                          {/* STUDENT PROFILE */}

                          <button
                            type="button"
                            className="view-btn"
                            onClick={() =>
                              navigate(
                                `/registrar/student/DetailsR/${student.student_id}`,
                              )
                            }
                          >
                            View
                          </button>

                          {/* ACADEMIC RECORDS */}

                          <button
                            type="button"
                            className="record-btn"
                            onClick={() =>
                              navigate(
                                `/registrar/student/${student.student_id}/AcadRecR`,
                              )
                            }
                          >
                            Records
                          </button>

                          {/* DOCUMENTS */}

                          <button
                            type="button"
                            className="document-btn"
                            onClick={() =>
                              navigate(
                                `/registrar/student/${student.student_id}/DocumentsR`,
                              )
                            }
                          >
                            Documents
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ===============================================
            PAGINATION
        =============================================== */}

        <div className="registrar-listR-pagination">
          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={handlePreviousPage}
          >
            Previous
          </button>

          <div className="page-numbers">
            {Array.from(
              {
                length: totalPages,
              },

              (_, index) => index + 1,
            ).map((page) => (
              <button
                type="button"
                key={page}
                className={
                  currentPage === page
                    ? "pagination-btn active-page"
                    : "pagination-btn"
                }
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={handleNextPage}
          >
            Next
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
