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

interface FacultyOption {
  faculty_id: number;

  employee_number?: string;

  faculty_name?: string;

  first_name?: string;

  middle_name?: string | null;

  last_name?: string;
}

interface RoomOption {
  room_id: number;

  room_name: string;

  room_code?: string;

  capacity?: number | null;
}

// =====================================================
// RESPONSE
// =====================================================

interface UpdateOfferingResponse {
  success: boolean;

  message?: string;

  error?: string;

  conflict?: boolean;

  conflicts?: OfferingConflict[];

  summary?: {
    total_conflicts?: number;

    faculty_conflicts?: number;

    section_conflicts?: number;

    room_conflicts?: number;
  };

  proposed_schedule?: {
    faculty_id?: number | null;

    room_id?: number | null;

    schedule_days?: string | null;

    schedule_time?: string | null;
  };

  conflict_count?: number;

  conflict_types?: string[];

  offering?: unknown;
}
// =====================================================
// PROPS
// =====================================================

interface EditOfferingModalProps {
  open: boolean;

  subject: OfferingTableSubject | null;

  faculty: FacultyOption[];

  rooms: RoomOption[];

  onClose: () => void;

  onSuccess: () => void;

  onUnauthorized: () => void;
}

// =====================================================
// SAFE JSON RESPONSE
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
// FACULTY DISPLAY NAME
// =====================================================

function getFacultyName(item: FacultyOption) {
  if (item.faculty_name) {
    return item.faculty_name;
  }

  const fullName = [item.first_name, item.middle_name, item.last_name]
    .filter(Boolean)
    .join(" ");

  if (fullName) {
    return fullName;
  }

  return `Faculty #${item.faculty_id}`;
}

// =====================================================
// COMPONENT
// =====================================================

export default function EditOfferingModal({
  open,

  subject,

  faculty,

  rooms,

  onClose,

  onSuccess,

  onUnauthorized,
}: EditOfferingModalProps) {
  // =====================================================
  // FORM
  // =====================================================

  const [facultyId, setFacultyId] = useState("");

  const [roomId, setRoomId] = useState("");

  const [scheduleDays, setScheduleDays] = useState("");

  const [scheduleTime, setScheduleTime] = useState("");

  const [maxStudents, setMaxStudents] = useState("");

  // =====================================================
  // UI
  // =====================================================

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [conflicts, setConflicts] = useState<OfferingConflict[]>([]);

  // =====================================================
  // EXISTING OFFERING
  // =====================================================

  const offering = subject?.offering || null;

  const offeringId = offering?.offering_id;

  // =====================================================
  // RESET / LOAD CURRENT VALUES
  // =====================================================

  useEffect(() => {
    if (!open || !subject || !offering) {
      return;
    }

    setFacultyId(offering.faculty ? String(offering.faculty.faculty_id) : "");

    setRoomId(offering.room ? String(offering.room.room_id) : "");

    setScheduleDays(offering.schedule?.days || "");

    setScheduleTime(offering.schedule?.time || "");

    setMaxStudents(
      String(
        offering.capacity?.max_students ||
          subject.section_subject?.max_students ||
          50,
      ),
    );

    setError("");

    setConflicts([]);
  }, [open, subject, offering]);

  // =====================================================
  // SELECTED ROOM
  // =====================================================

  const selectedRoom = useMemo(() => {
    if (!roomId) {
      return null;
    }

    return rooms.find((item) => String(item.room_id) === roomId) || null;
  }, [roomId, rooms]);

  // =====================================================
  // CAPACITY
  // =====================================================

  const numericCapacity = Number(maxStudents);

  const validCapacity =
    Number.isInteger(numericCapacity) && numericCapacity > 0;

  // =====================================================
  // CURRENT ASSIGNED STUDENTS
  // =====================================================

  const enrolledCount = Number(offering?.capacity?.enrolled_count || 0);

  // =====================================================
  // DETECT CURRENT STATUS
  // =====================================================

  const currentStatus = offering?.status || "Closed";

  const isOpen = currentStatus === "Open";

  // =====================================================
  // VALIDATE
  // =====================================================

  const validateForm = () => {
    // ===============================================
    // CAPACITY
    // ===============================================

    if (!validCapacity) {
      throw new Error(
        "Maximum students must be a whole number greater than 0.",
      );
    }

    // ===============================================
    // CANNOT DROP BELOW ACTIVE STUDENTS
    // ===============================================

    if (numericCapacity < enrolledCount) {
      throw new Error(
        `Maximum students cannot be lower than the current assigned student count of ${enrolledCount}.`,
      );
    }

    // ===============================================
    // ROOM CAPACITY
    //
    // Room is NOT part of schedule conflicts.
    //
    // This only checks physical capacity.
    // ===============================================

    if (selectedRoom?.capacity && numericCapacity > selectedRoom.capacity) {
      throw new Error(
        `Maximum students cannot exceed the selected room capacity of ${selectedRoom.capacity}.`,
      );
    }

    // ===============================================
    // SCHEDULE PAIR
    // ===============================================

    const hasDays = Boolean(scheduleDays.trim());

    const hasTime = Boolean(scheduleTime.trim());

    if (hasDays !== hasTime) {
      throw new Error(
        "Schedule days and schedule time must either both be provided or both be empty.",
      );
    }

    // ===============================================
    // OPEN OFFERING
    //
    // An Open offering must remain complete.
    // ===============================================

    if (isOpen) {
      if (!facultyId) {
        throw new Error(
          "An Open offering must have an assigned faculty member.",
        );
      }

      if (!hasDays) {
        throw new Error("An Open offering must have schedule days.");
      }

      if (!hasTime) {
        throw new Error("An Open offering must have a schedule time.");
      }
    }
  };

  // =====================================================
  // CLOSE
  // =====================================================

  const handleClose = () => {
    if (loading) {
      return;
    }

    setError("");

    setConflicts([]);

    onClose();
  };

  // =====================================================
  // SAVE
  // =====================================================

  const handleSave = async () => {
    if (!subject || !offering || !offeringId) {
      setError("A valid subject offering is required.");

      return;
    }

    try {
      setLoading(true);

      setError("");

      setConflicts([]);

      // ===============================================
      // VALIDATE FRONTEND
      // ===============================================

      validateForm();

      // ===============================================
      // PAYLOAD
      //
      // IMPORTANT:
      //
      // Missing field in backend = preserve old value.
      //
      // Explicit null = clear optional value.
      //
      // We intentionally send all editable values so
      // the Registrar can clear optional assignments.
      //
      // STATUS IS NOT EDITED HERE.
      // ===============================================

      const payload = {
        faculty_id: facultyId ? Number(facultyId) : null,

        room_id: roomId ? Number(roomId) : null,

        schedule_days: scheduleDays.trim() ? scheduleDays.trim() : null,

        schedule_time: scheduleTime.trim() ? scheduleTime.trim() : null,

        max_students: numericCapacity,
      };

      console.log("UPDATE SUBJECT OFFERING:", offeringId, payload);

      // ===============================================
      // REQUEST
      // ===============================================

      const response = await authService.authFetch(
        `${API_BASE_URL}/subject-offerings/${offeringId}`,
        {
          method: "PUT",

          headers: {
            Accept: "application/json",

            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        },
      );

      const data = await readJsonResponse<UpdateOfferingResponse>(response);

      // ===============================================
      // AUTHENTICATION
      // ===============================================
      if (response.status === 409) {
        console.log("========================================");

        console.log("OFFERING CONFLICT RESPONSE:", data);

        console.log(
          "OFFERING CONFLICTS JSON:",
          JSON.stringify(data.conflicts || [], null, 2),
        );

        console.log("CONFLICT SUMMARY:", data.summary);

        console.log("PROPOSED SCHEDULE:", data.proposed_schedule);

        console.log("========================================");

        setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);

        throw new Error(
          data.message ||
            data.error ||
            "The offering could not be updated because of a conflict.",
        );
      }

      if (response.status === 401) {
        onUnauthorized();

        return;
      }

      // ===============================================
      // AUTHORIZATION
      // ===============================================

      if (response.status === 403) {
        throw new Error(
          data.message ||
            data.error ||
            "You are not authorized to edit class offerings.",
        );
      }

      // ===============================================
      // NOT FOUND
      // ===============================================

      if (response.status === 404) {
        throw new Error(
          data.message ||
            data.error ||
            "The class offering could not be found.",
        );
      }

      // ===============================================
      // CONFLICT
      //
      // Backend remains authoritative.
      //
      // This includes:
      // - SECTION schedule conflict
      // - FACULTY schedule conflict
      // - capacity protection
      // - invalid status transitions/configuration
      // ===============================================

      if (response.status === 409) {
        setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);

        throw new Error(
          data.message ||
            data.error ||
            "The offering could not be updated because of a conflict.",
        );
      }

      // ===============================================
      // GENERAL ERROR
      // ===============================================

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Failed to update class offering.",
        );
      }

      // ===============================================
      // SUCCESS
      // ===============================================

      console.log("UPDATE OFFERING SUCCESS:", data);

      onSuccess();

      onClose();
    } catch (error) {
      console.error("UPDATE OFFERING ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to update class offering.",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // DO NOT RENDER
  // =====================================================

  if (!open || !subject || !offering) {
    return null;
  }

  // =====================================================
  // RENDER
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
        aria-labelledby="edit-offering-title"
      >
        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="class-offering-modal-header">
          <div>
            <h2 id="edit-offering-title">Edit Class Offering</h2>

            <p>
              Update faculty, schedule, room, or capacity for this class
              offering.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close"
            disabled={loading}
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        {/* ================================================= */}
        {/* SUBJECT INFORMATION */}
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
            {subject.subject.units} unit
            {subject.subject.units !== 1 ? "s" : ""}
          </small>
        </div>

        {/* ================================================= */}
        {/* ERROR */}
        {/* ================================================= */}

        {error && conflicts.length === 0 && (
          <div className="class-offering-error">{error}</div>
        )}

        {/* ================================================= */}
        {/* SCHEDULE CONFLICT DISPLAY */}
        {/* ================================================= */}

        <ConflictAlert conflicts={conflicts} message={error} />

        {/* ================================================= */}
        {/* BODY */}
        {/* ================================================= */}

        <div className="class-offering-modal-body">
          {/* =============================================== */}
          {/* CURRENT STATUS */}
          {/* =============================================== */}

          <div className="class-offering-prepare-notice">
            <strong>Current status: {currentStatus}</strong>

            {isOpen ? (
              <p>
                This offering is currently Open. It must remain completely
                configured after editing or the backend will reject the update.
              </p>
            ) : (
              <p>
                This offering is currently Closed. You may complete its
                configuration here, then manage its status separately if needed.
              </p>
            )}
          </div>

          {/* =============================================== */}
          {/* FORM */}
          {/* =============================================== */}

          <div className="class-offering-form-grid">
            {/* ============================================= */}
            {/* FACULTY */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="edit-offering-faculty">Faculty</label>

              <select
                id="edit-offering-faculty"
                value={facultyId}
                disabled={loading}
                onChange={(event) => {
                  setFacultyId(event.target.value);

                  setError("");

                  setConflicts([]);
                }}
              >
                <option value="">Not Assigned</option>

                {faculty.map((item) => (
                  <option key={item.faculty_id} value={item.faculty_id}>
                    {getFacultyName(item)}
                  </option>
                ))}
              </select>

              <small>Required while the offering is Open.</small>
            </div>

            {/* ============================================= */}
            {/* ROOM */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="edit-offering-room">Room</label>

              <select
                id="edit-offering-room"
                value={roomId}
                disabled={loading}
                onChange={(event) => {
                  setRoomId(event.target.value);

                  setError("");
                }}
              >
                <option value="">No Room Assigned</option>

                {rooms.map((room) => (
                  <option key={room.room_id} value={room.room_id}>
                    {room.room_code ? `${room.room_code} — ` : ""}

                    {room.room_name}

                    {room.capacity ? ` (${room.capacity})` : ""}
                  </option>
                ))}
              </select>

              <small>
                Optional. Room is not used for schedule conflict checking.
              </small>
            </div>

            {/* ============================================= */}
            {/* SCHEDULE DAYS */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="edit-offering-days">Schedule Days</label>

              <input
                id="edit-offering-days"
                type="text"
                value={scheduleDays}
                disabled={loading}
                placeholder="Example: Monday, Wednesday"
                onChange={(event) => {
                  setScheduleDays(event.target.value);

                  setError("");

                  setConflicts([]);
                }}
              />

              <small>Examples: Monday or Monday, Wednesday.</small>
            </div>

            {/* ============================================= */}
            {/* SCHEDULE TIME */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="edit-offering-time">Schedule Time</label>

              <input
                id="edit-offering-time"
                type="text"
                value={scheduleTime}
                disabled={loading}
                placeholder="Example: 8:00 AM - 10:00 AM"
                onChange={(event) => {
                  setScheduleTime(event.target.value);

                  setError("");

                  setConflicts([]);
                }}
              />

              <small>
                Overlapping section or faculty schedules will be rejected.
              </small>
            </div>

            {/* ============================================= */}
            {/* MAXIMUM STUDENTS */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="edit-offering-capacity">Maximum Students</label>

              <input
                id="edit-offering-capacity"
                type="number"
                min={Math.max(1, enrolledCount)}
                step={1}
                value={maxStudents}
                disabled={loading}
                onChange={(event) => {
                  setMaxStudents(event.target.value);

                  setError("");
                }}
              />

              {enrolledCount > 0 && (
                <small>Current assigned students: {enrolledCount}</small>
              )}

              {selectedRoom?.capacity ? (
                <small>Selected room capacity: {selectedRoom.capacity}</small>
              ) : (
                <small>Capacity cannot be lower than assigned students.</small>
              )}
            </div>

            {/* ============================================= */}
            {/* STATUS */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label>Offering Status</label>

              <input type="text" value={currentStatus} disabled />

              <small>
                Status is managed separately from editing the class
                configuration.
              </small>
            </div>
          </div>

          {/* =============================================== */}
          {/* VALIDATION INFORMATION */}
          {/* =============================================== */}

          <div className="class-offering-open-requirements">
            <h3>Schedule Validation</h3>

            <ul>
              <li>Same section + overlapping schedule = conflict</li>

              <li>Same faculty + overlapping schedule = conflict</li>

              <li>Room is not included in schedule conflict checking</li>

              <li>Adjacent schedules are allowed</li>
            </ul>
          </div>
        </div>

        {/* ================================================= */}
        {/* FOOTER */}
        {/* ================================================= */}

        <div className="class-offering-modal-footer">
          <button type="button" disabled={loading} onClick={handleClose}>
            Cancel
          </button>

          <button
            type="button"
            className="class-offering-primary-button"
            disabled={loading || !validCapacity}
            onClick={handleSave}
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
