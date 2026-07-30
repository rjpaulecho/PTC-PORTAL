import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../services/auth.service";
import styles from "../../styles/auth.module.css";
import "../../styles/background.css";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await authService.login(email, password);

    setLoading(false);

    if (!result) {
      setError("Invalid email or password.");
      return;
    }

    authService.savePendingEmail(email);
    navigate("/otp");
  }

  return (
    <div className="geo-background">
      <div className="geo-shapes">
        <div className="geo-shape shape-1"></div>
        <div className="geo-shape shape-2"></div>
        <div className="geo-shape shape-3"></div>
        <div className="geo-shape shape-4"></div>
        <div className="geo-shape shape-5"></div>
        <div className="geo-shape shape-6"></div>
        <div className="geo-shape shape-7"></div>
      </div>

      <div className={styles.authcard} style={{ position: "relative", zIndex: 2 }}>
        <div className={styles.authleft} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "50%",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>

          <h2>Welcome Back</h2>
          <p>Login to access your portal dashboard.</p>
        </div>

        <div className={styles.authright}>
          <h2>Login</h2>

          <form onSubmit={handleSubmit}>
            <div className={styles.inputgroup}>
              <label>Email</label>
              <input
                type="email"
                placeholder="r@ptc.edu.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.inputgroup}>
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p style={{ color: "red", fontSize: "13px", marginBottom: "8px" }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Login"}
            </button>
          </form>

          <div className={styles.authlinks}>
            <a href="#">Forgot password?</a>
          </div>
          <div style={{ marginTop: "20px" }}>
            <h4>Development Access</h4>

            <button
              type="button"
              onClick={() => {
                authService.saveSession({
                  username: "admin",
                  role: "admin",
                });

                navigate("/admin/dashboard");
              }}
            >
              Login as Admin
            </button>

            <button
              type="button"
              onClick={() => {
                authService.saveSession({
                  username: "faculty",
                  role: "faculty",
                });

                navigate("/faculty/dashboard");
              }}
              style={{ marginLeft: "10px" }}
            >
              Login as Faculty
            </button>

            <button
              type="button"
              onClick={() => {
                authService.saveSession({
                  username: "student",
                  role: "student",
                });

                navigate("/student/dashboard");
              }}
              style={{ marginLeft: "10px" }}
            >
              Login as Student
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}