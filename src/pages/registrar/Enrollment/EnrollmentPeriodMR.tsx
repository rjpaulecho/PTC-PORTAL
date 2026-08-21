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

interface RegistrarSession {
  id?: number;
  user_id?: number;
  username?: string;
  role: string;
  email?: string;
  role_id?: number;
}

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

  enrollment_period?: EnrollmentPeriod | null;

  academic_years?: AcademicYear[];
  semesters?: Semester[];

  error?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export default function EnrollmentPeriodMR() {
  const navigate = useNavigate();

  // ============================================================
  // SESSION
  // ============================================================

  const [user, setUser] = useState<RegistrarSession | null>(null);

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
  // GET SESSION
  // ============================================================

  useEffect(() => {
    const session = authService.getSession();

    console.log("=================================");
    console.log("REGISTRAR ENROLLMENT PERIOD");
    console.log("SESSION:", session);
    console.log("=================================");

    if (!session || session.role !== "Registrar") {
      navigate("/login", { replace: true });
      return;
    }

    if (!session.user_id) {
      setError("Registrar session does not contain a user ID.");
      setLoading(false);
      return;
    }

    setUser(session);
  }, [navigate]);

  // ============================================================
  // LOAD INITIAL DATA
  // ============================================================

  useEffect(() => {
    if (!user?.user_id) {
      return;
    }

    void loadPeriodData();
  }, [user]);

  // ============================================================
  // LOAD PERIOD DATA
  // ============================================================

  const loadPeriodData = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("=================================");
      console.log("LOADING ENROLLMENT PERIOD");
      console.log("Endpoint:", API_BASE_URL);
      console.log("=================================");

      const response = await fetch(API_BASE_URL);

      let responseData: PeriodResponse;

      try {
        responseData = await response.json();
      } catch {
        throw new Error(
          `Server returned an invalid response (${response.status}).`,
        );
      }

      console.log("Period API status:", response.status);
      console.log("Period API response:", responseData);

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            `Failed to load enrollment period (${response.status})`,
        );
      }

      if (!responseData.success) {
        throw new Error(
          responseData.message ||
            "Unable to load enrollment period information.",
        );
      }

      // ========================================================
      // ACADEMIC YEARS
      // ========================================================

      setAcademicYears(responseData.academic_years || []);

      // ========================================================
      // SEMESTERS
      // ========================================================

      setSemesters(responseData.semesters || []);

      // ========================================================
      // CURRENT OPEN PERIOD
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
      // Select current academic year and first semester
      // as the default option for opening enrollment.
      // ========================================================

      const currentYear = (responseData.academic_years || []).find(
        (year) => year.is_current === true || Number(year.is_current) === 1,
      );

      if (currentYear) {
        setSelectedAcademicYearId(Number(currentYear.academic_year_id));
      } else if (responseData.academic_years?.length) {
        setSelectedAcademicYearId(
          Number(responseData.academic_years[0].academic_year_id),
        );
      }

      if (responseData.semesters?.length) {
        setSelectedSemesterId(Number(responseData.semesters[0].semester_id));
      }
    } catch (error) {
      console.error("LOAD ENROLLMENT PERIOD ERROR:", error);

      if (error instanceof TypeError) {
        setError(
          "Unable to connect to the enrollment server. Make sure the backend is running on http://localhost:3000.",
        );
      } else {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load enrollment period.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // OPEN / REOPEN ENROLLMENT
  // ============================================================

  const openEnrollment = async () => {
    if (!user?.user_id) {
      setError("Unable to identify the current Registrar.");
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
      console.log("Registrar ID:", user.user_id);
      console.log("=================================");

      const response = await fetch(`${API_BASE_URL}/open`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          academic_year_id: selectedAcademicYearId,

          semester_id: selectedSemesterId,

          user_id: user.user_id,
        }),
      });

      let responseData: PeriodResponse;

      try {
        responseData = await response.json();
      } catch {
        throw new Error(
          `Server returned an invalid response (${response.status}).`,
        );
      }

      console.log("Open status:", response.status);

      console.log("Open response:", responseData);

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            `Unable to open enrollment (${response.status})`,
        );
      }

      if (!responseData.success) {
        throw new Error(responseData.message || "Unable to open enrollment.");
      }

      setSuccessMessage(
        responseData.message || "Enrollment period opened successfully.",
      );

      // ========================================================
      // RELOAD DATABASE STATE
      // ========================================================

      await loadPeriodData();
    } catch (error) {
      console.error("OPEN ENROLLMENT ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
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
    if (!user?.user_id) {
      setError("Unable to identify the current Registrar.");
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

      console.log("Registrar ID:", user.user_id);

      console.log("=================================");

      const response = await fetch(`${API_BASE_URL}/close`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          enrollment_period_id: currentPeriod.enrollment_period_id,

          user_id: user.user_id,
        }),
      });

      let responseData: PeriodResponse;

      try {
        responseData = await response.json();
      } catch {
        throw new Error(
          `Server returned an invalid response (${response.status}).`,
        );
      }

      console.log("Close status:", response.status);

      console.log("Close response:", responseData);

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            `Unable to close enrollment (${response.status})`,
        );
      }

      if (!responseData.success) {
        throw new Error(responseData.message || "Unable to close enrollment.");
      }

      setSuccessMessage(
        responseData.message || "Enrollment period closed successfully.",
      );

      setShowCloseConfirmation(false);

      // ========================================================
      // RELOAD DATABASE STATE
      // ========================================================

      await loadPeriodData();
    } catch (error) {
      console.error("CLOSE ENROLLMENT ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
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

  const openButtonText = periodIsOpen ? "" : "Open Enrollment";

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
                  console.log("CLOSE ENROLLMENT BUTTON CLICKED");
                  console.log("Current Period:", currentPeriod);
                  console.log("Action Loading:", actionLoading);

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
