import { BrowserRouter, Routes, Route } from "react-router-dom"
import StudentDashboard from "../pages/student/Dashboard"
import AdminDashboard from "../pages/admin/AdminDashboard"

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}