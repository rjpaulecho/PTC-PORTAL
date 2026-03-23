// pages/faculty/FacultyDashboard.tsx
// Note: role guard is now handled by ProtectedRoute in mainserver.tsx
// so this page doesn't need its own manual check anymore.
// The inline guard below is kept as a safety net only.

import DashboardLayout from "../../components/Layout/DashboardLayout";
import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const user = authService.getSession();

  // Safety net: ProtectedRoute already blocks wrong roles,
  // but this catches any edge case where the component is used outside the router.
  if (!user || user.role !== "faculty") {
    // ← lowercase "faculty" — was "Faculty" before
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="faculty-dashboard">
        <h1>Welcome, {user.username}</h1>
        <p>This is your faculty dashboard.</p>
      </div>
    </DashboardLayout>
  );
}
