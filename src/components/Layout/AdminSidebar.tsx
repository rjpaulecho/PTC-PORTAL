import { Link } from "react-router-dom"

export default function AdminSidebar() {
  return (
    <div className="bg-light border-end p-3 h-100">
      <h6>Admin Menu</h6>
      <ul className="nav flex-column">
        <li className="nav-item">
          <Link className="nav-link" to="/admin/dashboard">
            Dashboard
          </Link>
        </li>
        <li className="nav-item">
          <Link className="nav-link" to="/admin/students">
            Manage Students
          </Link>
        </li>
        <li className="nav-item">
          <Link className="nav-link" to="/admin/admissions">
            Admissions
          </Link>
        </li>
      </ul>
    </div>
  )
}