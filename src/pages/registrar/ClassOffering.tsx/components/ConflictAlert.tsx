// =====================================================
// TYPES
// =====================================================

export type OfferingConflictType = "SECTION" | "FACULTY" | "ROOM" | string;

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
  // Keeps the component compatible if another endpoint
  // returns:
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

  room: {
    room_id?: number;

    room_code?: string;

    room_name?: string;
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
// NORMALIZE CONFLICT TYPES
// =====================================================

function normalizeConflictTypes(
  conflictTypes: OfferingConflictType[] | undefined,
  fallbackType?: OfferingConflictType,
) {
  const normalized = Array.isArray(conflictTypes)
    ? conflictTypes
        .map((type) => String(type).trim().toUpperCase())
        .filter(Boolean)
    : [];

  if (normalized.length > 0) {
    return [...new Set(normalized)];
  }

  if (fallbackType) {
    const type = String(fallbackType).trim().toUpperCase();

    if (type) {
      return [type];
    }
  }

  return ["CONFLICT"];
}

// =====================================================
// NORMALIZE BACKEND RESPONSE
// =====================================================

function normalizeConflict(conflict: OfferingConflict): NormalizedConflict {
  // ===================================================
  // CURRENT RESPONSE
  // ===================================================

  if (
    conflict.subject ||
    conflict.section ||
    conflict.faculty ||
    conflict.room ||
    conflict.schedule ||
    conflict.conflict_types
  ) {
    return {
      offering_id: conflict.offering_id,

      conflictTypes: normalizeConflictTypes(
        conflict.conflict_types,
        conflict.type,
      ),

      commonDays: Array.isArray(conflict.common_days)
        ? conflict.common_days.map((day) => String(day).trim()).filter(Boolean)
        : [],

      message: conflict.message,

      subject: conflict.subject || null,

      section: conflict.section || null,

      faculty: conflict.faculty || null,

      room: conflict.room || null,

      schedule: conflict.schedule || null,

      status: conflict.status,
    };
  }

  // ===================================================
  // LEGACY RESPONSE
  // ===================================================

  const legacy = conflict.conflicting_offering;

  return {
    offering_id: legacy?.offering_id,

    conflictTypes: normalizeConflictTypes(undefined, conflict.type),

    commonDays: [],

    message: conflict.message,

    subject: legacy?.subject || null,

    section: legacy?.section || null,

    faculty: legacy?.faculty || null,

    room: legacy?.room || null,

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

    case "ROOM":
      return "Room Schedule Conflict";

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
        "The selected section already has another subject " +
        "scheduled during this time."
      );

    case "FACULTY":
      return (
        "The selected faculty member is already assigned " +
        "to another class during this time."
      );

    case "ROOM":
      return (
        "The selected room is already assigned to another " +
        "class during this time."
      );

    default:
      return "This schedule overlaps with another existing class offering.";
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
    return `${subject.subject_code} — ${subject.subject_name}`;
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
  const days = conflict.schedule?.days?.trim();

  const time = conflict.schedule?.time?.trim();

  if (days && time) {
    return `${days} • ${time}`;
  }

  if (days) {
    return `${days} • Time not available`;
  }

  if (time) {
    return `Days not available • ${time}`;
  }

  return "Schedule not available";
}

// =====================================================
// ROOM TEXT
// =====================================================

function getRoomText(conflict: NormalizedConflict) {
  const room = conflict.room;

  if (!room) {
    return "No room assigned";
  }

  if (room.room_code && room.room_name) {
    return `${room.room_code} — ${room.room_name}`;
  }

  return room.room_code || room.room_name || "Assigned room";
}

// =====================================================
// MAIN CONFLICT TYPE
//
// Used only for CSS accent.
//
// Existing CSS may only have section/faculty/conflict.
// ROOM safely falls back to the generic conflict accent.
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
// RESOLUTION TEXT
// =====================================================

function getResolutionText(conflicts: NormalizedConflict[]) {
  const types = new Set(
    conflicts.flatMap((conflict) => conflict.conflictTypes),
  );

  const resolutions: string[] = [];

  if (types.has("SECTION")) {
    resolutions.push("choose another non-overlapping schedule for the section");
  }

  if (types.has("FACULTY")) {
    resolutions.push(
      "choose another faculty member or a non-overlapping schedule",
    );
  }

  if (types.has("ROOM")) {
    resolutions.push("choose another room or a non-overlapping schedule");
  }

  if (resolutions.length === 0) {
    return "Choose a schedule that does not overlap with the conflicting offering.";
  }

  if (resolutions.length === 1) {
    return `To resolve this conflict, ${resolutions[0]}.`;
  }

  const finalResolution = resolutions.pop();

  return `To resolve these conflicts, ${resolutions.join(
    ", ",
  )}, and ${finalResolution}.`;
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

  const resolutionText = getResolutionText(normalizedConflicts);

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
        <div className="class-offering-conflict-icon" aria-hidden="true">
          !
        </div>

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
          Review each conflict below before changing the schedule, faculty
          member, or room.
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

          const roomName = getRoomText(conflict);

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

                {conflict.offering_id !== undefined && (
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
                {/* ROOM */}
                {/* ===================================== */}

                <div className="class-offering-conflict-detail">
                  <span>Room</span>

                  <strong>{roomName}</strong>
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
                    <span>
                      Overlapping Day
                      {conflict.commonDays.length !== 1 ? "s" : ""}
                    </span>

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

        <p>{resolutionText}</p>
      </div>
    </div>
  );
}
