import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function AuditlogReport() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "Admin") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="admin-auditlog-reports">
        <h1>Auditlog</h1>
        <p>This page is under construction.</p>
      </div>
    </DashboardLayout>
  );
}
