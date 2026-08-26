import { useEffect, useMemo, useState } from "react";

import { authService } from "../../../../services/auth.service";

import type { OfferingTableSubject } from "../components/OfferingTable";

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

  capacity?: number;
}

// =====================================================
// API RESPONSE
// =====================================================

interface CreateOfferingResponse {
  success: boolean;

  message?: string;

  error?: string;

  offering?: unknown;

  conflicts?: unknown[];
}

// =====================================================
// PROPS
// =====================================================

interface AddOfferingModalProps {
  open: boolean;

  subject: OfferingTableSubject | null;

  faculty: FacultyOption[];

  rooms: RoomOption[];

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
// FACULTY NAME
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

export default function AddOfferingModal({
  open,

  subject,

  faculty,

  rooms,

  onClose,

  onSuccess,

  onUnauthorized,
}: AddOfferingModalProps) {
  // =====================================================
  // FORM STATE
  // =====================================================

  const [facultyId, setFacultyId] = useState("");

  const [roomId, setRoomId] = useState("");

  const [scheduleDays, setScheduleDays] = useState("");

  const [scheduleTime, setScheduleTime] = useState("");

  const [maxStudents, setMaxStudents] = useState("");

  // =====================================================
  // UI STATE
  // =====================================================

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // RESET FORM
  // =====================================================

  useEffect(() => {
    if (!open || !subject) {
      return;
    }

    setFacultyId("");

    setRoomId("");

    setScheduleDays("");

    setScheduleTime("");

    setMaxStudents(String(subject.section_subject?.max_students || 50));

    setError("");
  }, [open, subject]);

  // =====================================================
  // SUBJECT INFORMATION
  // =====================================================

  const sectionSubjectId = subject?.section_subject?.section_subject_id;

  const subjectCode = subject?.subject.subject_code || "";

  const subjectName = subject?.subject.subject_name || "";

  const units = subject?.subject.units || 0;

  // =====================================================
  // SELECTED ROOM
  // =====================================================

  const selectedRoom = useMemo(() => {
    if (!roomId) {
      return null;
    }

    return rooms.find((room) => String(room.room_id) === roomId) || null;
  }, [rooms, roomId]);

  // =====================================================
  // NUMERIC CAPACITY
  // =====================================================

  const numericCapacity = Number(maxStudents);

  // =====================================================
  // OPEN REQUIREMENTS
  // =====================================================

  const canOpen =
    Boolean(facultyId) &&
    Boolean(scheduleDays.trim()) &&
    Boolean(scheduleTime.trim()) &&
    Number.isFinite(numericCapacity) &&
    numericCapacity > 0;

  // =====================================================
  // VALIDATE CAPACITY
  // =====================================================

  const validateCapacity = () => {
    if (!Number.isFinite(numericCapacity) || numericCapacity <= 0) {
      throw new Error("Capacity must be greater than 0.");
    }

    if (selectedRoom?.capacity && numericCapacity > selectedRoom.capacity) {
      throw new Error(
        `Capacity cannot exceed the selected room capacity of ${selectedRoom.capacity}.`,
      );
    }
  };

  // =====================================================
  // CREATE OFFERING
  // =====================================================

  const createOffering = async (status: "Closed" | "Open") => {
    if (!subject || !sectionSubjectId) {
      setError("This subject does not have a valid section subject.");

      return;
    }

    try {
      setLoading(true);

      setError("");

      // =================================================
      // BASIC VALIDATION
      // =================================================

      validateCapacity();

      // =================================================
      // OPEN VALIDATION
      // =================================================

      if (status === "Open" && !facultyId) {
        throw new Error(
          "Faculty is required before an offering can be opened.",
        );
      }

      if (status === "Open" && !scheduleDays.trim()) {
        throw new Error(
          "Schedule days are required before an offering can be opened.",
        );
      }

      if (status === "Open" && !scheduleTime.trim()) {
        throw new Error(
          "Schedule time is required before an offering can be opened.",
        );
      }

      // =================================================
      // REQUEST BODY
      // =================================================

      const payload: {
        section_subject_id: number;

        faculty_id?: number;

        room_id?: number;

        schedule_days?: string;

        schedule_time?: string;

        max_students: number;

        status: "Closed" | "Open";
      } = {
        section_subject_id: sectionSubjectId,

        max_students: numericCapacity,

        status,
      };

      // =================================================
      // OPTIONAL FACULTY
      // =================================================

      if (facultyId) {
        payload.faculty_id = Number(facultyId);
      }

      // =================================================
      // OPTIONAL ROOM
      // =================================================

      if (roomId) {
        payload.room_id = Number(roomId);
      }

      // =================================================
      // OPTIONAL SCHEDULE DAYS
      // =================================================

      if (scheduleDays.trim()) {
        payload.schedule_days = scheduleDays.trim();
      }

      // =================================================
      // OPTIONAL SCHEDULE TIME
      // =================================================

      if (scheduleTime.trim()) {
        payload.schedule_time = scheduleTime.trim();
      }

      console.log("CREATE SUBJECT OFFERING:", payload);

      // =================================================
      // REQUEST
      // =================================================

      const response = await authService.authFetch(
        `${API_BASE_URL}/subject-offerings`,
        {
          method: "POST",

          headers: {
            Accept: "application/json",

            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        },
      );

      const data = await readJsonResponse<CreateOfferingResponse>(response);

      // =================================================
      // UNAUTHORIZED
      // =================================================

      if (response.status === 401) {
        onUnauthorized();

        return;
      }

      // =================================================
      // FORBIDDEN
      // =================================================

      if (response.status === 403) {
        throw new Error(
          data.message ||
            data.error ||
            "You are not authorized to create class offerings.",
        );
      }

      // =================================================
      // CONFLICT
      // =================================================

      if (response.status === 409) {
        throw new Error(
          data.message ||
            data.error ||
            "The selected schedule conflicts with another class offering.",
        );
      }

      // =================================================
      // VALIDATION / API ERROR
      // =================================================

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Failed to create the class offering.",
        );
      }

      // =================================================
      // SUCCESS
      // =================================================

      onSuccess();

      onClose();
    } catch (error) {
      console.error("CREATE OFFERING ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to create class offering.",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // DO NOT RENDER
  // =====================================================

  if (!open || !subject) {
    return null;
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="class-offering-modal-backdrop" role="presentation">
      <div
        className="class-offering-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-offering-title"
      >
        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="class-offering-modal-header">
          <div>
            <h2 id="add-offering-title">Create Class Offering</h2>

            <p>Configure the class implementation for this section subject.</p>
          </div>

          <button
            type="button"
            aria-label="Close"
            disabled={loading}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* ================================================= */}
        {/* SUBJECT */}
        {/* ================================================= */}

        <div className="class-offering-modal-subject">
          <div>
            <strong>{subjectCode}</strong>

            <span>
              {" — "}
              {subjectName}
            </span>
          </div>

          <small>
            {units} unit
            {units !== 1 ? "s" : ""}
          </small>
        </div>

        {/* ================================================= */}
        {/* ERROR */}
        {/* ================================================= */}

        {error && <div className="class-offering-error">{error}</div>}

        {/* ================================================= */}
        {/* FORM */}
        {/* ================================================= */}

        <div className="class-offering-modal-body">
          <div className="class-offering-form-grid">
            {/* ============================================= */}
            {/* FACULTY */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="add-offering-faculty">Faculty</label>

              <select
                id="add-offering-faculty"
                value={facultyId}
                disabled={loading}
                onChange={(event) => setFacultyId(event.target.value)}
              >
                <option value="">Not Assigned</option>

                {faculty.map((item) => (
                  <option key={item.faculty_id} value={item.faculty_id}>
                    {getFacultyName(item)}
                  </option>
                ))}
              </select>

              <small>Required when opening the offering.</small>
            </div>

            {/* ============================================= */}
            {/* ROOM */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="add-offering-room">Room</label>

              <select
                id="add-offering-room"
                value={roomId}
                disabled={loading}
                onChange={(event) => setRoomId(event.target.value)}
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
                Optional. Room capacity is validated when a room is assigned.
              </small>
            </div>

            {/* ============================================= */}
            {/* SCHEDULE DAYS */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="add-offering-days">Schedule Days</label>

              <input
                id="add-offering-days"
                type="text"
                value={scheduleDays}
                disabled={loading}
                placeholder="Example: Monday, Wednesday"
                onChange={(event) => setScheduleDays(event.target.value)}
              />

              <small>Required when opening the offering.</small>
            </div>

            {/* ============================================= */}
            {/* SCHEDULE TIME */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="add-offering-time">Schedule Time</label>

              <input
                id="add-offering-time"
                type="text"
                value={scheduleTime}
                disabled={loading}
                placeholder="Example: 8:00 AM - 10:00 AM"
                onChange={(event) => setScheduleTime(event.target.value)}
              />

              <small>Required when opening the offering.</small>
            </div>

            {/* ============================================= */}
            {/* CAPACITY */}
            {/* ============================================= */}

            <div className="class-offering-field">
              <label htmlFor="add-offering-capacity">Maximum Students</label>

              <input
                id="add-offering-capacity"
                type="number"
                min={1}
                value={maxStudents}
                disabled={loading}
                onChange={(event) => setMaxStudents(event.target.value)}
              />

              {selectedRoom?.capacity ? (
                <small>Selected room capacity: {selectedRoom.capacity}</small>
              ) : (
                <small>
                  Maximum number of students allowed in this offering.
                </small>
              )}
            </div>
          </div>

          {/* ================================================= */}
          {/* OPEN REQUIREMENTS */}
          {/* ================================================= */}

          <div className="class-offering-open-requirements">
            <h3>Open Offering Requirements</h3>

            <ul>
              <li>Faculty: {facultyId ? "Ready" : "Missing"}</li>

              <li>
                Schedule Days: {scheduleDays.trim() ? "Ready" : "Missing"}
              </li>

              <li>
                Schedule Time: {scheduleTime.trim() ? "Ready" : "Missing"}
              </li>

              <li>
                Capacity:{" "}
                {Number.isFinite(numericCapacity) && numericCapacity > 0
                  ? "Ready"
                  : "Invalid"}
              </li>

              <li>Room: Optional</li>
            </ul>
          </div>
        </div>

        {/* ================================================= */}
        {/* FOOTER */}
        {/* ================================================= */}

        <div className="class-offering-modal-footer">
          <button type="button" disabled={loading} onClick={onClose}>
            Cancel
          </button>

          <button
            type="button"
            disabled={loading || !maxStudents}
            onClick={() => createOffering("Closed")}
          >
            {loading ? "Saving..." : "Save as Closed"}
          </button>

          <button
            type="button"
            disabled={loading || !canOpen}
            onClick={() => createOffering("Open")}
          >
            {loading ? "Creating..." : "Create & Open"}
          </button>
        </div>
      </div>
    </div>
  );
}
