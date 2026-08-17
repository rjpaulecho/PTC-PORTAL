import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import "../../../styles/ProgramHeadDashboard.css";

export default function ProgramHeadDashboard() {
  const navigate = useNavigate();
  const user = authService.getSession();

  useEffect(() => {
    if (!user || user.role !== "Program Head") {
      navigate("/login");
    }
  }, [navigate, user]);

  if (!user || user.role !== "Program Head") {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="programhead-dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Program Head Dashboard</h1>
            <p>
              Welcome back, <strong>{user.username}</strong>.
            </p>
          </div>
        </div>

        <div className="dashboard-cards">
          <div className="dashboard-card">
            <h3>Pending Grade Approvals</h3>
            <span className="dashboard-number">12</span>
            <p>Faculty grade submissions awaiting approval.</p>
          </div>

          <div className="dashboard-card">
            <h3>Faculty Members</h3>
            <span className="dashboard-number">25</span>
            <p>Assigned faculty under your department.</p>
          </div>

          <div className="dashboard-card">
            <h3>Students</h3>
            <span className="dashboard-number">842</span>
            <p>Currently enrolled students.</p>
          </div>

          <div className="dashboard-card">
            <h3>Active Sections</h3>
            <span className="dashboard-number">31</span>
            <p>Sections currently handled this semester.</p>
          </div>
        </div>

        <div className="dashboard-actions">
          <h2>Quick Actions</h2>

          <div className="action-grid">
            <button
              onClick={() => navigate("/programhead/gradeapproval/pending")}
            >
              Grade Approval
            </button>

            <button>Faculty Evaluation</button>

            <button>Curriculum Management</button>

            <button>Class Monitoring</button>

            <button>Student Performance</button>

            <button>Generate Reports</button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
