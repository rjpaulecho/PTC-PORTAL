import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import "../../../styles/EnrollmentPeriodMR.css";

// ============================================================
// API
// ============================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/enrollments/period";

// ============================================================
// TYPES
// ============================================================

interface AcademicYear {
  academic_year_id: number;
  academic_year: string;
  is_current?: boolean | number;
}

interface Semester {
  semester_id: number;
  semester_name: string;
}

interface EnrollmentPeriod {
  enrollment_period_id: number;

  academic_year_id: number;
  academic_year: string;

  semester_id: number;
  semester_name: string;

  status: string;

  opened_by?: number | null;
  opened_by_username?: string | null;
  opened_at?: string | null;

  closed_by?: number | null;
  closed_by_username?: string | null;
  closed_at?: string | null;

  remarks?: string | null;
}

interface PeriodResponse {
  success: boolean;
  message?: string;
  error?: string;

  enrollment_period?: EnrollmentPeriod | null;

  academic_years?: AcademicYear[];
  semesters?: Semester[];
}

// ============================================================
// COMPONENT
// ============================================================

export default function EnrollmentPeriodMR() {
  const navigate = useNavigate();

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  const user = authService.getSession();
  const token = authService.getToken();

  const userRole = user?.role;

  const authenticated = Boolean(user && token);

  // ============================================================
  // DATA
  // ============================================================

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  const [semesters, setSemesters] = useState<Semester[]>([]);

  const [currentPeriod, setCurrentPeriod] = useState<EnrollmentPeriod | null>(
    null,
  );

  // ============================================================
  // SELECTION
  // ============================================================

  const [selectedAcademicYearId, setSelectedAcademicYearId] =
    useState<number>(0);

  const [selectedSemesterId, setSelectedSemesterId] = useState<number>(0);

  // ============================================================
  // STATES
  // ============================================================

  const [loading, setLoading] = useState(true);

  const [actionLoading, setActionLoading] = useState(false);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // ============================================================
  // CONFIRMATION
  // ============================================================

  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

  // ============================================================
  // AUTHORIZATION
  // ============================================================

  useEffect(() => {
    // No user session or no JWT
    if (!authenticated) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return;
    }

    // Logged in but not Registrar
    if (userRole !== "Registrar") {
      if (user) {
        navigate(authService.getDashboardRoute(user.role), {
          replace: true,
        });
      } else {
        navigate("/login", {
          replace: true,
        });
      }
    }
  }, [authenticated, userRole, user, navigate]);

  // ============================================================
  // RESPONSE HANDLER
  // ============================================================

  const readPeriodResponse = async (
    response: Response,
  ): Promise<PeriodResponse> => {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();

      throw new Error(
        `Server returned a non-JSON response (${response.status}): ${text.slice(
          0,
          200,
        )}`,
      );
    }

    return response.json();
  };

  // ============================================================
  // HANDLE AUTH RESPONSE
  // ============================================================

  const handleAuthenticationResponse = (
    response: Response,
    responseData: PeriodResponse,
  ) => {
    // ----------------------------------------------------------
    // 401
    // Token missing / invalid / expired
    // ----------------------------------------------------------

    if (response.status === 401) {
      authService.logout();

      navigate("/login", {
        replace: true,
      });

      return false;
    }

    // ----------------------------------------------------------
    // 403
    // Authenticated but not allowed
    // ----------------------------------------------------------

    if (response.status === 403) {
      throw new Error(
        responseData.message ||
          responseData.error ||
          "You are not authorized to manage the enrollment period.",
      );
    }

    return true;
  };

  // ============================================================
  // LOAD PERIOD DATA
  // ============================================================

  const loadPeriodData = async () => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    try {
      setLoading(true);

      setError("");

      console.log("=================================");

      console.log("LOADING ENROLLMENT PERIOD");

      console.log("Endpoint:", API_BASE_URL);

      console.log("=================================");

      // ========================================================
      // AUTHENTICATED REQUEST
      //
      // Automatically adds:
      //
      // Authorization: Bearer <JWT>
      // ========================================================

      const response = await authService.authFetch(API_BASE_URL, {
        method: "GET",

        headers: {
          Accept: "application/json",
        },
      });

      const responseData = await readPeriodResponse(response);

      console.log("Period API status:", response.status);

      console.log("Period API response:", responseData);

      // ========================================================
      // AUTHENTICATION / AUTHORIZATION
      // ========================================================

      const canContinue = handleAuthenticationResponse(response, responseData);

      if (!canContinue) {
        return;
      }

      // ========================================================
      // HTTP ERROR
      // ========================================================

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            `Failed to load enrollment period (${response.status}).`,
        );
      }

      // ========================================================
      // API ERROR
      // ========================================================

      if (!responseData.success) {
        throw new Error(
          responseData.message ||
            "Unable to load enrollment period information.",
        );
      }

      // ========================================================
      // ACADEMIC YEARS
      // ========================================================

      const years = Array.isArray(responseData.academic_years)
        ? responseData.academic_years
        : [];

      setAcademicYears(years);

      // ========================================================
      // SEMESTERS
      // ========================================================

      const semesterData = Array.isArray(responseData.semesters)
        ? responseData.semesters
        : [];

      setSemesters(semesterData);

      // ========================================================
      // CURRENT PERIOD
      // ========================================================

      const period = responseData.enrollment_period || null;

      setCurrentPeriod(period);

      // ========================================================
      // SELECT CURRENT OPEN PERIOD
      // ========================================================

      if (period) {
        setSelectedAcademicYearId(Number(period.academic_year_id));

        setSelectedSemesterId(Number(period.semester_id));

        return;
      }

      // ========================================================
      // NO OPEN PERIOD
      //
      // Select current academic year if possible.
      // ========================================================

      const currentYear = years.find(
        (year) => year.is_current === true || Number(year.is_current) === 1,
      );

      if (currentYear) {
        setSelectedAcademicYearId(Number(currentYear.academic_year_id));
      } else if (years.length > 0) {
        setSelectedAcademicYearId(Number(years[0].academic_year_id));
      } else {
        setSelectedAcademicYearId(0);
      }

      if (semesterData.length > 0) {
        setSelectedSemesterId(Number(semesterData[0].semester_id));
      } else {
        setSelectedSemesterId(0);
      }
    } catch (err) {
      console.error("LOAD ENROLLMENT PERIOD ERROR:", err);

      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the enrollment server. Make sure the backend is running on http://localhost:3000.",
        );

        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load enrollment period.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOAD INITIAL DATA
  // ============================================================

  useEffect(() => {
    if (!authenticated || userRole !== "Registrar") {
      return;
    }

    void loadPeriodData();
  }, [authenticated, userRole]);

  // ============================================================
  // OPEN / REOPEN ENROLLMENT
  // ============================================================

  const openEnrollment = async () => {
    if (!authenticated || userRole !== "Registrar") {
      setError("Authentication is required.");

      return;
    }

    if (!selectedAcademicYearId) {
      setError("Please select an academic year.");

      return;
    }

    if (!selectedSemesterId) {
      setError("Please select a semester.");

      return;
    }

    try {
      setActionLoading(true);

      setError("");

      setSuccessMessage("");

      console.log("=================================");

      console.log("OPENING ENROLLMENT PERIOD");

      console.log("Academic Year ID:", selectedAcademicYearId);

      console.log("Semester ID:", selectedSemesterId);

      console.log("=================================");

      // ======================================================
      // IMPORTANT
      //
      // DO NOT send:
      //
      // user_id: user.user_id
      //
      // Backend must use:
      //
      // req.user.user_id
      //
      // ======================================================

      const response = await authService.authFetch(`${API_BASE_URL}/open`, {
        method: "POST",

        body: JSON.stringify({
          academic_year_id: selectedAcademicYearId,

          semester_id: selectedSemesterId,
        }),
      });

      const responseData = await readPeriodResponse(response);

      console.log("Open status:", response.status);

      console.log("Open response:", responseData);

      // ======================================================
      // AUTH CHECK
      // ======================================================

      const canContinue = handleAuthenticationResponse(response, responseData);

      if (!canContinue) {
        return;
      }

      // ======================================================
      // HTTP ERROR
      // ======================================================

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            `Unable to open enrollment (${response.status}).`,
        );
      }

      // ======================================================
      // API ERROR
      // ======================================================

      if (!responseData.success) {
        throw new Error(responseData.message || "Unable to open enrollment.");
      }

      // ======================================================
      // SUCCESS
      // ======================================================

      setSuccessMessage(
        responseData.message || "Enrollment period opened successfully.",
      );

      // ======================================================
      // RELOAD DATABASE STATE
      // ======================================================

      await loadPeriodData();
    } catch (err) {
      console.error("OPEN ENROLLMENT ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to open enrollment period.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ============================================================
  // CLOSE ENROLLMENT
  // ============================================================

  const closeEnrollment = async () => {
    if (!authenticated || userRole !== "Registrar") {
      setError("Authentication is required.");

      return;
    }

    if (!currentPeriod?.enrollment_period_id) {
      setError("There is no active enrollment period to close.");

      return;
    }

    try {
      setActionLoading(true);

      setError("");

      setSuccessMessage("");

      console.log("=================================");

      console.log("CLOSING ENROLLMENT PERIOD");

      console.log("Enrollment Period ID:", currentPeriod.enrollment_period_id);

      console.log("=================================");

      // ======================================================
      // IMPORTANT
      //
      // Registrar identity comes from JWT:
      //
      // req.user.user_id
      //
      // No frontend user_id is sent.
      // ======================================================

      const response = await authService.authFetch(`${API_BASE_URL}/close`, {
        method: "POST",

        body: JSON.stringify({
          enrollment_period_id: currentPeriod.enrollment_period_id,
        }),
      });

      const responseData = await readPeriodResponse(response);

      console.log("Close status:", response.status);

      console.log("Close response:", responseData);

      // ======================================================
      // AUTH CHECK
      // ======================================================

      const canContinue = handleAuthenticationResponse(response, responseData);

      if (!canContinue) {
        return;
      }

      // ======================================================
      // HTTP ERROR
      // ======================================================

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            `Unable to close enrollment (${response.status}).`,
        );
      }

      // ======================================================
      // API ERROR
      // ======================================================

      if (!responseData.success) {
        throw new Error(responseData.message || "Unable to close enrollment.");
      }

      // ======================================================
      // SUCCESS
      // ======================================================

      setSuccessMessage(
        responseData.message || "Enrollment period closed successfully.",
      );

      setShowCloseConfirmation(false);

      // ======================================================
      // RELOAD DATABASE STATE
      // ======================================================

      await loadPeriodData();
    } catch (err) {
      console.error("CLOSE ENROLLMENT ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to close enrollment period.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ============================================================
  // FORMAT DATE
  // ============================================================

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) {
      return "—";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // ============================================================
  // STATUS
  // ============================================================

  const periodIsOpen = currentPeriod?.status?.toLowerCase() === "open";

  // ============================================================
  // SELECTED YEAR
  // ============================================================

  const selectedAcademicYear = academicYears.find(
    (year) => Number(year.academic_year_id) === Number(selectedAcademicYearId),
  );

  // ============================================================
  // SELECTED SEMESTER
  // ============================================================

  const selectedSemester = semesters.find(
    (semester) => Number(semester.semester_id) === Number(selectedSemesterId),
  );

  // ============================================================
  // BUTTON TEXT
  // ============================================================

  const openButtonText = "Open Enrollment";

  // ============================================================
  // AUTH RENDER GUARD
  // ============================================================

  if (!authenticated || !user || userRole !== "Registrar") {
    return null;
  }

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="registrar-enrollment-periodM">
          <div className="enrollment-period-loading">
            <div className="enrollment-period-spinner"></div>

            <p>Loading enrollment period...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <DashboardLayout>
      <div className="registrar-enrollment-periodM">
        {/* ==================================================
            HEADER
        ================================================== */}

        <div className="enrollment-period-header">
          <div>
            <span className="enrollment-period-eyebrow">
              Registrar Management
            </span>

            <h1>Enrollment Period</h1>

            <p>Open or close the enrollment period for students.</p>
          </div>

          <div
            className={`enrollment-period-status ${
              periodIsOpen ? "open" : "closed"
            }`}
          >
            <span className="status-dot"></span>

            {currentPeriod?.status || "CLOSED"}
          </div>
        </div>

        {/* ==================================================
            ERROR ALERT
        ================================================== */}

        {error && (
          <div className="enrollment-period-alert error">
            <span className="alert-icon">!</span>

            <div>
              <strong>Action Failed</strong>

              <p>{error}</p>
            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="alert-close"
            >
              ×
            </button>
          </div>
        )}

        {/* ==================================================
            SUCCESS ALERT
        ================================================== */}

        {successMessage && (
          <div className="enrollment-period-alert success">
            <span className="alert-icon">✓</span>

            <div>
              <strong>Enrollment Period</strong>

              <p>{successMessage}</p>
            </div>

            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="alert-close"
            >
              ×
            </button>
          </div>
        )}

        {/* ==================================================
            CURRENT PERIOD
        ================================================== */}

        <div className="enrollment-period-card">
          <div className="period-card-header">
            <div>
              <span className="enrollment-period-eyebrow">
                Current Enrollment Period
              </span>

              <h2>
                {currentPeriod
                  ? `${currentPeriod.academic_year} — ${currentPeriod.semester_name}`
                  : "No Enrollment Period Open"}
              </h2>
            </div>

            <div
              className={`period-large-status ${
                periodIsOpen ? "open" : "closed"
              }`}
            >
              <span className="status-dot"></span>

              {currentPeriod?.status || "CLOSED"}
            </div>
          </div>

          {currentPeriod ? (
            <div className="period-details-grid">
              <div className="period-detail">
                <span>Academic Year</span>

                <strong>{currentPeriod.academic_year}</strong>
              </div>

              <div className="period-detail">
                <span>Semester</span>

                <strong>{currentPeriod.semester_name}</strong>
              </div>

              <div className="period-detail">
                <span>Opened By</span>

                <strong>
                  {currentPeriod.opened_by_username ||
                    currentPeriod.opened_by ||
                    "—"}
                </strong>
              </div>

              <div className="period-detail">
                <span>Opened</span>

                <strong>{formatDateTime(currentPeriod.opened_at)}</strong>
              </div>
            </div>
          ) : (
            <div className="period-empty">
              <strong>No enrollment period is currently open.</strong>

              <p>
                Select an academic year and semester below to open enrollment.
              </p>
            </div>
          )}
        </div>

        {/* ==================================================
            PERIOD CONFIGURATION
        ================================================== */}

        <div className="enrollment-period-card">
          <div className="period-card-header">
            <div>
              <span className="enrollment-period-eyebrow">
                Period Configuration
              </span>

              <h2>Select Enrollment Period</h2>

              <p>
                Choose the academic year and semester that students will enroll
                in.
              </p>
            </div>
          </div>

          {/* ==================================================
              SELECTION
          ================================================== */}

          <div className="period-selection-grid">
            {/* Academic Year */}

            <div className="period-field">
              <label htmlFor="academic-year">Academic Year</label>

              <select
                id="academic-year"
                value={selectedAcademicYearId}
                onChange={(event) =>
                  setSelectedAcademicYearId(Number(event.target.value))
                }
                disabled={actionLoading || periodIsOpen}
              >
                <option value={0}>Select Academic Year</option>

                {academicYears.map((year) => (
                  <option
                    key={year.academic_year_id}
                    value={year.academic_year_id}
                  >
                    {year.academic_year}

                    {year.is_current === true || Number(year.is_current) === 1
                      ? " — Current"
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester */}

            <div className="period-field">
              <label htmlFor="semester">Semester</label>

              <select
                id="semester"
                value={selectedSemesterId}
                onChange={(event) =>
                  setSelectedSemesterId(Number(event.target.value))
                }
                disabled={actionLoading || periodIsOpen}
              >
                <option value={0}>Select Semester</option>

                {semesters.map((semester) => (
                  <option
                    key={semester.semester_id}
                    value={semester.semester_id}
                  >
                    {semester.semester_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ==================================================
              SELECTED PERIOD PREVIEW
          ================================================== */}

          {selectedAcademicYearId > 0 && selectedSemesterId > 0 && (
            <div className="period-preview">
              <span>Selected Period</span>

              <strong>
                {selectedAcademicYear?.academic_year || "—"}

                {" — "}

                {selectedSemester?.semester_name || "—"}
              </strong>
            </div>
          )}

          {/* ==================================================
              ACTIONS
          ================================================== */}

          <div className="period-actions">
            {!periodIsOpen && (
              <button
                type="button"
                className="period-btn open-btn"
                onClick={openEnrollment}
                disabled={
                  actionLoading ||
                  !selectedAcademicYearId ||
                  !selectedSemesterId
                }
              >
                {actionLoading ? (
                  <>
                    <span className="button-spinner"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    <span>✓</span>

                    {openButtonText}
                  </>
                )}
              </button>
            )}

            {periodIsOpen && (
              <button
                type="button"
                className="period-btn close-btn"
                onClick={() => {
                  setError("");

                  setSuccessMessage("");

                  setShowCloseConfirmation(true);
                }}
                disabled={actionLoading}
              >
                <span>×</span>
                Close Enrollment
              </button>
            )}
          </div>
        </div>

        {/* ==================================================
            IMPORTANT INFORMATION
        ================================================== */}

        <div className="enrollment-period-info">
          <div className="info-icon">i</div>

          <div>
            <strong>Enrollment Period Rules</strong>

            <ul>
              <li>
                Students can submit enrollment only while the enrollment period
                is open.
              </li>

              <li>Students cannot select or change sections.</li>

              <li>
                Subjects and sections are prepared by the Registrar/system.
              </li>

              <li>
                Closing enrollment prevents students from submitting their
                prepared enrollment.
              </li>

              <li>
                Reopening a previously closed period updates the existing period
                instead of creating a duplicate record.
              </li>
            </ul>
          </div>
        </div>

        {/* ==================================================
            CLOSE CONFIRMATION MODAL
        ================================================== */}

        {showCloseConfirmation && (
          <div className="period-modal-overlay">
            <div className="period-modal">
              <div className="period-modal-icon">!</div>

              <h2>Close Enrollment?</h2>

              <p>
                Are you sure you want to close the current enrollment period?
              </p>

              <div className="period-modal-period">
                <strong>{currentPeriod?.academic_year}</strong>

                <span>{currentPeriod?.semester_name}</span>
              </div>

              <small>
                Students will no longer be able to submit their prepared
                enrollment while the period is closed.
              </small>

              <div className="period-modal-actions">
                <button
                  type="button"
                  className="period-btn cancel-btn"
                  onClick={() => setShowCloseConfirmation(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="period-btn close-btn"
                  onClick={closeEnrollment}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <>
                      <span className="button-spinner"></span>
                      Closing...
                    </>
                  ) : (
                    "Yes, Close Enrollment"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
