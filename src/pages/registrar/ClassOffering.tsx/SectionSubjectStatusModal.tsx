import { useEffect, useState } from "react";

import { authService } from "../../../services/auth.service";

import type { OfferingTableSubject } from "./components/OfferingTable";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/offerings";

// =====================================================
// TYPES
// =====================================================

type SectionSubjectStatus = "Open" | "Closed" | "Cancelled";

// =====================================================
// RESPONSE
// =====================================================

interface UpdateSectionSubjectStatusResponse {
  success: boolean;

  message?: string;

  error?: string;

  active_assignments?: number;

  pending_assignments?: number;

  approved_assignments?: number;

  offering_count?: number;

  open_offerings?: number;

  section_subject?: unknown;
}

// =====================================================
// PROPS
// =====================================================

interface SectionSubjectStatusModalProps {
  open: boolean;

  subject: OfferingTableSubject | null;

  onClose: () => void;

  onSuccess: () => void;

  onUnauthorized: () => void;
}

// =====================================================
// SAFE JSON
// =====================================================

async function readJsonResponse<T>(response: Response): Promise<T> {
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

  return response.json() as Promise<T>;
}

// =====================================================
// COMPONENT
// =====================================================

export default function SectionSubjectStatusModal({
  open,

  subject,

  onClose,

  onSuccess,

  onUnauthorized,
}: SectionSubjectStatusModalProps) {
  // =====================================================
  // CURRENT SECTION SUBJECT
  // =====================================================

  const sectionSubject = subject?.section_subject || null;

  const sectionSubjectId = sectionSubject?.section_subject_id;

  const currentStatus: SectionSubjectStatus =
    sectionSubject?.status === "Open" ||
    sectionSubject?.status === "Closed" ||
    sectionSubject?.status === "Cancelled"
      ? sectionSubject.status
      : "Closed";

  const isCancelled = currentStatus === "Cancelled";

  // =====================================================
  // NORMAL LIFECYCLE
  //
  // Open   -> Closed
  // Closed -> Open
  // Cancelled -> no normal action in this UI
  // =====================================================

  const normalTargetStatus: SectionSubjectStatus | null =
    currentStatus === "Open"
      ? "Closed"
      : currentStatus === "Closed"
        ? "Open"
        : null;

  // =====================================================
  // UI STATE
  // =====================================================

  const [cancelMode, setCancelMode] = useState(false);

  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [backendDetails, setBackendDetails] = useState<
    Record<string, number | null>
  >({});

  // =====================================================
  // RESET
  // =====================================================

  useEffect(() => {
    if (!open || !sectionSubjectId) {
      return;
    }

    setCancelMode(false);

    setReason("");

    setLoading(false);

    setError("");

    setBackendDetails({});
  }, [open, sectionSubjectId]);

  // =====================================================
  // DISPLAY
  // =====================================================

  const modalTitle = cancelMode
    ? "Cancel Section Subject"
    : currentStatus === "Open"
      ? "Close Section Subject"
      : currentStatus === "Closed"
        ? "Open Section Subject"
        : "Cancelled Section Subject";

  const modalDescription = cancelMode
    ? "Confirm permanent cancellation of this section subject."
    : currentStatus === "Open"
      ? "Close this subject for the selected section and academic term."
      : currentStatus === "Closed"
        ? "Open this subject for the selected section and academic term."
        : "This section subject is currently Cancelled.";

  const normalButtonText =
    normalTargetStatus === "Open"
      ? "Open Section Subject"
      : normalTargetStatus === "Closed"
        ? "Close Section Subject"
        : "";

  // =====================================================
  // CLEAR FEEDBACK
  // =====================================================

  const clearFeedback = () => {
    setError("");

    setBackendDetails({});
  };

  // =====================================================
  // CLOSE
  // =====================================================

  const handleClose = () => {
    if (loading) {
      return;
    }

    clearFeedback();

    setCancelMode(false);

    setReason("");

    onClose();
  };

  // =====================================================
  // CANCELLATION MODE
  // =====================================================

  const beginCancellation = () => {
    if (loading || isCancelled) {
      return;
    }

    clearFeedback();

    setReason("");

    setCancelMode(true);
  };

  const leaveCancellation = () => {
    if (loading) {
      return;
    }

    clearFeedback();

    setReason("");

    setCancelMode(false);
  };

  // =====================================================
  // CAPTURE BACKEND DETAILS
  // =====================================================

  const captureBackendDetails = (data: UpdateSectionSubjectStatusResponse) => {
    const details: Record<string, number | null> = {};

    if (typeof data.active_assignments === "number") {
      details.active_assignments = data.active_assignments;
    }

    if (typeof data.pending_assignments === "number") {
      details.pending_assignments = data.pending_assignments;
    }

    if (typeof data.approved_assignments === "number") {
      details.approved_assignments = data.approved_assignments;
    }

    if (typeof data.offering_count === "number") {
      details.offering_count = data.offering_count;
    }

    if (typeof data.open_offerings === "number") {
      details.open_offerings = data.open_offerings;
    }

    setBackendDetails(details);
  };

  // =====================================================
  // UPDATE STATUS
  //
  // Backend is authoritative for protection rules.
  //
  // Contract confirmed at runtime:
  // Cancelled requires a non-empty reason.
  // =====================================================

  const updateStatus = async (targetStatus: SectionSubjectStatus) => {
    if (!subject || !sectionSubject || !sectionSubjectId) {
      setError("A valid section subject is required.");

      return;
    }

    if (loading) {
      return;
    }

    if (targetStatus === currentStatus) {
      setError(`The section subject is already ${currentStatus}.`);

      return;
    }

    if (targetStatus === "Cancelled" && reason.trim().length === 0) {
      setError("A reason is required when cancelling a section subject.");

      return;
    }

    try {
      setLoading(true);

      clearFeedback();

      const payload: {
        status: SectionSubjectStatus;

        reason?: string;
      } = {
        status: targetStatus,
      };

      if (targetStatus === "Cancelled") {
        payload.reason = reason.trim();
      }

      console.log("UPDATE SECTION SUBJECT STATUS:", {
        section_subject_id: sectionSubjectId,

        current_status: currentStatus,

        target_status: targetStatus,

        payload,
      });

      const response = await authService.authFetch(
        `${API_BASE_URL}/section-subjects/${sectionSubjectId}/status`,
        {
          method: "PATCH",

          headers: {
            Accept: "application/json",

            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        },
      );

      const data =
        await readJsonResponse<UpdateSectionSubjectStatusResponse>(response);

      // ===============================================
      // 401
      // ===============================================

      if (response.status === 401) {
        onUnauthorized();

        return;
      }

      // ===============================================
      // 403
      // ===============================================

      if (response.status === 403) {
        setError(
          data.message ||
            data.error ||
            "You are not authorized to change section subject status.",
        );

        return;
      }

      // ===============================================
      // 404
      // ===============================================

      if (response.status === 404) {
        setError(
          data.message ||
            data.error ||
            "The section subject could not be found.",
        );

        return;
      }

      // ===============================================
      // BUSINESS-RULE / VALIDATION BLOCK
      //
      // The exact protection logic belongs to backend.
      // Display the backend's authoritative explanation.
      // ===============================================

      if (
        response.status === 400 ||
        response.status === 409 ||
        response.status === 422
      ) {
        captureBackendDetails(data);

        setError(
          data.message ||
            data.error ||
            "The section subject status could not be changed.",
        );

        console.log("SECTION SUBJECT STATUS BLOCKED:", data);

        return;
      }

      // ===============================================
      // GENERAL ERROR
      // ===============================================

      if (!response.ok || !data.success) {
        captureBackendDetails(data);

        setError(
          data.message ||
            data.error ||
            "Failed to update section subject status.",
        );

        return;
      }

      // ===============================================
      // SUCCESS
      // ===============================================

      console.log("UPDATE SECTION SUBJECT STATUS SUCCESS:", data);

      onSuccess();
    } catch (requestError) {
      console.error("UPDATE SECTION SUBJECT STATUS ERROR:", requestError);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update section subject status.",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // ACTIONS
  // =====================================================

  const handleNormalStatusChange = () => {
    if (!normalTargetStatus) {
      return;
    }

    void updateStatus(normalTargetStatus);
  };

  const handleCancellation = () => {
    void updateStatus("Cancelled");
  };

  // =====================================================
  // BACKEND DETAIL ROWS
  // =====================================================

  const backendDetailRows = Object.entries(backendDetails);

  // =====================================================
  // DO NOT RENDER
  // =====================================================

  if (!open || !subject || !sectionSubject) {
    return null;
  }

  // =====================================================
  // RENDER
  //
  // Reuse the already-proven modal scroll behavior.
  // =====================================================

  return (
    <div
      className="class-offering-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          handleClose();
        }
      }}
    >
      <div
        className="class-offering-modal class-offering-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-subject-status-title"
      >
        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="class-offering-modal-header">
          <div>
            <h2 id="section-subject-status-title">{modalTitle}</h2>

            <p>{modalDescription}</p>
          </div>

          <button
            type="button"
            aria-label="Close section subject status modal"
            disabled={loading}
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        {/* ================================================= */}
        {/* SUBJECT */}
        {/* ================================================= */}

        <div className="class-offering-modal-subject">
          <div>
            <strong>{subject.subject.subject_code}</strong>

            <span>
              {" — "}
              {subject.subject.subject_name}
            </span>
          </div>

          <small>
            Section Subject #{sectionSubject.section_subject_id} ·{" "}
            {currentStatus}
          </small>
        </div>

        {/* ================================================= */}
        {/* ERROR */}
        {/* ================================================= */}

        {error && <div className="class-offering-error">{error}</div>}

        {/* ================================================= */}
        {/* BODY */}
        {/* ================================================= */}

        <div className="class-offering-modal-body">
          {/* =============================================== */}
          {/* CURRENT STATE */}
          {/* =============================================== */}

          <div className="class-offering-prepare-notice">
            <strong>Current section subject status: {currentStatus}</strong>

            <p>
              Section capacity: {sectionSubject.max_students ?? 0} · Offering:{" "}
              {subject.offering
                ? `#${subject.offering.offering_id} (${subject.offering.status})`
                : "No offering created"}
            </p>
          </div>

          {/* =============================================== */}
          {/* BACKEND PROTECTION DETAILS */}
          {/* =============================================== */}

          {backendDetailRows.length > 0 && (
            <div className="class-offering-open-requirements">
              <h3>Status Change Blocked</h3>

              <ul>
                {backendDetailRows.map(([key, value]) => (
                  <li key={key}>
                    {key
                      .replaceAll("_", " ")
                      .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                    : {value}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* =============================================== */}
          {/* CANCELLED */}
          {/* =============================================== */}

          {isCancelled && (
            <div className="class-offering-open-requirements">
              <h3>Cancelled Section Subject</h3>

              <p>
                This section subject is currently Cancelled. Normal Open and
                Close actions are not shown in this UI.
              </p>
            </div>
          )}

          {/* =============================================== */}
          {/* OPEN -> CLOSED */}
          {/* =============================================== */}

          {!isCancelled && !cancelMode && normalTargetStatus === "Closed" && (
            <>
              <div className="class-offering-open-requirements">
                <h3>Before Closing</h3>

                <ul>
                  <li>
                    This subject will stop being considered Open for this
                    section and academic term.
                  </li>

                  <li>
                    An existing child offering is not deleted by this frontend
                    action.
                  </li>

                  <li>
                    A Closed section subject prevents its offering from being
                    treated as ready for normal enrollment assignment.
                  </li>

                  <li>
                    The backend will apply any protection rules before the
                    status is changed.
                  </li>
                </ul>
              </div>

              <div className="class-offering-prepare-notice">
                <strong>Close this section subject?</strong>

                <p>
                  Click Close Section Subject below to send the status change to
                  the backend.
                </p>
              </div>
            </>
          )}

          {/* =============================================== */}
          {/* CLOSED -> OPEN */}
          {/* =============================================== */}

          {!isCancelled && !cancelMode && normalTargetStatus === "Open" && (
            <>
              <div className="class-offering-open-requirements">
                <h3>Before Opening</h3>

                <ul>
                  <li>
                    This subject becomes Open for this section and academic
                    term.
                  </li>

                  <li>
                    Opening the section subject does not automatically open a
                    Closed subject offering.
                  </li>

                  <li>
                    Offering readiness still depends on the offering's own
                    configuration and status.
                  </li>

                  <li>
                    The backend remains authoritative for any protection rules.
                  </li>
                </ul>
              </div>

              <div className="class-offering-prepare-notice">
                <strong>Open this section subject?</strong>

                <p>
                  Click Open Section Subject below to confirm the status change.
                </p>
              </div>
            </>
          )}

          {/* =============================================== */}
          {/* CANCEL CONFIRMATION */}
          {/* =============================================== */}

          {!isCancelled && cancelMode && (
            <>
              <div className="class-offering-open-requirements">
                <h3>Cancellation Warning</h3>

                <ul>
                  <li>
                    Cancelled removes this section subject from normal active
                    use.
                  </li>

                  <li>
                    Existing child offering records are not deleted by this
                    frontend action.
                  </li>

                  <li>
                    The backend may block cancellation when related records
                    still require protection.
                  </li>

                  <li>
                    Use Closed instead if this subject may need to be activated
                    again later.
                  </li>
                </ul>
              </div>

              <div className="class-offering-field">
                <label htmlFor="section-subject-cancellation-reason">
                  Cancellation Reason
                </label>

                <textarea
                  id="section-subject-cancellation-reason"
                  value={reason}
                  disabled={loading}
                  placeholder="Explain why this section subject is being cancelled."
                  onChange={(event) => {
                    setReason(event.target.value);

                    clearFeedback();
                  }}
                />

                <small>
                  Required. This reason will be sent to the backend with the
                  cancellation request.
                </small>
              </div>
            </>
          )}
        </div>

        {/* ================================================= */}
        {/* FOOTER */}
        {/* ================================================= */}

        <div className="class-offering-modal-footer">
          {isCancelled ? (
            <button type="button" disabled={loading} onClick={handleClose}>
              Close Modal
            </button>
          ) : cancelMode ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={leaveCancellation}
              >
                Back
              </button>

              <button
                type="button"
                className="class-offering-primary-button"
                disabled={loading || reason.trim().length === 0}
                onClick={handleCancellation}
              >
                {loading ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={loading} onClick={handleClose}>
                Close Modal
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={beginCancellation}
              >
                Cancel Section Subject
              </button>

              <button
                type="button"
                className="class-offering-primary-button"
                disabled={loading || !normalTargetStatus}
                onClick={handleNormalStatusChange}
              >
                {loading ? "Updating..." : normalButtonText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
