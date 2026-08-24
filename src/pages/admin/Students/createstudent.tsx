import {
  useMemo,
  useState,
  useEffect,
  type ChangeEvent,
  type FormEvent,
} from "react";

import DashboardLayout from "../../../components/Layout/DashboardLayout";

import { authService } from "../../../services/auth.service";

import { useNavigate } from "react-router-dom";

import "../../../styles/addeditdrop.css";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/students";

// =====================================================
// OPTIONS
// =====================================================

// Matches courses currently seeded in the courses table.
// Later we can replace this with an authenticated API.
const COURSES = ["BSIT", "BSCS", "BSA"] as const;

const YEAR_LEVELS = ["1st Year", "2nd Year", "3rd Year", "4th Year"] as const;

const SEMESTERS = [
  {
    id: "1",
    label: "First Semester",
  },
  {
    id: "2",
    label: "Second Semester",
  },
  {
    id: "3",
    label: "Summer",
  },
] as const;

const GENDERS = ["Male", "Female"] as const;

// =====================================================
// TYPES
// =====================================================

interface CreateStudentResponse {
  success?: boolean;

  message?: string;

  error?: string;

  studentId?: number;

  studentNumber?: string;

  temporaryPassword?: string;
}

// =====================================================
// HELPERS
// =====================================================

const yearLevelToDigit = (yearLevel: string): string => {
  const match = yearLevel.match(/^(\d+)/);

  return match ? match[1] : "";
};

// Generates:
// BSIT-1A
// BSIT-1B
// ...
// BSIT-1Z
const generateSectionOptions = (
  course: string,
  yearLevel: string,
): string[] => {
  const yearDigit = yearLevelToDigit(yearLevel);

  if (!course || !yearDigit) {
    return [];
  }

  return Array.from(
    {
      length: 26,
    },
    (_, index) => {
      const letter = String.fromCharCode(65 + index);

      return `${course}-${yearDigit}${letter}`;
    },
  );
};

const emptyForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  gender: "",
  birthDate: "",
  contactNumber: "",

  // ADDRESS
  houseNo: "",
  street: "",
  barangay: "",
  city: "",
  province: "",
  zipCode: "",

  // ACADEMIC
  course: "",
  yearLevel: "1st Year",
  section: "",
  semesterId: "1",
};

// =====================================================
// COMPONENT
// =====================================================

export default function CreateStudent() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const user = authService.getSession();

  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // =====================================================
  // STATE
  // =====================================================

  const [formState, setFormState] = useState(emptyForm);

  const [isSaving, setIsSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [createdStudent, setCreatedStudent] = useState<{
    studentNumber: string;
    temporaryPassword: string;
  } | null>(null);

  // =====================================================
  // SECTION OPTIONS
  // =====================================================

  const sectionOptions = useMemo(
    () => generateSectionOptions(formState.course, formState.yearLevel),
    [formState.course, formState.yearLevel],
  );

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

    if (userRole !== "Admin") {
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
  // INPUT CHANGE
  // =====================================================

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    setFormState((current) => {
      const updated = {
        ...current,
        [name]: value,
      };

      // =================================================
      // REVALIDATE SECTION
      // =================================================

      if (name === "course" || name === "yearLevel") {
        const validSections = generateSectionOptions(
          updated.course,
          updated.yearLevel,
        );

        if (!validSections.includes(updated.section)) {
          updated.section = "";
        }
      }

      return updated;
    });
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErrorMessage(null);

    // =================================================
    // AUTH CHECK
    // =================================================

    if (!authenticated || userRole !== "Admin") {
      setErrorMessage(
        "Your session has expired or you are not authorized to create students.",
      );

      return;
    }

    // =================================================
    // REQUIRED FIELDS
    // =================================================

    if (
      !formState.firstName.trim() ||
      !formState.lastName.trim() ||
      !formState.email.trim() ||
      !formState.course.trim() ||
      !formState.yearLevel.trim() ||
      !formState.section.trim() ||
      !formState.houseNo.trim() ||
      !formState.street.trim() ||
      !formState.barangay.trim() ||
      !formState.city.trim() ||
      !formState.province.trim()
    ) {
      setErrorMessage("Please fill in all required fields.");

      return;
    }

    // =================================================
    // EMAIL VALIDATION
    // =================================================

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(formState.email.trim())) {
      setErrorMessage("Please enter a valid email address.");

      return;
    }

    // =================================================
    // YEAR LEVEL
    // =================================================

    const yearLevelNumber = Number(yearLevelToDigit(formState.yearLevel));

    if (!Number.isInteger(yearLevelNumber) || yearLevelNumber <= 0) {
      setErrorMessage("Invalid year level.");

      return;
    }

    // =================================================
    // SECTION VALIDATION
    // =================================================

    if (!sectionOptions.includes(formState.section)) {
      setErrorMessage("Please select a valid section.");

      return;
    }

    try {
      setIsSaving(true);

      // =================================================
      // PAYLOAD
      //
      // No Admin user_id or role_id is sent.
      //
      // Authentication / actor identity comes from JWT
      // and req.user on the backend.
      // =================================================

      const payload = {
        firstName: formState.firstName.trim(),

        middleName: formState.middleName.trim(),

        lastName: formState.lastName.trim(),

        email: formState.email.trim(),

        gender: formState.gender || null,

        birthDate: formState.birthDate || null,

        contactNumber: formState.contactNumber.trim(),

        // ADDRESS

        houseNo: formState.houseNo.trim(),

        street: formState.street.trim(),

        barangay: formState.barangay.trim(),

        city: formState.city.trim(),

        province: formState.province.trim(),

        zipCode: formState.zipCode.trim(),

        // ACADEMIC

        course: formState.course,

        yearLevel: formState.yearLevel,

        section: formState.section,

        semesterId: Number(formState.semesterId),
      };

      console.log("CREATE ADMIN STUDENT:", payload);

      // =================================================
      // JWT AUTHENTICATED POST
      // =================================================

      const response = await authService.authFetch(API_BASE_URL, {
        method: "POST",

        body: JSON.stringify(payload),
      });

      // =================================================
      // SAFE RESPONSE
      // =================================================

      const contentType = response.headers.get("content-type") || "";

      let data: CreateStudentResponse | null = null;

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
            "You are not authorized to create students.",
        );
      }

      // =================================================
      // HTTP ERROR
      // =================================================

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to add student (${response.status}).`,
        );
      }

      // =================================================
      // VALIDATE RESPONSE
      // =================================================

      const studentNumber = String(data?.studentNumber ?? "").trim();

      const temporaryPassword = String(data?.temporaryPassword ?? "").trim();

      if (!studentNumber) {
        throw new Error(
          "Student was created, but the server did not return the student number.",
        );
      }

      // =================================================
      // SUCCESS
      // =================================================

      setCreatedStudent({
        studentNumber,

        temporaryPassword: temporaryPassword || studentNumber,
      });

      setFormState(emptyForm);
    } catch (error) {
      console.error("CREATE ADMIN STUDENT ERROR:", error);

      if (error instanceof TypeError) {
        setErrorMessage(
          "Unable to connect to the student server. Make sure the backend is running on port 3000.",
        );

        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to add student.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // =====================================================
  // AUTH GUARD
  // =====================================================

  if (!authenticated || !user || userRole !== "Admin") {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <div className="admin-createstudents-students">
        <h1>Add Student</h1>

        {/* =================================================
            ERROR
        ================================================= */}

        {errorMessage && (
          <p className="admin-manage-students__error">{errorMessage}</p>
        )}

        {/* =================================================
            SUCCESS
        ================================================= */}

        {createdStudent && (
          <div className="admin-success-box">
            <h3>✅ Student Created Successfully</h3>

            <p>
              <strong>Student Number:</strong> {createdStudent.studentNumber}
            </p>

            <p>
              <strong>Username:</strong> {createdStudent.studentNumber}
            </p>

            <p>
              <strong>Temporary Password:</strong>{" "}
              {createdStudent.temporaryPassword}
            </p>

            <div className="admin-student-form__actions">
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `Username: ${createdStudent.studentNumber}\nPassword: ${createdStudent.temporaryPassword}`,
                    );

                    window.alert("Credentials copied.");
                  } catch (error) {
                    console.error("COPY CREDENTIALS ERROR:", error);

                    window.alert("Unable to copy credentials.");
                  }
                }}
              >
                Copy Credentials
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate("/admin/students/addeditdrop")}
              >
                Back to Student List
              </button>
            </div>
          </div>
        )}

        {/* =================================================
            FORM
        ================================================= */}

        {!createdStudent && (
          <form onSubmit={handleSubmit} className="admin-student-form">
            {/* PERSONAL */}

            <label>
              First Name
              <input
                type="text"
                name="firstName"
                value={formState.firstName}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            <label>
              Middle Name
              <input
                type="text"
                name="middleName"
                value={formState.middleName}
                onChange={handleInputChange}
                disabled={isSaving}
              />
            </label>

            <label>
              Last Name
              <input
                type="text"
                name="lastName"
                value={formState.lastName}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            <label>
              Gender
              <select
                name="gender"
                value={formState.gender}
                onChange={handleInputChange}
                disabled={isSaving}
              >
                <option value="">Select gender</option>

                {GENDERS.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Birth Date
              <input
                type="date"
                name="birthDate"
                value={formState.birthDate}
                onChange={handleInputChange}
                disabled={isSaving}
              />
            </label>

            <label>
              Contact Number
              <input
                type="tel"
                name="contactNumber"
                value={formState.contactNumber}
                onChange={handleInputChange}
                placeholder="e.g. 09171234567"
                disabled={isSaving}
              />
            </label>

            {/* ADDRESS */}

            <label>
              House No.
              <input
                type="text"
                name="houseNo"
                value={formState.houseNo}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            <label>
              Street
              <input
                type="text"
                name="street"
                value={formState.street}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            <label>
              Barangay
              <input
                type="text"
                name="barangay"
                value={formState.barangay}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            <label>
              City
              <input
                type="text"
                name="city"
                value={formState.city}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            <label>
              Province
              <input
                type="text"
                name="province"
                value={formState.province}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            <label>
              ZIP Code
              <input
                type="text"
                name="zipCode"
                value={formState.zipCode}
                onChange={handleInputChange}
                disabled={isSaving}
              />
            </label>

            <label>
              Email
              <input
                type="email"
                name="email"
                value={formState.email}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              />
            </label>

            {/* ACADEMIC */}

            <label>
              Semester
              <select
                name="semesterId"
                value={formState.semesterId}
                onChange={handleInputChange}
                disabled={isSaving}
              >
                {SEMESTERS.map((semester) => (
                  <option key={semester.id} value={semester.id}>
                    {semester.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Course
              <select
                name="course"
                value={formState.course}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              >
                <option value="">Select course</option>

                {COURSES.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Year Level
              <select
                name="yearLevel"
                value={formState.yearLevel}
                onChange={handleInputChange}
                disabled={isSaving}
                required
              >
                {YEAR_LEVELS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Section
              <select
                name="section"
                value={formState.section}
                onChange={handleInputChange}
                required
                disabled={isSaving || sectionOptions.length === 0}
              >
                <option value="">Select section</option>

                {sectionOptions.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>

            {/* ACTIONS */}

            <div className="admin-student-form__actions">
              <button
                type="button"
                className="btn"
                onClick={() => navigate(-1)}
                disabled={isSaving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving || !authenticated || userRole !== "Admin"}
              >
                {isSaving ? "Saving..." : "Add Student"}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
