import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function StudentAdmission() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "student") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="student-admission">
        <h1>Welcome, {user.username} </h1>
        <p>This is your student admission page.</p>
      </div>
    </DashboardLayout>
  );
}
