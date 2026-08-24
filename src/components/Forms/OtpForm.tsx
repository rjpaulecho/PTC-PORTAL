import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { authService } from "../../services/auth.service";

import styles from "../../styles/auth.module.css";

export default function OtpForm() {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const username = authService.getPendingUsername();

  // =====================================================
  // GUARD
  //
  // User should only be on the OTP page after:
  //
  // Login
  //   ↓
  // OTP sent
  //   ↓
  // pending_username saved
  // =====================================================
  useEffect(() => {
    if (!username) {
      navigate("/login", {
        replace: true,
      });
    }
  }, [username, navigate]);

  if (!username) {
    return null;
  }

  // =====================================================
  // VERIFY OTP
  // =====================================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const currentUsername = authService.getPendingUsername();

      if (!currentUsername) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      // ==========================================
      // Backend:
      //
      // POST /auth/verify-otp
      //
      // returns:
      //
      // token
      // +
      // authenticated user
      //
      // authService.verifyOtp() automatically:
      //
      // saveToken()
      // saveSession()
      // ==========================================

      const user = await authService.verifyOtp(currentUsername, otp);

      // OTP process is finished.
      authService.clearPendingUsername();

      // ==========================================
      // Route according to authenticated role
      // ==========================================

      const destination = authService.getDashboardRoute(user.role);

      navigate(destination, {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid or expired OTP. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.authcard}>
      {/* ========================================
          LEFT SIDE
      ======================================== */}
      <div className={styles.authleft}>
        <h2>Check Your Email</h2>

        <p>
          A 6-digit OTP has been sent to the email address associated with your
          account.
          <br />
          <strong>Username: {username}</strong>
        </p>
      </div>

      {/* ========================================
          RIGHT SIDE
      ======================================== */}
      <div className={styles.authright}>
        <h2>OTP Verification</h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.inputgroup}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder=" "
              maxLength={6}
              value={otp}
              onChange={(e) => {
                const numericValue = e.target.value.replace(/\D/g, "");

                setOtp(numericValue);
              }}
              disabled={loading}
              required
            />

            <label>Enter OTP</label>
          </div>

          {/* ====================================
              ERROR
          ==================================== */}
          {error && <p className={styles.errorMsg}>{error}</p>}

          {/* ====================================
              VERIFY BUTTON
          ==================================== */}
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className={`${styles.submitBtn} ${loading ? styles.loading : ""}`}
          >
            {loading ? "Verifying..." : "Verify OTP"}
          </button>
        </form>

        {/* ======================================
            BACK TO LOGIN
        ====================================== */}
        <div className={styles.authlinks}>
          <button
            type="button"
            onClick={() => {
              authService.clearPendingUsername();

              navigate("/login", {
                replace: true,
              });
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
