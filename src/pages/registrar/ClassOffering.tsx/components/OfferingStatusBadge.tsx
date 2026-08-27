// =====================================================
// STATUS TYPE
//
// These are DISPLAY states only.
//
// The backend remains authoritative for:
// - ready_for_enrollment
// - configuration_complete
// - section_subject.status
// - offering.status
// =====================================================

export type OfferingDisplayStatus =
  | "READY"
  | "CONFIGURED"
  | "NO SECTION SUBJECT"
  | "NO OFFERING"
  | "INCOMPLETE"
  | "CANCELLED"
  | "SECTION CLOSED"
  | "SECTION CANCELLED"
  | "NOT READY";

// =====================================================
// PROPS
// =====================================================

interface OfferingStatusBadgeProps {
  status: OfferingDisplayStatus;
}

// =====================================================
// CSS CLASS
//
// NOTE:
// The existing stylesheet already has a neutral
// `.class-offering-status-badge.closed` style.
//
// CONFIGURED means:
// - required configuration exists
// - offering is currently Closed
// - not yet enrollment-ready
//
// Reuse the existing `closed` visual style so Step 6 does
// not require a CSS migration just to rename the display
// meaning from CLOSED -> CONFIGURED.
// =====================================================

function getStatusClassName(status: OfferingDisplayStatus) {
  switch (status) {
    case "READY":
      return "ready";

    case "CONFIGURED":
      return "closed";

    case "NO OFFERING":
      return "no-offering";

    case "NO SECTION SUBJECT":
      return "no-section-subject";

    case "INCOMPLETE":
      return "incomplete";

    case "CANCELLED":
      return "cancelled";

    case "SECTION CLOSED":
      return "section-closed";

    case "SECTION CANCELLED":
      return "section-cancelled";

    case "NOT READY":
    default:
      return "not-ready";
  }
}

// =====================================================
// COMPONENT
// =====================================================

export default function OfferingStatusBadge({
  status,
}: OfferingStatusBadgeProps) {
  return (
    <span
      className={`class-offering-status-badge ${getStatusClassName(status)}`}
    >
      {status}
    </span>
  );
}
