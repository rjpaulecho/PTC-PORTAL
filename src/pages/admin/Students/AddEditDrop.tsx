import { useEffect, useState } from "react";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import Modal from "../../../components/modal";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import "../../../styles/addeditdrop.css";

type Student = {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  gender: string;
  birthDate: string;
  contactNumber: string;
  course: string;
  yearLevel: string;
  section: string;
  semesterId: string;
};

// Point this at wherever your Node server actually runs.
const API_BASE_URL = "http://localhost:3000/api/students";

export default function AddEditDrop() {
  const navigate = useNavigate();
  const user = authService.getSession();
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  useEffect(() => {
    const loadStudents = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch(API_BASE_URL);
        if (!response.ok) throw new Error("Failed to load students");
        const data: Student[] = await response.json();
        setStudents(data);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load students",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadStudents();
  }, []);

  useEffect(() => {
    if (!user || user.role !== "Admin") {
      navigate("/login");
    }
  }, [user, navigate]);

  if (!user || user.role !== "Admin") {
    return null;
  }

  const filteredStudents = students.filter((student) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return (
      student.id.toLowerCase().includes(query) ||
      student.firstName.toLowerCase().includes(query) ||
      student.lastName.toLowerCase().includes(query)
    );
  });

  // Add/Edit no longer open a modal — they navigate to their own dedicated pages.
  // TODO: adjust these paths to match your actual router config if different.
  const goToAddStudent = () => navigate("/admin/students/createstudents");
  const goToEditStudent = (student: Student) =>
    navigate(`/admin/students/editstudents/${student.id}`);

  const confirmDeleteStudent = (student: Student) => {
    setDeleteTarget(student);
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const deleteStudent = async () => {
    if (!deleteTarget) return;

    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete student");

      setStudents((current) =>
        current.filter((student) => student.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete student",
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="admin-manage-students">
        <div className="admin-manage-students__header">
          <h1>Add / Edit Students</h1>
          <button
            type="button"
            className="btn btn-primary"
            onClick={goToAddStudent}
          >
            + Add Student
          </button>
        </div>

        {errorMessage && (
          <p className="admin-manage-students__error">{errorMessage}</p>
        )}

        <input
          type="text"
          placeholder="Search by ID or name..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="admin-manage-students__search"
        />

        <table className="admin-manage-students__table">
          <thead>
            <tr>
              <th>ID</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Email</th>
              <th>Contact Number</th>
              <th>Course</th>
              <th>Year Level</th>
              <th>Section</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center" }}>
                  Loading students...
                </td>
              </tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center" }}>
                  No students found.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td>{student.id}</td>
                  <td>{student.firstName}</td>
                  <td>{student.lastName}</td>
                  <td>{student.email}</td>
                  <td>{student.contactNumber || "—"}</td>
                  <td>{student.course}</td>
                  <td>{student.yearLevel}</td>
                  <td>{student.section}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => goToEditStudent(student)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => confirmDeleteStudent(student)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Delete confirmation stays as a modal — it's a quick yes/no, not a form */}
        {deleteTarget && (
          <Modal isOpen={Boolean(deleteTarget)} onClose={cancelDelete}>
            <h2>Delete Student</h2>
            <p>
              Are you sure you want to delete{" "}
              <strong>
                {deleteTarget.firstName} {deleteTarget.lastName}
              </strong>
              ? This action cannot be undone.
            </p>
            <div className="admin-student-form__actions">
              <button type="button" className="btn" onClick={cancelDelete}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={deleteStudent}
              >
                Delete
              </button>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
