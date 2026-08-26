// =====================================================
// TYPES
// =====================================================

export type OfferingConflictType = "SECTION" | "FACULTY" | string;

// =====================================================
// BACKEND CONFLICT SHAPE
// =====================================================

export interface OfferingConflict {
  offering_id?: number;

  section_subject_id?: number;

  conflict_types?: OfferingConflictType[];

  common_days?: string[];

  message?: string;

  subject?: {
    subject_id?: number;

    subject_code?: string;

    subject_name?: string;
  };

  section?: {
    section_id?: number;

    section_name?: string;
  };

  faculty?: {
    faculty_id?: number;

    faculty_name?: string;
  } | null;

  room?: {
    room_id?: number;

    room_code?: string;

    room_name?: string;
  } | null;

  schedule?: {
    days?: string | null;

    time?: string | null;
  };

  status?: string;

  // ===================================================
  // OPTIONAL LEGACY / CREATE-ENDPOINT SUPPORT
  //
  // Keeps the component compatible if another backend
  // endpoint still returns:
  //
  // {
  //   type: "FACULTY",
  //   conflicting_offering: {...}
  // }
  // ===================================================

  type?: OfferingConflictType;

  conflicting_offering?: {
    offering_id?: number;

    section_subject_id?: number;

    subject?: {
      subject_id?: number;

      subject_code?: string;

      subject_name?: string;
    };

    section?: {
      section_id?: number;

      section_name?: string;
    };

    faculty?: {
      faculty_id?: number;

      faculty_name?: string;
    } | null;

    schedule?: {
      days?: string | null;

      time?: string | null;
    };

    status?: string;
  };
}

// =====================================================
// NORMALIZED DISPLAY TYPE
// =====================================================

interface NormalizedConflict {
  offering_id?: number;

  conflictTypes: string[];

  commonDays: string[];

  message?: string;

  subject: {
    subject_id?: number;

    subject_code?: string;

    subject_name?: string;
  } | null;

  section: {
    section_id?: number;

    section_name?: string;
  } | null;

  faculty: {
    faculty_id?: number;

    faculty_name?: string;
  } | null;

  schedule: {
    days?: string | null;

    time?: string | null;
  } | null;

  status?: string;
}

// =====================================================
// PROPS
// =====================================================

interface ConflictAlertProps {
  conflicts: OfferingConflict[];

  message?: string;

  title?: string;
}

// =====================================================
// NORMALIZE BACKEND RESPONSE
// =====================================================

function normalizeConflict(conflict: OfferingConflict): NormalizedConflict {
  // ===================================================
  // CURRENT PUT RESPONSE
  // ===================================================

  if (
    conflict.subject ||
    conflict.section ||
    conflict.faculty ||
    conflict.schedule
  ) {
    const conflictTypes =
      Array.isArray(conflict.conflict_types) &&
      conflict.conflict_types.length > 0
        ? conflict.conflict_types.map((type) => String(type).toUpperCase())
        : conflict.type
          ? [String(conflict.type).toUpperCase()]
          : ["CONFLICT"];

    return {
      offering_id: conflict.offering_id,

      conflictTypes,

      commonDays: Array.isArray(conflict.common_days)
        ? conflict.common_days
        : [],

      message: conflict.message,

      subject: conflict.subject || null,

      section: conflict.section || null,

      faculty: conflict.faculty || null,

      schedule: conflict.schedule || null,

      status: conflict.status,
    };
  }

  // ===================================================
  // LEGACY / CREATE RESPONSE
  // ===================================================

  const legacy = conflict.conflicting_offering;

  return {
    offering_id: legacy?.offering_id,

    conflictTypes: conflict.type
      ? [String(conflict.type).toUpperCase()]
      : ["CONFLICT"],

    commonDays: [],

    message: conflict.message,

    subject: legacy?.subject || null,

    section: legacy?.section || null,

    faculty: legacy?.faculty || null,

    schedule: legacy?.schedule || null,

    status: legacy?.status,
  };
}

// =====================================================
// CONFLICT LABEL
// =====================================================

function getConflictLabel(type: string) {
  switch (String(type).trim().toUpperCase()) {
    case "SECTION":
      return "Section Schedule Conflict";

    case "FACULTY":
      return "Faculty Schedule Conflict";

    default:
      return "Schedule Conflict";
  }
}

// =====================================================
// CONFLICT EXPLANATION
// =====================================================

function getConflictExplanation(type: string) {
  switch (String(type).trim().toUpperCase()) {
    case "SECTION":
      return (
        "The selected section already has another " +
        "subject scheduled during this time."
      );

    case "FACULTY":
      return (
        "The selected faculty member is already " +
        "assigned to another class during this time."
      );

    default:
      return (
        "This schedule overlaps with another " + "existing class offering."
      );
  }
}

// =====================================================
// SUBJECT TEXT
// =====================================================

function getSubjectText(conflict: NormalizedConflict) {
  const subject = conflict.subject;

  if (!subject) {
    return "Existing class offering";
  }

  if (subject.subject_code && subject.subject_name) {
    return `${subject.subject_code} — ` + `${subject.subject_name}`;
  }

  if (subject.subject_code) {
    return subject.subject_code;
  }

  if (subject.subject_name) {
    return subject.subject_name;
  }

  return "Existing class offering";
}

// =====================================================
// SCHEDULE TEXT
// =====================================================

function getScheduleText(conflict: NormalizedConflict) {
  const days = conflict.schedule?.days;

  const time = conflict.schedule?.time;

  if (days && time) {
    return `${days} • ${time}`;
  }

  if (days) {
    return days;
  }

  if (time) {
    return time;
  }

  return "Schedule not available";
}

// =====================================================
// MAIN CONFLICT TYPE
//
// Used only for CSS accent.
// =====================================================

function getPrimaryConflictType(conflict: NormalizedConflict) {
  if (conflict.conflictTypes.includes("SECTION")) {
    return "section";
  }

  if (conflict.conflictTypes.includes("FACULTY")) {
    return "faculty";
  }

  return "conflict";
}

// =====================================================
// COMPONENT
// =====================================================

export default function ConflictAlert({
  conflicts,

  message,

  title = "Schedule Conflict Detected",
}: ConflictAlertProps) {
  // =====================================================
  // NOTHING TO DISPLAY
  // =====================================================

  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return null;
  }

  // =====================================================
  // NORMALIZE
  // =====================================================

  const normalizedConflicts = conflicts.map(normalizeConflict);

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      className="class-offering-conflict-alert"
      role="alert"
      aria-live="polite"
    >
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="class-offering-conflict-header">
        <div className="class-offering-conflict-icon">!</div>

        <div>
          <h3>{title}</h3>

          <p>
            {message ||
              "The selected schedule cannot be saved because it conflicts with an existing class offering."}
          </p>
        </div>
      </div>

      {/* ================================================= */}
      {/* CONFLICT COUNT */}
      {/* ================================================= */}

      <div className="class-offering-conflict-help">
        <strong>
          {normalizedConflicts.length} conflicting offering
          {normalizedConflicts.length !== 1 ? "s" : ""} found
        </strong>

        <p>
          Review each conflict below before choosing another schedule or faculty
          member.
        </p>
      </div>

      {/* ================================================= */}
      {/* CONFLICT LIST */}
      {/* ================================================= */}

      <div className="class-offering-conflict-list">
        {normalizedConflicts.map((conflict, index) => {
          const primaryType = getPrimaryConflictType(conflict);

          const sectionName =
            conflict.section?.section_name || "Unknown section";

          const facultyName =
            conflict.faculty?.faculty_name || "No faculty assigned";

          const status = conflict.status || "Unknown";

          return (
            <div
              className={`class-offering-conflict-item ${primaryType}`}
              key={[conflict.offering_id ?? "offering", index].join("-")}
            >
              {/* ======================================= */}
              {/* CONFLICT TYPE BADGES */}
              {/* ======================================= */}

              <div className="class-offering-conflict-item-header">
                {conflict.conflictTypes.map((type) => (
                  <span key={type} className="class-offering-conflict-type">
                    {type}
                  </span>
                ))}

                <strong>
                  {conflict.conflictTypes
                    .map((type) => getConflictLabel(type))
                    .join(" / ")}
                </strong>
              </div>

              {/* ======================================= */}
              {/* EXPLANATION */}
              {/* ======================================= */}

              <p className="class-offering-conflict-description">
                {conflict.message ||
                  conflict.conflictTypes
                    .map((type) => getConflictExplanation(type))
                    .join(" ")}
              </p>

              {/* ======================================= */}
              {/* EXISTING OFFERING DETAILS */}
              {/* ======================================= */}

              <div className="class-offering-conflict-details">
                {/* ===================================== */}
                {/* OFFERING */}
                {/* ===================================== */}

                {conflict.offering_id && (
                  <div className="class-offering-conflict-detail">
                    <span>Offering</span>

                    <strong>#{conflict.offering_id}</strong>
                  </div>
                )}

                {/* ===================================== */}
                {/* SUBJECT */}
                {/* ===================================== */}

                <div className="class-offering-conflict-detail">
                  <span>Existing Subject</span>

                  <strong>{getSubjectText(conflict)}</strong>
                </div>

                {/* ===================================== */}
                {/* SECTION */}
                {/* ===================================== */}

                <div className="class-offering-conflict-detail">
                  <span>Section</span>

                  <strong>{sectionName}</strong>
                </div>

                {/* ===================================== */}
                {/* FACULTY */}
                {/* ===================================== */}

                <div className="class-offering-conflict-detail">
                  <span>Faculty</span>

                  <strong>{facultyName}</strong>
                </div>

                {/* ===================================== */}
                {/* SCHEDULE */}
                {/* ===================================== */}

                <div className="class-offering-conflict-detail">
                  <span>Existing Schedule</span>

                  <strong>{getScheduleText(conflict)}</strong>
                </div>

                {/* ===================================== */}
                {/* COMMON DAY */}
                {/* ===================================== */}

                {conflict.commonDays.length > 0 && (
                  <div className="class-offering-conflict-detail">
                    <span>Overlapping Day</span>

                    <strong>{conflict.commonDays.join(", ")}</strong>
                  </div>
                )}

                {/* ===================================== */}
                {/* STATUS */}
                {/* ===================================== */}

                <div className="class-offering-conflict-detail">
                  <span>Offering Status</span>

                  <strong>{status}</strong>
                </div>
              </div>

              {/* ======================================= */}
              {/* REASON */}
              {/* ======================================= */}

              <div className="class-offering-conflict-reason">
                {conflict.conflictTypes.map((type) => (
                  <div key={type}>
                    <strong>{getConflictLabel(type)}:</strong>{" "}
                    {getConflictExplanation(type)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ================================================= */}
      {/* RESOLUTION */}
      {/* ================================================= */}

      <div className="class-offering-conflict-help">
        <strong>How to resolve</strong>

        <p>
          Change the faculty member or select a schedule that does not overlap
          with the conflicting offerings shown above.
        </p>
      </div>
    </div>
  );
}
