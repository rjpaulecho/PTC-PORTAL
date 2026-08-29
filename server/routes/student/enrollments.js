// routes/student/enrollments.js

import express from "express";
import db from "../../db.js";

import {
  ELIGIBILITY_TYPE,
  evaluateCurriculumTerm,
  getApprovedAcademicHistory,
  getRetakeCandidates,
} from "../../services/academicEvaluation.service.js";

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
// PURPOSE:
//
// - Identify Student from req.user
// - Load active assigned curriculum
// - Load current Open enrollment period
// - Evaluate current curriculum subjects
// - Use ONLY Approved Grade V2 academic history
// - Remove already-passed subjects
// - Detect valid retakes
// - Validate prerequisites
// - Show current Draft membership
//
// IMPORTANT:
//
// Student DOES NOT choose:
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
    // 2. GET AUTHENTICATED STUDENT
    //
    // Student identity comes ONLY from req.user.
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
    // 3. ACTIVE ASSIGNED CURRICULUM
    //
    // Must:
    // - belong to Student
    // - have Active assignment
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
            cur.course_id

        FROM student_curriculum sc

        INNER JOIN curriculum cur
            ON cur.curriculum_id = sc.curriculum_id

        WHERE sc.student_id = ?
          AND sc.status = 'Active'
          AND cur.is_active = 1
          AND cur.course_id = ?

        ORDER BY
            sc.assigned_date DESC,
            sc.student_curriculum_id DESC

        LIMIT 1
      `,
      [studentId, studentCourseId],
    );

    if (curriculumRows.length === 0) {
      return res.status(409).json({
        success: false,

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message:
          "Student enrollment cannot continue because there is no valid active curriculum assigned to this Student.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 4. CURRENT OPEN ENROLLMENT PERIOD
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
    // 5. ENROLLMENT CLOSED
    //
    // This is NOT an authentication error.
    // Student can still open the enrollment page.
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
        can_modify_draft: false,
        can_submit: false,
      });
    }

    const period = periodRows[0];

    const academicYearId = Number(period.academic_year_id);
    const semesterId = Number(period.semester_id);

    // =================================================
    // 6. CURRENT ENROLLMENT
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
    // 7. OFFICIAL APPROVED ACADEMIC HISTORY
    //
    // Grade Model V2:
    //
    // grades
    //   ↓ enrollment_subject_id
    // enrollment_subjects
    //   ↓ enrollment_id
    // enrollments
    //
    // ONLY:
    //
    // grade_status = Approved
    // enrollment_status = Approved
    //
    // final_rating is authoritative.
    // =================================================

    const approvedHistory = await getApprovedAcademicHistory(studentId, db);

    // Build latest Approved academic result per subject.
    //
    // getApprovedAcademicHistory() is already newest-first.
    const latestHistoryMap = new Map();

    for (const record of approvedHistory) {
      const subjectId = Number(record.subject_id);

      if (!latestHistoryMap.has(subjectId)) {
        latestHistoryMap.set(subjectId, record);
      }
    }

    // =================================================
    // 8. EVALUATE CURRENT CURRICULUM TERM
    //
    // Shared service is now the authoritative source
    // for:
    //
    // - Regular
    // - Retake
    // - Already Passed
    // - Blocked Prerequisite
    // - Unresolved academic result
    // =================================================

    const termEvaluation = await evaluateCurriculumTerm(
      {
        studentId,
        curriculumId,
        yearLevel,
        semesterId,
      },
      db,
    );

    // =================================================
    // 9. ALL SUBJECTS IN ASSIGNED CURRICULUM
    //
    // Needed to preserve existing response metadata
    // for retakes from earlier semesters.
    // =================================================

    const [allCurriculumRows] = await db.execute(
      `
          SELECT
              cs.curriculum_subject_id,
              cs.curriculum_id,
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

    const curriculumSubjectMap = new Map();

    for (const row of allCurriculumRows) {
      curriculumSubjectMap.set(Number(row.subject_id), row);
    }

    // =================================================
    // 10. HELPER — FORMAT PREREQUISITES
    //
    // Preserve the frontend's existing prerequisite
    // response shape.
    // =================================================

    function formatPrerequisites(prerequisiteCheck) {
      if (
        !prerequisiteCheck ||
        !Array.isArray(prerequisiteCheck.prerequisites)
      ) {
        return [];
      }

      return prerequisiteCheck.prerequisites.map((prerequisite) => {
        const prerequisiteSubjectId = Number(
          prerequisite.prerequisite_subject_id,
        );

        const academicRecord = latestHistoryMap.get(prerequisiteSubjectId);

        return {
          prerequisite_id: Number(prerequisite.prerequisite_id),

          subject_id: prerequisiteSubjectId,

          subject_code: prerequisite.prerequisite_subject_code,

          subject_name: prerequisite.prerequisite_subject_name,

          passed: Boolean(prerequisite.is_satisfied),

          // Keep old API property name for frontend
          // compatibility.
          //
          // Value now correctly comes from final_rating.
          final_grade: academicRecord?.final_rating ?? null,

          academic_status: academicRecord?.result
            ? String(academicRecord.result).toUpperCase()
            : "NOT_TAKEN",
        };
      });
    }

    // =================================================
    // 11. COMPLETED / PASSED SUBJECTS
    // =================================================

    const completedSubjectMap = new Map();

    for (const record of approvedHistory) {
      if (record.result !== "Passed") {
        continue;
      }

      const subjectId = Number(record.subject_id);

      if (completedSubjectMap.has(subjectId)) {
        continue;
      }

      completedSubjectMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: record.subject_code,

        subject_name: record.subject_name,

        units: Number(record.units || 0),

        // Existing frontend property name preserved.
        final_grade: record.final_rating,

        academic_status: "PASSED",
      });
    }

    const completedSubjects = Array.from(completedSubjectMap.values());

    // =================================================
    // 12. REGULAR ELIGIBLE SUBJECTS
    // =================================================

    const regularSubjects = termEvaluation.regular.map((subject) => ({
      subject_id: Number(subject.subject_id),

      subject_code: subject.subject_code,

      subject_name: subject.subject_name,

      units: Number(subject.units || 0),

      lecture_hours: Number(subject.lecture_hours || 0),

      laboratory_hours: Number(subject.laboratory_hours || 0),

      year_level: Number(subject.year_level),

      semester_id: Number(subject.semester_id),

      is_required: Boolean(subject.is_required),

      display_order: Number(subject.display_order),

      curriculum_subject_id: Number(subject.curriculum_subject_id),

      enrollment_type: "Regular",

      academic_status: "NOT_TAKEN",

      eligible: true,

      prerequisites: formatPrerequisites(subject.prerequisites),
    }));

    // =================================================
    // 13. BLOCKED SUBJECTS
    //
    // Already-passed subjects are NOT blocked.
    // They belong in completed_subjects.
    // =================================================

    const blockedSubjects = [];

    for (const subject of termEvaluation.blocked) {
      if (subject.eligibility_type === ELIGIBILITY_TYPE.ALREADY_PASSED) {
        continue;
      }

      const prerequisites = formatPrerequisites(subject.prerequisites);

      const missingPrerequisites = prerequisites.filter((item) => !item.passed);

      let reason = "ACADEMIC_RESULT_UNRESOLVED";

      if (subject.eligibility_type === ELIGIBILITY_TYPE.BLOCKED_PREREQUISITE) {
        reason = "PREREQUISITE_NOT_PASSED";
      }

      blockedSubjects.push({
        subject_id: Number(subject.subject_id),

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        year_level: Number(subject.year_level),

        semester_id: Number(subject.semester_id),

        curriculum_subject_id: Number(subject.curriculum_subject_id),

        reason,

        prerequisites,

        missing_prerequisites: missingPrerequisites,
      });
    }

    // =================================================
    // 14. VALID RETAKE CANDIDATES
    //
    // Can come from an older year/semester.
    //
    // Shared service guarantees:
    //
    // - subject belongs to assigned curriculum
    // - latest Approved result is 4.00 or 5.00
    // - subject has not later been passed
    // - prerequisites are satisfied
    // =================================================

    const retakeRows = await getRetakeCandidates(studentId, curriculumId, db);

    const retakeCandidates = retakeRows.map((retake) => {
      const curriculumSubject = curriculumSubjectMap.get(
        Number(retake.subject_id),
      );

      return {
        subject_id: Number(retake.subject_id),

        subject_code: retake.subject_code,

        subject_name: retake.subject_name,

        units: Number(retake.units || 0),

        lecture_hours: curriculumSubject
          ? Number(curriculumSubject.lecture_hours || 0)
          : 0,

        laboratory_hours: curriculumSubject
          ? Number(curriculumSubject.laboratory_hours || 0)
          : 0,

        // Keep old frontend property name.
        // This value now comes from final_rating.
        previous_final_grade: retake.previous_final_rating,

        previous_status: String(retake.previous_result).toUpperCase(),

        previous_grade_id: retake.previous_grade_id,

        curriculum_subject_id: curriculumSubject
          ? Number(curriculumSubject.curriculum_subject_id)
          : null,

        original_year_level: curriculumSubject
          ? Number(curriculumSubject.year_level)
          : null,

        original_semester_id: curriculumSubject
          ? Number(curriculumSubject.semester_id)
          : null,

        enrollment_type: "Retake",

        eligible_for_retake: true,

        prerequisites: formatPrerequisites(retake.prerequisites),
      };
    });

    // =================================================
    // 15. CURRENT DRAFT SUBJECT MEMBERSHIP
    //
    // Student does NOT choose placement.
    //
    // We only identify whether subjects are already
    // present in an existing Draft.
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
    // 16. MARK CURRENT DRAFT MEMBERSHIP
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
// BODY:
//
// {
//   "selected_retake_subject_ids": [37]
// }
//
// RULES:
//
// - Student identity comes ONLY from req.user.
// - Open enrollment period is required.
// - Valid active curriculum is required.
// - Eligible Regular subjects are automatically added.
// - Student may select only valid Retake candidates.
// - Passed subjects are excluded.
// - Subjects with unmet prerequisites are excluded.
// - Student NEVER selects section/offering.
// - Draft placement remains NULL.
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
    // Retakes are optional.
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
    // 4. AUTHENTICATED STUDENT PROFILE
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
    // 5. ACTIVE ASSIGNED CURRICULUM
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

          ORDER BY
              sc.assigned_date DESC,
              sc.student_curriculum_id DESC

          LIMIT 1

          FOR UPDATE
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
    // 7. PREVENT DUPLICATE CURRENT ENROLLMENT
    //
    // Do not create another:
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

      const existingStatus = String(existing.enrollment_status);

      if (["Draft", "Pending", "Approved"].includes(existingStatus)) {
        await connection.rollback();

        return res.status(409).json({
          success: false,

          message: `A ${existingStatus} enrollment already exists for this enrollment period.`,

          enrollment: {
            enrollment_id: Number(existing.enrollment_id),

            enrollment_status: existingStatus,

            remarks: existing.remarks || null,

            created_at: existing.created_at,
          },
        });
      }
    }

    // =================================================
    // 8. EVALUATE CURRENT TERM
    //
    // Shared Academic Evaluation Service is now the
    // authoritative academic eligibility source.
    //
    // Uses:
    //
    // grades.enrollment_subject_id
    // enrollment_subjects.enrollment_id
    // enrollments.student_id
    //
    // Only Approved grades/enrollments count.
    // final_rating is authoritative.
    // =================================================

    const termEvaluation = await evaluateCurriculumTerm(
      {
        studentId,
        curriculumId,
        yearLevel,
        semesterId,
      },
      connection,
    );

    // =================================================
    // 9. REGULAR ELIGIBLE SUBJECTS
    //
    // Automatically included.
    // =================================================

    const regularEligible = termEvaluation.regular.map((subject) => ({
      subject_id: Number(subject.subject_id),

      subject_code: subject.subject_code,

      subject_name: subject.subject_name,

      units: Number(subject.units || 0),

      curriculum_subject_id: Number(subject.curriculum_subject_id),

      enrollment_type: "Regular",
    }));

    // =================================================
    // 10. LOAD ALL ASSIGNED CURRICULUM SUBJECTS
    //
    // Retakes may originate from an older term, so
    // current-term evaluation alone is not enough.
    // =================================================

    const [curriculumSubjectRows] = await connection.execute(
      `
          SELECT
              cs.curriculum_subject_id,
              cs.curriculum_id,
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
              cs.year_level ASC,
              cs.semester_id ASC,
              cs.display_order ASC,
              s.subject_code ASC
        `,
      [curriculumId],
    );

    const curriculumSubjectMap = new Map();

    for (const subject of curriculumSubjectRows) {
      curriculumSubjectMap.set(Number(subject.subject_id), subject);
    }

    // =================================================
    // 11. VALID RETAKE CANDIDATES
    //
    // Shared service guarantees:
    //
    // - belongs to assigned curriculum
    // - Approved 4.00 or 5.00 result
    // - not later passed
    // - prerequisites satisfied
    // =================================================

    const validRetakeRows = await getRetakeCandidates(
      studentId,
      curriculumId,
      connection,
    );

    const validRetakeMap = new Map();

    for (const retake of validRetakeRows) {
      const subjectId = Number(retake.subject_id);

      const curriculumSubject = curriculumSubjectMap.get(subjectId);

      // Defensive protection.
      //
      // Retake must still belong to assigned curriculum.
      if (!curriculumSubject) {
        continue;
      }

      validRetakeMap.set(subjectId, {
        subject_id: subjectId,

        subject_code: retake.subject_code,

        subject_name: retake.subject_name,

        units: Number(retake.units || 0),

        curriculum_subject_id: Number(curriculumSubject.curriculum_subject_id),

        original_year_level: Number(curriculumSubject.year_level),

        original_semester_id: Number(curriculumSubject.semester_id),

        // Preserve old API naming.
        //
        // Value now correctly comes from final_rating.
        previous_final_grade: retake.previous_final_rating,

        previous_status: String(retake.previous_result).toUpperCase(),

        previous_grade_id: retake.previous_grade_id,

        enrollment_type: "Retake",
      });
    }

    // =================================================
    // 12. VALIDATE STUDENT-SELECTED RETAKES
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
    // 13. SELECTED RETAKES
    // =================================================

    const selectedRetakes = selectedRetakeIds.map((subjectId) =>
      validRetakeMap.get(subjectId),
    );

    // =================================================
    // 14. FINAL DRAFT SUBJECT LIST
    //
    // Regular:
    // automatically included.
    //
    // Retake:
    // optional Student selection.
    // =================================================

    const draftSubjectMap = new Map();

    for (const subject of regularEligible) {
      draftSubjectMap.set(subject.subject_id, subject);
    }

    for (const subject of selectedRetakes) {
      draftSubjectMap.set(subject.subject_id, subject);
    }

    const draftSubjects = Array.from(draftSubjectMap.values());

    // =================================================
    // 15. NO ELIGIBLE SUBJECTS
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
    // 16. CREATE DRAFT ENROLLMENT
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
    // 17. INSERT DRAFT SUBJECTS
    //
    // VERY IMPORTANT:
    //
    // Student DOES NOT assign placement.
    //
    // offering_id        = NULL
    // section_id         = NULL
    // section_subject_id = NULL
    //
    // Registrar assigns these after submission.
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
    // 18. TOTAL UNITS
    // =================================================

    const totalUnits = draftSubjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    // =================================================
    // 19. COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // 20. RESPONSE
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
// FLOW:
//
// Draft
//   ↓
// Revalidate academic eligibility
//   ↓
// Pending
//   ↓
// Registrar reviews and assigns placement
//
// IMPORTANT:
//
// - Student identity comes ONLY from req.user.
// - Student can submit ONLY their own Draft.
// - Enrollment period must still be Open.
// - Active curriculum must still be valid.
// - Every Draft subject is revalidated.
// - All currently eligible Regular subjects must exist.
// - Retakes must still be valid.
// - Passed subjects cannot be submitted again.
// - Blocked prerequisite subjects cannot be submitted.
// - Student does NOT choose placement.
// =====================================================

router.post("/:enrollment_id/submit", async (req, res) => {
  let connection;
  let transactionActive = false;

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
    // 3. CONNECTION + TRANSACTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

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
      transactionActive = false;

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
    //
    // Student A cannot submit Student B's enrollment.
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
      transactionActive = false;

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
      transactionActive = false;

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
    // Must match this Draft's:
    //
    // academic_year_id
    // semester_id
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
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message: "The enrollment period for this Draft no longer exists.",
      });
    }

    const enrollmentPeriod = periodRows[0];

    if (String(enrollmentPeriod.status) !== "Open") {
      await connection.rollback();
      transactionActive = false;

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

    const semesterId = Number(enrollment.semester_id);

    // =================================================
    // 8. ACTIVE ASSIGNED CURRICULUM
    //
    // Revalidate because curriculum/profile state may
    // have changed after Draft preparation.
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

          ORDER BY
              sc.assigned_date DESC,
              sc.student_curriculum_id DESC

          LIMIT 1

          FOR UPDATE
        `,
      [studentId, studentCourseId],
    );

    if (curriculumRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

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
    // 9. GET ALL DRAFT SUBJECT MEMBERSHIP
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

    // =================================================
    // 10. ACTIVE SUBJECTS
    //
    // Dropped and Withdrawn are historical.
    // =================================================

    const activeSubjects = subjectRows.filter((subject) => {
      const status = String(subject.status || "");

      return !["Dropped", "Withdrawn"].includes(status);
    });

    if (activeSubjects.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(400).json({
        success: false,

        message:
          "Enrollment cannot be submitted because it has no active subjects.",
      });
    }

    // =================================================
    // 11. DRAFT SUBJECT STATUS
    //
    // Before grades exist, Draft membership must still
    // be Enrolled.
    //
    // Completed / Failed / Incomplete belong to
    // finalized academic attempts, not a new Draft.
    // =================================================

    const invalidStatusSubjects = activeSubjects.filter(
      (subject) => String(subject.status) !== "Enrolled",
    );

    if (invalidStatusSubjects.length > 0) {
      await connection.rollback();
      transactionActive = false;

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
    // 12. DUPLICATE SUBJECT CHECK
    // =================================================

    const draftSubjectIds = activeSubjects.map((subject) =>
      Number(subject.subject_id),
    );

    const uniqueDraftSubjectIds = new Set(draftSubjectIds);

    if (uniqueDraftSubjectIds.size !== draftSubjectIds.length) {
      await connection.rollback();
      transactionActive = false;

      return res.status(400).json({
        success: false,

        message: "Duplicate subjects were found in the Draft enrollment.",
      });
    }

    // =================================================
    // 13. RE-EVALUATE CURRENT TERM
    //
    // This is the authoritative regular-subject check.
    //
    // Uses Grade Model V2 through the shared service:
    //
    // grades.enrollment_subject_id
    //        ↓
    // enrollment_subjects
    //        ↓
    // enrollments.student_id
    //
    // Only:
    //
    // grade_status = Approved
    // enrollment_status = Approved
    //
    // final_rating is authoritative.
    // =================================================

    const termEvaluation = await evaluateCurriculumTerm(
      {
        studentId,
        curriculumId,
        yearLevel,
        semesterId,
      },
      connection,
    );

    // =================================================
    // 14. ELIGIBLE REGULAR SUBJECT MAP
    // =================================================

    const eligibleRegularMap = new Map();

    for (const subject of termEvaluation.regular) {
      eligibleRegularMap.set(Number(subject.subject_id), subject);
    }

    // =================================================
    // 15. VALID RETAKE SUBJECT MAP
    //
    // Retakes may come from any previous term in the
    // Student's currently assigned curriculum.
    //
    // Shared service validates:
    //
    // - latest Approved rating is 4.00 or 5.00
    // - no later Approved pass exists
    // - subject belongs to active curriculum
    // - prerequisites are satisfied
    // =================================================

    const retakeRows = await getRetakeCandidates(
      studentId,
      curriculumId,
      connection,
    );

    const validRetakeMap = new Map();

    for (const retake of retakeRows) {
      validRetakeMap.set(Number(retake.subject_id), retake);
    }

    // =================================================
    // 16. VALIDATE EVERY DRAFT SUBJECT
    //
    // Every active Draft subject must currently be:
    //
    // 1. Regular eligible
    //
    // OR
    //
    // 2. Valid retake
    //
    // Anything else is rejected.
    // =================================================

    const invalidAcademicSubjects = [];

    let regularCount = 0;
    let retakeCount = 0;

    for (const subject of activeSubjects) {
      const subjectId = Number(subject.subject_id);

      // -----------------------------------------------
      // REGULAR
      // -----------------------------------------------

      if (eligibleRegularMap.has(subjectId)) {
        regularCount += 1;
        continue;
      }

      // -----------------------------------------------
      // RETAKE
      // -----------------------------------------------

      if (validRetakeMap.has(subjectId)) {
        retakeCount += 1;
        continue;
      }

      // -----------------------------------------------
      // INVALID / NO LONGER ELIGIBLE
      // -----------------------------------------------

      const blockedCurrentSubject = termEvaluation.blocked.find(
        (item) => Number(item.subject_id) === subjectId,
      );

      let reason = "SUBJECT_NO_LONGER_ELIGIBLE";

      if (blockedCurrentSubject) {
        if (
          blockedCurrentSubject.eligibility_type ===
          ELIGIBILITY_TYPE.ALREADY_PASSED
        ) {
          reason = "SUBJECT_ALREADY_PASSED";
        } else if (
          blockedCurrentSubject.eligibility_type ===
          ELIGIBILITY_TYPE.BLOCKED_PREREQUISITE
        ) {
          reason = "PREREQUISITE_NOT_PASSED";
        } else if (
          blockedCurrentSubject.eligibility_type === ELIGIBILITY_TYPE.UNRESOLVED
        ) {
          reason = "ACADEMIC_RESULT_UNRESOLVED";
        }
      }

      invalidAcademicSubjects.push({
        enrollment_subject_id: Number(subject.enrollment_subject_id),

        subject_id: subjectId,

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        reason,
      });
    }

    if (invalidAcademicSubjects.length > 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(400).json({
        success: false,

        message: "Some Draft subjects are no longer academically eligible.",

        invalid_subjects: invalidAcademicSubjects,
      });
    }

    // =================================================
    // 17. VERIFY ALL ELIGIBLE REGULAR SUBJECTS EXIST
    //
    // Regular subjects are automatic.
    //
    // Student may choose whether to take a valid retake,
    // but must not remove eligible Regular subjects
    // from the Draft.
    // =================================================

    const missingRegularSubjects = [];

    for (const [subjectId, subject] of eligibleRegularMap.entries()) {
      if (uniqueDraftSubjectIds.has(subjectId)) {
        continue;
      }

      missingRegularSubjects.push({
        subject_id: Number(subjectId),

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        curriculum_subject_id: Number(subject.curriculum_subject_id),
      });
    }

    if (missingRegularSubjects.length > 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(400).json({
        success: false,

        message:
          "Some required eligible regular subjects are missing from the Draft.",

        missing_regular_subjects: missingRegularSubjects,
      });
    }

    // =================================================
    // 18. TOTAL UNITS
    // =================================================

    const totalUnits = activeSubjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    // =================================================
    // 19. PLACEMENT
    //
    // DO NOT REQUIRE:
    //
    // section_id
    // offering_id
    // section_subject_id
    //
    // Student preparation intentionally leaves them
    // NULL.
    //
    // Registrar owns placement after submission.
    // =================================================

    const unassignedSubjects = activeSubjects.filter(
      (subject) =>
        subject.section_id === null ||
        subject.offering_id === null ||
        subject.section_subject_id === null,
    );

    // =================================================
    // 20. DRAFT → PENDING
    // =================================================

    const submittedRemarks = enrollment.remarks || "Submitted by Student.";

    const [updateResult] = await connection.execute(
      `
          UPDATE enrollments

          SET
              enrollment_status =
                  'Pending',

              remarks = ?

          WHERE enrollment_id = ?

            AND student_id = ?

            AND enrollment_status =
                'Draft'
        `,
      [submittedRemarks, enrollmentId, studentId],
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message:
          "Enrollment could not be submitted because its status changed before submission.",
      });
    }

    // =================================================
    // 21. COMMIT
    // =================================================

    await connection.commit();

    transactionActive = false;

    // =================================================
    // 22. RESPONSE
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

      curriculum: {
        curriculum_id: curriculumId,

        curriculum_name: curriculum.curriculum_name,

        effective_year:
          curriculum.effective_year !== null
            ? Number(curriculum.effective_year)
            : null,
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

        unassigned_subjects: unassignedSubjects.length,
      },

      next_action: "Registrar reviews this Pending enrollment.",
    });
  } catch (error) {
    if (connection && transactionActive) {
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
