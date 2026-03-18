import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function ManageStudents() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="admin-Students">
        <p>student for admin.</p>
      </div>
    </DashboardLayout>
  );
}
