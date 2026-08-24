// routes/student/enrollments.js

import express from "express";
import db from "../../db.js";

const router = express.Router();

// =====================================================
// GET CURRENT STUDENT ENROLLMENT
//
// GET /api/student/enrollments/current?user_id=1
//
// READ-ONLY
//
// Student can:
// - View student information
// - View curriculum
// - View current enrollment period
// - View current enrollment
//
// Student cannot modify anything here.
// =====================================================

router.get("/current", async (req, res) => {
  try {
    // =================================================
    // 1. GET USER ID
    // =================================================

    const userId = Number(req.query.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user_id.",
      });
    }

    // =================================================
    // 2. VERIFY STUDENT
    // =================================================

    const [studentRows] = await db.execute(
      `
      SELECT
          u.user_id,
          u.username,
          u.role_id,

          r.role_name,

          s.student_id,
          s.student_number,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.course_id,
          s.year_level

      FROM users u

      INNER JOIN roles r
          ON r.role_id = u.role_id

      INNER JOIN students s
          ON s.user_id = u.user_id

      WHERE u.user_id = ?
        AND r.role_name = 'Student'

      LIMIT 1
      `,
      [userId],
    );

    if (studentRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "User is not a valid Student account.",
      });
    }

    const student = studentRows[0];

    // =================================================
    // 3. GET ASSIGNED CURRICULUM
    // =================================================

    const [curriculumRows] = await db.execute(
      `
      SELECT
          sc.student_curriculum_id,
          sc.student_id,
          sc.curriculum_id,

          sc.assigned_date,
          sc.status AS curriculum_status,
          sc.remarks,

          cur.course_id,
          cur.curriculum_name,
          cur.effective_year,
          cur.total_units,
          cur.is_active,

          c.course_code,
          c.course_name

      FROM student_curriculum sc

      INNER JOIN curriculum cur
          ON cur.curriculum_id = sc.curriculum_id

      INNER JOIN courses c
          ON c.course_id = cur.course_id

      WHERE sc.student_id = ?

      ORDER BY
          CASE
              WHEN sc.status = 'Active' THEN 1
              ELSE 2
          END,

          sc.assigned_date DESC,
          sc.student_curriculum_id DESC

      LIMIT 1
      `,
      [student.student_id],
    );

    let curriculum = null;

    if (curriculumRows.length > 0) {
      const currentCurriculum = curriculumRows[0];

      curriculum = {
        student_curriculum_id: Number(currentCurriculum.student_curriculum_id),

        curriculum_id: Number(currentCurriculum.curriculum_id),

        curriculum_name: currentCurriculum.curriculum_name,

        effective_year: Number(currentCurriculum.effective_year),

        total_units: Number(currentCurriculum.total_units || 0),

        is_active: Boolean(currentCurriculum.is_active),

        assigned_date: currentCurriculum.assigned_date,

        status: currentCurriculum.curriculum_status,

        remarks: currentCurriculum.remarks,

        course: {
          course_id: Number(currentCurriculum.course_id),

          course_code: currentCurriculum.course_code,

          course_name: currentCurriculum.course_name,
        },
      };
    }

    // =================================================
    // 4. GET CURRENT OPEN ENROLLMENT PERIOD
    // =================================================

    const [periodRows] = await db.execute(
      `
      SELECT
          ep.enrollment_period_id,

          ep.academic_year_id,
          ay.academic_year,

          ep.semester_id,
          sem.semester_name,

          ep.status,

          ep.opened_by,
          ep.opened_at,

          ep.closed_by,
          ep.closed_at,

          ep.remarks

      FROM enrollment_periods ep

      INNER JOIN academic_years ay
          ON ay.academic_year_id = ep.academic_year_id

      INNER JOIN semesters sem
          ON sem.semester_id = ep.semester_id

      WHERE ep.status = 'Open'

      ORDER BY
          ep.enrollment_period_id DESC

      LIMIT 1
      `,
    );

    // =================================================
    // 5. NO OPEN ENROLLMENT PERIOD
    // =================================================

    if (periodRows.length === 0) {
      return res.status(200).json({
        success: true,

        message: "Enrollment is currently closed.",

        student: {
          user_id: Number(student.user_id),

          username: student.username,

          student_id: Number(student.student_id),

          student_number: student.student_number,

          first_name: student.first_name,

          middle_name: student.middle_name,

          last_name: student.last_name,

          student_name: `${student.first_name}${
            student.middle_name ? ` ${student.middle_name}` : ""
          } ${student.last_name}`,

          course_id: Number(student.course_id),

          year_level: Number(student.year_level),
        },

        curriculum,

        enrollment_period: null,

        enrollment: null,
      });
    }

    const enrollmentPeriod = periodRows[0];

    const academicYearId = Number(enrollmentPeriod.academic_year_id);

    const semesterId = Number(enrollmentPeriod.semester_id);

    // =================================================
    // 6. GET CURRENT ENROLLMENT
    // =================================================

    const [enrollmentRows] = await db.execute(
      `
      SELECT
          e.enrollment_id,
          e.student_id,

          e.academic_year_id,
          ay.academic_year,

          e.semester_id,
          sem.semester_name,

          e.enrollment_status,
          e.remarks,

          e.approved_by,
          e.approved_at,

          e.created_at

      FROM enrollments e

      INNER JOIN academic_years ay
          ON ay.academic_year_id = e.academic_year_id

      INNER JOIN semesters sem
          ON sem.semester_id = e.semester_id

      WHERE e.student_id = ?
        AND e.academic_year_id = ?
        AND e.semester_id = ?

      ORDER BY
          e.created_at DESC,
          e.enrollment_id DESC

      LIMIT 1
      `,
      [student.student_id, academicYearId, semesterId],
    );

    // =================================================
    // 7. STUDENT RESPONSE
    // =================================================

    const studentResponse = {
      user_id: Number(student.user_id),

      username: student.username,

      student_id: Number(student.student_id),

      student_number: student.student_number,

      first_name: student.first_name,

      middle_name: student.middle_name,

      last_name: student.last_name,

      student_name: `${student.first_name}${
        student.middle_name ? ` ${student.middle_name}` : ""
      } ${student.last_name}`,

      course_id: Number(student.course_id),

      year_level: Number(student.year_level),
    };

    // =================================================
    // 8. NO CURRENT ENROLLMENT
    // =================================================

    if (enrollmentRows.length === 0) {
      return res.status(200).json({
        success: true,

        message: "No current enrollment found for the open enrollment period.",

        student: studentResponse,

        curriculum,

        enrollment_period: {
          enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

          academic_year_id: academicYearId,

          academic_year: enrollmentPeriod.academic_year,

          semester_id: semesterId,

          semester_name: enrollmentPeriod.semester_name,

          status: enrollmentPeriod.status,

          opened_by: enrollmentPeriod.opened_by,

          opened_at: enrollmentPeriod.opened_at,

          closed_by: enrollmentPeriod.closed_by,

          closed_at: enrollmentPeriod.closed_at,

          remarks: enrollmentPeriod.remarks,
        },

        enrollment: null,
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // 9. SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      student: studentResponse,

      curriculum,

      enrollment_period: {
        enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

        academic_year_id: academicYearId,

        academic_year: enrollmentPeriod.academic_year,

        semester_id: semesterId,

        semester_name: enrollmentPeriod.semester_name,

        status: enrollmentPeriod.status,

        opened_by: enrollmentPeriod.opened_by,

        opened_at: enrollmentPeriod.opened_at,

        closed_by: enrollmentPeriod.closed_by,

        closed_at: enrollmentPeriod.closed_at,

        remarks: enrollmentPeriod.remarks,
      },

      enrollment: {
        enrollment_id: Number(enrollment.enrollment_id),

        student_id: Number(enrollment.student_id),

        academic_year_id: Number(enrollment.academic_year_id),

        academic_year: enrollment.academic_year,

        semester_id: Number(enrollment.semester_id),

        semester_name: enrollment.semester_name,

        enrollment_status: enrollment.enrollment_status,

        remarks: enrollment.remarks,

        approved_by: enrollment.approved_by,

        approved_at: enrollment.approved_at,

        created_at: enrollment.created_at,
      },
    });
  } catch (error) {
    console.error("GET CURRENT STUDENT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load current student enrollment.",
      error: error.message,
    });
  }
});

// =====================================================
// GET PREPARED STUDENT ENROLLMENT
//
// GET /api/student/enrollments/subjects?user_id=6
//
// READ-ONLY
//
// Student does NOT:
// - Add subjects
// - Remove subjects
// - Replace subjects
// - Select sections
// - Transfer sections
// - Select retakes
//
// Registrar/system prepares the enrollment.
// Student only reviews it.
// =====================================================

router.get("/subjects", async (req, res) => {
  try {
    // =================================================
    // 1. GET USER ID
    // =================================================

    const userId = Number(req.query.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user_id.",
      });
    }

    // =================================================
    // 2. VERIFY STUDENT
    // =================================================

    const [studentRows] = await db.execute(
      `
      SELECT
          u.user_id,
          u.username,
          u.role_id,

          r.role_name,

          s.student_id,
          s.student_number,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.course_id,
          s.year_level

      FROM users u

      INNER JOIN roles r
          ON r.role_id = u.role_id

      INNER JOIN students s
          ON s.user_id = u.user_id

      WHERE u.user_id = ?
        AND r.role_name = 'Student'

      LIMIT 1
      `,
      [userId],
    );

    if (studentRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "User is not a valid Student account.",
      });
    }

    const student = studentRows[0];

    // =================================================
    // 3. GET ASSIGNED CURRICULUM
    // =================================================

    const [curriculumRows] = await db.execute(
      `
      SELECT
          sc.student_curriculum_id,
          sc.student_id,
          sc.curriculum_id,

          sc.assigned_date,
          sc.status AS curriculum_status,
          sc.remarks,

          cur.course_id,
          cur.curriculum_name,
          cur.effective_year,
          cur.total_units,
          cur.is_active,

          c.course_code,
          c.course_name

      FROM student_curriculum sc

      INNER JOIN curriculum cur
          ON cur.curriculum_id = sc.curriculum_id

      INNER JOIN courses c
          ON c.course_id = cur.course_id

      WHERE sc.student_id = ?

      ORDER BY
          CASE
              WHEN sc.status = 'Active' THEN 1
              ELSE 2
          END,

          sc.assigned_date DESC,
          sc.student_curriculum_id DESC

      LIMIT 1
      `,
      [student.student_id],
    );

    if (curriculumRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No curriculum is assigned to this student.",
      });
    }

    const curriculum = curriculumRows[0];

    // =================================================
    // 4. GET OPEN ENROLLMENT PERIOD
    // =================================================

    const [periodRows] = await db.execute(
      `
      SELECT
          ep.enrollment_period_id,

          ep.academic_year_id,
          ay.academic_year,

          ep.semester_id,
          sem.semester_name,

          ep.status,

          ep.opened_by,
          ep.opened_at,

          ep.closed_by,
          ep.closed_at,

          ep.remarks

      FROM enrollment_periods ep

      INNER JOIN academic_years ay
          ON ay.academic_year_id = ep.academic_year_id

      INNER JOIN semesters sem
          ON sem.semester_id = ep.semester_id

      WHERE ep.status = 'Open'

      ORDER BY
          ep.enrollment_period_id DESC

      LIMIT 1
      `,
    );

    // =================================================
    // 5. ENROLLMENT CLOSED
    // =================================================

    if (periodRows.length === 0) {
      return res.status(200).json({
        success: true,

        message: "Enrollment is currently closed.",

        student: {
          student_id: Number(student.student_id),

          student_number: student.student_number,

          student_name: `${student.first_name}${
            student.middle_name ? ` ${student.middle_name}` : ""
          } ${student.last_name}`,

          course_id: Number(student.course_id),

          year_level: Number(student.year_level),

          enrollment_type: "Regular",
        },

        curriculum: {
          student_curriculum_id: Number(curriculum.student_curriculum_id),

          curriculum_id: Number(curriculum.curriculum_id),

          curriculum_name: curriculum.curriculum_name,

          effective_year: Number(curriculum.effective_year),

          total_units: Number(curriculum.total_units || 0),

          is_active: Boolean(curriculum.is_active),

          course: {
            course_id: Number(curriculum.course_id),

            course_code: curriculum.course_code,

            course_name: curriculum.course_name,
          },
        },

        enrollment_period: null,

        enrollment: null,

        summary: {
          total_subjects: 0,
          regular_subjects: 0,
          retake_subjects: 0,
          total_units: 0,
          enrollment_type: "Regular",
        },

        subjects: [],
      });
    }

    const enrollmentPeriod = periodRows[0];

    const academicYearId = Number(enrollmentPeriod.academic_year_id);

    const semesterId = Number(enrollmentPeriod.semester_id);

    const yearLevel = Number(student.year_level);

    // =================================================
    // 6. GET CURRENT ENROLLMENT
    // =================================================

    const [enrollmentRows] = await db.execute(
      `
      SELECT
          e.enrollment_id,
          e.student_id,

          e.academic_year_id,
          ay.academic_year,

          e.semester_id,
          sem.semester_name,

          e.enrollment_status,
          e.remarks,

          e.approved_by,
          e.approved_at,

          e.created_at

      FROM enrollments e

      INNER JOIN academic_years ay
          ON ay.academic_year_id = e.academic_year_id

      INNER JOIN semesters sem
          ON sem.semester_id = e.semester_id

      WHERE e.student_id = ?
        AND e.academic_year_id = ?
        AND e.semester_id = ?

      ORDER BY
          e.created_at DESC,
          e.enrollment_id DESC

      LIMIT 1
      `,
      [student.student_id, academicYearId, semesterId],
    );

    // =================================================
    // 7. NO CURRENT ENROLLMENT
    // =================================================

    if (enrollmentRows.length === 0) {
      return res.status(200).json({
        success: true,

        message: "No current enrollment found for the open enrollment period.",

        student: {
          student_id: Number(student.student_id),

          student_number: student.student_number,

          student_name: `${student.first_name}${
            student.middle_name ? ` ${student.middle_name}` : ""
          } ${student.last_name}`,

          course_id: Number(student.course_id),

          year_level: Number(student.year_level),

          enrollment_type: "Regular",
        },

        curriculum: {
          student_curriculum_id: Number(curriculum.student_curriculum_id),

          curriculum_id: Number(curriculum.curriculum_id),

          curriculum_name: curriculum.curriculum_name,

          effective_year: Number(curriculum.effective_year),

          total_units: Number(curriculum.total_units || 0),

          is_active: Boolean(curriculum.is_active),

          course: {
            course_id: Number(curriculum.course_id),

            course_code: curriculum.course_code,

            course_name: curriculum.course_name,
          },
        },

        enrollment_period: {
          enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

          academic_year_id: academicYearId,

          academic_year: enrollmentPeriod.academic_year,

          semester_id: semesterId,

          semester_name: enrollmentPeriod.semester_name,

          status: enrollmentPeriod.status,

          opened_by: enrollmentPeriod.opened_by,

          opened_at: enrollmentPeriod.opened_at,

          closed_by: enrollmentPeriod.closed_by,

          closed_at: enrollmentPeriod.closed_at,

          remarks: enrollmentPeriod.remarks,
        },

        enrollment: null,

        summary: {
          total_subjects: 0,
          regular_subjects: 0,
          retake_subjects: 0,
          total_units: 0,
          enrollment_type: "Regular",
        },

        subjects: [],
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // 8. GET STUDENT GRADES
    //
    // 1 - 3 = Passed
    // 4     = Incomplete / Retake
    // 5     = Failed / Retake
    //
    // Priority:
    // Final
    // Midterm
    // Prelim
    // =================================================

    const [academicRows] = await db.execute(
      `
      SELECT
          g.grade_id,
          g.student_id,
          g.subject_id,
          g.enrollment_id,

          g.prelim_grade,
          g.midterm_grade,
          g.final_grade,

          g.remarks,

          sub.subject_code,
          sub.subject_name,
          sub.units,
          sub.lecture_hours,
          sub.laboratory_hours

      FROM grades g

      INNER JOIN subjects sub
          ON sub.subject_id = g.subject_id

      WHERE g.student_id = ?

      ORDER BY
          g.subject_id ASC,
          g.enrollment_id DESC,
          g.grade_id DESC
      `,
      [student.student_id],
    );

    // =================================================
    // 9. BUILD ACADEMIC MAP
    // =================================================

    const academicMap = new Map();

    for (const row of academicRows) {
      const subjectId = Number(row.subject_id);

      if (academicMap.has(subjectId)) {
        continue;
      }

      let grade = null;

      if (row.final_grade !== null && row.final_grade !== "") {
        grade = Number(row.final_grade);
      } else if (row.midterm_grade !== null && row.midterm_grade !== "") {
        grade = Number(row.midterm_grade);
      } else if (row.prelim_grade !== null && row.prelim_grade !== "") {
        grade = Number(row.prelim_grade);
      }

      if (grade !== null && Number.isNaN(grade)) {
        grade = null;
      }

      let academicStatus = "Not Taken";
      let enrollmentType = "Regular";

      if (grade !== null && grade >= 1 && grade <= 3) {
        academicStatus = "Passed";
      } else if (grade === 4 || grade === 5) {
        academicStatus = "Retake";
        enrollmentType = "Retake";
      } else if (grade === null && row.remarks) {
        const remarks = String(row.remarks).trim().toLowerCase();

        if (remarks === "passed") {
          academicStatus = "Passed";
        } else if (
          remarks === "retake" ||
          remarks === "failed" ||
          remarks === "incomplete"
        ) {
          academicStatus = "Retake";
          enrollmentType = "Retake";
        }
      }

      academicMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: row.subject_code,

        subject_name: row.subject_name,

        units: Number(row.units || 0),

        lecture_hours: row.lecture_hours,

        laboratory_hours: row.laboratory_hours,

        grade,

        remarks: row.remarks,

        academic_status: academicStatus,

        enrollment_type: enrollmentType,

        enrollment_id: Number(row.enrollment_id),

        grade_id: Number(row.grade_id),
      });
    }

    // =================================================
    // 10. GET CURRENT CURRICULUM SUBJECTS
    // =================================================

    const [curriculumSubjects] = await db.execute(
      `
      SELECT
          cs.curriculum_subject_id,

          cs.subject_id,
          cs.year_level,
          cs.semester_id,

          cs.is_required,
          cs.display_order,

          s.subject_code,
          s.subject_name,
          s.units,
          s.lecture_hours,
          s.laboratory_hours

      FROM curriculum_subjects cs

      INNER JOIN subjects s
          ON s.subject_id = cs.subject_id

      WHERE cs.curriculum_id = ?
        AND cs.year_level = ?
        AND cs.semester_id = ?

      ORDER BY
          cs.display_order ASC,
          s.subject_code ASC
      `,
      [Number(curriculum.curriculum_id), yearLevel, semesterId],
    );

    // =================================================
    // 11. BUILD SUBJECT MAP
    // =================================================

    const subjectMap = new Map();

    // =================================================
    // 12. ADD CURRICULUM SUBJECTS
    // =================================================

    for (const row of curriculumSubjects) {
      const subjectId = Number(row.subject_id);

      const academicRecord = academicMap.get(subjectId);

      // Passed subjects are already completed.
      if (academicRecord && academicRecord.academic_status === "Passed") {
        continue;
      }

      // =================================================
      // RETAKE SUBJECT
      // =================================================

      if (academicRecord && academicRecord.academic_status === "Retake") {
        subjectMap.set(subjectId, {
          subject_id: subjectId,

          subject_code: row.subject_code,

          subject_name: row.subject_name,

          units: Number(row.units || 0),

          lecture_hours: row.lecture_hours,

          laboratory_hours: row.laboratory_hours,

          year_level: Number(row.year_level),

          semester_id: Number(row.semester_id),

          is_required: Boolean(row.is_required),

          display_order: Number(row.display_order),

          enrollment_type: "Retake",

          academic_status: "Retake",

          previous_grade: academicRecord.grade,

          remarks: academicRecord.remarks,

          curriculum_subject_id: Number(row.curriculum_subject_id),
        });

        continue;
      }

      // =================================================
      // REGULAR SUBJECT
      // =================================================

      subjectMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: row.subject_code,

        subject_name: row.subject_name,

        units: Number(row.units || 0),

        lecture_hours: row.lecture_hours,

        laboratory_hours: row.laboratory_hours,

        year_level: Number(row.year_level),

        semester_id: Number(row.semester_id),

        is_required: Boolean(row.is_required),

        display_order: Number(row.display_order),

        enrollment_type: "Regular",

        academic_status: "Not Taken",

        previous_grade: null,

        remarks: null,

        curriculum_subject_id: Number(row.curriculum_subject_id),
      });
    }

    // =================================================
    // 13. ADD OLD RETAKE SUBJECTS
    // =================================================

    for (const academicRecord of academicMap.values()) {
      if (academicRecord.academic_status !== "Retake") {
        continue;
      }

      const subjectId = Number(academicRecord.subject_id);

      if (subjectMap.has(subjectId)) {
        continue;
      }

      subjectMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: academicRecord.subject_code,

        subject_name: academicRecord.subject_name,

        units: Number(academicRecord.units || 0),

        lecture_hours: academicRecord.lecture_hours,

        laboratory_hours: academicRecord.laboratory_hours,

        year_level: null,

        semester_id: null,

        is_required: false,

        display_order: 999999,

        enrollment_type: "Retake",

        academic_status: "Retake",

        previous_grade: academicRecord.grade,

        remarks: academicRecord.remarks,

        curriculum_subject_id: null,
      });
    }

    // =================================================
    // 14. GET CURRENT ENROLLMENT SUBJECTS
    // =================================================

    const [currentEnrollmentSubjects] = await db.execute(
      `
      SELECT
          es.enrollment_subject_id,
          es.enrollment_id,

          es.subject_id,
          es.section_id,

          es.status

      FROM enrollment_subjects es

      WHERE es.enrollment_id = ?

      ORDER BY
          es.enrollment_subject_id ASC
      `,
      [Number(enrollment.enrollment_id)],
    );

    // =================================================
    // 15. BUILD CURRENT SUBJECT MAP
    // =================================================

    const currentSubjectMap = new Map();

    for (const row of currentEnrollmentSubjects) {
      currentSubjectMap.set(Number(row.subject_id), {
        enrollment_subject_id: Number(row.enrollment_subject_id),

        enrollment_id: Number(row.enrollment_id),

        subject_id: Number(row.subject_id),

        section_id: row.section_id !== null ? Number(row.section_id) : null,

        status: row.status,
      });
    }

    // =================================================
    // 16. GET AVAILABLE SECTIONS
    //
    // READ-ONLY.
    //
    // Student cannot choose these sections.
    // Registrar assigns the section.
    // =================================================

    const subjectIds = Array.from(subjectMap.keys());

    const availableSectionsMap = new Map();

    if (subjectIds.length > 0) {
      const placeholders = subjectIds.map(() => "?").join(",");

      const [sectionRows] = await db.execute(
        `
        SELECT
            ss.section_subject_id,

            ss.section_id,
            ss.subject_id,

            ss.academic_year_id,
            ss.semester_id,

            ss.max_students AS subject_max_students,
            ss.status AS section_subject_status,

            sec.section_name,
            sec.course_id,
            sec.year_level,
            sec.max_students AS section_max_students,

            s.subject_code,
            s.subject_name,

            COUNT(
                CASE
                    WHEN es.status = 'Enrolled'
                    THEN es.enrollment_subject_id
                END
            ) AS enrolled_students

        FROM section_subjects ss

        INNER JOIN sections sec
            ON sec.section_id = ss.section_id

        INNER JOIN subjects s
            ON s.subject_id = ss.subject_id

        LEFT JOIN enrollment_subjects es
            ON es.section_id = ss.section_id
            AND es.subject_id = ss.subject_id
            AND es.status = 'Enrolled'

        WHERE ss.subject_id IN (${placeholders})

          AND ss.academic_year_id = ?

          AND ss.semester_id = ?

          AND ss.status = 'Open'

        GROUP BY
            ss.section_subject_id,
            ss.section_id,
            ss.subject_id,
            ss.academic_year_id,
            ss.semester_id,
            ss.max_students,
            ss.status,

            sec.section_name,
            sec.course_id,
            sec.year_level,
            sec.max_students,

            s.subject_code,
            s.subject_name

        ORDER BY
            ss.subject_id ASC,
            sec.section_name ASC
        `,
        [...subjectIds, academicYearId, semesterId],
      );

      for (const row of sectionRows) {
        const subjectId = Number(row.subject_id);

        const maxStudents = Number(
          row.subject_max_students ?? row.section_max_students ?? 50,
        );

        const enrolledStudents = Number(row.enrolled_students || 0);

        const availableSlots = Math.max(maxStudents - enrolledStudents, 0);

        if (!availableSectionsMap.has(subjectId)) {
          availableSectionsMap.set(subjectId, []);
        }

        availableSectionsMap.get(subjectId).push({
          section_subject_id: Number(row.section_subject_id),

          section_id: Number(row.section_id),

          subject_id: subjectId,

          subject_code: row.subject_code,

          subject_name: row.subject_name,

          section_name: row.section_name,

          course_id: Number(row.course_id),

          year_level: Number(row.year_level),

          academic_year_id: Number(row.academic_year_id),

          semester_id: Number(row.semester_id),

          max_students: maxStudents,

          enrolled_students: enrolledStudents,

          available_slots: availableSlots,

          status: row.section_subject_status,
        });
      }
    }

    // =================================================
    // 17. BUILD FINAL SUBJECT LIST
    // =================================================

    const subjects = [];

    for (const subject of subjectMap.values()) {
      const subjectId = Number(subject.subject_id);

      const currentEnrollmentSubject = currentSubjectMap.get(subjectId);

      const availableSections = availableSectionsMap.get(subjectId) || [];

      let assignedSection = null;

      // =================================================
      // FIND CURRENT ASSIGNED SECTION
      // =================================================

      if (
        currentEnrollmentSubject &&
        currentEnrollmentSubject.section_id !== null
      ) {
        assignedSection =
          availableSections.find(
            (section) =>
              section.section_id === currentEnrollmentSubject.section_id,
          ) || null;
      }

      // =================================================
      // IF CURRENT SECTION IS NO LONGER OPEN
      // LOOK IT UP DIRECTLY
      // =================================================

      if (
        currentEnrollmentSubject &&
        currentEnrollmentSubject.section_id !== null &&
        !assignedSection
      ) {
        const [assignedRows] = await db.execute(
          `
          SELECT
              ss.section_subject_id,

              ss.section_id,
              ss.subject_id,

              ss.academic_year_id,
              ss.semester_id,

              ss.max_students AS subject_max_students,
              ss.status AS section_subject_status,

              sec.section_name,
              sec.course_id,
              sec.year_level,
              sec.max_students AS section_max_students,

              s.subject_code,
              s.subject_name

          FROM section_subjects ss

          INNER JOIN sections sec
              ON sec.section_id = ss.section_id

          INNER JOIN subjects s
              ON s.subject_id = ss.subject_id

          WHERE ss.section_id = ?

            AND ss.subject_id = ?

          LIMIT 1
          `,
          [currentEnrollmentSubject.section_id, subjectId],
        );

        if (assignedRows.length > 0) {
          const row = assignedRows[0];

          assignedSection = {
            section_subject_id: Number(row.section_subject_id),

            section_id: Number(row.section_id),

            subject_id: Number(row.subject_id),

            subject_code: row.subject_code,

            subject_name: row.subject_name,

            section_name: row.section_name,

            course_id: Number(row.course_id),

            year_level: Number(row.year_level),

            academic_year_id: Number(row.academic_year_id),

            semester_id: Number(row.semester_id),

            max_students: Number(
              row.subject_max_students ?? row.section_max_students ?? 50,
            ),

            enrolled_students: 0,

            available_slots: 0,

            status: row.section_subject_status,
          };
        }
      }

      subjects.push({
        subject_id: subjectId,

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        lecture_hours: subject.lecture_hours,

        laboratory_hours: subject.laboratory_hours,

        year_level: subject.year_level,

        semester_id: subject.semester_id,

        is_required: Boolean(subject.is_required),

        display_order: Number(subject.display_order || 999999),

        enrollment_type: subject.enrollment_type,

        academic_status: subject.academic_status,

        previous_grade: subject.previous_grade,

        remarks: subject.remarks,

        curriculum_subject_id: subject.curriculum_subject_id,

        enrollment_subject_id:
          currentEnrollmentSubject?.enrollment_subject_id ?? null,

        enrollment_subject_status: currentEnrollmentSubject?.status ?? null,

        assigned_section: assignedSection,

        has_available_sections: availableSections.length > 0,

        available_sections: availableSections,
      });
    }

    // =================================================
    // 18. SORT SUBJECTS
    //
    // Regular first.
    // Retakes after regular.
    // =================================================

    subjects.sort((a, b) => {
      if (a.enrollment_type === "Regular" && b.enrollment_type === "Retake") {
        return -1;
      }

      if (a.enrollment_type === "Retake" && b.enrollment_type === "Regular") {
        return 1;
      }

      return (
        Number(a.display_order || 999999) - Number(b.display_order || 999999)
      );
    });

    // =================================================
    // 19. DETERMINE ENROLLMENT TYPE
    // =================================================

    const hasRetakes = subjects.some(
      (subject) => subject.enrollment_type === "Retake",
    );

    const studentEnrollmentType = hasRetakes ? "Irregular" : "Regular";

    // =================================================
    // 20. TOTAL UNITS
    // =================================================

    const totalUnits = subjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    // =================================================
    // 21. SUBJECT COUNTS
    // =================================================

    const regularSubjectCount = subjects.filter(
      (subject) => subject.enrollment_type === "Regular",
    ).length;

    const retakeSubjectCount = subjects.filter(
      (subject) => subject.enrollment_type === "Retake",
    ).length;

    // =================================================
    // 22. FINAL RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Student enrollment prepared successfully.",

      student: {
        user_id: Number(student.user_id),

        username: student.username,

        student_id: Number(student.student_id),

        student_number: student.student_number,

        first_name: student.first_name,

        middle_name: student.middle_name,

        last_name: student.last_name,

        student_name: `${student.first_name}${
          student.middle_name ? ` ${student.middle_name}` : ""
        } ${student.last_name}`,

        course_id: Number(student.course_id),

        year_level: Number(student.year_level),

        enrollment_type: studentEnrollmentType,
      },

      curriculum: {
        student_curriculum_id: Number(curriculum.student_curriculum_id),

        curriculum_id: Number(curriculum.curriculum_id),

        curriculum_name: curriculum.curriculum_name,

        effective_year: Number(curriculum.effective_year),

        total_units: Number(curriculum.total_units || 0),

        is_active: Boolean(curriculum.is_active),

        course: {
          course_id: Number(curriculum.course_id),

          course_code: curriculum.course_code,

          course_name: curriculum.course_name,
        },
      },

      enrollment_period: {
        enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

        academic_year_id: academicYearId,

        academic_year: enrollmentPeriod.academic_year,

        semester_id: semesterId,

        semester_name: enrollmentPeriod.semester_name,

        status: enrollmentPeriod.status,

        opened_by: enrollmentPeriod.opened_by,

        opened_at: enrollmentPeriod.opened_at,

        closed_by: enrollmentPeriod.closed_by,

        closed_at: enrollmentPeriod.closed_at,

        remarks: enrollmentPeriod.remarks,
      },

      enrollment: {
        enrollment_id: Number(enrollment.enrollment_id),

        student_id: Number(enrollment.student_id),

        academic_year_id: Number(enrollment.academic_year_id),

        academic_year: enrollment.academic_year,

        semester_id: Number(enrollment.semester_id),

        semester_name: enrollment.semester_name,

        enrollment_status: enrollment.enrollment_status,

        remarks: enrollment.remarks,

        approved_by: enrollment.approved_by,

        approved_at: enrollment.approved_at,

        created_at: enrollment.created_at,
      },

      summary: {
        total_subjects: subjects.length,

        regular_subjects: regularSubjectCount,

        retake_subjects: retakeSubjectCount,

        total_units: totalUnits,

        enrollment_type: studentEnrollmentType,
      },

      subjects,
    });
  } catch (error) {
    console.error("GET STUDENT ENROLLMENT SUBJECTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load student enrollment subjects.",

      error: error.message,
    });
  }
});
// =====================================================
// PREPARE STUDENT ENROLLMENT
//
// POST /api/student/enrollments/prepare
//
// The system prepares the student's enrollment based on:
//
// - Assigned curriculum
// - Student year level
// - Current enrollment period
// - Curriculum subjects
// - Previous grades
// - Required retakes
//
// STUDENT DOES NOT SELECT SUBJECTS.
//
// STUDENT DOES NOT SELECT SECTIONS.
//
// Sections are assigned by the Registrar.
// =====================================================

router.post("/prepare", async (req, res) => {
  let connection;

  try {
    // =================================================
    // 1. GET USER ID
    // =================================================

    const userId = Number(req.body?.user_id || req.query?.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid user_id is required.",
      });
    }

    // =================================================
    // 2. DATABASE CONNECTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // 3. VERIFY STUDENT
    // =================================================

    const [studentRows] = await connection.execute(
      `
      SELECT
          u.user_id,
          u.username,
          u.role_id,

          r.role_name,

          s.student_id,
          s.student_number,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.course_id,
          s.year_level

      FROM users u

      INNER JOIN roles r
          ON r.role_id = u.role_id

      INNER JOIN students s
          ON s.user_id = u.user_id

      WHERE u.user_id = ?
        AND r.role_name = 'Student'

      LIMIT 1
      `,
      [userId],
    );

    if (studentRows.length === 0) {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message: "User is not a valid Student account.",
      });
    }

    const student = studentRows[0];

    const studentId = Number(student.student_id);

    const yearLevel = Number(student.year_level);

    // =================================================
    // 4. GET ASSIGNED CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
      SELECT
          sc.student_curriculum_id,
          sc.student_id,
          sc.curriculum_id,

          sc.assigned_date,
          sc.status AS curriculum_status,
          sc.remarks,

          cur.course_id,
          cur.curriculum_name,
          cur.effective_year,
          cur.total_units,
          cur.is_active,

          c.course_code,
          c.course_name

      FROM student_curriculum sc

      INNER JOIN curriculum cur
          ON cur.curriculum_id = sc.curriculum_id

      INNER JOIN courses c
          ON c.course_id = cur.course_id

      WHERE sc.student_id = ?

      ORDER BY
          CASE
              WHEN sc.status = 'Active' THEN 1
              ELSE 2
          END,

          sc.assigned_date DESC,
          sc.student_curriculum_id DESC

      LIMIT 1
      `,
      [studentId],
    );

    if (curriculumRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "No curriculum is assigned to this student.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 5. GET OPEN ENROLLMENT PERIOD
    // =================================================

    const [periodRows] = await connection.execute(
      `
      SELECT
          ep.enrollment_period_id,

          ep.academic_year_id,
          ay.academic_year,

          ep.semester_id,
          sem.semester_name,

          ep.status,

          ep.opened_by,
          ep.opened_at,

          ep.closed_by,
          ep.closed_at,

          ep.remarks

      FROM enrollment_periods ep

      INNER JOIN academic_years ay
          ON ay.academic_year_id = ep.academic_year_id

      INNER JOIN semesters sem
          ON sem.semester_id = ep.semester_id

      WHERE ep.status = 'Open'

      ORDER BY
          ep.enrollment_period_id DESC

      LIMIT 1

      FOR UPDATE
      `,
    );

    if (periodRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Enrollment is currently closed.",
      });
    }

    const enrollmentPeriod = periodRows[0];

    const academicYearId = Number(enrollmentPeriod.academic_year_id);

    const semesterId = Number(enrollmentPeriod.semester_id);
    // =================================================
    // 6. CHECK EXISTING ENROLLMENT
    // =================================================

    const [existingEnrollmentRows] = await connection.execute(
      `
  SELECT
      enrollment_id,
      student_id,
      academic_year_id,
      semester_id,
      enrollment_status,
      remarks,
      approved_by,
      approved_at,
      created_at

  FROM enrollments

  WHERE student_id = ?
    AND academic_year_id = ?
    AND semester_id = ?

  ORDER BY
      created_at DESC,
      enrollment_id DESC

  LIMIT 1

  FOR UPDATE
  `,
      [studentId, academicYearId, semesterId],
    );

    // =================================================
    // 7. CHECK EXISTING ENROLLMENT STATUS
    // =================================================
    //
    // Enrollment lifecycle:
    //
    // Draft
    //   ↓
    // Pending
    //   ↓
    // Approved
    //
    // OR
    //
    // Pending
    //   ↓
    // Rejected
    //   ↓
    // New Draft
    //
    // IMPORTANT:
    // Approved enrollment must NEVER be overwritten.
    // Pending enrollment must NEVER be duplicated.
    // Draft enrollment must NEVER be duplicated.
    //
    // A Rejected enrollment may be followed by a new
    // Draft enrollment so the student can restart.
    // =================================================

    if (existingEnrollmentRows.length > 0) {
      const existingEnrollment = existingEnrollmentRows[0];

      const existingStatus = String(existingEnrollment.enrollment_status || "")
        .trim()
        .toLowerCase();

      // =================================================
      // ACTIVE ENROLLMENT ALREADY EXISTS
      // =================================================

      if (
        existingStatus === "draft" ||
        existingStatus === "pending" ||
        existingStatus === "approved"
      ) {
        await connection.rollback();

        return res.status(409).json({
          success: false,

          message: `A ${existingEnrollment.enrollment_status} enrollment already exists for this student and enrollment period. A new enrollment cannot be created until the current enrollment is completed or rejected.`,

          enrollment: {
            enrollment_id: Number(existingEnrollment.enrollment_id),

            student_id: Number(existingEnrollment.student_id),

            academic_year_id: Number(existingEnrollment.academic_year_id),

            semester_id: Number(existingEnrollment.semester_id),

            enrollment_status: existingEnrollment.enrollment_status,

            remarks: existingEnrollment.remarks,

            approved_by: existingEnrollment.approved_by,

            approved_at: existingEnrollment.approved_at,

            created_at: existingEnrollment.created_at,
          },
        });
      }

      // =================================================
      // REJECTED ENROLLMENT
      // =================================================
      //
      // Rejected enrollment is historical.
      //
      // DO NOT delete it.
      // DO NOT modify it.
      //
      // A new Draft enrollment may be created below.
      // =================================================

      if (existingStatus === "rejected") {
        console.log(
          `Previous enrollment ${existingEnrollment.enrollment_id} was rejected. Creating a new Draft enrollment.`,
        );
      }

      // =================================================
      // OTHER TERMINAL STATUSES
      // =================================================
      //
      // If your database uses Cancelled/Dropped/etc.,
      // they can also allow a new enrollment.
      // =================================================

      if (existingStatus === "cancelled" || existingStatus === "dropped") {
        console.log(
          `Previous enrollment ${existingEnrollment.enrollment_id} has terminal status "${existingEnrollment.enrollment_status}". Creating a new Draft enrollment.`,
        );
      }
    }
    // =================================================
    // 8. GET CURRICULUM SUBJECTS
    //
    // ONLY subjects belonging to:
    //
    // assigned curriculum
    // +
    // student's current year level
    // +
    // current semester
    // =================================================

    const [curriculumSubjects] = await connection.execute(
      `
      SELECT
          cs.curriculum_subject_id,

          cs.subject_id,
          cs.year_level,
          cs.semester_id,

          cs.is_required,
          cs.display_order,

          s.subject_code,
          s.subject_name,
          s.units,
          s.lecture_hours,
          s.laboratory_hours

      FROM curriculum_subjects cs

      INNER JOIN subjects s
          ON s.subject_id = cs.subject_id

      WHERE cs.curriculum_id = ?
        AND cs.year_level = ?
        AND cs.semester_id = ?

      ORDER BY
          cs.display_order ASC,
          s.subject_code ASC
      `,
      [curriculumId, yearLevel, semesterId],
    );

    // =================================================
    // 9. GET PREVIOUS GRADES
    //
    // 1 - 3 = Passed
    // 4     = Incomplete / Retake
    // 5     = Failed / Retake
    // =================================================

    const [gradeRows] = await connection.execute(
      `
      SELECT
          g.grade_id,
          g.student_id,
          g.subject_id,
          g.enrollment_id,

          g.prelim_grade,
          g.midterm_grade,
          g.final_grade,

          g.remarks

      FROM grades g

      WHERE g.student_id = ?

      ORDER BY
          g.subject_id ASC,
          g.enrollment_id DESC,
          g.grade_id DESC
      `,
      [studentId],
    );

    // =================================================
    // 10. BUILD LATEST ACADEMIC RECORD MAP
    // =================================================

    const academicMap = new Map();

    for (const row of gradeRows) {
      const subjectId = Number(row.subject_id);

      if (academicMap.has(subjectId)) {
        continue;
      }

      let grade = null;

      if (row.final_grade !== null && row.final_grade !== "") {
        grade = Number(row.final_grade);
      } else if (row.midterm_grade !== null && row.midterm_grade !== "") {
        grade = Number(row.midterm_grade);
      } else if (row.prelim_grade !== null && row.prelim_grade !== "") {
        grade = Number(row.prelim_grade);
      }

      if (grade !== null && Number.isNaN(grade)) {
        grade = null;
      }

      let academicStatus = "Not Taken";

      if (grade !== null && grade >= 1 && grade <= 3) {
        academicStatus = "Passed";
      } else if (grade === 4 || grade === 5) {
        academicStatus = "Retake";
      } else if (grade === null && row.remarks) {
        const remarks = String(row.remarks).trim().toLowerCase();

        if (remarks === "passed") {
          academicStatus = "Passed";
        } else if (
          remarks === "retake" ||
          remarks === "failed" ||
          remarks === "incomplete"
        ) {
          academicStatus = "Retake";
        }
      }

      academicMap.set(subjectId, {
        subject_id: subjectId,
        grade,
        remarks: row.remarks,
        academic_status: academicStatus,
      });
    }

    // =================================================
    // 11. PREPARE SUBJECT LIST
    //
    // Passed subjects:
    //     DO NOT include.
    //
    // Not taken:
    //     Include as Regular.
    //
    // Retake:
    //     Include as Retake.
    // =================================================

    const preparedSubjects = new Map();

    for (const row of curriculumSubjects) {
      const subjectId = Number(row.subject_id);

      const academicRecord = academicMap.get(subjectId);

      // ---------------------------------------------
      // PASSED
      // ---------------------------------------------

      if (academicRecord && academicRecord.academic_status === "Passed") {
        continue;
      }

      // ---------------------------------------------
      // RETAKE
      // ---------------------------------------------

      if (academicRecord && academicRecord.academic_status === "Retake") {
        preparedSubjects.set(subjectId, {
          subject_id: subjectId,

          enrollment_type: "Retake",

          curriculum_subject_id: Number(row.curriculum_subject_id),

          previous_grade: academicRecord.grade,

          remarks: academicRecord.remarks,

          section_id: null,
        });

        continue;
      }

      // ---------------------------------------------
      // REGULAR
      // ---------------------------------------------

      preparedSubjects.set(subjectId, {
        subject_id: subjectId,

        enrollment_type: "Regular",

        curriculum_subject_id: Number(row.curriculum_subject_id),

        previous_grade: null,

        remarks: null,

        section_id: null,
      });
    }

    // =================================================
    // 12. ADD OLD RETAKE SUBJECTS
    //
    // A failed/incomplete subject from an older
    // curriculum semester must still be retaken.
    //
    // It should NOT need to belong to the current
    // year-level/semester curriculum list.
    // =================================================

    for (const academicRecord of academicMap.values()) {
      if (academicRecord.academic_status !== "Retake") {
        continue;
      }

      const subjectId = Number(academicRecord.subject_id);

      if (preparedSubjects.has(subjectId)) {
        continue;
      }

      preparedSubjects.set(subjectId, {
        subject_id: subjectId,

        enrollment_type: "Retake",

        curriculum_subject_id: null,

        previous_grade: academicRecord.grade,

        remarks: academicRecord.remarks,

        section_id: null,
      });
    }

    // =================================================
    // 13. REQUIRE AT LEAST ONE SUBJECT
    // =================================================

    if (preparedSubjects.size === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "No subjects are available for this enrollment. The student may already have completed the required subjects for this period.",

        total_subjects: 0,
      });
    }

    // =================================================
    // 14. CREATE DRAFT ENROLLMENT
    // =================================================

    const [enrollmentResult] = await connection.execute(
      `
        INSERT INTO enrollments (
            student_id,
            academic_year_id,
            semester_id,
            enrollment_status,
            approved_by,
            approved_at,
            remarks
        )

        VALUES (
            ?,
            ?,
            ?,
            'Draft',
            NULL,
            NULL,
            ?
        )
        `,
      [studentId, academicYearId, semesterId, "Prepared by system"],
    );

    const enrollmentId = Number(enrollmentResult.insertId);

    // =================================================
    // 15. INSERT PREPARED SUBJECTS
    //
    // section_id intentionally starts NULL.
    //
    // Registrar assigns the section later.
    // =================================================

    for (const subject of preparedSubjects.values()) {
      await connection.execute(
        `
        INSERT INTO enrollment_subjects (
            enrollment_id,
            subject_id,
            section_id,
            status
        )

        VALUES (
            ?,
            ?,
            NULL,
            'Pending'
        )
        `,
        [enrollmentId, Number(subject.subject_id)],
      );
    }

    // =================================================
    // 16. COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // 17. BUILD RESPONSE
    // =================================================

    const preparedSubjectList = Array.from(preparedSubjects.values());

    const regularSubjects = preparedSubjectList.filter(
      (subject) => subject.enrollment_type === "Regular",
    );

    const retakeSubjects = preparedSubjectList.filter(
      (subject) => subject.enrollment_type === "Retake",
    );

    // =================================================
    // 18. SUCCESS
    // =================================================

    return res.status(201).json({
      success: true,

      message: "Student enrollment prepared successfully.",

      student: {
        user_id: Number(student.user_id),

        username: student.username,

        student_id: studentId,

        student_number: student.student_number,

        student_name: `${student.first_name}${
          student.middle_name ? ` ${student.middle_name}` : ""
        } ${student.last_name}`,

        course_id: Number(student.course_id),

        year_level: yearLevel,

        enrollment_type: retakeSubjects.length > 0 ? "Irregular" : "Regular",
      },

      enrollment_period: {
        enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

        academic_year_id: academicYearId,

        academic_year: enrollmentPeriod.academic_year,

        semester_id: semesterId,

        semester_name: enrollmentPeriod.semester_name,

        status: enrollmentPeriod.status,
      },

      curriculum: {
        student_curriculum_id: Number(curriculum.student_curriculum_id),

        curriculum_id: curriculumId,

        curriculum_name: curriculum.curriculum_name,

        course: {
          course_id: Number(curriculum.course_id),

          course_code: curriculum.course_code,

          course_name: curriculum.course_name,
        },
      },

      enrollment: {
        enrollment_id: enrollmentId,

        student_id: studentId,

        academic_year_id: academicYearId,

        academic_year: enrollmentPeriod.academic_year,

        semester_id: semesterId,

        semester_name: enrollmentPeriod.semester_name,

        enrollment_status: "Draft",

        approved_by: null,

        approved_at: null,

        remarks: "Prepared by system",
      },

      summary: {
        total_subjects: preparedSubjectList.length,

        regular_subjects: regularSubjects.length,

        retake_subjects: retakeSubjects.length,

        enrollment_type: retakeSubjects.length > 0 ? "Irregular" : "Regular",
      },

      subjects: preparedSubjectList.map((subject) => ({
        subject_id: Number(subject.subject_id),

        enrollment_type: subject.enrollment_type,

        curriculum_subject_id: subject.curriculum_subject_id,

        previous_grade: subject.previous_grade,

        remarks: subject.remarks,

        section_id: null,

        status: "Pending",
      })),
    });
  } catch (error) {
    // =================================================
    // ROLLBACK
    // =================================================

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("PREPARE ENROLLMENT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("PREPARE STUDENT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to prepare student enrollment.",

      error: error.message,
    });
  } finally {
    // =================================================
    // RELEASE CONNECTION
    // =================================================

    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// SUBMIT STUDENT ENROLLMENT
//
// POST /api/student/enrollments/:enrollment_id/submit
//
// IMPORTANT:
//
// Student does NOT:
// - Select subjects
// - Add subjects
// - Remove subjects
// - Select sections
// - Change sections
// - Transfer sections
// - Select retakes
//
// Student only submits the enrollment prepared by
// the Registrar/system.
//
// FLOW:
//
// Draft
//   ↓
// Student submits
//   ↓
// Pending
//   ↓
// Registrar reviews
//   ↓
// Approved / Rejected
//
// =====================================================

router.post("/:enrollment_id/submit", async (req, res) => {
  let connection;

  try {
    // =================================================
    // 1. GET ENROLLMENT ID
    // =================================================

    const enrollmentId = Number(req.params.enrollment_id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment_id.",
      });
    }

    // =================================================
    // 2. GET USER ID
    // =================================================

    const userId = Number(req.body?.user_id || req.query?.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid user_id is required.",
      });
    }

    // =================================================
    // 3. DATABASE CONNECTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // 4. VERIFY STUDENT
    // =================================================

    const [studentRows] = await connection.execute(
      `
          SELECT
              u.user_id,
              u.username,
              u.role_id,

              r.role_name,

              s.student_id,
              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name

          FROM users u

          INNER JOIN roles r
              ON r.role_id = u.role_id

          INNER JOIN students s
              ON s.user_id = u.user_id

          WHERE u.user_id = ?
            AND r.role_name = 'Student'

          LIMIT 1
          `,
      [userId],
    );

    if (studentRows.length === 0) {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message: "User is not a valid Student account.",
      });
    }

    const student = studentRows[0];

    // =================================================
    // 5. GET ENROLLMENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              e.enrollment_id,
              e.student_id,

              e.academic_year_id,
              ay.academic_year,

              e.semester_id,
              sem.semester_name,

              e.enrollment_status,
              e.remarks,

              e.approved_by,
              e.approved_at,

              e.created_at

          FROM enrollments e

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          WHERE e.enrollment_id = ?
            AND e.student_id = ?

          LIMIT 1

          FOR UPDATE
          `,
      [enrollmentId, student.student_id],
    );

    if (enrollmentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
        enrollment_id: enrollmentId,
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // 6. ONLY DRAFT CAN BE SUBMITTED
    // =================================================

    const enrollmentStatus = String(enrollment.enrollment_status || "")
      .trim()
      .toLowerCase();

    if (enrollmentStatus !== "draft") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `This enrollment cannot be submitted because its current status is "${enrollment.enrollment_status}".`,

        enrollment: {
          enrollment_id: Number(enrollment.enrollment_id),

          student_id: Number(enrollment.student_id),

          enrollment_status: enrollment.enrollment_status,
        },
      });
    }

    // =================================================
    // 7. VERIFY ENROLLMENT PERIOD
    // =================================================

    const [periodRows] = await connection.execute(
      `
          SELECT
              ep.enrollment_period_id,

              ep.academic_year_id,
              ay.academic_year,

              ep.semester_id,
              sem.semester_name,

              ep.status,

              ep.opened_by,
              ep.opened_at,

              ep.closed_by,
              ep.closed_at,

              ep.remarks

          FROM enrollment_periods ep

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 ep.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 ep.semester_id

          WHERE ep.academic_year_id = ?
            AND ep.semester_id = ?

          ORDER BY
              ep.enrollment_period_id DESC

          LIMIT 1

          FOR UPDATE
          `,
      [Number(enrollment.academic_year_id), Number(enrollment.semester_id)],
    );

    if (periodRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Enrollment period is not currently open.",
      });
    }

    const enrollmentPeriod = periodRows[0];

    const periodStatus = String(enrollmentPeriod.status || "")
      .trim()
      .toLowerCase();

    if (periodStatus !== "open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Enrollment period is not currently open.",

        enrollment_period: {
          enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

          academic_year_id: Number(enrollmentPeriod.academic_year_id),

          academic_year: enrollmentPeriod.academic_year,

          semester_id: Number(enrollmentPeriod.semester_id),

          semester_name: enrollmentPeriod.semester_name,

          status: enrollmentPeriod.status,
        },
      });
    }

    // =================================================
    // 8. GET PREPARED ENROLLMENT SUBJECTS
    // =================================================

    const [enrollmentSubjects] = await connection.execute(
      `
          SELECT
              es.enrollment_subject_id,
              es.enrollment_id,
              es.subject_id,
              es.section_id,
              es.status,

              s.subject_code,
              s.subject_name,
              s.units

          FROM enrollment_subjects es

          INNER JOIN subjects s
              ON s.subject_id = es.subject_id

          WHERE es.enrollment_id = ?

          ORDER BY
              es.enrollment_subject_id ASC
          `,
      [enrollmentId],
    );

    // =================================================
    // MUST HAVE SUBJECTS
    // =================================================

    if (enrollmentSubjects.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "No subjects have been prepared for this enrollment.",
      });
    }

    // =================================================
    // 9. FILTER ACTIVE SUBJECTS
    //
    // Dropped subjects remain for history.
    // =================================================

    const activeSubjects = enrollmentSubjects.filter((subject) => {
      const status = String(subject.status || "")
        .trim()
        .toLowerCase();

      return status !== "dropped";
    });

    // =================================================
    // MUST HAVE AT LEAST ONE ACTIVE SUBJECT
    // =================================================

    if (activeSubjects.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message: "Cannot submit enrollment because it has no active subjects.",
      });
    }

    // =================================================
    // 10. VALIDATE ACTIVE SUBJECT STATUS
    //
    // Allowed:
    // Pending
    // Enrolled
    //
    // Dropped ignored.
    // =================================================

    const invalidSubjects = activeSubjects.filter((subject) => {
      const status = String(subject.status || "")
        .trim()
        .toLowerCase();

      return !["pending", "enrolled"].includes(status);
    });

    if (invalidSubjects.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message: "Some prepared enrollment subjects have an invalid status.",

        invalid_subject_count: invalidSubjects.length,

        invalid_subjects: invalidSubjects.map((subject) => ({
          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          subject_name: subject.subject_name,

          status: subject.status,
        })),
      });
    }

    // =================================================
    // 11. VERIFY SECTION ASSIGNMENTS
    //
    // Registrar/system assigns sections.
    //
    // Every active subject must have a section.
    // =================================================

    const subjectsWithoutSection = activeSubjects.filter(
      (subject) =>
        subject.section_id === null ||
        subject.section_id === undefined ||
        Number(subject.section_id) <= 0,
    );

    if (subjectsWithoutSection.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "Some prepared subjects do not have an assigned section yet. Please wait for the Registrar to complete the enrollment preparation.",

        subjects_without_section: subjectsWithoutSection.map((subject) => ({
          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          subject_name: subject.subject_name,

          section_id: subject.section_id,
        })),
      });
    }

    // =================================================
    // 12. VERIFY SECTION EXISTS
    // =================================================

    const invalidSectionSubjects = [];

    for (const subject of activeSubjects) {
      const [sectionRows] = await connection.execute(
        `
            SELECT
                section_id,
                section_name,
                course_id,
                year_level,
                max_students

            FROM sections

            WHERE section_id = ?

            LIMIT 1
            `,
        [Number(subject.section_id)],
      );

      if (sectionRows.length === 0) {
        invalidSectionSubjects.push({
          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          section_id: Number(subject.section_id),
        });
      }
    }

    if (invalidSectionSubjects.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message: "Some prepared subjects reference sections that do not exist.",

        invalid_section_subjects: invalidSectionSubjects,
      });
    }

    // =================================================
    // 13. VERIFY SECTION-SUBJECT ASSIGNMENTS
    //
    // A section existing by itself is not enough.
    //
    // The Registrar must have actually prepared the
    // subject inside that section for this exact
    // academic year and semester.
    // =================================================

    const invalidSectionAssignments = [];

    for (const subject of activeSubjects) {
      const [sectionSubjectRows] = await connection.execute(
        `
            SELECT
                ss.section_subject_id,
                ss.section_id,
                ss.subject_id,
                ss.academic_year_id,
                ss.semester_id,
                ss.max_students,
                ss.status

            FROM section_subjects ss

            WHERE ss.section_id = ?
              AND ss.subject_id = ?
              AND ss.academic_year_id = ?
              AND ss.semester_id = ?

            LIMIT 1
            `,
        [
          Number(subject.section_id),
          Number(subject.subject_id),
          Number(enrollment.academic_year_id),
          Number(enrollment.semester_id),
        ],
      );

      if (sectionSubjectRows.length === 0) {
        invalidSectionAssignments.push({
          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          section_id: Number(subject.section_id),

          message:
            "The assigned section is not prepared for this subject in the current academic year and semester.",
        });

        continue;
      }

      const sectionSubject = sectionSubjectRows[0];

      const sectionSubjectStatus = String(sectionSubject.status || "")
        .trim()
        .toLowerCase();

      if (sectionSubjectStatus !== "open") {
        invalidSectionAssignments.push({
          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          section_id: Number(subject.section_id),

          section_subject_id: Number(sectionSubject.section_subject_id),

          status: sectionSubject.status,

          message: "The assigned section-subject is not currently open.",
        });
      }
    }

    if (invalidSectionAssignments.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "Some prepared subjects have invalid or unavailable section assignments.",

        invalid_section_assignments: invalidSectionAssignments,
      });
    }

    // =================================================
    // 14. CHECK DUPLICATE ACTIVE SUBJECTS
    // =================================================

    const subjectIds = activeSubjects.map((subject) =>
      Number(subject.subject_id),
    );

    const duplicateSubjectIds = subjectIds.filter(
      (subjectId, index) => subjectIds.indexOf(subjectId) !== index,
    );

    if (duplicateSubjectIds.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "Duplicate active subjects were found in the prepared enrollment.",

        subject_ids: [...new Set(duplicateSubjectIds)],
      });
    }

    // =================================================
    // 15. GET STUDENT GRADES
    //
    // 1 - 3 = Passed
    // 4     = Incomplete / Retake
    // 5     = Failed / Retake
    //
    // Latest grade record per subject.
    // =================================================

    const [gradeRows] = await connection.execute(
      `
          SELECT
              g.grade_id,
              g.student_id,
              g.subject_id,
              g.enrollment_id,

              g.prelim_grade,
              g.midterm_grade,
              g.final_grade,

              g.remarks

          FROM grades g

          WHERE g.student_id = ?

          ORDER BY
              g.subject_id ASC,
              g.enrollment_id DESC,
              g.grade_id DESC
          `,
      [student.student_id],
    );

    // =================================================
    // 16. BUILD REQUIRED RETAKE MAP
    // =================================================

    const retakeSubjectIds = new Set();

    const checkedGradeSubjects = new Set();

    for (const row of gradeRows) {
      const subjectId = Number(row.subject_id);

      // Only latest grade record per subject.
      if (checkedGradeSubjects.has(subjectId)) {
        continue;
      }

      checkedGradeSubjects.add(subjectId);

      let grade = null;

      // Final grade priority.
      if (row.final_grade !== null && row.final_grade !== "") {
        grade = Number(row.final_grade);
      }

      // Midterm fallback.
      else if (row.midterm_grade !== null && row.midterm_grade !== "") {
        grade = Number(row.midterm_grade);
      }

      // Prelim fallback.
      else if (row.prelim_grade !== null && row.prelim_grade !== "") {
        grade = Number(row.prelim_grade);
      }

      // Ignore invalid numbers.
      if (grade !== null && Number.isNaN(grade)) {
        grade = null;
      }

      // 4 or 5 requires retake.
      if (grade === 4 || grade === 5) {
        retakeSubjectIds.add(subjectId);
      }
    }

    // =================================================
    // 17. VERIFY REQUIRED RETAKES ARE PREPARED
    //
    // IMPORTANT:
    //
    // Student does NOT choose the retake.
    //
    // Student does NOT choose the section.
    //
    // Registrar/system must prepare the retake
    // subject and assign a valid section.
    //
    // We verify that every required retake appears
    // in the prepared active enrollment.
    // =================================================

    const preparedActiveSubjectIds = new Set(
      activeSubjects.map((subject) => Number(subject.subject_id)),
    );

    const missingRetakes = [];

    for (const subjectId of retakeSubjectIds) {
      if (!preparedActiveSubjectIds.has(Number(subjectId))) {
        missingRetakes.push(Number(subjectId));
      }
    }

    // =================================================
    // BLOCK SUBMISSION IF REQUIRED RETAKE
    // WAS NOT PREPARED
    // =================================================

    if (missingRetakes.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "Some failed or incomplete subjects have not been prepared for retake.",

        missing_retake_subject_ids: missingRetakes,

        missing_retake_count: missingRetakes.length,
      });
    }

    // =================================================
    // 18. VERIFY RETAKE SUBJECTS HAVE VALID SECTIONS
    //
    // This is already covered by the active-subject
    // section validation above.
    //
    // This additional check gives a more specific
    // retake error.
    // =================================================

    const retakesWithoutSection = activeSubjects.filter(
      (subject) =>
        retakeSubjectIds.has(Number(subject.subject_id)) &&
        (subject.section_id === null ||
          subject.section_id === undefined ||
          Number(subject.section_id) <= 0),
    );

    if (retakesWithoutSection.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "Some required retake subjects have not yet been assigned a section by the Registrar.",

        retakes_without_section: retakesWithoutSection.map((subject) => ({
          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          subject_name: subject.subject_name,

          section_id: subject.section_id,
        })),
      });
    }

    // =================================================
    // 19. UPDATE ENROLLMENT
    //
    // Draft → Pending
    // =================================================

    const submittedRemarks = enrollment.remarks || "Submitted by student";

    const [updateResult] = await connection.execute(
      `
          UPDATE enrollments

          SET
              enrollment_status = 'Pending',
              remarks = ?

          WHERE enrollment_id = ?
            AND student_id = ?
            AND enrollment_status = 'Draft'
          `,
      [submittedRemarks, enrollmentId, student.student_id],
    );

    // =================================================
    // VERIFY UPDATE ACTUALLY HAPPENED
    // =================================================

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Enrollment could not be submitted because its status changed before submission.",
      });
    }

    // =================================================
    // 20. COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // 21. SUCCESS RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message:
        "Enrollment submitted successfully and is now pending Registrar review.",

      enrollment: {
        enrollment_id: Number(enrollment.enrollment_id),

        student_id: Number(enrollment.student_id),

        student_number: student.student_number,

        academic_year_id: Number(enrollment.academic_year_id),

        academic_year: enrollment.academic_year,

        semester_id: Number(enrollment.semester_id),

        semester_name: enrollment.semester_name,

        enrollment_status: "Pending",

        remarks: submittedRemarks,

        approved_by: null,

        approved_at: null,

        created_at: enrollment.created_at,
      },

      enrollment_period: {
        enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

        academic_year_id: Number(enrollmentPeriod.academic_year_id),

        academic_year: enrollmentPeriod.academic_year,

        semester_id: Number(enrollmentPeriod.semester_id),

        semester_name: enrollmentPeriod.semester_name,

        status: enrollmentPeriod.status,
      },

      subjects: {
        total: activeSubjects.length,

        regular: activeSubjects.filter(
          (subject) => !retakeSubjectIds.has(Number(subject.subject_id)),
        ).length,

        retakes: activeSubjects.filter((subject) =>
          retakeSubjectIds.has(Number(subject.subject_id)),
        ).length,
      },
    });
  } catch (error) {
    // =================================================
    // ROLLBACK
    // =================================================

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("SUBMIT ENROLLMENT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("SUBMIT STUDENT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to submit student enrollment.",

      error: error.message,
    });
  } finally {
    // =================================================
    // RELEASE CONNECTION
    // =================================================

    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

export default router;
