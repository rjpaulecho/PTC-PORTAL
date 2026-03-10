import { Link } from "react-router-dom"


export default function StudentSidebar() {
  return (
    <div className="bg-light border-end p-3 h-100">
      <h6>Student Menu</h6>
      <ul className="nav flex-column">
        <li className="nav-item">
          <Link className="nav-link" to="/student/dashboard">
            Dashboard
          </Link>
        </li>
        <li className="nav-item">
          <Link className="nav-link" to="/student/profile">
            Profile
          </Link>
        </li>
        <li className="nav-item">
          <Link className="nav-link" to="/student/schedule">
            Schedule
          </Link>
        </li>
      </ul>
    </div>
  )
}