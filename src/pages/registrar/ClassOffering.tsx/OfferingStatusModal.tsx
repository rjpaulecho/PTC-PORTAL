import { useEffect, useMemo, useState } from "react";

import { authService } from "../../../services/auth.service";

import type { OfferingTableSubject } from "./components/OfferingTable";

import ConflictAlert, {
  type OfferingConflict,
} from "./components/ConflictAlert";

// =====================================================
// API
// =====================================================

const API_BASE_URL = "http://localhost:3000/api/registrar/offerings";

// =====================================================
// TYPES
// =====================================================

type OfferingStatus = "Open" | "Closed" | "Cancelled";

interface StatusBlockDetails {
  missingFields: string[];

  activeAssignments: number | null;

  pendingAssignments: number | null;

  approvedAssignments: number | null;
}

// =====================================================
// API RESPONSE
// =====================================================

interface UpdateOfferingStatusResponse {
  success: boolean;

  message?: string;

  error?: string;

  conflict?: boolean;

  conflict_count?: number;

  conflict_types?: string[];

  conflicts?: OfferingConflict[];

  missing_fields?: string[];

  active_assignments?: number;

  pending_assignments?: number;

  approved_assignments?: number;

  offering?: unknown;
}

// =====================================================
// PROPS
// =====================================================

interface OfferingStatusModalProps {
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
// EMPTY BACKEND BLOCK DETAILS
// =====================================================

function emptyBlockDetails(): StatusBlockDetails {
  return {
    missingFields: [],

    activeAssignments: null,

    pendingAssignments: null,

    approvedAssignments: null,
  };
}

// =====================================================
// COMPONENT
// =====================================================

export default function OfferingStatusModal({
  open,

  subject,

  onClose,

  onSuccess,

  onUnauthorized,
}: OfferingStatusModalProps) {
  // =====================================================
  // CURRENT OFFERING
  // =====================================================

  const offering = subject?.offering || null;

  const offeringId = offering?.offering_id;

  const currentStatus: OfferingStatus =
    offering?.status === "Open" ||
    offering?.status === "Closed" ||
    offering?.status === "Cancelled"
      ? offering.status
      : "Closed";

  const isCancelled = currentStatus === "Cancelled";

  // =====================================================
  // UI STATE
  // =====================================================

  const [cancelMode, setCancelMode] = useState(false);

  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [conflicts, setConflicts] = useState<OfferingConflict[]>([]);

  const [blockDetails, setBlockDetails] =
    useState<StatusBlockDetails>(emptyBlockDetails);

  // =====================================================
  // RESET WHEN MODAL OPENS
  // =====================================================

  useEffect(() => {
    if (!open || !offeringId) {
      return;
    }

    setCancelMode(false);

    setReason("");

    setLoading(false);

    setError("");

    setConflicts([]);

    setBlockDetails(emptyBlockDetails());
  }, [open, offeringId]);

  // =====================================================
  // NORMAL LIFECYCLE ACTION
  //
  // Closed -> Open
  // Open   -> Closed
  // Cancelled -> terminal
  // =====================================================

  const normalTargetStatus: OfferingStatus | null =
    currentStatus === "Closed"
      ? "Open"
      : currentStatus === "Open"
        ? "Closed"
        : null;

  // =====================================================
  // OPENING REQUIREMENTS
  //
  // Frontend guidance only.
  // Backend remains authoritative.
  //
  // Room is optional.
  // Schedule conflict resources are SECTION and FACULTY.
  // =====================================================

  const openingRequirements = useMemo(() => {
    const missing: string[] = [];

    if (subject?.section_subject?.status !== "Open") {
      missing.push("Section subject must be Open");
    }

    if (!offering?.faculty?.faculty_id) {
      missing.push("Faculty must be assigned");
    }

    if (!offering?.schedule?.days?.trim()) {
      missing.push("Schedule days are required");
    }

    if (!offering?.schedule?.time?.trim()) {
      missing.push("Schedule time is required");
    }

    const maxStudents = Number(offering?.capacity?.max_students || 0);

    if (!Number.isFinite(maxStudents) || maxStudents <= 0) {
      missing.push("Maximum students must be greater than 0");
    }

    return missing;
  }, [
    subject?.section_subject?.status,
    offering?.faculty?.faculty_id,
    offering?.schedule?.days,
    offering?.schedule?.time,
    offering?.capacity?.max_students,
  ]);

  const canOpen = openingRequirements.length === 0;

  // =====================================================
  // TITLE / DESCRIPTION
  // =====================================================

  const modalTitle = cancelMode
    ? "Cancel Class Offering"
    : currentStatus === "Closed"
      ? "Open Class Offering"
      : currentStatus === "Open"
        ? "Close Class Offering"
        : "Cancelled Class Offering";

  const modalDescription = cancelMode
    ? "Permanently cancel this class offering."
    : currentStatus === "Closed"
      ? "Confirm that this class offering can be opened for enrollment assignment."
      : currentStatus === "Open"
        ? "Confirm that this class offering should be closed."
        : "This class offering is permanently cancelled.";

  const normalButtonText =
    normalTargetStatus === "Open"
      ? "Open Offering"
      : normalTargetStatus === "Closed"
        ? "Close Offering"
        : "";

  // =====================================================
  // CLEAR FEEDBACK
  // =====================================================

  const clearFeedback = () => {
    setError("");

    setConflicts([]);

    setBlockDetails(emptyBlockDetails());
  };

  // =====================================================
  // CLOSE MODAL
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
  // BEGIN CANCELLATION
  // =====================================================

  const beginCancellation = () => {
    if (loading || isCancelled) {
      return;
    }

    clearFeedback();

    setReason("");

    setCancelMode(true);
  };

  // =====================================================
  // BACK FROM CANCELLATION
  // =====================================================

  const leaveCancellation = () => {
    if (loading) {
      return;
    }

    clearFeedback();

    setReason("");

    setCancelMode(false);
  };

  // =====================================================
  // CAPTURE BACKEND BUSINESS-RULE DETAILS
  // =====================================================

  const captureBlockDetails = (data: UpdateOfferingStatusResponse) => {
    setBlockDetails({
      missingFields: Array.isArray(data.missing_fields)
        ? data.missing_fields
        : [],

      activeAssignments:
        typeof data.active_assignments === "number"
          ? data.active_assignments
          : null,

      pendingAssignments:
        typeof data.pending_assignments === "number"
          ? data.pending_assignments
          : null,

      approvedAssignments:
        typeof data.approved_assignments === "number"
          ? data.approved_assignments
          : null,
    });
  };

  // =====================================================
  // UPDATE STATUS
  // =====================================================

  const updateStatus = async (targetStatus: OfferingStatus) => {
    if (!subject || !offering || !offeringId) {
      setError("A valid class offering is required.");

      return;
    }

    if (loading) {
      return;
    }

    if (currentStatus === "Cancelled") {
      setError(
        "This offering is Cancelled and cannot return to Open or Closed.",
      );

      return;
    }

    if (targetStatus === currentStatus) {
      setError(`The offering is already ${currentStatus}.`);

      return;
    }

    if (targetStatus === "Open" && !canOpen) {
      setError(
        `This offering cannot be opened yet: ${openingRequirements.join("; ")}.`,
      );

      return;
    }

    if (targetStatus === "Cancelled" && reason.trim().length === 0) {
      setError("A cancellation reason is required.");

      return;
    }

    try {
      setLoading(true);

      clearFeedback();

      // ===============================================
      // PAYLOAD
      // ===============================================

      const payload: {
        status: OfferingStatus;

        reason?: string;
      } = {
        status: targetStatus,
      };

      if (targetStatus === "Cancelled") {
        payload.reason = reason.trim();
      }

      console.log("UPDATE OFFERING STATUS:", {
        offering_id: offeringId,

        current_status: currentStatus,

        target_status: targetStatus,

        payload,
      });

      // ===============================================
      // REQUEST
      // ===============================================

      const response = await authService.authFetch(
        `${API_BASE_URL}/subject-offerings/${offeringId}/status`,
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
        await readJsonResponse<UpdateOfferingStatusResponse>(response);

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
            "You are not authorized to change offering status.",
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
            "The class offering could not be found.",
        );

        return;
      }

      // ===============================================
      // 409
      //
      // Can be:
      // - SECTION conflict
      // - FACULTY conflict
      // - incomplete configuration
      // - section subject not Open
      // - Pending assignment protection when closing
      // - Pending / Approved protection when cancelling
      // ===============================================

      if (response.status === 409) {
        const backendConflicts = Array.isArray(data.conflicts)
          ? data.conflicts
          : [];

        setConflicts(backendConflicts);

        captureBlockDetails(data);

        setError(
          data.message ||
            data.error ||
            "The offering status could not be changed.",
        );

        console.log("OFFERING STATUS 409:", data);

        return;
      }

      // ===============================================
      // GENERAL API ERROR
      // ===============================================

      if (!response.ok || !data.success) {
        captureBlockDetails(data);

        setError(
          data.message ||
            data.error ||
            "Failed to update the class offering status.",
        );

        return;
      }

      // ===============================================
      // SUCCESS
      // ===============================================

      console.log("UPDATE OFFERING STATUS SUCCESS:", data);

      onSuccess();
    } catch (requestError) {
      console.error("UPDATE OFFERING STATUS ERROR:", requestError);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update offering status.",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // NORMAL OPEN / CLOSE
  // =====================================================

  const handleNormalStatusChange = () => {
    if (!normalTargetStatus) {
      return;
    }

    void updateStatus(normalTargetStatus);
  };

  // =====================================================
  // CONFIRM CANCELLATION
  // =====================================================

  const handleCancellation = () => {
    void updateStatus("Cancelled");
  };

  // =====================================================
  // BACKEND BLOCK DETAILS
  // =====================================================

  const hasBlockDetails =
    blockDetails.missingFields.length > 0 ||
    blockDetails.activeAssignments !== null ||
    blockDetails.pendingAssignments !== null ||
    blockDetails.approvedAssignments !== null;

  // =====================================================
  // DO NOT RENDER
  // =====================================================

  if (!open || !subject || !offering) {
    return null;
  }

  // =====================================================
  // RENDER
  //
  // Reuse the proven modal scrollbar class.
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
        aria-labelledby="offering-status-title"
      >
        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="class-offering-modal-header">
          <div>
            <h2 id="offering-status-title">{modalTitle}</h2>

            <p>{modalDescription}</p>
          </div>

          <button
            type="button"
            aria-label="Close status modal"
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
            Offering #{offering.offering_id} · {currentStatus}
          </small>
        </div>

        {/* ================================================= */}
        {/* ERROR */}
        {/* ================================================= */}

        {error && conflicts.length === 0 && (
          <div className="class-offering-error">{error}</div>
        )}

        {/* ================================================= */}
        {/* SCHEDULE CONFLICT */}
        {/* ================================================= */}

        <ConflictAlert
          conflicts={conflicts}
          message={error}
          title="Cannot Open Offering"
        />

        {/* ================================================= */}
        {/* BODY */}
        {/* ================================================= */}

        <div className="class-offering-modal-body">
          {/* =============================================== */}
          {/* CURRENT CONFIGURATION */}
          {/* =============================================== */}

          <div className="class-offering-prepare-notice">
            <strong>Current status: {currentStatus}</strong>

            <p>
              Faculty: {offering.faculty?.faculty_name || "Not Assigned"} ·
              Schedule:{" "}
              {offering.schedule?.days && offering.schedule?.time
                ? `${offering.schedule.days} · ${offering.schedule.time}`
                : "Not Assigned"}{" "}
              · Capacity: {offering.capacity?.max_students ?? 0}
            </p>
          </div>

          {/* =============================================== */}
          {/* BACKEND BLOCK DETAILS */}
          {/* =============================================== */}

          {hasBlockDetails && (
            <div className="class-offering-open-requirements">
              <h3>Status Change Blocked</h3>

              <ul>
                {blockDetails.missingFields.map((item) => (
                  <li key={item}>Missing: {item}</li>
                ))}

                {blockDetails.activeAssignments !== null && (
                  <li>Active assignments: {blockDetails.activeAssignments}</li>
                )}

                {blockDetails.pendingAssignments !== null && (
                  <li>
                    Pending assignments: {blockDetails.pendingAssignments}
                  </li>
                )}

                {blockDetails.approvedAssignments !== null && (
                  <li>
                    Approved assignments: {blockDetails.approvedAssignments}
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* =============================================== */}
          {/* CANCELLED TERMINAL */}
          {/* =============================================== */}

          {isCancelled && (
            <div className="class-offering-open-requirements">
              <h3>Cancelled Offering</h3>

              <p>
                This offering is permanently Cancelled. It cannot be reopened or
                returned to Closed through the normal offering lifecycle.
              </p>
            </div>
          )}

          {/* =============================================== */}
          {/* CLOSED -> OPEN */}
          {/* =============================================== */}

          {!isCancelled && !cancelMode && normalTargetStatus === "Open" && (
            <>
              <div className="class-offering-open-requirements">
                <h3>Opening Requirements</h3>

                {canOpen ? (
                  <ul>
                    <li>Section subject is Open</li>

                    <li>Faculty is assigned</li>

                    <li>Schedule days are assigned</li>

                    <li>Schedule time is assigned</li>

                    <li>Capacity is greater than 0</li>

                    <li>Backend will check SECTION schedule conflicts</li>

                    <li>Backend will check FACULTY schedule conflicts</li>

                    <li>Room is optional</li>
                  </ul>
                ) : (
                  <>
                    <p>
                      Complete the following configuration before this offering
                      can be opened:
                    </p>

                    <ul>
                      {openingRequirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="class-offering-prepare-notice">
                <strong>What happens when opened?</strong>

                <p>
                  A successful Open transition makes this offering available for
                  Registrar enrollment assignment and allows it to contribute to
                  section readiness.
                </p>
              </div>
            </>
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
                    The offering will no longer be available for normal
                    enrollment assignment.
                  </li>

                  <li>
                    Closing does not delete the offering or its faculty,
                    schedule, room, or capacity configuration.
                  </li>

                  <li>
                    The System will reject closing while Pending students are
                    assigned to this offering.
                  </li>

                  <li>
                    The offering can be opened again later if all opening
                    validations pass.
                  </li>
                </ul>
              </div>

              <div className="class-offering-prepare-notice">
                <strong>Close this offering?</strong>

                <p>Click Close Offering below to confirm the status change.</p>
              </div>
            </>
          )}

          {/* =============================================== */}
          {/* CANCELLATION */}
          {/* =============================================== */}

          {!isCancelled && cancelMode && (
            <>
              <div className="class-offering-open-requirements">
                <h3>Cancellation Warning</h3>

                <ul>
                  <li>Cancellation is terminal.</li>

                  <li>
                    The System will reject cancellation while Pending or
                    Approved assignments still exist.
                  </li>

                  <li>A cancellation reason is required.</li>

                  <li>
                    Use Closed instead if this offering may be used again later.
                  </li>
                </ul>
              </div>

              <div className="class-offering-field">
                <label htmlFor="offering-cancellation-reason">
                  Cancellation Reason
                </label>

                <textarea
                  id="offering-cancellation-reason"
                  value={reason}
                  disabled={loading}
                  placeholder="Explain why this class offering is being permanently cancelled."
                  onChange={(event) => {
                    setReason(event.target.value);

                    clearFeedback();
                  }}
                />

                <small>Required for the cancellation audit trail.</small>
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
                Cancel Offering
              </button>

              <button
                type="button"
                className="class-offering-primary-button"
                disabled={
                  loading ||
                  !normalTargetStatus ||
                  (normalTargetStatus === "Open" && !canOpen)
                }
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
