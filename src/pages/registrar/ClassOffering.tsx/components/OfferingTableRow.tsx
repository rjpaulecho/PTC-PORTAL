import OfferingStatusBadge, {
  type OfferingDisplayStatus,
} from "./OfferingStatusBadge";

import type { OfferingTableSubject } from "./OfferingTable";

// =====================================================
// PROPS
// =====================================================

interface OfferingTableRowProps {
  item: OfferingTableSubject;

  onCreateOffering: (subject: OfferingTableSubject) => void;

  onEditOffering: (subject: OfferingTableSubject) => void;

  onOfferingStatus: (subject: OfferingTableSubject) => void;

  onSectionSubjectStatus: (subject: OfferingTableSubject) => void;
}

// =====================================================
// DISPLAY STATUS
//
// IMPORTANT:
// This does not invent readiness.
//
// It translates the backend-provided row state into the
// status vocabulary shown to the Registrar.
// =====================================================

function getDisplayStatus(item: OfferingTableSubject): OfferingDisplayStatus {
  const sectionSubject = item.section_subject;

  const offering = item.offering;

  // -----------------------------------------------------
  // SECTION SUBJECT DOES NOT EXIST
  // -----------------------------------------------------

  if (!item.has_section_subject || !sectionSubject) {
    return "NO SECTION SUBJECT";
  }

  // -----------------------------------------------------
  // SECTION SUBJECT TERMINAL STATE
  //
  // Check this before NO OFFERING because a Cancelled
  // section_subject cannot receive another offering.
  // -----------------------------------------------------

  if (sectionSubject.status === "Cancelled") {
    return "SECTION CANCELLED";
  }

  // -----------------------------------------------------
  // OFFERING DOES NOT EXIST
  // -----------------------------------------------------

  if (!item.has_offering || !offering) {
    return "NO OFFERING";
  }

  // -----------------------------------------------------
  // OFFERING TERMINAL STATE
  // -----------------------------------------------------

  if (offering.status === "Cancelled") {
    return "CANCELLED";
  }

  // -----------------------------------------------------
  // SECTION SUBJECT CLOSED
  // -----------------------------------------------------

  if (sectionSubject.status !== "Open") {
    return "SECTION CLOSED";
  }

  // -----------------------------------------------------
  // ENROLLMENT READY
  //
  // Backend-provided readiness wins.
  // -----------------------------------------------------

  if (item.ready_for_enrollment) {
    return "READY";
  }

  // -----------------------------------------------------
  // CONFIGURATION INCOMPLETE
  // -----------------------------------------------------

  if (!item.configuration_complete) {
    return "INCOMPLETE";
  }

  // -----------------------------------------------------
  // CONFIGURED BUT CLOSED
  //
  // Faculty / schedule / capacity are complete, section
  // subject is Open, but offering is not Open.
  // -----------------------------------------------------

  if (offering.status === "Closed") {
    return "CONFIGURED";
  }

  // Defensive fallback for an unexpected backend state.
  return "NOT READY";
}

// =====================================================
// SCHEDULE DISPLAY
// =====================================================

function getScheduleDisplay(
  schedule:
    | {
        days: string | null;
        time: string | null;
      }
    | undefined,
) {
  const days = schedule?.days?.trim() || "";

  const time = schedule?.time?.trim() || "";

  if (days && time) {
    return `${days} • ${time}`;
  }

  if (days) {
    return `${days} • Time not assigned`;
  }

  if (time) {
    return `Days not assigned • ${time}`;
  }

  return "Not assigned";
}

// =====================================================
// ROOM DISPLAY
// =====================================================

function getRoomDisplay(
  room:
    | {
        room_name: string;
        room_code?: string | null;
      }
    | null
    | undefined,
) {
  if (!room) {
    return "—";
  }

  if (room.room_code && room.room_name) {
    return `${room.room_code} — ${room.room_name}`;
  }

  return room.room_code || room.room_name || "—";
}

// =====================================================
// COMPONENT
// =====================================================

export default function OfferingTableRow({
  item,

  onCreateOffering,

  onEditOffering,

  onOfferingStatus,

  onSectionSubjectStatus,
}: OfferingTableRowProps) {
  // =====================================================
  // OFFERING DATA
  // =====================================================

  const sectionSubject = item.section_subject;

  const offering = item.offering;

  const capacity = offering?.capacity;

  // =====================================================
  // TERMINAL STATES
  // =====================================================

  const sectionSubjectCancelled = sectionSubject?.status === "Cancelled";

  const offeringCancelled = offering?.status === "Cancelled";

  // =====================================================
  // DISPLAY STATUS
  // =====================================================

  const displayStatus = getDisplayStatus(item);

  // =====================================================
  // SCHEDULE / ROOM
  // =====================================================

  const scheduleDisplay = getScheduleDisplay(offering?.schedule);

  const roomDisplay = getRoomDisplay(offering?.room);

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <tr>
      {/* ================================================= */}
      {/* CODE */}
      {/* ================================================= */}
      <td>
        <strong>{item.subject.subject_code}</strong>
      </td>
      {/* ================================================= */}
      {/* SUBJECT */}
      {/* ================================================= */}
      <td>
        <div>{item.subject.subject_name}</div>

        <small>
          {item.subject.units} unit
          {item.subject.units !== 1 ? "s" : ""}
        </small>
      </td>
      {/* ================================================= */}
      {/* FACULTY */}
      {/* ================================================= */}
      <td>{offering?.faculty?.faculty_name || "Not assigned"}</td>
      {/* ================================================= */}
      {/* SCHEDULE */}
      {/* ================================================= */}
      <td>{scheduleDisplay}</td>
      {/* ================================================= */}
      {/* ROOM */}
      // // Room is optional.
      {/* ================================================= */}
      <td>{roomDisplay}</td>
      {/* ================================================= */}
      {/* CAPACITY */}
      {/* ================================================= */}
      <td>
        {capacity ? (
          <>
            <span>
              {capacity.enrolled_count}/{capacity.max_students}
            </span>

            {capacity.is_full && (
              <small
                style={{
                  display: "block",
                }}
              >
                Full
              </small>
            )}
          </>
        ) : (
          (sectionSubject?.max_students ?? "—")
        )}
      </td>
      {/* ================================================= */}
      {/* STATUS */}
      {/* ================================================= */}
      <td>
        <OfferingStatusBadge status={displayStatus} />
      </td>
      {/* ================================================= */}
      {/* ACTIONS */}
      {/* ================================================= */}
      <td>
        {/* =============================================== */}
        {/* NO SECTION SUBJECT */}
        {/* =============================================== */}

        {!item.has_section_subject || !sectionSubject ? (
          <span>Section subject missing</span>
        ) : sectionSubjectCancelled ? (
          /* ============================================= */
          /* CANCELLED SECTION SUBJECT */
          //
          // Terminal academic state.
          // Backend does not allow creating another
          // offering for this section_subject.
          /* ============================================= */

          <span>No actions</span>
        ) : !item.has_offering || !offering ? (
          /* ============================================= */
          /* OFFERING MISSING */
          /* ============================================= */

          <div className="class-offering-actions">
            <button type="button" onClick={() => onCreateOffering(item)}>
              Create Offering
            </button>

            <button type="button" onClick={() => onSectionSubjectStatus(item)}>
              Section Status
            </button>
          </div>
        ) : offeringCancelled ? (
          /* ============================================= */
          /* CANCELLED OFFERING */
          //
          // Offering cancellation is terminal.
          // Section-subject status remains separately
          // manageable.
          /* ============================================= */

          <div className="class-offering-actions">
            <span>Offering cancelled</span>

            <button type="button" onClick={() => onSectionSubjectStatus(item)}>
              Section Status
            </button>
          </div>
        ) : (
          /* ============================================= */
          /* ACTIVE / CLOSED OFFERING */
          /* ============================================= */

          <div className="class-offering-actions">
            {/* EDIT */}

            <button type="button" onClick={() => onEditOffering(item)}>
              Edit
            </button>

            {/* OFFERING STATUS
                Modal handles Open / Close / Cancel and
                backend remains authoritative. */}

            <button type="button" onClick={() => onOfferingStatus(item)}>
              {offering.status === "Open" ? "Close Offering" : "Open Offering"}
            </button>

            {/* SECTION SUBJECT STATUS */}

            <button type="button" onClick={() => onSectionSubjectStatus(item)}>
              Section Status
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
