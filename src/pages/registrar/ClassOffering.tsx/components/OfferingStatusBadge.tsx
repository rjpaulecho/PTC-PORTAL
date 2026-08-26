// =====================================================
// STATUS TYPE
// =====================================================

export type OfferingDisplayStatus =
  | "READY"
  | "NO SECTION SUBJECT"
  | "NO OFFERING"
  | "INCOMPLETE"
  | "CLOSED"
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
// COMPONENT
// =====================================================

export default function OfferingStatusBadge({
  status,
}: OfferingStatusBadgeProps) {
  // =====================================================
  // CSS CLASS
  // =====================================================

  const getStatusClassName = () => {
    switch (status) {
      case "READY":
        return "ready";

      case "NO OFFERING":
        return "no-offering";

      case "NO SECTION SUBJECT":
        return "no-section-subject";

      case "INCOMPLETE":
        return "incomplete";

      case "CLOSED":
        return "closed";

      case "CANCELLED":
        return "cancelled";

      case "SECTION CLOSED":
        return "section-closed";

      case "SECTION CANCELLED":
        return "section-cancelled";

      default:
        return "not-ready";
    }
  };

  return (
    <span className={`class-offering-status-badge ${getStatusClassName()}`}>
      {status}
    </span>
  );
}
