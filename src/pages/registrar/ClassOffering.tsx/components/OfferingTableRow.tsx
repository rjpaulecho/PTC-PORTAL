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

  const offering = item.offering;

  const capacity = offering?.capacity;

  // =====================================================
  // STATUS
  // =====================================================

  let statusLabel = "NOT READY";

  if (item.ready_for_enrollment) {
    statusLabel = "READY";
  } else if (!item.has_section_subject) {
    statusLabel = "NO SECTION SUBJECT";
  } else if (!item.has_offering) {
    statusLabel = "NO OFFERING";
  } else if (item.offering?.status === "Cancelled") {
    statusLabel = "CANCELLED";
  } else if (item.section_subject?.status === "Cancelled") {
    statusLabel = "SECTION CANCELLED";
  } else if (item.section_subject?.status !== "Open") {
    statusLabel = "SECTION CLOSED";
  } else if (!item.configuration_complete) {
    statusLabel = "INCOMPLETE";
  } else if (item.offering?.status === "Closed") {
    statusLabel = "CLOSED";
  }

  // =====================================================
  // SCHEDULE DISPLAY
  // =====================================================

  const scheduleDisplay =
    offering?.schedule?.days && offering?.schedule?.time
      ? `${offering.schedule.days} • ${offering.schedule.time}`
      : "Not assigned";

  // =====================================================
  // CAPACITY DISPLAY
  // =====================================================

  const capacityDisplay = capacity
    ? `${capacity.enrolled_count}/${capacity.max_students}`
    : (item.section_subject?.max_students ?? "—");

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
      {/* ================================================= */}

      <td>{offering?.room?.room_name || "—"}</td>

      {/* ================================================= */}
      {/* CAPACITY */}
      {/* ================================================= */}

      <td>
        {capacityDisplay}

        {capacity?.is_full && (
          <small
            style={{
              display: "block",
            }}
          >
            Full
          </small>
        )}
      </td>

      {/* ================================================= */}
      {/* STATUS */}
      {/* ================================================= */}

      <td>{statusLabel}</td>

      {/* ================================================= */}
      {/* ACTIONS */}
      {/* ================================================= */}

      <td>
        {!item.has_section_subject ? (
          <span>Section subject missing</span>
        ) : !item.has_offering ? (
          <button type="button" onClick={() => onCreateOffering(item)}>
            Create Offering
          </button>
        ) : item.offering?.status === "Cancelled" ? (
          <span>No actions</span>
        ) : (
          <div className="class-offering-actions">
            {/* =========================================== */}
            {/* EDIT */}
            {/* =========================================== */}

            <button type="button" onClick={() => onEditOffering(item)}>
              Edit
            </button>

            {/* =========================================== */}
            {/* OPEN / CLOSE */}
            {/* =========================================== */}

            <button type="button" onClick={() => onOfferingStatus(item)}>
              {item.offering?.status === "Open" ? "Close" : "Open"}
            </button>

            {/* =========================================== */}
            {/* SECTION SUBJECT STATUS */}
            {/* =========================================== */}

            <button type="button" onClick={() => onSectionSubjectStatus(item)}>
              Section Status
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
