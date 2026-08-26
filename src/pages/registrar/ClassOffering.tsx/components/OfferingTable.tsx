// =====================================================
// TYPES
// =====================================================

interface OfferingFaculty {
  faculty_id: number;
  faculty_name: string;
}

interface OfferingRoom {
  room_id: number;
  room_name: string;
}

interface OfferingSchedule {
  days: string | null;
  time: string | null;
}

interface OfferingCapacity {
  max_students: number;
  enrolled_count: number;
  available_slots: number;
  is_full: boolean;
}

interface Offering {
  offering_id: number;

  status: "Open" | "Closed" | "Cancelled";

  faculty: OfferingFaculty | null;

  room: OfferingRoom | null;

  schedule: OfferingSchedule;

  capacity: OfferingCapacity;
}

interface SectionSubject {
  section_subject_id: number;

  status: "Open" | "Closed" | "Cancelled";

  max_students: number;
}

interface SubjectInfo {
  subject_id: number;

  subject_code: string;

  subject_name: string;

  units: number;

  lecture_hours: number;

  laboratory_hours: number;

  is_required: boolean;

  display_order: number;
}

export interface OfferingTableSubject {
  curriculum_subject_id: number | null;

  subject: SubjectInfo;

  section_subject: SectionSubject | null;

  offering: Offering | null;

  has_section_subject: boolean;

  has_offering: boolean;

  configuration_complete: boolean;

  ready_for_enrollment: boolean;

  missing_configuration: string[];
}

// =====================================================
// PROPS
// =====================================================

interface OfferingTableProps {
  subjects: OfferingTableSubject[];

  onCreateOffering: (subject: OfferingTableSubject) => void;

  onEditOffering: (subject: OfferingTableSubject) => void;

  onOfferingStatus: (subject: OfferingTableSubject) => void;

  onSectionSubjectStatus: (subject: OfferingTableSubject) => void;
}

// =====================================================
// COMPONENT
// =====================================================

export default function OfferingTable({
  subjects,

  onCreateOffering,

  onEditOffering,

  onOfferingStatus,

  onSectionSubjectStatus,
}: OfferingTableProps) {
  return (
    <section className="class-offering-section">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="class-offering-section-header">
        <div>
          <h2>Curriculum Class Offerings</h2>

          <p>
            Every expected curriculum subject is shown, including subjects that
            do not yet have an offering.
          </p>
        </div>
      </div>

      {/* ================================================= */}
      {/* TABLE */}
      {/* ================================================= */}

      <div className="class-offering-table-wrapper">
        <table className="class-offering-table">
          <thead>
            <tr>
              <th>Code</th>

              <th>Subject</th>

              <th>Faculty</th>

              <th>Schedule</th>

              <th>Room</th>

              <th>Capacity</th>

              <th>Status</th>

              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {/* =========================================== */}
            {/* EMPTY */}
            {/* =========================================== */}

            {subjects.length === 0 && (
              <tr>
                <td colSpan={8}>
                  No curriculum subjects found for this academic setup.
                </td>
              </tr>
            )}

            {/* =========================================== */}
            {/* SUBJECTS */}
            {/* =========================================== */}

            {subjects.map((item) => {
              const offering = item.offering;

              const capacity = offering?.capacity;

              // ==========================================
              // STATUS LABEL
              // ==========================================

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

              return (
                <tr key={item.curriculum_subject_id ?? item.subject.subject_id}>
                  {/* ===================================== */}
                  {/* CODE */}
                  {/* ===================================== */}

                  <td>
                    <strong>{item.subject.subject_code}</strong>
                  </td>

                  {/* ===================================== */}
                  {/* SUBJECT */}
                  {/* ===================================== */}

                  <td>
                    <div>{item.subject.subject_name}</div>

                    <small>
                      {item.subject.units} unit
                      {item.subject.units !== 1 ? "s" : ""}
                    </small>
                  </td>

                  {/* ===================================== */}
                  {/* FACULTY */}
                  {/* ===================================== */}

                  <td>{offering?.faculty?.faculty_name || "Not assigned"}</td>

                  {/* ===================================== */}
                  {/* SCHEDULE */}
                  {/* ===================================== */}

                  <td>
                    {offering?.schedule?.days && offering?.schedule?.time
                      ? `${offering.schedule.days} • ${offering.schedule.time}`
                      : "Not assigned"}
                  </td>

                  {/* ===================================== */}
                  {/* ROOM */}
                  {/* ===================================== */}

                  <td>{offering?.room?.room_name || "—"}</td>

                  {/* ===================================== */}
                  {/* CAPACITY */}
                  {/* ===================================== */}

                  <td>
                    {capacity
                      ? `${capacity.enrolled_count}/${capacity.max_students}`
                      : (item.section_subject?.max_students ?? "—")}

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

                  {/* ===================================== */}
                  {/* STATUS */}
                  {/* ===================================== */}

                  <td>{statusLabel}</td>

                  {/* ===================================== */}
                  {/* ACTIONS */}
                  {/* ===================================== */}

                  <td>
                    {!item.has_section_subject ? (
                      <span>Section subject missing</span>
                    ) : !item.has_offering ? (
                      <button
                        type="button"
                        onClick={() => onCreateOffering(item)}
                      >
                        Create Offering
                      </button>
                    ) : item.offering?.status === "Cancelled" ? (
                      <span>No actions</span>
                    ) : (
                      <div className="class-offering-actions">
                        {/* EDIT */}

                        <button
                          type="button"
                          onClick={() => onEditOffering(item)}
                        >
                          Edit
                        </button>

                        {/* OPEN / CLOSE */}

                        <button
                          type="button"
                          onClick={() => onOfferingStatus(item)}
                        >
                          {item.offering?.status === "Open" ? "Close" : "Open"}
                        </button>

                        {/* SECTION STATUS */}

                        <button
                          type="button"
                          onClick={() => onSectionSubjectStatus(item)}
                        >
                          Section Status
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
