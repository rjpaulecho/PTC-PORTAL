import React, { useState } from "react";

type Props = {
  setShowRegister: (value: boolean) => void;
};

export default function RegistrationForm({ setShowRegister }: Props) {
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    verifyPassword: "",
  });

  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.email || !formData.username || !formData.password) {
      setError("Please fill all fields");
      return;
    }

    if (formData.password !== formData.verifyPassword) {
      setError("Passwords do not match!");
      setFormData({ ...formData, password: "", verifyPassword: "" });
      return;
    }

    setError("");
    console.log("Registering user...", formData);
  }

  return (
    <>
      {/* LEFT PANEL */}
      <div className="auth-left">
        <h2>Create Account</h2>
        <p>Join us today and start your journey with us!</p>
      </div>

      {/* RIGHT PANEL */}
      <div className="auth-right">
        <h2>Register</h2>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
          />

          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
          />

          <input
            type="password"
            name="verifyPassword"
            placeholder="Verify Password"
            value={formData.verifyPassword}
            onChange={handleChange}
          />

          {error && <div className="error-message">{error}</div>}
        </form>
        <button type="submit">Register</button>
        <div className="auth-links">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setShowRegister(false);
            }}
          >
            Back to Login
          </a>
        </div>
      </div>
    </>
  );
}
