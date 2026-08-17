import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function EnrollmentHistory() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "Admin") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="admin-approve-history">
        <h1>Approve Enrollment</h1>
        <p>This page is under construction.</p>
      </div>
    </DashboardLayout>
  );
}
