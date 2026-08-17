import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function SubmitRequirements() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "Student") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="submit-requirements">
        <p>This is your requirements submission page.</p>
      </div>
    </DashboardLayout>
  );
}
