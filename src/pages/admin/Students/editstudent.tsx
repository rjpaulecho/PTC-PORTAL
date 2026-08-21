import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate, useParams } from "react-router-dom";
import "../../../styles/addeditdrop.css";

// Point this at wherever your Node server actually runs.
const API_BASE_URL = "http://localhost:3000/api/students";

// Matches courses actually seeded in the courses table (course_code)
const COURSES = ["BSIT", "BSCS", "BSA"] as const;

const YEAR_LEVELS = ["1st Year", "2nd Year", "3rd Year", "4th Year"] as const;

// Matches semesters seeded in the semesters table (semester_id -> semester_name)
const SEMESTERS = [
  { id: "1", label: "First Semester" },
  { id: "2", label: "Second Semester" },
  { id: "3", label: "Summer" },
] as const;

const GENDERS = ["Male", "Female"] as const;

// Maps "1st Year" -> "1", "2nd Year" -> "2", etc.
const yearLevelToDigit = (yearLevel: string): string => {
  const match = yearLevel.match(/^(\d+)/);
  return match ? match[1] : "";
};

// Generates ["BSIT-1A", "BSIT-1B", ..., "BSIT-1Z"] for a given course + year level.
const generateSectionOptions = (
  course: string,
  yearLevel: string,
): string[] => {
  const yearDigit = yearLevelToDigit(yearLevel);
  if (!course || !yearDigit) return [];

  return Array.from({ length: 26 }, (_, index) => {
    const letter = String.fromCharCode(65 + index); // A-Z
    return `${course}-${yearDigit}${letter}`;
  });
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

  course: "",
  yearLevel: "1st Year",
  section: "",
  semesterId: "1",
};
export default function EditStudent() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // student_number, e.g. "26BSIT-0001"
  const user = authService.getSession();

  const [formState, setFormState] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sectionOptions = useMemo(
    () => generateSectionOptions(formState.course, formState.yearLevel),
    [formState.course, formState.yearLevel],
  );

  useEffect(() => {
    if (!id) return;

    const loadStudent = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch(`${API_BASE_URL}/${id}`);
        if (!response.ok) throw new Error("Failed to load student");
        const data = await response.json();

        setFormState({
          firstName: data.firstName || "",
          middleName: data.middleName || "",
          lastName: data.lastName || "",
          email: data.email || "",
          gender: data.gender || "",
          birthDate: data.birthDate ? String(data.birthDate).slice(0, 10) : "",
          contactNumber: data.contactNumber || "",

          // ADDRESS
          houseNo: data.houseNo || "",
          street: data.street || "",
          barangay: data.barangay || "",
          city: data.city || "",
          province: data.province || "",
          zipCode: data.zipCode || "",

          course: data.course || "",
          yearLevel: data.yearLevel || "1st Year",
          section: data.section || "",
          semesterId: data.semesterId ? String(data.semesterId) : "1",
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load student",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadStudent();
  }, [id]);

  if (!user || user.role !== "Admin") {
    navigate("/login");
    return null;
  }

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    setFormState((current) => {
      const updated = { ...current, [name]: value };

      // Whenever Course or Year Level changes, the list of valid sections
      // changes too, so re-validate the currently selected section.
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    if (
      !formState.firstName.trim() ||
      !formState.lastName.trim() ||
      !formState.email.trim() ||
      !formState.course.trim() ||
      !formState.yearLevel.trim() ||
      !formState.section.trim()
    ) {
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to update student");
      }

      // TODO: adjust to match your actual list-page route if it's not "/admin/students"
      navigate("/admin/students/addeditdrop");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update student",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="admin-editstudents-students-table">
        <h1>Edit Student</h1>

        {errorMessage && (
          <p className="admin-manage-students__error">{errorMessage}</p>
        )}

        {isLoading ? (
          <p>Loading student…</p>
        ) : (
          <form onSubmit={handleSubmit} className="admin-student-form">
            <label>
              First Name
              <input
                type="text"
                name="firstName"
                value={formState.firstName}
                onChange={handleInputChange}
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
              />
            </label>

            <label>
              Last Name
              <input
                type="text"
                name="lastName"
                value={formState.lastName}
                onChange={handleInputChange}
                required
              />
            </label>

            <label>
              Gender
              <select
                name="gender"
                value={formState.gender}
                onChange={handleInputChange}
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
              />
            </label>
            <label>
              House No.
              <input
                type="text"
                name="houseNo"
                value={formState.houseNo}
                onChange={handleInputChange}
              />
            </label>

            <label>
              Street
              <input
                type="text"
                name="street"
                value={formState.street}
                onChange={handleInputChange}
              />
            </label>

            <label>
              Barangay
              <input
                type="text"
                name="barangay"
                value={formState.barangay}
                onChange={handleInputChange}
              />
            </label>

            <label>
              City
              <input
                type="text"
                name="city"
                value={formState.city}
                onChange={handleInputChange}
              />
            </label>

            <label>
              Province
              <input
                type="text"
                name="province"
                value={formState.province}
                onChange={handleInputChange}
              />
            </label>

            <label>
              ZIP Code
              <input
                type="text"
                name="zipCode"
                value={formState.zipCode}
                onChange={handleInputChange}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                name="email"
                value={formState.email}
                onChange={handleInputChange}
                required
              />
            </label>

            <label>
              Semester
              <select
                name="semesterId"
                value={formState.semesterId}
                onChange={handleInputChange}
              >
                {SEMESTERS.map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.label}
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
                disabled={sectionOptions.length === 0}
              >
                <option value="">Select section</option>
                {sectionOptions.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>

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
                disabled={isSaving}
              >
                {isSaving ? "Saving…" : "Add Student"}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
