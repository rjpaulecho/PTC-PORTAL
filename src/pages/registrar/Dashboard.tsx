import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import "../../styles/RegistrarDashboard.css";

export default function RegistrarDashboard() {
  const navigate = useNavigate();
  const user = authService.getSession();

  useEffect(() => {
    if (!user || user.role !== "Registrar") {
      navigate("/login");
    }
  }, [navigate, user]);

  if (!user || user.role !== "Registrar") {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="registrar-dashboard">
        <h1>Registrar Dashboard</h1>
        <p>Welcome, {user.username}.</p>

        <div className="dashboard-cards">
          <div className="dashboard-card">
            <h3>Student Records</h3>
            <p>Manage and update student information.</p>
          </div>

          <div className="dashboard-card">
            <h3>Enrollment Requests</h3>
            <p>Review and process enrollment applications.</p>
          </div>

          <div className="dashboard-card">
            <h3>Academic Records</h3>
            <p>Maintain transcripts and academic history.</p>
          </div>

          <div className="dashboard-card">
            <h3>Reports</h3>
            <p>Generate enrollment and registrar reports.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
