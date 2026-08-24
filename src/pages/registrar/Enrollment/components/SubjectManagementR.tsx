import DashboardLayout from "../../../../components/Layout/DashboardLayout";
import { authService } from "../../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

import "../../../../styles/SubjectManagementR.css";

export default function SubjectManagementR() {
  const navigate = useNavigate();

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  const user = authService.getSession();
  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // =====================================================
  // AUTHORIZATION
  // =====================================================

  useEffect(() => {
    // No valid session or JWT
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    // Logged in but wrong role
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
            onClick={() => navigate("/registrar/enrollment/management")}
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
              onClick={() => navigate("/registrar/enrollment/management")}
            >
              Go to Enrollment Management
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
