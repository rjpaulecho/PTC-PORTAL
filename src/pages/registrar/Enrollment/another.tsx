import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function EnrollmeR() {
  const navigate = useNavigate();
  const user = authService.getSession();

  if (!user || user.role !== "Registrar") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="registrar-enrollment-process">
        <h1>Class Schedule</h1>
        <p>This page is under construction.</p>
      </div>
    </DashboardLayout>
  );
}
