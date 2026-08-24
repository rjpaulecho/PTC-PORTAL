import React, { useEffect, useState } from "react";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import { useNavigate } from "react-router-dom";

import AddCourseModal from "./AddCourseModal";
import EditCourseModal from "./EditCourseModal";

import "../../../styles/CoursemanagementR.css";

const API_BASE_URL = "http://localhost:3000/api/registrar/courses";

// =====================================================
// TYPES
// =====================================================

interface Course {
  course_id: number;
  department_id: number;

  course_code: string;
  course_name: string;

  total_years: number;

  department_code: string;
  department_name: string;

  created_at?: string;
}

interface CourseResponse {
  success: boolean;

  data?: Course[];

  courses?: Course[];

  message?: string;
  error?: string;
}

interface Department {
  department_id: number;
  department_code: string;
  department_name: string;
}

interface DepartmentResponse {
  success: boolean;

  data?: Department[];

  departments?: Department[];

  message?: string;
  error?: string;
}

interface DeleteCourseResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export default function CoursemanagementR() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // =====================================================
  // COURSE STATES
  // =====================================================

  const [courses, setCourses] = useState<Course[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // =====================================================
  // DEPARTMENT STATES
  // =====================================================

  const [departments, setDepartments] = useState<Department[]>([]);

  const [loadingDepartments, setLoadingDepartments] = useState(true);

  const [departmentError, setDepartmentError] = useState("");

  // =====================================================
  // FILTERS
  // =====================================================

  const [search, setSearch] = useState("");

  const [department, setDepartment] = useState("All");

  // =====================================================
  // MODALS
  // =====================================================

  const [showAddCourse, setShowAddCourse] = useState(false);

  const [showEditCourse, setShowEditCourse] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // =====================================================
  // DELETE STATE
  // =====================================================

  const [deletingCourseId, setDeletingCourseId] = useState<number | null>(null);

  // =====================================================
  // AUTHORIZATION
  // =====================================================

  useEffect(() => {
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    if (userRole !== "Registrar") {
      if (userRole) {
        navigate(authService.getDashboardRoute(userRole), {
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
  // LOAD COURSES
  // =====================================================

  const loadCourses = async () => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    try {
      setLoading(true);

      setError("");

      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (department !== "All") {
        params.set("department", department);
      }

      const queryString = params.toString();

      const requestUrl = queryString
        ? `${API_BASE_URL}?${queryString}`
        : API_BASE_URL;

      console.log("GET REGISTRAR COURSES:", requestUrl);

      // =================================================
      // JWT AUTHENTICATED REQUEST
      // =================================================

      const response = await authService.authFetch(requestUrl, {
        method: "GET",

        headers: {
          Accept: "application/json",
        },
      });

      // =================================================
      // SAFE RESPONSE
      // =================================================

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

      // =================================================
      // 401
      // =================================================

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      // =================================================
      // 403
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to manage courses.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to load courses (${response.status}).`,
        );
      }

      // =================================================
      // API ERROR
      // =================================================

      if (!data?.success) {
        throw new Error(data?.message || "Failed to load courses.");
      }

      const loadedCourses = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.courses)
          ? data.courses
          : [];

      setCourses(loadedCourses);
    } catch (err) {
      console.error("GET COURSES ERROR:", err);

      setCourses([]);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the course server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setError(err instanceof Error ? err.message : "Unable to load courses.");
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // LOAD DEPARTMENTS
  // =====================================================

  const loadDepartments = async () => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    try {
      setLoadingDepartments(true);

      setDepartmentError("");

      const url = `${API_BASE_URL}/departments/list`;

      // =================================================
      // JWT AUTHENTICATED REQUEST
      // =================================================

      const response = await authService.authFetch(url, {
        method: "GET",

        headers: {
          Accept: "application/json",
        },
      });

      // =================================================
      // SAFE RESPONSE
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      let data: DepartmentResponse | null = null;

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

      // =================================================
      // 401
      // =================================================

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      // =================================================
      // 403
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to load departments.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to load departments (${response.status}).`,
        );
      }

      // =================================================
      // API ERROR
      // =================================================

      if (!data?.success) {
        throw new Error(data?.message || "Failed to load departments.");
      }

      const loadedDepartments = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.departments)
          ? data.departments
          : [];

      setDepartments(loadedDepartments);
    } catch (err) {
      console.error("GET DEPARTMENTS ERROR:", err);

      setDepartments([]);

      if (err instanceof TypeError) {
        setDepartmentError("Unable to connect to the department server.");

        return;
      }

      setDepartmentError(
        err instanceof Error ? err.message : "Unable to load departments.",
      );
    } finally {
      setLoadingDepartments(false);
    }
  };

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    void loadDepartments();
  }, [authenticated, userRole]);

  // =====================================================
  // LOAD COURSES WHEN FILTER CHANGES
  // =====================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    const timeout = setTimeout(() => {
      void loadCourses();
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [authenticated, userRole, search, department]);

  // =====================================================
  // SEARCH
  // =====================================================

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  };

  // =====================================================
  // DEPARTMENT FILTER
  // =====================================================

  const handleDepartmentChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setDepartment(event.target.value);
  };

  // =====================================================
  // ADD COURSE SUCCESS
  // =====================================================

  const handleCourseAdded = async () => {
    setShowAddCourse(false);

    await loadCourses();
  };

  // =====================================================
  // EDIT COURSE
  // =====================================================

  const handleEdit = (course: Course) => {
    setSelectedCourse(course);

    setShowEditCourse(true);
  };

  // =====================================================
  // EDIT SUCCESS
  // =====================================================

  const handleCourseUpdated = async () => {
    setShowEditCourse(false);

    setSelectedCourse(null);

    await loadCourses();
  };

  // =====================================================
  // DELETE COURSE
  // =====================================================

  const handleDelete = async (course: Course) => {
    if (!authenticated || userRole !== "Registrar") {
      window.alert(
        "Your session has expired or you are not authorized to delete courses.",
      );

      return;
    }

    const courseId = Number(course.course_id);

    if (!Number.isInteger(courseId) || courseId <= 0) {
      window.alert("Invalid course ID.");

      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${course.course_code}?\n\n${course.course_name}`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingCourseId(courseId);

      const url = `${API_BASE_URL}/${courseId}`;

      // =================================================
      // JWT AUTHENTICATED DELETE
      // =================================================

      const response = await authService.authFetch(url, {
        method: "DELETE",

        headers: {
          Accept: "application/json",
        },
      });

      // =================================================
      // SAFE RESPONSE
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      let data: DeleteCourseResponse | null = null;

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

      // =================================================
      // 401
      // =================================================

      if (response.status === 401) {
        authService.logout();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      // =================================================
      // 403
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data?.message ||
            data?.error ||
            "You are not authorized to delete courses.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to delete course (${response.status}).`,
        );
      }

      // =================================================
      // API ERROR
      // =================================================

      if (!data?.success) {
        throw new Error(data?.message || "Failed to delete course.");
      }

      await loadCourses();
    } catch (err) {
      console.error("DELETE COURSE ERROR:", err);

      window.alert(
        err instanceof Error ? err.message : "Unable to delete course.",
      );
    } finally {
      setDeletingCourseId(null);
    }
  };

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="registrar-course-management">
        {/* =================================================
            HEADER
        ================================================= */}

        <div className="registrar-course-header">
          <div>
            <h1>Course Management</h1>

            <p>Manage academic courses and their departments.</p>
          </div>

          <button
            type="button"
            className="add-course-btn"
            onClick={() => setShowAddCourse(true)}
          >
            + Add Course
          </button>
        </div>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <div className="registrar-course-summary">
          <div className="registrar-course-card">
            <span>Total Courses</span>

            <h2>{courses.length}</h2>
          </div>

          <div className="registrar-course-card">
            <span>Departments</span>

            <h2>{departments.length}</h2>
          </div>

          <div className="registrar-course-card">
            <span>Showing</span>

            <h2>{courses.length}</h2>
          </div>
        </div>

        {/* =================================================
            TOOLBAR
        ================================================= */}

        <div className="registrar-course-toolbar">
          <div className="registrar-course-search">
            <input
              type="text"
              placeholder="Search course code or course name..."
              value={search}
              onChange={handleSearch}
            />
          </div>

          <div className="registrar-course-filters">
            <select
              value={department}
              onChange={handleDepartmentChange}
              disabled={loadingDepartments}
            >
              <option value="All">All Departments</option>

              {departments.map((item) => (
                <option
                  key={item.department_id}
                  value={String(item.department_id)}
                >
                  {item.department_code} - {item.department_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* =================================================
            DEPARTMENT ERROR
        ================================================= */}

        {departmentError && (
          <div className="course-filter-error">{departmentError}</div>
        )}

        {/* =================================================
            TABLE
        ================================================= */}

        <div className="registrar-course-table-wrapper">
          <div className="course-table-container">
            <table className="course-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Course</th>
                  <th>Course Name</th>
                  <th>Department</th>
                  <th>Years</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {/* LOADING */}

                {loading && (
                  <tr>
                    <td colSpan={6} className="table-message">
                      Loading courses...
                    </td>
                  </tr>
                )}

                {/* ERROR */}

                {!loading && error && (
                  <tr>
                    <td colSpan={6} className="table-message error">
                      {error}
                    </td>
                  </tr>
                )}

                {/* EMPTY */}

                {!loading && !error && courses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-message">
                      No courses found.
                    </td>
                  </tr>
                )}

                {/* DATA */}

                {!loading &&
                  !error &&
                  courses.map((course) => (
                    <tr key={course.course_id}>
                      <td>{course.course_id}</td>

                      <td>
                        <div className="course-code-cell">
                          <strong>{course.course_code}</strong>
                        </div>
                      </td>

                      <td>
                        <div className="course-name-cell">
                          <strong>{course.course_name}</strong>
                        </div>
                      </td>

                      <td>
                        <div className="course-department-cell">
                          <strong>{course.department_code}</strong>

                          <small>{course.department_name}</small>
                        </div>
                      </td>

                      <td>
                        {course.total_years}{" "}
                        {course.total_years === 1 ? "Year" : "Years"}
                      </td>

                      <td>
                        <div className="course-actions">
                          <button
                            type="button"
                            className="course-edit-btn"
                            onClick={() => handleEdit(course)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="course-delete-btn"
                            disabled={deletingCourseId === course.course_id}
                            onClick={() => handleDelete(course)}
                          >
                            {deletingCourseId === course.course_id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* =================================================
            ADD COURSE MODAL
        ================================================= */}

        {showAddCourse && (
          <AddCourseModal
            departments={departments}
            onClose={() => setShowAddCourse(false)}
            onSuccess={handleCourseAdded}
          />
        )}

        {/* =================================================
            EDIT COURSE MODAL
        ================================================= */}

        {showEditCourse && selectedCourse && (
          <EditCourseModal
            course={selectedCourse}
            departments={departments}
            onClose={() => {
              setShowEditCourse(false);

              setSelectedCourse(null);
            }}
            onSuccess={handleCourseUpdated}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
