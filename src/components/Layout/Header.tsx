import { authService } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";

export default function Header() {
  const user = authService.getSession();
  const navigate = useNavigate();

  function handleLogout() {
    authService.logout();
    navigate("/login");
  }

  return (
    <div className="header">
      <div className="header-left">
        <h2 className="header-title">PTC Portal</h2>
      </div>
      <div className="header-right">
        <span className="header-user"> {user?.username}</span>
        <span className="header-role">{user?.role}</span>
        <button className="header-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
