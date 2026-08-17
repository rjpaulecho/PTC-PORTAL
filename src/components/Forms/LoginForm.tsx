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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      await authService.login(username, password);

      authService.savePendingUsername(username);
      navigate("/otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.authPage}>
      <div className={`${styles.authcard} ${styles.fadeIn}`}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ←
        </button>

        <div className={styles.authleft}>
          <h2>Welcome Back</h2>
          <p>Login to access your portal dashboard.</p>
        </div>

        <div className={styles.authright}>
          <h2>Login</h2>

          <form onSubmit={handleSubmit}>
            {/* --- input BEFORE label, needed for the floating-label CSS --- */}
            <div className={styles.inputgroup}>
              <input
                type="text"
                placeholder=" "
                value={username}
                onChange={(e) => setUsername(e.target.value.toUpperCase())}
                required
              />
              <label>Student Number / Username</label>
            </div>

            <div className={styles.inputgroup}>
              <input
                type="password"
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <label>Password</label>
            </div>
            {/* --- end reordered inputs --- */}

            {error && (
              <p key={error} className={styles.errorMsg}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`${styles.submitBtn} ${loading ? styles.loading : ""}`}
            >
              {loading ? (
                <>
                  <span className={styles.spinner} />
                  Verifying...
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>

          <div className={styles.authlinks}>
            <a href="/register">Create an account</a>
            <a href="#">Forgot password?</a>
          </div>

          <div style={{ marginTop: "20px" }}>
            <h4>Development Access</h4>

            <div className={styles.devButtons}>
              <button
                type="button"
                className={styles.devBtn}
                onClick={() => {
                  authService.saveSession({
                    user_id: 1,
                    username: "admin",
                    email: "admin@ptc.edu.ph",
                    role: "Admin",
                    role_id: 1,
                  });
                  navigate("/admin/dashboard");
                }}
              >
                Login as Admin
              </button>

              <button
                type="button"
                className={styles.devBtn}
                onClick={() => {
                  authService.saveSession({
                    user_id: 2,
                    username: "faculty",
                    email: "faculty@ptc.edu.ph",
                    role: "Faculty",
                    role_id: 2,
                  });
                  navigate("/faculty/dashboard");
                }}
              >
                Login as Faculty
              </button>

              <button
                type="button"
                className={styles.devBtn}
                onClick={() => {
                  authService.saveSession({
                    user_id: 3,
                    username: "student",
                    email: "student@ptc.edu.ph",
                    role: "Student",
                    role_id: 3,
                  });
                  navigate("/student/dashboard");
                }}
              >
                Login as Student
              </button>

              <button
                type="button"
                className={styles.devBtn}
                onClick={() => {
                  authService.saveSession({
                    user_id: 4,
                    username: "programhead",
                    email: "programhead@ptc.edu.ph",
                    role: "Program Head",
                    role_id: 4,
                  });
                  navigate("/programhead/dashboard");
                }}
              >
                Login as Program Head
              </button>

              <button
                type="button"
                className={styles.devBtn}
                onClick={() => {
                  authService.saveSession({
                    user_id: 5,
                    username: "registrar",
                    email: "registrar@ptc.edu.ph",
                    role: "Registrar",
                    role_id: 5,
                  });
                  navigate("/registrar/dashboard");
                }}
              >
                Login as Registrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}