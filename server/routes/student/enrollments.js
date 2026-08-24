// routes/student/enrollments.js

import express from "express";
import db from "../../db.js";

const router = express.Router();
// =====================================================
// GET CURRENT STUDENT ENROLLMENT
//
// GET /api/student/enrollments/current
//
// AUTH:
// Student JWT required.
//
// IMPORTANT:
// - No user_id query parameter.
// - No student_id query parameter.
// - Student identity comes ONLY from req.user.
// - Student can only see their own enrollment.
// =====================================================

router.get("/current", async (req, res) => {
  try {
    // =================================================
    // 1. AUTHENTICATED USER
    // =================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const userId = Number(req.user.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user ID is invalid.",
      });
    }

    // =================================================
    // 2. STUDENT ROLE
    // =================================================

    if (req.user.role_name !== "Student") {
      return res.status(403).json({
        success: false,
        message: "Student access is required.",
      });
    }

    // =================================================
    // 3. GET AUTHENTICATED STUDENT
    //
    // Do NOT accept student_id from frontend.
    // =================================================

    const [studentRows] = await db.execute(
      `
      SELECT
          s.student_id,
          s.user_id,
          s.student_number,

          s.first_name,
          s.middle_name,
          s.last_name,

          s.course_id,
          c.course_code,
          c.course_name,

          s.year_level,

          s.section_id,
          sec.section_name,

          s.academic_year_id,
          student_ay.academic_year AS student_academic_year,

          s.semester_id,
          student_sem.semester_name AS student_semester_name

      FROM students s

      INNER JOIN courses c
          ON c.course_id = s.course_id

      LEFT JOIN sections sec
          ON sec.section_id = s.section_id

      LEFT JOIN academic_years student_ay
          ON student_ay.academic_year_id =
             s.academic_year_id

      LEFT JOIN semesters student_sem
          ON student_sem.semester_id =
             s.semester_id

      WHERE s.user_id = ?

      LIMIT 1
      `,
      [userId],
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No Student profile is connected to this account.",
      });
    }

    const student = studentRows[0];

    const studentId = Number(student.student_id);

    const studentCourseId = Number(student.course_id);

    // =================================================
    // 4. GET ACTIVE ASSIGNED CURRICULUM
    //
    // Curriculum must:
    // - belong to this Student
    // - have status Active
    // - itself be active
    // - belong to Student's current Course
    //
    // We DO NOT guess a curriculum.
    // =================================================

    const [curriculumRows] = await db.execute(
      `
      SELECT
          sc.student_curriculum_id,
          sc.student_id,
          sc.curriculum_id,
          sc.assigned_date,
          sc.status AS assignment_status,
          sc.remarks,

          cur.curriculum_name,
          cur.effective_year,
          cur.total_units,
          cur.is_active,

          cur.course_id AS curriculum_course_id,

          c.course_code,
          c.course_name

      FROM student_curriculum sc

      INNER JOIN curriculum cur
          ON cur.curriculum_id =
             sc.curriculum_id

      INNER JOIN courses c
          ON c.course_id =
             cur.course_id

      WHERE sc.student_id = ?
        AND sc.status = 'Active'
        AND cur.is_active = 1
        AND cur.course_id = ?

      LIMIT 1
      `,
      [studentId, studentCourseId],
    );

    let curriculum = null;

    if (curriculumRows.length > 0) {
      const row = curriculumRows[0];

      curriculum = {
        student_curriculum_id: Number(row.student_curriculum_id),

        curriculum_id: Number(row.curriculum_id),

        curriculum_name: row.curriculum_name,

        effective_year:
          row.effective_year !== null ? Number(row.effective_year) : null,

        total_units: row.total_units !== null ? Number(row.total_units) : null,

        status: row.assignment_status,

        assigned_date: row.assigned_date,

        remarks: row.remarks || null,

        course: {
          course_id: Number(row.curriculum_course_id),

          course_code: row.course_code,

          course_name: row.course_name,
        },
      };
    }

    // =================================================
    // 5. CHECK IF STUDENT HAS A BAD CURRICULUM RECORD
    //
    // This lets us distinguish:
    //
    // NO CURRICULUM
    // vs
    // COURSE / CURRICULUM MISMATCH
    // vs
    // INACTIVE ASSIGNMENT
    // =================================================

    let curriculumIssue = null;

    if (!curriculum) {
      const [assignmentRows] = await db.execute(
        `
          SELECT
              sc.student_curriculum_id,
              sc.curriculum_id,
              sc.status,

              cur.course_id,
              cur.curriculum_name,
              cur.is_active

          FROM student_curriculum sc

          LEFT JOIN curriculum cur
              ON cur.curriculum_id =
                 sc.curriculum_id

          WHERE sc.student_id = ?

          LIMIT 1
          `,
        [studentId],
      );

      if (assignmentRows.length === 0) {
        curriculumIssue = "NO_CURRICULUM";
      } else {
        const assignment = assignmentRows[0];

        if (Number(assignment.course_id) !== studentCourseId) {
          curriculumIssue = "COURSE_CURRICULUM_MISMATCH";
        } else if (assignment.status !== "Active") {
          curriculumIssue = "CURRICULUM_ASSIGNMENT_NOT_ACTIVE";
        } else if (Number(assignment.is_active) !== 1) {
          curriculumIssue = "CURRICULUM_NOT_ACTIVE";
        } else {
          curriculumIssue = "INVALID_CURRICULUM_ASSIGNMENT";
        }
      }
    }

    // =================================================
    // 6. GET CURRENT OPEN ENROLLMENT PERIOD
    //
    // Registrar owns opening/closing enrollment.
    // Student only reads it.
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

            ep.opened_at,

            ep.remarks

        FROM enrollment_periods ep

        INNER JOIN academic_years ay
            ON ay.academic_year_id =
               ep.academic_year_id

        INNER JOIN semesters sem
            ON sem.semester_id =
               ep.semester_id

        WHERE ep.status = 'Open'

        ORDER BY
            ep.enrollment_period_id DESC

        LIMIT 1
        `,
    );

    // =================================================
    // STUDENT RESPONSE
    // =================================================

    const studentResponse = {
      student_id: studentId,

      student_number: student.student_number,

      first_name: student.first_name,

      middle_name: student.middle_name,

      last_name: student.last_name,

      student_name: [student.first_name, student.middle_name, student.last_name]
        .filter(Boolean)
        .join(" "),

      course: {
        course_id: studentCourseId,

        course_code: student.course_code,

        course_name: student.course_name,
      },

      year_level: Number(student.year_level),

      current_section: {
        section_id:
          student.section_id !== null ? Number(student.section_id) : null,

        section_name: student.section_name || null,
      },

      profile_academic_period: {
        academic_year_id:
          student.academic_year_id !== null
            ? Number(student.academic_year_id)
            : null,

        academic_year: student.student_academic_year || null,

        semester_id:
          student.semester_id !== null ? Number(student.semester_id) : null,

        semester_name: student.student_semester_name || null,
      },
    };

    // =================================================
    // 7. NO OPEN ENROLLMENT PERIOD
    //
    // This is NOT an error.
    //
    // Student should still be able to open the page
    // and see that enrollment is closed.
    // =================================================

    if (periodRows.length === 0) {
      return res.status(200).json({
        success: true,

        message: "Enrollment is currently closed.",

        student: studentResponse,

        curriculum,

        curriculum_issue: curriculumIssue,

        enrollment_period: null,

        enrollment: null,

        can_prepare: false,
      });
    }

    const period = periodRows[0];

    const academicYearId = Number(period.academic_year_id);

    const semesterId = Number(period.semester_id);

    // =================================================
    // 8. GET CURRENT STUDENT ENROLLMENT
    //
    // Student ownership is enforced using studentId
    // derived from req.user.
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
            ON ay.academic_year_id =
               e.academic_year_id

        INNER JOIN semesters sem
            ON sem.semester_id =
               e.semester_id

        WHERE e.student_id = ?
          AND e.academic_year_id = ?
          AND e.semester_id = ?

        ORDER BY
            e.created_at DESC,
            e.enrollment_id DESC

        LIMIT 1
        `,
      [studentId, academicYearId, semesterId],
    );

    const enrollmentPeriod = {
      enrollment_period_id: Number(period.enrollment_period_id),

      academic_year_id: academicYearId,

      academic_year: period.academic_year,

      semester_id: semesterId,

      semester_name: period.semester_name,

      status: period.status,

      opened_at: period.opened_at,

      remarks: period.remarks || null,
    };

    // =================================================
    // 9. NO ENROLLMENT YET
    // =================================================

    if (enrollmentRows.length === 0) {
      return res.status(200).json({
        success: true,

        message: curriculum
          ? "No enrollment has been prepared for the current enrollment period."
          : "Student enrollment cannot be prepared until the curriculum assignment is corrected.",

        student: studentResponse,

        curriculum,

        curriculum_issue: curriculumIssue,

        enrollment_period: enrollmentPeriod,

        enrollment: null,

        can_prepare: Boolean(curriculum),
      });
    }

    const enrollment = enrollmentRows[0];

    const enrollmentStatus = String(enrollment.enrollment_status);

    // =================================================
    // 10. CURRENT ENROLLMENT RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      student: studentResponse,

      curriculum,

      curriculum_issue: curriculumIssue,

      enrollment_period: enrollmentPeriod,

      enrollment: {
        enrollment_id: Number(enrollment.enrollment_id),

        student_id: Number(enrollment.student_id),

        academic_year_id: Number(enrollment.academic_year_id),

        academic_year: enrollment.academic_year,

        semester_id: Number(enrollment.semester_id),

        semester_name: enrollment.semester_name,

        enrollment_status: enrollmentStatus,

        remarks: enrollment.remarks || null,

        approved_by:
          enrollment.approved_by !== null
            ? Number(enrollment.approved_by)
            : null,

        approved_at: enrollment.approved_at,

        created_at: enrollment.created_at,
      },

      // Existing Draft/Pending/Approved means
      // do not prepare another enrollment.
      can_prepare:
        Boolean(curriculum) &&
        !["Draft", "Pending", "Approved"].includes(enrollmentStatus),
    });
  } catch (error) {
    console.error("GET CURRENT STUDENT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load current student enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
// =====================================================
// GET STUDENT ENROLLMENT ELIGIBLE SUBJECTS
//
// GET /api/student/enrollments/subjects
//
// AUTH:
// Student JWT required.
//
// Purpose:
// - Identify Student from req.user
// - Load active assigned curriculum
// - Load current Open enrollment period
// - Load current curriculum subjects
// - Evaluate previous FINAL grades
// - Remove already-passed subjects
// - Detect valid retakes
// - Validate prerequisites
// - Show current Draft membership if Draft exists
//
// IMPORTANT:
// Student does NOT choose:
// - section
// - offering
// - faculty
// - room
// - schedule
//
// Registrar handles placement later.
// =====================================================

router.get("/subjects", async (req, res) => {
  try {
    // =================================================
    // 1. AUTHENTICATION
    // =================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const userId = Number(req.user.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user ID is invalid.",
      });
    }

    // =================================================
    // 2. STUDENT ROLE
    // =================================================

    if (req.user.role_name !== "Student") {
      return res.status(403).json({
        success: false,
        message: "Student access is required.",
      });
    }

    // =================================================
    // 3. GET STUDENT PROFILE
    //
    // Identity comes ONLY from req.user.
    // =================================================

    const [studentRows] = await db.execute(
      `
      SELECT
          s.student_id,
          s.user_id,
          s.student_number,

          s.first_name,
          s.middle_name,
          s.last_name,

          s.course_id,
          c.course_code,
          c.course_name,

          s.year_level

      FROM students s

      INNER JOIN courses c
          ON c.course_id = s.course_id

      WHERE s.user_id = ?

      LIMIT 1
      `,
      [userId],
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No Student profile is connected to this account.",
      });
    }

    const student = studentRows[0];

    const studentId = Number(student.student_id);

    const studentCourseId = Number(student.course_id);

    const yearLevel = Number(student.year_level);

    // =================================================
    // 4. GET ACTIVE ASSIGNED CURRICULUM
    //
    // Must:
    // - belong to Student
    // - be Active assignment
    // - curriculum itself must be active
    // - curriculum must belong to Student's Course
    // =================================================

    const [curriculumRows] = await db.execute(
      `
      SELECT
          sc.student_curriculum_id,
          sc.curriculum_id,
          sc.assigned_date,
          sc.status AS assignment_status,
          sc.remarks,

          cur.curriculum_name,
          cur.effective_year,
          cur.total_units,
          cur.is_active,
          cur.course_id,

          c.course_code,
          c.course_name

      FROM student_curriculum sc

      INNER JOIN curriculum cur
          ON cur.curriculum_id =
             sc.curriculum_id

      INNER JOIN courses c
          ON c.course_id =
             cur.course_id

      WHERE sc.student_id = ?
        AND sc.status = 'Active'
        AND cur.is_active = 1
        AND cur.course_id = ?

      LIMIT 1
      `,
      [studentId, studentCourseId],
    );

    if (curriculumRows.length === 0) {
      return res.status(409).json({
        success: false,

        message:
          "Student enrollment cannot continue because there is no valid active curriculum assigned to this Student.",

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 5. GET OPEN ENROLLMENT PERIOD
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
          ep.opened_at,
          ep.remarks

      FROM enrollment_periods ep

      INNER JOIN academic_years ay
          ON ay.academic_year_id =
             ep.academic_year_id

      INNER JOIN semesters sem
          ON sem.semester_id =
             ep.semester_id

      WHERE ep.status = 'Open'

      ORDER BY
          ep.enrollment_period_id DESC

      LIMIT 1
      `,
    );

    // =================================================
    // ENROLLMENT CLOSED
    //
    // This is not an authentication error.
    // Student can still open the page.
    // =================================================

    if (periodRows.length === 0) {
      return res.status(200).json({
        success: true,

        message: "Enrollment is currently closed.",

        student: {
          student_id: studentId,

          student_number: student.student_number,

          student_name: [
            student.first_name,
            student.middle_name,
            student.last_name,
          ]
            .filter(Boolean)
            .join(" "),

          course: {
            course_id: studentCourseId,

            course_code: student.course_code,

            course_name: student.course_name,
          },

          year_level: yearLevel,
        },

        curriculum: {
          student_curriculum_id: Number(curriculum.student_curriculum_id),

          curriculum_id: curriculumId,

          curriculum_name: curriculum.curriculum_name,

          effective_year:
            curriculum.effective_year !== null
              ? Number(curriculum.effective_year)
              : null,

          total_units:
            curriculum.total_units !== null
              ? Number(curriculum.total_units)
              : null,

          status: curriculum.assignment_status,
        },

        enrollment_period: null,

        enrollment: null,

        regular_subjects: [],

        retake_candidates: [],

        blocked_subjects: [],

        completed_subjects: [],

        summary: {
          regular_subjects: 0,
          retake_candidates: 0,
          blocked_subjects: 0,
          completed_subjects: 0,
          eligible_units: 0,
        },

        can_prepare: false,
      });
    }

    const period = periodRows[0];

    const academicYearId = Number(period.academic_year_id);

    const semesterId = Number(period.semester_id);

    // =================================================
    // 6. GET CURRENT ENROLLMENT
    //
    // There should not be duplicate active enrollments
    // for the same Student + AY + semester.
    // =================================================

    const [enrollmentRows] = await db.execute(
      `
        SELECT
            e.enrollment_id,
            e.student_id,

            e.academic_year_id,
            e.semester_id,

            e.enrollment_status,
            e.remarks,

            e.approved_by,
            e.approved_at,

            e.created_at

        FROM enrollments e

        WHERE e.student_id = ?
          AND e.academic_year_id = ?
          AND e.semester_id = ?

        ORDER BY
            e.created_at DESC,
            e.enrollment_id DESC

        LIMIT 1
        `,
      [studentId, academicYearId, semesterId],
    );

    const currentEnrollment =
      enrollmentRows.length > 0 ? enrollmentRows[0] : null;

    // =================================================
    // 7. GET FINAL ACADEMIC RESULTS
    //
    // IMPORTANT:
    //
    // We use FINAL GRADE ONLY.
    //
    // NO:
    // - prelim fallback
    // - midterm fallback
    // - remarks-based pass/fail decision
    //
    // Enrollment must already be Approved.
    // =================================================

    const [gradeRows] = await db.execute(
      `
        SELECT
            g.grade_id,
            g.student_id,
            g.subject_id,
            g.enrollment_id,

            g.final_grade,
            g.remarks,

            e.created_at AS enrollment_created_at,
            e.enrollment_status,

            sub.subject_code,
            sub.subject_name,
            sub.units,
            sub.lecture_hours,
            sub.laboratory_hours

        FROM grades g

        INNER JOIN enrollments e
            ON e.enrollment_id =
               g.enrollment_id

        INNER JOIN subjects sub
            ON sub.subject_id =
               g.subject_id

        WHERE g.student_id = ?
          AND g.final_grade IS NOT NULL
          AND e.enrollment_status = 'Approved'

        ORDER BY
            g.subject_id ASC,
            e.created_at DESC,
            g.grade_id DESC
        `,
      [studentId],
    );

    // =================================================
    // 8. BUILD LATEST FINAL GRADE MAP
    //
    // 1.00 - 3.00 = PASSED
    // 4.00        = INCOMPLETE / RETAKE
    // 5.00        = FAILED / RETAKE
    //
    // Remarks are informational only.
    // =================================================

    const academicMap = new Map();

    for (const row of gradeRows) {
      const subjectId = Number(row.subject_id);

      // First record is latest because query is sorted.
      if (academicMap.has(subjectId)) {
        continue;
      }

      const finalGrade = Number(row.final_grade);

      let academicStatus = "UNRESOLVED";

      if (finalGrade >= 1 && finalGrade <= 3) {
        academicStatus = "PASSED";
      } else if (finalGrade === 4) {
        academicStatus = "INCOMPLETE";
      } else if (finalGrade === 5) {
        academicStatus = "FAILED";
      }

      academicMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: row.subject_code,

        subject_name: row.subject_name,

        units: Number(row.units || 0),

        lecture_hours: row.lecture_hours,

        laboratory_hours: row.laboratory_hours,

        final_grade: finalGrade,

        academic_status: academicStatus,

        remarks: row.remarks || null,

        enrollment_id: Number(row.enrollment_id),

        grade_id: Number(row.grade_id),
      });
    }

    // =================================================
    // 9. GET ALL SUBJECTS IN ASSIGNED CURRICULUM
    //
    // Used to ensure retakes still belong to the
    // Student's assigned curriculum.
    // =================================================

    const [allCurriculumRows] = await db.execute(
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
            ON s.subject_id =
               cs.subject_id

        WHERE cs.curriculum_id = ?

        ORDER BY
            cs.year_level ASC,
            cs.semester_id ASC,
            cs.display_order ASC,
            s.subject_code ASC
        `,
      [curriculumId],
    );

    const assignedCurriculumSubjectMap = new Map();

    for (const row of allCurriculumRows) {
      assignedCurriculumSubjectMap.set(Number(row.subject_id), row);
    }

    // =================================================
    // 10. CURRENT YEAR/SEMESTER CURRICULUM SUBJECTS
    // =================================================

    const currentCurriculumSubjects = allCurriculumRows.filter(
      (row) =>
        Number(row.year_level) === yearLevel &&
        Number(row.semester_id) === semesterId,
    );

    // =================================================
    // 11. GET PREREQUISITES
    //
    // subject_prerequisites:
    //
    // subject_id
    //       ↓ requires
    // prerequisite_subject_id
    // =================================================

    const prerequisiteMap = new Map();

    const currentSubjectIds = currentCurriculumSubjects.map((row) =>
      Number(row.subject_id),
    );

    if (currentSubjectIds.length > 0) {
      const placeholders = currentSubjectIds.map(() => "?").join(",");

      const [prerequisiteRows] = await db.execute(
        `
          SELECT
              sp.prerequisite_id,
              sp.subject_id,
              sp.prerequisite_subject_id,

              required.subject_code
                  AS prerequisite_subject_code,

              required.subject_name
                  AS prerequisite_subject_name

          FROM subject_prerequisites sp

          INNER JOIN subjects required
              ON required.subject_id =
                 sp.prerequisite_subject_id

          WHERE sp.subject_id
                IN (${placeholders})

          ORDER BY
              sp.subject_id,
              required.subject_code
          `,
        currentSubjectIds,
      );

      for (const row of prerequisiteRows) {
        const subjectId = Number(row.subject_id);

        if (!prerequisiteMap.has(subjectId)) {
          prerequisiteMap.set(subjectId, []);
        }

        prerequisiteMap.get(subjectId).push({
          prerequisite_id: Number(row.prerequisite_id),

          subject_id: Number(row.prerequisite_subject_id),

          subject_code: row.prerequisite_subject_code,

          subject_name: row.prerequisite_subject_name,
        });
      }
    }

    // =================================================
    // 12. BUILD COMPLETED SUBJECTS
    // =================================================

    const completedSubjects = [];

    for (const academicRecord of academicMap.values()) {
      if (academicRecord.academic_status !== "PASSED") {
        continue;
      }

      completedSubjects.push({
        subject_id: academicRecord.subject_id,

        subject_code: academicRecord.subject_code,

        subject_name: academicRecord.subject_name,

        units: academicRecord.units,

        final_grade: academicRecord.final_grade,

        academic_status: "PASSED",
      });
    }

    // =================================================
    // 13. BUILD REGULAR + BLOCKED SUBJECTS
    // =================================================

    const regularSubjects = [];

    const blockedSubjects = [];

    const retakeCandidateMap = new Map();

    for (const row of currentCurriculumSubjects) {
      const subjectId = Number(row.subject_id);

      const academicRecord = academicMap.get(subjectId);

      // ===============================================
      // ALREADY PASSED
      // ===============================================

      if (academicRecord?.academic_status === "PASSED") {
        continue;
      }

      // ===============================================
      // CURRENT SUBJECT IS A RETAKE
      // ===============================================

      if (
        academicRecord &&
        (academicRecord.academic_status === "FAILED" ||
          academicRecord.academic_status === "INCOMPLETE")
      ) {
        retakeCandidateMap.set(subjectId, {
          subject_id: subjectId,

          subject_code: row.subject_code,

          subject_name: row.subject_name,

          units: Number(row.units || 0),

          lecture_hours: row.lecture_hours,

          laboratory_hours: row.laboratory_hours,

          previous_final_grade: academicRecord.final_grade,

          previous_status: academicRecord.academic_status,

          curriculum_subject_id: Number(row.curriculum_subject_id),

          original_year_level: Number(row.year_level),

          original_semester_id: Number(row.semester_id),

          eligible_for_retake: true,
        });

        continue;
      }

      // ===============================================
      // CHECK PREREQUISITES
      // ===============================================

      const prerequisites = prerequisiteMap.get(subjectId) || [];

      const prerequisiteResults = prerequisites.map((prerequisite) => {
        const record = academicMap.get(prerequisite.subject_id);

        const passed = record?.academic_status === "PASSED";

        return {
          ...prerequisite,

          passed,

          final_grade: record?.final_grade ?? null,

          academic_status: record?.academic_status ?? "NOT_TAKEN",
        };
      });

      const missingPrerequisites = prerequisiteResults.filter(
        (item) => !item.passed,
      );

      // ===============================================
      // BLOCKED BY PREREQUISITE
      // ===============================================

      if (missingPrerequisites.length > 0) {
        blockedSubjects.push({
          subject_id: subjectId,

          subject_code: row.subject_code,

          subject_name: row.subject_name,

          units: Number(row.units || 0),

          year_level: Number(row.year_level),

          semester_id: Number(row.semester_id),

          curriculum_subject_id: Number(row.curriculum_subject_id),

          reason: "PREREQUISITE_NOT_PASSED",

          prerequisites: prerequisiteResults,

          missing_prerequisites: missingPrerequisites,
        });

        continue;
      }

      // ===============================================
      // REGULAR ELIGIBLE SUBJECT
      // ===============================================

      regularSubjects.push({
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

        curriculum_subject_id: Number(row.curriculum_subject_id),

        enrollment_type: "Regular",

        academic_status: "NOT_TAKEN",

        eligible: true,

        prerequisites: prerequisiteResults,
      });
    }

    // =================================================
    // 14. ADD OLD RETAKE CANDIDATES
    //
    // Retakes can come from an earlier year/semester.
    //
    // But subject must still belong to the currently
    // assigned curriculum.
    // =================================================

    for (const academicRecord of academicMap.values()) {
      if (
        academicRecord.academic_status !== "FAILED" &&
        academicRecord.academic_status !== "INCOMPLETE"
      ) {
        continue;
      }

      const subjectId = Number(academicRecord.subject_id);

      // Must belong to assigned curriculum.
      const curriculumSubject = assignedCurriculumSubjectMap.get(subjectId);

      if (!curriculumSubject) {
        continue;
      }

      if (retakeCandidateMap.has(subjectId)) {
        continue;
      }

      retakeCandidateMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: academicRecord.subject_code,

        subject_name: academicRecord.subject_name,

        units: Number(academicRecord.units || 0),

        lecture_hours: academicRecord.lecture_hours,

        laboratory_hours: academicRecord.laboratory_hours,

        previous_final_grade: academicRecord.final_grade,

        previous_status: academicRecord.academic_status,

        curriculum_subject_id: Number(curriculumSubject.curriculum_subject_id),

        original_year_level: Number(curriculumSubject.year_level),

        original_semester_id: Number(curriculumSubject.semester_id),

        eligible_for_retake: true,
      });
    }

    const retakeCandidates = Array.from(retakeCandidateMap.values());

    // =================================================
    // 15. GET CURRENT DRAFT SUBJECT MEMBERSHIP
    //
    // Student does NOT choose section here.
    // We only show whether the subject is already in
    // the existing Draft.
    // =================================================

    const draftSubjectMap = new Map();

    if (
      currentEnrollment &&
      String(currentEnrollment.enrollment_status) === "Draft"
    ) {
      const [draftRows] = await db.execute(
        `
          SELECT
              enrollment_subject_id,
              subject_id,
              status

          FROM enrollment_subjects

          WHERE enrollment_id = ?
            AND status NOT IN (
              'Dropped',
              'Withdrawn'
            )

          ORDER BY
              enrollment_subject_id ASC
          `,
        [Number(currentEnrollment.enrollment_id)],
      );

      for (const row of draftRows) {
        draftSubjectMap.set(Number(row.subject_id), {
          enrollment_subject_id: Number(row.enrollment_subject_id),

          status: row.status,
        });
      }
    }

    // =================================================
    // 16. MARK DRAFT MEMBERSHIP
    // =================================================

    const finalRegularSubjects = regularSubjects.map((subject) => {
      const draft = draftSubjectMap.get(subject.subject_id);

      return {
        ...subject,

        selected_in_draft: Boolean(draft),

        enrollment_subject_id: draft?.enrollment_subject_id ?? null,

        enrollment_subject_status: draft?.status ?? null,
      };
    });

    const finalRetakeCandidates = retakeCandidates.map((subject) => {
      const draft = draftSubjectMap.get(subject.subject_id);

      return {
        ...subject,

        selected_in_draft: Boolean(draft),

        enrollment_subject_id: draft?.enrollment_subject_id ?? null,

        enrollment_subject_status: draft?.status ?? null,
      };
    });

    // =================================================
    // 17. SORT
    // =================================================

    finalRegularSubjects.sort(
      (a, b) =>
        Number(a.display_order || 999999) - Number(b.display_order || 999999),
    );

    finalRetakeCandidates.sort((a, b) =>
      String(a.subject_code).localeCompare(String(b.subject_code)),
    );

    // =================================================
    // 18. SUMMARY
    // =================================================

    const eligibleUnits = finalRegularSubjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    const currentStatus = currentEnrollment
      ? String(currentEnrollment.enrollment_status)
      : null;

    const activeEnrollmentExists = ["Draft", "Pending", "Approved"].includes(
      currentStatus,
    );

    // =================================================
    // 19. RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      student: {
        student_id: studentId,

        student_number: student.student_number,

        student_name: [
          student.first_name,
          student.middle_name,
          student.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course: {
          course_id: studentCourseId,

          course_code: student.course_code,

          course_name: student.course_name,
        },

        year_level: yearLevel,
      },

      curriculum: {
        student_curriculum_id: Number(curriculum.student_curriculum_id),

        curriculum_id: curriculumId,

        curriculum_name: curriculum.curriculum_name,

        effective_year:
          curriculum.effective_year !== null
            ? Number(curriculum.effective_year)
            : null,

        total_units:
          curriculum.total_units !== null
            ? Number(curriculum.total_units)
            : null,

        status: curriculum.assignment_status,
      },

      enrollment_period: {
        enrollment_period_id: Number(period.enrollment_period_id),

        academic_year_id: academicYearId,

        academic_year: period.academic_year,

        semester_id: semesterId,

        semester_name: period.semester_name,

        status: period.status,

        opened_at: period.opened_at,

        remarks: period.remarks || null,
      },

      enrollment: currentEnrollment
        ? {
            enrollment_id: Number(currentEnrollment.enrollment_id),

            student_id: Number(currentEnrollment.student_id),

            enrollment_status: currentStatus,

            remarks: currentEnrollment.remarks || null,

            created_at: currentEnrollment.created_at,
          }
        : null,

      regular_subjects: finalRegularSubjects,

      retake_candidates: finalRetakeCandidates,

      blocked_subjects: blockedSubjects,

      completed_subjects: completedSubjects,

      summary: {
        regular_subjects: finalRegularSubjects.length,

        retake_candidates: finalRetakeCandidates.length,

        blocked_subjects: blockedSubjects.length,

        completed_subjects: completedSubjects.length,

        eligible_units: eligibleUnits,
      },

      can_prepare: !activeEnrollmentExists,

      can_modify_draft: currentStatus === "Draft",

      can_submit: currentStatus === "Draft",
    });
  } catch (error) {
    console.error("GET STUDENT ELIGIBLE SUBJECTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load Student enrollment eligibility.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
// =====================================================
// PREPARE STUDENT ENROLLMENT
//
// POST /api/student/enrollments/prepare
//
// AUTH:
// Student JWT required.
//
// Body:
//
// {
//   "selected_retake_subject_ids": [27]
// }
//
// Rules:
//
// - Student identity comes ONLY from req.user.
// - Open enrollment period is required.
// - Valid active curriculum is required.
// - All eligible REGULAR subjects are automatically added.
// - Student may select only VALID retake candidates.
// - Passed subjects are excluded.
// - Blocked prerequisite subjects are excluded.
// - Student NEVER selects section/offering.
// - Draft subjects have:
//      section_id = NULL
//      offering_id = NULL
//      section_subject_id = NULL
//
// Creates:
//
// enrollments.enrollment_status = 'Draft'
// =====================================================

router.post("/prepare", async (req, res) => {
  let connection;

  try {
    // =================================================
    // 1. AUTHENTICATED STUDENT
    // =================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (req.user.role_name !== "Student") {
      return res.status(403).json({
        success: false,
        message: "Student access is required.",
      });
    }

    const userId = Number(req.user.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated Student user ID is invalid.",
      });
    }

    // =================================================
    // 2. SELECTED RETAKES
    //
    // Retakes are OPTIONAL.
    //
    // Regular eligible subjects are automatic.
    // =================================================

    const rawRetakeIds = req.body?.selected_retake_subject_ids ?? [];

    if (!Array.isArray(rawRetakeIds)) {
      return res.status(400).json({
        success: false,
        message: "selected_retake_subject_ids must be an array.",
      });
    }

    const selectedRetakeIds = [
      ...new Set(rawRetakeIds.map((value) => Number(value))),
    ];

    for (const subjectId of selectedRetakeIds) {
      if (!Number.isInteger(subjectId) || subjectId <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Every selected retake subject ID must be a positive integer.",
        });
      }
    }

    // =================================================
    // 3. CONNECTION + TRANSACTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // 4. AUTHENTICATED STUDENT
    // =================================================

    const [studentRows] = await connection.execute(
      `
        SELECT
            s.student_id,
            s.user_id,
            s.student_number,

            s.first_name,
            s.middle_name,
            s.last_name,

            s.course_id,
            c.course_code,
            c.course_name,

            s.year_level

        FROM students s

        INNER JOIN courses c
            ON c.course_id =
               s.course_id

        WHERE s.user_id = ?

        LIMIT 1

        FOR UPDATE
        `,
      [userId],
    );

    if (studentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "No Student profile is connected to this account.",
      });
    }

    const student = studentRows[0];

    const studentId = Number(student.student_id);

    const courseId = Number(student.course_id);

    const yearLevel = Number(student.year_level);

    // =================================================
    // 5. ACTIVE CURRICULUM
    //
    // Must belong to Student's current Course.
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
        SELECT
            sc.student_curriculum_id,
            sc.curriculum_id,

            sc.assigned_date,
            sc.status AS assignment_status,

            cur.curriculum_name,
            cur.effective_year,
            cur.total_units,
            cur.course_id

        FROM student_curriculum sc

        INNER JOIN curriculum cur
            ON cur.curriculum_id =
               sc.curriculum_id

        WHERE sc.student_id = ?
          AND sc.status = 'Active'
          AND cur.is_active = 1
          AND cur.course_id = ?

        LIMIT 1
        `,
      [studentId, courseId],
    );

    if (curriculumRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message:
          "Student enrollment cannot be prepared because there is no valid active curriculum assigned to this Student.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 6. OPEN ENROLLMENT PERIOD
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
            ep.opened_at,
            ep.remarks

        FROM enrollment_periods ep

        INNER JOIN academic_years ay
            ON ay.academic_year_id =
               ep.academic_year_id

        INNER JOIN semesters sem
            ON sem.semester_id =
               ep.semester_id

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

    const period = periodRows[0];

    const academicYearId = Number(period.academic_year_id);

    const semesterId = Number(period.semester_id);

    // =================================================
    // 7. CHECK EXISTING ENROLLMENT
    //
    // Never create duplicate:
    //
    // Draft
    // Pending
    // Approved
    //
    // Rejected / Cancelled may start again.
    // =================================================

    const [existingRows] = await connection.execute(
      `
        SELECT
            enrollment_id,
            enrollment_status,
            remarks,
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

    if (existingRows.length > 0) {
      const existing = existingRows[0];

      const status = String(existing.enrollment_status);

      if (["Draft", "Pending", "Approved"].includes(status)) {
        await connection.rollback();

        return res.status(409).json({
          success: false,

          message: `A ${status} enrollment already exists for this enrollment period.`,

          enrollment: {
            enrollment_id: Number(existing.enrollment_id),

            enrollment_status: status,

            remarks: existing.remarks || null,

            created_at: existing.created_at,
          },
        });
      }
    }

    // =================================================
    // 8. OFFICIAL FINAL GRADES
    //
    // Only:
    //
    // - final_grade
    // - Approved enrollment
    //
    // NO Prelim/Midterm fallback.
    // NO remarks-based result.
    // =================================================

    const [gradeRows] = await connection.execute(
      `
        SELECT
            g.grade_id,
            g.subject_id,
            g.enrollment_id,

            g.final_grade,
            g.remarks,

            e.created_at
                AS enrollment_created_at,

            sub.subject_code,
            sub.subject_name,
            sub.units

        FROM grades g

        INNER JOIN enrollments e
            ON e.enrollment_id =
               g.enrollment_id

        INNER JOIN subjects sub
            ON sub.subject_id =
               g.subject_id

        WHERE g.student_id = ?
          AND g.final_grade IS NOT NULL
          AND e.enrollment_status = 'Approved'

        ORDER BY
            g.subject_id ASC,
            e.created_at DESC,
            g.grade_id DESC
        `,
      [studentId],
    );

    // =================================================
    // 9. LATEST ACADEMIC RESULT MAP
    // =================================================

    const academicMap = new Map();

    for (const row of gradeRows) {
      const subjectId = Number(row.subject_id);

      if (academicMap.has(subjectId)) {
        continue;
      }

      const grade = Number(row.final_grade);

      let result = "UNRESOLVED";

      if (grade >= 1 && grade <= 3) {
        result = "PASSED";
      } else if (grade === 4) {
        result = "INCOMPLETE";
      } else if (grade === 5) {
        result = "FAILED";
      }

      academicMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: row.subject_code,

        subject_name: row.subject_name,

        units: Number(row.units || 0),

        final_grade: grade,

        result,

        grade_id: Number(row.grade_id),

        enrollment_id: Number(row.enrollment_id),
      });
    }

    // =================================================
    // 10. ALL SUBJECTS IN ASSIGNED CURRICULUM
    // =================================================

    const [curriculumSubjectRows] = await connection.execute(
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
            ON s.subject_id =
               cs.subject_id

        WHERE cs.curriculum_id = ?

        ORDER BY
            cs.year_level ASC,
            cs.semester_id ASC,
            cs.display_order ASC
        `,
      [curriculumId],
    );

    const curriculumSubjectMap = new Map();

    for (const row of curriculumSubjectRows) {
      curriculumSubjectMap.set(Number(row.subject_id), row);
    }

    // =================================================
    // 11. CURRENT YEAR + SEMESTER SUBJECTS
    // =================================================

    const currentSubjects = curriculumSubjectRows.filter(
      (row) =>
        Number(row.year_level) === yearLevel &&
        Number(row.semester_id) === semesterId,
    );

    // =================================================
    // 12. PREREQUISITES
    // =================================================

    const prerequisiteMap = new Map();

    const currentSubjectIds = currentSubjects.map((subject) =>
      Number(subject.subject_id),
    );

    if (currentSubjectIds.length > 0) {
      const placeholders = currentSubjectIds.map(() => "?").join(",");

      const [prerequisiteRows] = await connection.execute(
        `
          SELECT
              sp.subject_id,
              sp.prerequisite_subject_id

          FROM subject_prerequisites sp

          WHERE sp.subject_id
                IN (${placeholders})
          `,
        currentSubjectIds,
      );

      for (const row of prerequisiteRows) {
        const subjectId = Number(row.subject_id);

        if (!prerequisiteMap.has(subjectId)) {
          prerequisiteMap.set(subjectId, []);
        }

        prerequisiteMap
          .get(subjectId)
          .push(Number(row.prerequisite_subject_id));
      }
    }

    // =================================================
    // 13. REGULAR ELIGIBLE SUBJECTS
    // =================================================

    const regularEligible = [];

    for (const subject of currentSubjects) {
      const subjectId = Number(subject.subject_id);

      const previousResult = academicMap.get(subjectId);

      // ===============================================
      // ALREADY PASSED
      // ===============================================

      if (previousResult?.result === "PASSED") {
        continue;
      }

      // ===============================================
      // FAILED / INCOMPLETE
      //
      // This is a retake candidate,
      // NOT automatic regular enrollment.
      // ===============================================

      if (
        previousResult?.result === "FAILED" ||
        previousResult?.result === "INCOMPLETE"
      ) {
        continue;
      }

      // ===============================================
      // PREREQUISITE CHECK
      // ===============================================

      const prerequisiteIds = prerequisiteMap.get(subjectId) || [];

      let prerequisitesPassed = true;

      for (const prerequisiteId of prerequisiteIds) {
        const prerequisiteResult = academicMap.get(prerequisiteId);

        if (prerequisiteResult?.result !== "PASSED") {
          prerequisitesPassed = false;

          break;
        }
      }

      if (!prerequisitesPassed) {
        continue;
      }

      // ===============================================
      // ELIGIBLE REGULAR SUBJECT
      // ===============================================

      regularEligible.push({
        subject_id: subjectId,

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        curriculum_subject_id: Number(subject.curriculum_subject_id),

        enrollment_type: "Regular",
      });
    }

    // =================================================
    // 14. VALID RETAKE CANDIDATES
    //
    // Requirements:
    //
    // - latest official final grade = 4 or 5
    // - subject belongs to Student's assigned curriculum
    // =================================================

    const validRetakeMap = new Map();

    for (const academicRecord of academicMap.values()) {
      if (
        academicRecord.result !== "FAILED" &&
        academicRecord.result !== "INCOMPLETE"
      ) {
        continue;
      }

      const subjectId = Number(academicRecord.subject_id);

      const curriculumSubject = curriculumSubjectMap.get(subjectId);

      if (!curriculumSubject) {
        continue;
      }

      validRetakeMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: academicRecord.subject_code,

        subject_name: academicRecord.subject_name,

        units: Number(academicRecord.units || 0),

        curriculum_subject_id: Number(curriculumSubject.curriculum_subject_id),

        previous_final_grade: academicRecord.final_grade,

        previous_status: academicRecord.result,

        enrollment_type: "Retake",
      });
    }

    // =================================================
    // 15. VALIDATE STUDENT-SELECTED RETAKES
    //
    // Student cannot inject arbitrary subject IDs.
    // =================================================

    const invalidRetakeIds = selectedRetakeIds.filter(
      (subjectId) => !validRetakeMap.has(subjectId),
    );

    if (invalidRetakeIds.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "One or more selected subjects are not valid retake candidates.",

        invalid_retake_subject_ids: invalidRetakeIds,

        valid_retake_subject_ids: Array.from(validRetakeMap.keys()),
      });
    }

    // =================================================
    // 16. SELECTED RETAKE SUBJECTS
    // =================================================

    const selectedRetakes = selectedRetakeIds.map((subjectId) =>
      validRetakeMap.get(subjectId),
    );

    // =================================================
    // 17. FINAL DRAFT SUBJECT LIST
    // =================================================

    const draftSubjectMap = new Map();

    // Regular subjects automatically included.
    for (const subject of regularEligible) {
      draftSubjectMap.set(subject.subject_id, subject);
    }

    // Selected retakes added.
    for (const subject of selectedRetakes) {
      draftSubjectMap.set(subject.subject_id, subject);
    }

    const draftSubjects = Array.from(draftSubjectMap.values());

    // =================================================
    // NO ELIGIBLE SUBJECTS
    // =================================================

    if (draftSubjects.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "There are no eligible subjects to prepare for this enrollment period.",
      });
    }

    // =================================================
    // 18. CREATE DRAFT ENROLLMENT
    // =================================================

    const [enrollmentResult] = await connection.execute(
      `
        INSERT INTO enrollments (
            student_id,
            academic_year_id,
            semester_id,
            enrollment_status,
            remarks
        )

        VALUES (
            ?,
            ?,
            ?,
            'Draft',
            ?
        )
        `,
      [studentId, academicYearId, semesterId, "Prepared by Student."],
    );

    const enrollmentId = Number(enrollmentResult.insertId);

    // =================================================
    // 19. INSERT DRAFT SUBJECTS
    //
    // IMPORTANT:
    //
    // section_id         = NULL
    // offering_id        = NULL
    // section_subject_id = NULL
    //
    // Registrar assigns them after submission.
    // =================================================

    for (const subject of draftSubjects) {
      await connection.execute(
        `
        INSERT INTO enrollment_subjects (
            enrollment_id,
            subject_id,
            offering_id,
            section_id,
            section_subject_id,
            status
        )

        VALUES (
            ?,
            ?,
            NULL,
            NULL,
            NULL,
            'Enrolled'
        )
        `,
        [enrollmentId, subject.subject_id],
      );
    }

    // =================================================
    // 20. TOTAL UNITS
    // =================================================

    const totalUnits = draftSubjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    // =================================================
    // 21. COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // 22. RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,

      message: "Draft enrollment prepared successfully.",

      student: {
        student_id: studentId,

        student_number: student.student_number,

        student_name: [
          student.first_name,
          student.middle_name,
          student.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course: {
          course_id: courseId,

          course_code: student.course_code,

          course_name: student.course_name,
        },

        year_level: yearLevel,
      },

      curriculum: {
        curriculum_id: curriculumId,

        curriculum_name: curriculum.curriculum_name,

        effective_year:
          curriculum.effective_year !== null
            ? Number(curriculum.effective_year)
            : null,
      },

      enrollment_period: {
        enrollment_period_id: Number(period.enrollment_period_id),

        academic_year_id: academicYearId,

        academic_year: period.academic_year,

        semester_id: semesterId,

        semester_name: period.semester_name,

        status: period.status,
      },

      enrollment: {
        enrollment_id: enrollmentId,

        student_id: studentId,

        enrollment_status: "Draft",
      },

      summary: {
        total_subjects: draftSubjects.length,

        regular_subjects: regularEligible.length,

        selected_retakes: selectedRetakes.length,

        total_units: totalUnits,
      },

      subjects: draftSubjects,

      next_action:
        "Student may review the Draft and submit it for Registrar review.",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "PREPARE STUDENT ENROLLMENT ROLLBACK ERROR:",
          rollbackError,
        );
      }
    }

    console.error("PREPARE STUDENT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to prepare Student enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
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
// AUTH:
// Student JWT required.
//
// PURPOSE:
//
// Draft
//   ↓
// Revalidate academic eligibility
//   ↓
// Pending
//   ↓
// Registrar reviews and assigns
// section / offering / section_subject
//
// IMPORTANT:
//
// Student identity comes ONLY from req.user.
//
// Student DOES NOT need a section before submission.
//
// Draft subjects may contain:
//
// section_id          = NULL
// offering_id         = NULL
// section_subject_id  = NULL
//
// Registrar assigns placement AFTER submission.
// =====================================================

router.post("/:enrollment_id/submit", async (req, res) => {
  let connection;

  try {
    // =================================================
    // 1. ENROLLMENT ID
    // =================================================

    const enrollmentId = Number(req.params.enrollment_id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    // =================================================
    // 2. AUTHENTICATION
    // =================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (req.user.role_name !== "Student") {
      return res.status(403).json({
        success: false,
        message: "Student access is required.",
      });
    }

    const userId = Number(req.user.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated Student user ID is invalid.",
      });
    }

    // =================================================
    // 3. CONNECTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // 4. AUTHENTICATED STUDENT
    // =================================================

    const [studentRows] = await connection.execute(
      `
        SELECT
            s.student_id,
            s.user_id,
            s.student_number,

            s.first_name,
            s.middle_name,
            s.last_name,

            s.course_id,
            c.course_code,
            c.course_name,

            s.year_level

        FROM students s

        INNER JOIN courses c
            ON c.course_id = s.course_id

        WHERE s.user_id = ?

        LIMIT 1

        FOR UPDATE
        `,
      [userId],
    );

    if (studentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "No Student profile is connected to this account.",
      });
    }

    const student = studentRows[0];

    const studentId = Number(student.student_id);

    const studentCourseId = Number(student.course_id);

    const yearLevel = Number(student.year_level);

    // =================================================
    // 5. GET THIS STUDENT'S ENROLLMENT
    //
    // Ownership is enforced here.
    // Another Student cannot submit it.
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
      [enrollmentId, studentId],
    );

    if (enrollmentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // 6. ONLY DRAFT CAN BE SUBMITTED
    // =================================================

    const enrollmentStatus = String(enrollment.enrollment_status);

    if (enrollmentStatus !== "Draft") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Enrollment cannot be submitted because its current status is "${enrollmentStatus}".`,

        enrollment: {
          enrollment_id: Number(enrollment.enrollment_id),

          enrollment_status: enrollmentStatus,
        },
      });
    }

    // =================================================
    // 7. ENROLLMENT PERIOD MUST STILL BE OPEN
    //
    // And must match this Draft's AY + semester.
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
            ep.opened_at,
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
        message: "The enrollment period for this Draft no longer exists.",
      });
    }

    const enrollmentPeriod = periodRows[0];

    if (String(enrollmentPeriod.status) !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Enrollment can no longer be submitted because the enrollment period is closed.",

        enrollment_period: {
          enrollment_period_id: Number(enrollmentPeriod.enrollment_period_id),

          academic_year: enrollmentPeriod.academic_year,

          semester_name: enrollmentPeriod.semester_name,

          status: enrollmentPeriod.status,
        },
      });
    }

    // =================================================
    // 8. ACTIVE ASSIGNED CURRICULUM
    //
    // Revalidate because Admin may have changed
    // Student curriculum after Draft preparation.
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
        SELECT
            sc.student_curriculum_id,
            sc.curriculum_id,
            sc.status,

            cur.curriculum_name,
            cur.effective_year,
            cur.course_id,
            cur.is_active

        FROM student_curriculum sc

        INNER JOIN curriculum cur
            ON cur.curriculum_id =
               sc.curriculum_id

        WHERE sc.student_id = ?
          AND sc.status = 'Active'
          AND cur.is_active = 1
          AND cur.course_id = ?

        LIMIT 1
        `,
      [studentId, studentCourseId],
    );

    if (curriculumRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message:
          "Enrollment cannot be submitted because the Student no longer has a valid active curriculum.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 9. GET ACTIVE DRAFT SUBJECTS
    //
    // Dropped / Withdrawn are historical and ignored.
    //
    // NO SECTION REQUIREMENT HERE.
    // =================================================

    const [subjectRows] = await connection.execute(
      `
        SELECT
            es.enrollment_subject_id,
            es.enrollment_id,

            es.subject_id,

            es.offering_id,
            es.section_id,
            es.section_subject_id,

            es.status,

            s.subject_code,
            s.subject_name,
            s.units

        FROM enrollment_subjects es

        INNER JOIN subjects s
            ON s.subject_id =
               es.subject_id

        WHERE es.enrollment_id = ?

        ORDER BY
            es.enrollment_subject_id ASC

        FOR UPDATE
        `,
      [enrollmentId],
    );

    const activeSubjects = subjectRows.filter((row) => {
      const status = String(row.status || "");

      return !["Dropped", "Withdrawn"].includes(status);
    });

    if (activeSubjects.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Enrollment cannot be submitted because it has no active subjects.",
      });
    }

    // =================================================
    // 10. ACTIVE DRAFT SUBJECT STATUS
    //
    // Draft membership currently uses Enrolled.
    // =================================================

    const invalidStatusSubjects = activeSubjects.filter(
      (subject) => subject.status !== "Enrolled",
    );

    if (invalidStatusSubjects.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "Some Draft subjects have an invalid enrollment-subject status.",

        invalid_subjects: invalidStatusSubjects.map((subject) => ({
          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          status: subject.status,
        })),
      });
    }

    // =================================================
    // 11. DUPLICATE SUBJECT CHECK
    // =================================================

    const draftSubjectIds = activeSubjects.map((subject) =>
      Number(subject.subject_id),
    );

    const uniqueDraftSubjectIds = new Set(draftSubjectIds);

    if (uniqueDraftSubjectIds.size !== draftSubjectIds.length) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Duplicate subjects were found in the Draft enrollment.",
      });
    }

    // =================================================
    // 12. OFFICIAL FINAL ACADEMIC RESULTS
    //
    // Only:
    // - final_grade
    // - previous Approved enrollment
    //
    // NO Midterm fallback.
    // NO Prelim fallback.
    // NO remarks-based result.
    // =================================================

    const [gradeRows] = await connection.execute(
      `
        SELECT
            g.grade_id,
            g.subject_id,
            g.enrollment_id,

            g.final_grade,
            g.remarks,

            e.created_at
                AS enrollment_created_at,

            sub.subject_code,
            sub.subject_name,
            sub.units

        FROM grades g

        INNER JOIN enrollments e
            ON e.enrollment_id =
               g.enrollment_id

        INNER JOIN subjects sub
            ON sub.subject_id =
               g.subject_id

        WHERE g.student_id = ?
          AND g.final_grade IS NOT NULL
          AND e.enrollment_status = 'Approved'

        ORDER BY
            g.subject_id ASC,
            e.created_at DESC,
            g.grade_id DESC
        `,
      [studentId],
    );

    const academicMap = new Map();

    for (const row of gradeRows) {
      const subjectId = Number(row.subject_id);

      if (academicMap.has(subjectId)) {
        continue;
      }

      const finalGrade = Number(row.final_grade);

      let result = "UNRESOLVED";

      if (finalGrade >= 1 && finalGrade <= 3) {
        result = "PASSED";
      } else if (finalGrade === 4) {
        result = "INCOMPLETE";
      } else if (finalGrade === 5) {
        result = "FAILED";
      }

      academicMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: row.subject_code,

        subject_name: row.subject_name,

        units: Number(row.units || 0),

        final_grade: finalGrade,

        result,
      });
    }

    // =================================================
    // 13. LOAD ASSIGNED CURRICULUM SUBJECTS
    // =================================================

    const [curriculumSubjectRows] = await connection.execute(
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
            s.units

        FROM curriculum_subjects cs

        INNER JOIN subjects s
            ON s.subject_id =
               cs.subject_id

        WHERE cs.curriculum_id = ?

        ORDER BY
            cs.year_level,
            cs.semester_id,
            cs.display_order
        `,
      [curriculumId],
    );

    const curriculumSubjectMap = new Map();

    for (const row of curriculumSubjectRows) {
      curriculumSubjectMap.set(Number(row.subject_id), row);
    }

    // =================================================
    // 14. CURRENT YEAR / SEMESTER SUBJECTS
    // =================================================

    const currentCurriculumSubjects = curriculumSubjectRows.filter(
      (row) =>
        Number(row.year_level) === yearLevel &&
        Number(row.semester_id) === Number(enrollment.semester_id),
    );

    // =================================================
    // 15. LOAD PREREQUISITES
    // =================================================

    const currentSubjectIds = currentCurriculumSubjects.map((subject) =>
      Number(subject.subject_id),
    );

    const prerequisiteMap = new Map();

    if (currentSubjectIds.length > 0) {
      const placeholders = currentSubjectIds.map(() => "?").join(",");

      const [prerequisiteRows] = await connection.execute(
        `
          SELECT
              sp.subject_id,
              sp.prerequisite_subject_id,

              s.subject_code
                  AS prerequisite_subject_code,

              s.subject_name
                  AS prerequisite_subject_name

          FROM subject_prerequisites sp

          INNER JOIN subjects s
              ON s.subject_id =
                 sp.prerequisite_subject_id

          WHERE sp.subject_id
                IN (${placeholders})
          `,
        currentSubjectIds,
      );

      for (const row of prerequisiteRows) {
        const subjectId = Number(row.subject_id);

        if (!prerequisiteMap.has(subjectId)) {
          prerequisiteMap.set(subjectId, []);
        }

        prerequisiteMap.get(subjectId).push({
          subject_id: Number(row.prerequisite_subject_id),

          subject_code: row.prerequisite_subject_code,

          subject_name: row.prerequisite_subject_name,
        });
      }
    }

    // =================================================
    // 16. REBUILD ELIGIBLE REGULAR SUBJECT LIST
    //
    // This prevents someone from editing the Draft
    // directly and injecting an arbitrary regular
    // subject.
    // =================================================

    const eligibleRegularMap = new Map();

    for (const subject of currentCurriculumSubjects) {
      const subjectId = Number(subject.subject_id);

      const previous = academicMap.get(subjectId);

      // Already passed.
      if (previous?.result === "PASSED") {
        continue;
      }

      // Failed/Incomplete = retake,
      // not regular.
      if (previous?.result === "FAILED" || previous?.result === "INCOMPLETE") {
        continue;
      }

      const prerequisites = prerequisiteMap.get(subjectId) || [];

      const missingPrerequisites = prerequisites.filter(
        (prerequisite) =>
          academicMap.get(prerequisite.subject_id)?.result !== "PASSED",
      );

      if (missingPrerequisites.length > 0) {
        continue;
      }

      eligibleRegularMap.set(subjectId, subject);
    }

    // =================================================
    // 17. REBUILD VALID RETAKE LIST
    //
    // Retake is optional.
    //
    // A valid selected retake must:
    //
    // - belong to assigned curriculum
    // - latest official final result = 4 or 5
    // =================================================

    const validRetakeMap = new Map();

    for (const academicRecord of academicMap.values()) {
      if (
        academicRecord.result !== "FAILED" &&
        academicRecord.result !== "INCOMPLETE"
      ) {
        continue;
      }

      const subjectId = Number(academicRecord.subject_id);

      const curriculumSubject = curriculumSubjectMap.get(subjectId);

      if (!curriculumSubject) {
        continue;
      }

      validRetakeMap.set(subjectId, {
        ...curriculumSubject,

        previous_final_grade: academicRecord.final_grade,

        previous_status: academicRecord.result,
      });
    }

    // =================================================
    // 18. VALIDATE EVERY DRAFT SUBJECT
    //
    // Each subject must be either:
    //
    // 1. eligible regular
    // OR
    // 2. valid selected retake
    //
    // It does NOT need a section yet.
    // =================================================

    const invalidAcademicSubjects = [];

    let regularCount = 0;
    let retakeCount = 0;

    for (const subject of activeSubjects) {
      const subjectId = Number(subject.subject_id);

      if (eligibleRegularMap.has(subjectId)) {
        regularCount += 1;

        continue;
      }

      if (validRetakeMap.has(subjectId)) {
        retakeCount += 1;

        continue;
      }

      invalidAcademicSubjects.push({
        enrollment_subject_id: Number(subject.enrollment_subject_id),

        subject_id: subjectId,

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        reason: "SUBJECT_NO_LONGER_ELIGIBLE",
      });
    }

    if (invalidAcademicSubjects.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message: "Some Draft subjects are no longer academically eligible.",

        invalid_subjects: invalidAcademicSubjects,
      });
    }

    // =================================================
    // 19. VERIFY ALL ELIGIBLE REGULAR SUBJECTS EXIST
    //
    // Regular subjects are automatic in /prepare.
    //
    // Student may choose valid retakes,
    // but should not remove required eligible regular
    // subjects from the Draft.
    // =================================================

    const missingRegularSubjects = [];

    for (const [subjectId, subject] of eligibleRegularMap.entries()) {
      if (!uniqueDraftSubjectIds.has(subjectId)) {
        missingRegularSubjects.push({
          subject_id: Number(subjectId),

          subject_code: subject.subject_code,

          subject_name: subject.subject_name,
        });
      }
    }

    if (missingRegularSubjects.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,

        message:
          "Some required eligible regular subjects are missing from the Draft.",

        missing_regular_subjects: missingRegularSubjects,
      });
    }

    // =================================================
    // 20. TOTAL UNITS
    // =================================================

    const totalUnits = activeSubjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    // =================================================
    // 21. IMPORTANT:
    //
    // DO NOT REQUIRE:
    //
    // section_id
    // offering_id
    // section_subject_id
    //
    // They are intentionally allowed to remain NULL.
    //
    // Registrar will assign them while Pending.
    // =================================================

    // =================================================
    // 22. DRAFT → PENDING
    // =================================================

    const submittedRemarks = enrollment.remarks || "Submitted by Student.";

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
      [submittedRemarks, enrollmentId, studentId],
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Enrollment could not be submitted because its status changed before submission.",
      });
    }

    // =================================================
    // 23. COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // 24. RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message:
        "Enrollment submitted successfully and is now pending Registrar review.",

      student: {
        student_id: studentId,

        student_number: student.student_number,

        student_name: [
          student.first_name,
          student.middle_name,
          student.last_name,
        ]
          .filter(Boolean)
          .join(" "),
      },

      enrollment: {
        enrollment_id: enrollmentId,

        student_id: studentId,

        academic_year_id: Number(enrollment.academic_year_id),

        academic_year: enrollment.academic_year,

        semester_id: Number(enrollment.semester_id),

        semester_name: enrollment.semester_name,

        enrollment_status: "Pending",

        remarks: submittedRemarks,

        created_at: enrollment.created_at,
      },

      summary: {
        total_subjects: activeSubjects.length,

        regular_subjects: regularCount,

        selected_retakes: retakeCount,

        total_units: totalUnits,
      },

      registrar_assignment: {
        required: true,

        message:
          "Registrar must now review the enrollment and assign valid sections and subject offerings.",

        unassigned_subjects: activeSubjects.filter(
          (subject) =>
            subject.section_id === null ||
            subject.offering_id === null ||
            subject.section_subject_id === null,
        ).length,
      },

      next_action: "Registrar reviews this Pending enrollment.",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "SUBMIT STUDENT ENROLLMENT ROLLBACK ERROR:",
          rollbackError,
        );
      }
    }

    console.error("SUBMIT STUDENT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to submit Student enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// EXPORT ROUTER
// =====================================================

export default router;
