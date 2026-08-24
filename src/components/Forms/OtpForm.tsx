import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService, type UserRole } from "../../services/auth.service";
import styles from "../../styles/auth.module.css";

// Central place to map each role to its dashboard route.
// NOTE: adjust these paths if your actual routes differ —
// I only had /admin, /faculty, and /student confirmed from the
// original code, so I'm guessing at Registrar / Program Head.
const ROLE_ROUTES: Record<UserRole, string> = {
  Admin: "/admin/dashboard",
  Registrar: "/registrar/dashboard",
  "Program Head": "/programhead/dashboard",
  Faculty: "/faculty/dashboard",
  Student: "/student/dashboard",
};

export default function OtpForm() {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const username = authService.getPendingUsername();

  // Guard: redirect to login if no pending email
  useEffect(() => {
    if (!username) navigate("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!username) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const currentUsername = authService.getPendingUsername();

    if (!currentUsername) {
      setLoading(false);
      navigate("/login");
      return;
    }

    const user = await authService.verifyOtp(currentUsername, otp); // ← use currentEmail, guaranteed string

    setLoading(false);

    if (!user) {
      setError("Invalid or expired OTP. Please try again.");
      return;
    }

    authService.clearPendingUsername();
    authService.saveSession(user);
    switch (user.role) {
      case "Admin":
        navigate("/admin/dashboard");
        break;

      case "Faculty":
        navigate("/faculty/dashboard");
        break;

      case "Student":
        navigate("/student/dashboard");
        break;

      case "Program Head":
        navigate("/programhead/dashboard");
        break;

      case "Registrar":
        navigate("/registrar/dashboard");
        break;

      default:
        navigate("/login");
    }

    // FIX: previously compared against lowercase "admin" / "faculty",
    // but UserRole values are capitalized ("Admin", "Faculty", ...),
    // so this check never matched and everyone landed on
    // /student/dashboard regardless of actual role. Also added the
    // missing Registrar / Program Head branches.
    const destination = ROLE_ROUTES[user.role] ?? "/student/dashboard";
    navigate(destination);
  }

  return (
    <div className={styles.authcard}>
      <div className={styles.authleft}>
        <h2>Check Your Email</h2>
        <p>
          A 6-digit OTP has been sent to the email address associated with your
          account.
          <br />
          <strong>Username: {username}</strong>
        </p>
      </div>

      <div className={styles.authright}>
        <h2>OTP Verification</h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.inputgroup}>
            <label>Enter OTP</label>
            <input
              type="text"
              placeholder="******"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>

          {error && (
            <p style={{ color: "red", fontSize: "13px", marginBottom: "8px" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Verify OTP"}
          </button>
        </form>

        <div className={styles.authlinks}>
          <a href="/login">Back to Login</a>
        </div>
      </div>
    </div>
  );
}