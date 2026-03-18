import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function ManageAnnouncements() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="admin-Announcement">
        <p> Announcement for student</p>
      </div>
    </DashboardLayout>
  );
}
