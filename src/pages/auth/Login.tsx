import { useState } from "react";
import RegistrationForm from "./Register";

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

  function handleRegisterLink(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault(); // Prevent page refresh
    setShowRegister(true);
  }

  return (
    <div>
      {isLoggedIn ? (
        <h1>Welcome {name} 🎉</h1>
      ) : showRegister ? (
        <RegistrationForm setShowRegister={setShowRegister} />
      ) : (
        <>
          <h1>Login</h1>
          <form onSubmit={handleSubmit}>
            <div>
              <label>Username</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit">Login</button>
          </form>

          <p>
            Don't have an account?{" "}
            <a
              href="#"
              onClick={handleRegisterLink}
              style={{
                color: "blue",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Register here
            </a>
          </p>
        </>
      )}
    </div>
  );
}
