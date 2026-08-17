import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import "../../../styles/StudentProfile.css";

const API_BASE_URL = "http://localhost:3000/api/students";

interface Student {
  studentId: number;
  id: string;

  firstName: string;
  middleName?: string;
  lastName: string;

  email: string;
  gender?: string;
  birthDate?: string;
  contactNumber?: string;

  course: string;
  yearLevel: string;
  section: string;

  semester?: string;

  houseNo?: string;
  street?: string;
  barangay?: string;
  city?: string;
  province?: string;
  zipCode?: string;
}

export default function Sprofile() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const user = authService.getSession();

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const isAdmin = user?.role === "Admin";
  useEffect(() => {
    if (!isAdmin) {
      navigate("/login");
      return;
    }

    if (!id) {
      setErrorMessage("Student ID is missing.");
      setLoading(false);
      return;
    }

    const fetchStudent = async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const response = await fetch(`${API_BASE_URL}/${id}`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load student.");
        }

        setStudent(data);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load student profile.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStudent();
  }, [id, navigate, isAdmin]);
  if (!user || user.role !== "Admin") {
    return null;
  }

  if (loading) {
    return (
      <DashboardLayout>
        {" "}
        <div className="admin-profile-students">
          {" "}
          <p>Loading student profile...</p>{" "}
        </div>{" "}
      </DashboardLayout>
    );
  }

  if (errorMessage || !student) {
    return (
      <DashboardLayout>
        {" "}
        <div className="admin-profile-students">
          <button className="profile-back-button" onClick={() => navigate(-1)}>
            ← Back{" "}
          </button>

          <p className="profile-error">
            {errorMessage || "Student not found."}
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");

  const birthDate = student.birthDate
    ? new Date(student.birthDate).toLocaleDateString()
    : "Not provided";

  const address = [
    student.houseNo,
    student.street,
    student.barangay,
    student.city,
    student.province,
    student.zipCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <DashboardLayout>
      {" "}
      <div className="admin-profile-students">
        <div className="profile-page-header">
          <button className="profile-back-button" onClick={() => navigate(-1)}>
            ← Back to Student List{" "}
          </button>

          <button
            className="profile-edit-button"
            onClick={() =>
              navigate(`/admin/students/editstudents/${student.id}`)
            }
          >
            Edit Student
          </button>
        </div>

        {/* PROFILE HEADER */}
        <div className="profile-card profile-header-card">
          <div className="profile-avatar">
            {student.firstName.charAt(0)}
            {student.lastName.charAt(0)}
          </div>

          <div>
            <h1>{fullName}</h1>
            <p>Student ID: {student.id}</p>
          </div>
        </div>

        {/* PERSONAL INFORMATION */}
        <div className="profile-card">
          <h2>Personal Information</h2>

          <div className="profile-grid">
            <div className="profile-field">
              <span>First Name</span>
              <strong>{student.firstName || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Middle Name</span>
              <strong>{student.middleName || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Last Name</span>
              <strong>{student.lastName || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Gender</span>
              <strong>{student.gender || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Birth Date</span>
              <strong>{birthDate}</strong>
            </div>

            <div className="profile-field">
              <span>Contact Number</span>
              <strong>{student.contactNumber || "Not provided"}</strong>
            </div>

            <div className="profile-field profile-full-width">
              <span>Email</span>
              <strong>{student.email || "Not provided"}</strong>
            </div>
          </div>
        </div>

        {/* ADDRESS */}
        <div className="profile-card">
          <h2>Address</h2>

          <div className="profile-grid">
            <div className="profile-field">
              <span>House No.</span>
              <strong>{student.houseNo || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Street</span>
              <strong>{student.street || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Barangay</span>
              <strong>{student.barangay || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>City</span>
              <strong>{student.city || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Province</span>
              <strong>{student.province || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>ZIP Code</span>
              <strong>{student.zipCode || "Not provided"}</strong>
            </div>

            <div className="profile-field profile-full-width">
              <span>Complete Address</span>
              <strong>{address || "Not provided"}</strong>
            </div>
          </div>
        </div>

        {/* ACADEMIC INFORMATION */}
        <div className="profile-card">
          <h2>Academic Information</h2>

          <div className="profile-grid">
            <div className="profile-field">
              <span>Student Number</span>
              <strong>{student.id}</strong>
            </div>

            <div className="profile-field">
              <span>Course</span>
              <strong>{student.course || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Year Level</span>
              <strong>{student.yearLevel || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Section</span>
              <strong>{student.section || "Not provided"}</strong>
            </div>

            <div className="profile-field">
              <span>Semester</span>
              <strong>{student.semester || "Not provided"}</strong>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
