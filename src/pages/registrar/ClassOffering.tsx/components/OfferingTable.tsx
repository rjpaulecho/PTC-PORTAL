import OfferingTableRow from "./OfferingTableRow";

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

  room_code?: string | null;
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

  max_students: number | null;
}

interface SubjectInfo {
  subject_id: number;

  subject_code: string;

  subject_name: string;

  units: number;

  lecture_hours?: number;

  laboratory_hours?: number;

  is_required?: boolean;

  display_order?: number | null;
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
// ROW KEY
// =====================================================

function getRowKey(item: OfferingTableSubject) {
  if (item.curriculum_subject_id !== null) {
    return `curriculum-${item.curriculum_subject_id}`;
  }

  if (item.section_subject?.section_subject_id) {
    return `section-subject-${item.section_subject.section_subject_id}`;
  }

  if (item.offering?.offering_id) {
    return `offering-${item.offering.offering_id}`;
  }

  return `subject-${item.subject.subject_id}`;
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
  // =====================================================
  // TABLE MODE
  //
  // Special / Retake rows have curriculum_subject_id null.
  //
  // Their parent already renders its own heading, so this
  // component should only render the table itself there.
  // =====================================================

  const isSpecialTable =
    subjects.length > 0 &&
    subjects.every((item) => item.curriculum_subject_id === null);

  // =====================================================
  // TABLE CONTENT
  // =====================================================

  const tableContent = (
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
          {/* SUBJECT ROWS */}
          {/* =========================================== */}

          {subjects.map((item) => (
            <OfferingTableRow
              key={getRowKey(item)}
              item={item}
              onCreateOffering={onCreateOffering}
              onEditOffering={onEditOffering}
              onOfferingStatus={onOfferingStatus}
              onSectionSubjectStatus={onSectionSubjectStatus}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  // =====================================================
  // SPECIAL / RETAKE TABLE
  // =====================================================

  if (isSpecialTable) {
    return tableContent;
  }

  // =====================================================
  // NORMAL CURRICULUM TABLE
  // =====================================================

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

      {tableContent}
    </section>
  );
}
