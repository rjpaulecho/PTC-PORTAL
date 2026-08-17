import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function DashboardReport() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "Admin") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="admin-Dashboard-reports">
        <h1>Dashboard report</h1>
        <p>This page is under construction.</p>
      </div>
    </DashboardLayout>
  );
}
