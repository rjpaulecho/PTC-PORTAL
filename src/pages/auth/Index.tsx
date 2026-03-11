import logo from "../../assets/ptclogo.png";
import LoginAuth from "./Login";
import { useState } from "react";

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="home">
      {showLogin ? (
        <LoginAuth />
      ) : (
        <div className="home-card">
          <div className="logo">
            <img src={logo} alt="PTC Logo" />
          </div>

          <h1>Welcome to PTC Portal</h1>
          <p>
            Access your student dashboard, announcements, and academic records.
          </p>
          <div>
            <button onClick={() => setShowLogin(true)}>Login</button>
          </div>
        </div>
      )}
    </div>
  );
}
