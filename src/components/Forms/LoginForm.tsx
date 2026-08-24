import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { authService } from "../../services/auth.service";

import styles from "../../styles/auth.module.css";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // =====================================================
  // NORMAL LOGIN
  // Username + Password → OTP
  // =====================================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const cleanUsername = username.trim();

      await authService.login(cleanUsername, password);

      authService.savePendingUsername(cleanUsername);

      navigate("/otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // DEVELOPMENT LOGIN
  //
  // One-click development login.
  //
  // IMPORTANT:
  // This does NOT create a fake frontend session anymore.
  //
  // It calls:
  //
  // POST /auth/dev-login
  //
  // Backend:
  // - loads real user from database
  // - loads real role
  // - creates JWT
  // - returns JWT + user
  //
  // authService.devLogin():
  // - stores JWT
  // - stores user session
  // =====================================================
  async function handleDevLogin(devUsername: string) {
    setError("");
    setLoading(true);

    try {
      const user = await authService.devLogin(devUsername);

      const destination = authService.getDashboardRoute(user.role);

      navigate(destination, {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Development login failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.authPage}>
      <div className={`${styles.authcard} ${styles.fadeIn}`}>
        {/* ==========================================
            BACK BUTTON
        ========================================== */}
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate("/")}
          aria-label="Go back"
          disabled={loading}
        >
          ←
        </button>

        {/* ==========================================
            LEFT SIDE
        ========================================== */}
        <div className={styles.authleft}>
          <h2>Welcome Back</h2>

          <p>Login to access your portal dashboard.</p>
        </div>

        {/* ==========================================
            RIGHT SIDE
        ========================================== */}
        <div className={styles.authright}>
          <h2>Login</h2>

          {/* ========================================
              NORMAL LOGIN
          ======================================== */}
          <form onSubmit={handleSubmit}>
            <div className={styles.inputgroup}>
              <input
                type="text"
                placeholder=" "
                value={username}
                onChange={(e) => setUsername(e.target.value.toUpperCase())}
                disabled={loading}
                required
                autoComplete="username"
              />

              <label>Username / Student Number</label>
            </div>

            <div className={styles.inputgroup}>
              <input
                type="password"
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                autoComplete="current-password"
              />

              <label>Password</label>
            </div>

            {/* ======================================
                ERROR
            ====================================== */}
            {error && (
              <p key={error} className={styles.errorMsg}>
                {error}
              </p>
            )}

            {/* ======================================
                LOGIN BUTTON
            ====================================== */}
            <button
              type="submit"
              disabled={loading}
              className={`${styles.submitBtn} ${loading ? styles.loading : ""}`}
            >
              {loading ? "Verifying..." : "Login"}
            </button>
          </form>

          {/* ========================================
              FORGOT PASSWORD
          ======================================== */}
          <div className={styles.authlinks}>
            <a href="#">Forgot password?</a>
          </div>

          {/* ========================================
              DEVELOPMENT LOGIN
          ======================================== */}
          <div
            style={{
              marginTop: "20px",
            }}
          >
            <h4>For Development Access</h4>

            <div className={styles.devButtons}>
              {/* ================================
                  ADMIN
              ================================ */}
              <button
                type="button"
                className={styles.devBtn}
                disabled={loading}
                onClick={() => handleDevLogin("admin")}
              >
                Login as Admin
              </button>

              {/* ================================
                  REGISTRAR
              ================================ */}
              <button
                type="button"
                className={styles.devBtn}
                disabled={loading}
                onClick={() => handleDevLogin("registrar")}
              >
                Login as Registrar
              </button>

              {/* ================================
                  PROGRAM HEAD
              ================================ */}
              <button
                type="button"
                className={styles.devBtn}
                disabled={loading}
                onClick={() => handleDevLogin("proghead")}
              >
                Login as Program Head
              </button>

              {/* ================================
                  FACULTY
              ================================ */}
              <button
                type="button"
                className={styles.devBtn}
                disabled={loading}
                onClick={() => handleDevLogin("faculty")}
              >
                Login as Faculty
              </button>

              {/* ================================
                  STUDENT
              ================================ */}
              <button
                type="button"
                className={styles.devBtn}
                disabled={loading}
                onClick={() => handleDevLogin("26BSIT-0001")}
              >
                Login as Student
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
