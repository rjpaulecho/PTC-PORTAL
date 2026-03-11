import { useState } from "react";
import RegistrationForm from "./RegistrationForm";

export default function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (name === "admin" && password === "1234") {
      setIsLoggedIn(true);
    } else {
      alert("Invalid credentials");
    }
  }

  return (
    <div className="auth-card">
      {isLoggedIn ? (
        <h1>Welcome {name} 🎉</h1>
      ) : showRegister ? (
        <RegistrationForm setShowRegister={setShowRegister} />
      ) : (
        <>
          {/* LEFT PANEL */}
          <div className="auth-left">
            <h2>Welcome Back</h2>
            <p>Login to access your portal dashboard.</p>
          </div>

          {/* RIGHT PANEL */}
          <div className="auth-right">
            <h2>Login</h2>

            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Username"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </form>
            <button type="submit">Login</button>
            <div className="auth-links">
              <span></span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setShowRegister(true);
                }}
              >
                Don't have an account?
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
