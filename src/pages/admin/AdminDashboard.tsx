import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="admin-dashboard">
        <h1>Welcome, {user.username} </h1>
        <p>This is your admin dashboard.</p>
      </div>
    </DashboardLayout>
  );
}
