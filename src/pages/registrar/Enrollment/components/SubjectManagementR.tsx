import DashboardLayout from "../../../../components/Layout/DashboardLayout";
import { authService } from "../../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import "../../../../styles/SubjectManagementR.css";

export default function SubjectManagementR() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "Registrar") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="registrar-subject-management">
        {/* ================================================
            HEADER
        ================================================= */}

        <div className="subject-management-header">
          <div>
            <h1>Subject Management</h1>

            <p>
              Manage enrolled subjects, sections, and Registrar enrollment
              corrections.
            </p>
          </div>

          <button
            type="button"
            className="back-btn"
            onClick={() => navigate("/registrar/enrollment")}
          >
            ← Back to Enrollments
          </button>
        </div>

        {/* ================================================
            CONTENT
        ================================================= */}

        <div className="subject-management-card">
          <div className="subject-management-card-header">
            <div>
              <h2>Enrolled Subjects</h2>

              <p>
                Select an enrollment to manage its subjects and section
                assignments.
              </p>
            </div>
          </div>

          <div className="subject-management-empty">
            <h3>Subject Management</h3>

            <p>
              Choose an enrollment from the Registrar Enrollment Management page
              to manage its subjects.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={() => navigate("/registrar/enrollment")}
            >
              Go to Enrollment Management
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
