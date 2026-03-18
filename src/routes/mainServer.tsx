import { Routes, Route } from "react-router-dom";
import Home from "../pages/auth/Index";
import LoginAuth from "../pages/auth/Login";
import RegisterAuth from "../pages/auth/Register";
// Student pages
import StudentDashboard from "../pages/student/Dashboard";
import StudentProfile from "../pages/student/Profile";
import StudentSchedule from "../pages/student/Schedule";
import StudentAdmission from "../pages/student/Admission";
import StudentAnnouncement from "../pages/student/Announcement";
import StudentRecord from "../pages/student/StudentRecord";
// Admin pages
import AdminDashboard from "../pages/admin/AdminDashboard";
import ManageAdmissions from "../pages/admin/ManageAdmissions";
import ManageStudents from "../pages/admin/ManageStudents";
import ManageAnnouncements from "../pages/admin/ManageAnnouncement";

export default function AppRoutes() {
  return (
    <Routes>
      // Public routes
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginAuth />} />
      <Route path="/register" element={<RegisterAuth />} />
      // Student routes
      <Route path="/student/dashboard" element={<StudentDashboard />} />
      <Route path="/student/profile" element={<StudentProfile />} />
      <Route path="/student/schedule" element={<StudentSchedule />} />
      <Route path="/student/admission" element={<StudentAdmission />} />
      <Route path="/student/announcements" element={<StudentAnnouncement />} />
      <Route path="/student/records" element={<StudentRecord />} />
      // Admin routes
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/Admissions" element={<ManageAdmissions />} />
      <Route path="/admin/Students" element={<ManageStudents />} />
      <Route path="/admin/Announcements" element={<ManageAnnouncements />} />
    </Routes>
  );
}
