import React, { useState } from "react";
import styles from "../../styles/auth.module.css";

type Props = {
  onBackToLogin: () => void; // ✅ renamed from setShowRegister
};

export default function RegistrationForm({ onBackToLogin }: Props) {
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
    // TODO: call authService.register() here later
    onBackToLogin(); // go back to login after successful register
  }

  return (
    <div className={styles.authcard}>
      <div className={styles.authleft}>
        <h2>Create Account</h2>
        <p>Join us today and start your journey with us!</p>
      </div>

      <div className={styles.authright}>
        <h2>Register</h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.inputgroup}>
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="r@ptc.edu.ph"
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputgroup}>
            <label>Username</label>
            <input
              type="text"
              name="username"
              placeholder="Enter username"
              value={formData.username}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputgroup}>
            <label>Password</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputgroup}>
            <label>Verify Password</label>
            <input
              type="password"
              name="verifyPassword"
              placeholder="••••••••"
              value={formData.verifyPassword}
              onChange={handleChange}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit">Register</button>
        </form>

        <div className={styles.authlinks}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onBackToLogin();
            }}
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
