// routes/registrar/enrollments.js

import express from "express";
import db from "../../db.js";

import {
  ELIGIBILITY_TYPE,
  evaluateSubjectEligibility,
} from "../../services/academicEvaluation.service.js";

const router = express.Router();

// =====================================================
// HELPERS
// =====================================================

function toPositiveInt(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

// =====================================================
// GET REGISTRAR ACTOR FROM JWT
// =====================================================

function getRegistrarActor(req, res) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });

    return null;
  }

  if (req.user.role_name !== "Registrar") {
    res.status(403).json({
      success: false,
      message: "Registrar access is required.",
    });

    return null;
  }

  const userId = toPositiveInt(req.user.user_id);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authenticated Registrar user ID is invalid.",
    });

    return null;
  }

  return {
    user_id: userId,
    username: req.user.username || null,
  };
}
// =====================================================
// ACADEMIC ELIGIBILITY HELPERS
// =====================================================
//
// AUTHORITATIVE PTC RULES:
//
// 1. Only APPROVED final grades are academic truth.
//
// 2. Final grade classification:
//      1.00 - 3.00 = Passed
//      4.00        = Incomplete / Retake
//      5.00        = Failed / Retake
//
// 3. remarks DO NOT override final_grade.
//
// 4. If the student has EVER passed the target
//    subject, the subject cannot be taken again.
//
// 5. REGULAR / NEW subject:
//      prerequisites MUST already be passed.
//
// 6. VALID RETAKE:
//      previous Approved grade = 4.00 or 5.00.
//
//    A legitimate retake is NOT blocked by missing
//    prerequisite history because the student has
//    already previously taken the target subject.
//
// 7. Invalid / unsupported Approved final grades
//    block eligibility.
//
// =====================================================

// =====================================================
// CLASSIFY OFFICIAL FINAL GRADE
// =====================================================

function classifyFinalGrade(value) {
  if (value === null || value === undefined || value === "") {
    return {
      code: "NO_FINAL_GRADE",

      classification: "Unknown",

      passed: false,

      retake: false,

      valid: false,

      final_grade: null,
    };
  }

  const grade = Number(value);

  if (!Number.isFinite(grade)) {
    return {
      code: "INVALID_FINAL_GRADE",

      classification: "Unknown",

      passed: false,

      retake: false,

      valid: false,

      final_grade: null,
    };
  }

  // ===============================================
  // PASSED
  // ===============================================

  if (grade >= 1.0 && grade <= 3.0) {
    return {
      code: "PASSED",

      classification: "Passed",

      passed: true,

      retake: false,

      valid: true,

      final_grade: grade,
    };
  }

  // ===============================================
  // INCOMPLETE
  //
  // Official retake grade.
  // ===============================================

  if (grade === 4.0) {
    return {
      code: "INCOMPLETE",

      classification: "Incomplete",

      passed: false,

      retake: true,

      valid: true,

      final_grade: grade,
    };
  }

  // ===============================================
  // FAILED
  //
  // Official retake grade.
  // ===============================================

  if (grade === 5.0) {
    return {
      code: "FAILED",

      classification: "Failed",

      passed: false,

      retake: true,

      valid: true,

      final_grade: grade,
    };
  }

  // ===============================================
  // UNSUPPORTED OFFICIAL GRADE
  // ===============================================

  return {
    code: "INVALID_FINAL_GRADE",

    classification: "Unknown",

    passed: false,

    retake: false,

    valid: false,

    final_grade: grade,
  };
}

// =====================================================
// GET APPROVED GRADES FOR SUBJECTS
// =====================================================
//
// IMPORTANT:
//
// Enrollment eligibility must NEVER use:
// - Draft grade
// - Submitted grade
// - Returned grade
//
// Only:
// grade_status = Approved
//
// =====================================================

async function getApprovedGradesForSubjects(connection, studentId, subjectIds) {
  const cleanStudentId = toPositiveInt(studentId);

  if (!cleanStudentId) {
    throw new Error("Invalid student ID supplied to approved-grade lookup.");
  }

  const uniqueSubjectIds = [
    ...new Set(
      (subjectIds || []).map((value) => toPositiveInt(value)).filter(Boolean),
    ),
  ];

  if (uniqueSubjectIds.length === 0) {
    return [];
  }

  const placeholders = uniqueSubjectIds.map(() => "?").join(",");

  const [rows] = await connection.execute(
    `
        SELECT
            g.grade_id,

            g.student_id,

            g.subject_id,

            g.enrollment_id,

            g.final_grade,

            g.remarks,

            g.grade_status,

            g.approved_by,

            g.approved_at,

            g.created_at,

            g.updated_at,

            e.academic_year_id,

            e.semester_id,

            e.enrollment_status

        FROM grades g

        LEFT JOIN enrollments e
            ON e.enrollment_id =
               g.enrollment_id

        WHERE g.student_id = ?

          AND g.subject_id IN (
            ${placeholders}
          )

          AND g.grade_status =
              'Approved'

          AND g.final_grade
              IS NOT NULL

        ORDER BY
            COALESCE(
              g.approved_at,
              g.updated_at,
              g.created_at
            ) DESC,

            g.grade_id DESC
      `,
    [cleanStudentId, ...uniqueSubjectIds],
  );

  return rows.map((row) => {
    const result = classifyFinalGrade(row.final_grade);

    return {
      grade_id: Number(row.grade_id),

      student_id: Number(row.student_id),

      subject_id: Number(row.subject_id),

      enrollment_id:
        row.enrollment_id !== null && row.enrollment_id !== undefined
          ? Number(row.enrollment_id)
          : null,

      final_grade:
        row.final_grade !== null && row.final_grade !== undefined
          ? Number(row.final_grade)
          : null,

      remarks: row.remarks || null,

      grade_status: row.grade_status,

      approved_by:
        row.approved_by !== null && row.approved_by !== undefined
          ? Number(row.approved_by)
          : null,

      approved_at: row.approved_at || null,

      academic_year_id:
        row.academic_year_id !== null && row.academic_year_id !== undefined
          ? Number(row.academic_year_id)
          : null,

      semester_id:
        row.semester_id !== null && row.semester_id !== undefined
          ? Number(row.semester_id)
          : null,

      enrollment_status: row.enrollment_status || null,

      result,
    };
  });
}

// =====================================================
// EVALUATE ONE SUBJECT FOR ONE STUDENT
// =====================================================
//
// RETURNS:
//
// {
//   eligible,
//   attempt_type,
//   is_retake,
//   subject,
//   previous_grade,
//   prerequisites,
//   errors
// }
//
// =====================================================

async function evaluateStudentSubjectEligibility(
  connection,
  { studentId, subjectId },
) {
  const cleanStudentId = toPositiveInt(studentId);

  const cleanSubjectId = toPositiveInt(subjectId);

  if (!cleanStudentId || !cleanSubjectId) {
    throw new Error(
      "Invalid student/subject ID supplied to academic eligibility validator.",
    );
  }

  // ===============================================
  // GET TARGET SUBJECT
  // ===============================================

  const [subjectRows] = await connection.execute(
    `
        SELECT
            subject_id,

            subject_code,

            subject_name,

            units

        FROM subjects

        WHERE subject_id = ?

        LIMIT 1
      `,
    [cleanSubjectId],
  );

  if (subjectRows.length === 0) {
    return {
      eligible: false,

      attempt_type: null,

      is_retake: false,

      subject: null,

      previous_grade: null,

      prerequisites: [],

      errors: [
        {
          code: "SUBJECT_NOT_FOUND",

          message: "Subject does not exist.",
        },
      ],
    };
  }

  const targetSubject = subjectRows[0];

  // ===============================================
  // GET PREREQUISITES
  // ===============================================

  const [prerequisiteRows] = await connection.execute(
    `
        SELECT
            sp.prerequisite_id,

            sp.subject_id,

            sp.prerequisite_subject_id,

            prerequisite.subject_code
                AS prerequisite_subject_code,

            prerequisite.subject_name
                AS prerequisite_subject_name,

            prerequisite.units
                AS prerequisite_units

        FROM subject_prerequisites sp

        INNER JOIN subjects prerequisite
            ON prerequisite.subject_id =
               sp.prerequisite_subject_id

        WHERE sp.subject_id = ?

        ORDER BY
            prerequisite.subject_code ASC
      `,
    [cleanSubjectId],
  );

  const prerequisiteIds = prerequisiteRows.map((row) =>
    Number(row.prerequisite_subject_id),
  );

  // ===============================================
  // GET APPROVED GRADE HISTORY
  //
  // We need:
  // - target subject history
  // - prerequisite subject history
  // ===============================================

  const approvedGrades = await getApprovedGradesForSubjects(
    connection,
    cleanStudentId,
    [cleanSubjectId, ...prerequisiteIds],
  );

  // ===============================================
  // GROUP GRADES BY SUBJECT
  // ===============================================

  const gradesBySubject = new Map();

  for (const grade of approvedGrades) {
    const key = Number(grade.subject_id);

    if (!gradesBySubject.has(key)) {
      gradesBySubject.set(key, []);
    }

    gradesBySubject.get(key).push(grade);
  }

  // ===============================================
  // TARGET SUBJECT HISTORY
  // ===============================================

  const targetGradeHistory = gradesBySubject.get(cleanSubjectId) || [];

  // Query is newest first.
  const latestTargetGrade =
    targetGradeHistory.length > 0 ? targetGradeHistory[0] : null;

  // ===============================================
  // HAS EVER PASSED?
  //
  // Once officially passed, the subject cannot
  // be taken again.
  // ===============================================

  const passedTargetGrade =
    targetGradeHistory.find((grade) => grade.result.passed) || null;

  const errors = [];

  // ===============================================
  // BLOCK SUBJECT ALREADY PASSED
  // ===============================================

  if (passedTargetGrade) {
    errors.push({
      code: "SUBJECT_ALREADY_PASSED",

      message: `${targetSubject.subject_code} has already been passed and cannot be enrolled again.`,

      grade_id: passedTargetGrade.grade_id,

      final_grade: passedTargetGrade.final_grade,
    });
  }

  // ===============================================
  // INVALID APPROVED FINAL GRADE
  //
  // Example:
  // Approved final_grade = 3.50
  //
  // Our official rule only recognizes:
  // 1.00 - 3.00
  // 4.00
  // 5.00
  // ===============================================

  if (
    !passedTargetGrade &&
    latestTargetGrade &&
    !latestTargetGrade.result.valid
  ) {
    errors.push({
      code: "INVALID_APPROVED_FINAL_GRADE",

      message: `The latest approved final grade for ${targetSubject.subject_code} is outside the supported grading scale.`,

      grade_id: latestTargetGrade.grade_id,

      final_grade: latestTargetGrade.final_grade,
    });
  }

  // ===============================================
  // DETERMINE RETAKE
  //
  // RETAKE ONLY when latest Approved result is:
  //
  // 4.00 = Incomplete
  // 5.00 = Failed
  //
  // ===============================================

  const isRetake = Boolean(
    !passedTargetGrade &&
    latestTargetGrade &&
    latestTargetGrade.result.valid &&
    latestTargetGrade.result.retake,
  );

  const attemptType = isRetake ? "Retake" : "Regular";

  // ===============================================
  // PREREQUISITE EVALUATION
  //
  // IMPORTANT:
  //
  // REGULAR:
  // prerequisite MUST be passed.
  //
  // RETAKE:
  // prerequisite does NOT block enrollment.
  //
  // Reason:
  // Student already previously took the target
  // subject and has an official 4.00 / 5.00.
  //
  // We still return prerequisite information for
  // Registrar visibility, but we do not add a
  // blocking prerequisite error for a retake.
  // ===============================================

  const prerequisites = [];

  for (const prerequisite of prerequisiteRows) {
    const prerequisiteSubjectId = Number(prerequisite.prerequisite_subject_id);

    // =============================================
    // SELF-PREREQUISITE DATABASE ERROR
    // =============================================

    if (prerequisiteSubjectId === cleanSubjectId) {
      const prerequisiteResult = {
        prerequisite_id: Number(prerequisite.prerequisite_id),

        subject_id: prerequisiteSubjectId,

        subject_code: prerequisite.prerequisite_subject_code,

        subject_name: prerequisite.prerequisite_subject_name,

        required_for_attempt: !isRetake,

        satisfied: false,

        passed_grade: null,

        bypassed_for_retake: isRetake,

        error: "INVALID_SELF_PREREQUISITE",
      };

      prerequisites.push(prerequisiteResult);

      // -------------------------------------------
      // Regular enrollment:
      // Invalid curriculum prerequisite must block.
      //
      // Retake:
      // We do not let broken legacy prerequisite
      // history stop an otherwise valid retake.
      // -------------------------------------------

      if (!isRetake) {
        errors.push({
          code: "INVALID_SELF_PREREQUISITE",

          message: `${targetSubject.subject_code} cannot be its own prerequisite.`,

          prerequisite_id: Number(prerequisite.prerequisite_id),

          prerequisite_subject_id: prerequisiteSubjectId,
        });
      }

      continue;
    }

    // =============================================
    // PREREQUISITE GRADE HISTORY
    // =============================================

    const prerequisiteHistory =
      gradesBySubject.get(prerequisiteSubjectId) || [];

    // =============================================
    // PREREQUISITE SATISFIED IF ANY APPROVED
    // FINAL GRADE IS 1.00 - 3.00
    // =============================================

    const passedGrade =
      prerequisiteHistory.find((grade) => grade.result.passed) || null;

    const satisfied = Boolean(passedGrade);

    // =============================================
    // BUILD PREREQUISITE RESULT
    // =============================================

    prerequisites.push({
      prerequisite_id: Number(prerequisite.prerequisite_id),

      subject_id: prerequisiteSubjectId,

      subject_code: prerequisite.prerequisite_subject_code,

      subject_name: prerequisite.prerequisite_subject_name,

      required_for_attempt: !isRetake,

      satisfied,

      passed_grade: passedGrade
        ? {
            grade_id: passedGrade.grade_id,

            final_grade: passedGrade.final_grade,

            enrollment_id: passedGrade.enrollment_id,

            approved_by: passedGrade.approved_by,

            approved_at: passedGrade.approved_at,
          }
        : null,

      bypassed_for_retake: isRetake && !satisfied,

      error: satisfied ? null : isRetake ? null : "PREREQUISITE_NOT_PASSED",
    });

    // =============================================
    // REGULAR SUBJECT:
    // missing prerequisite BLOCKS.
    //
    // RETAKE:
    // missing prerequisite does NOT block.
    // =============================================

    if (!isRetake && !satisfied) {
      errors.push({
        code: "PREREQUISITE_NOT_PASSED",

        message: `${prerequisite.prerequisite_subject_code} must be passed before taking ${targetSubject.subject_code}.`,

        prerequisite_id: Number(prerequisite.prerequisite_id),

        prerequisite_subject_id: prerequisiteSubjectId,

        prerequisite_subject_code: prerequisite.prerequisite_subject_code,
      });
    }
  }

  // ===============================================
  // PREVIOUS GRADE RESPONSE
  // ===============================================

  const previousGrade = latestTargetGrade
    ? {
        grade_id: latestTargetGrade.grade_id,

        final_grade: latestTargetGrade.final_grade,

        classification: latestTargetGrade.result.classification,

        result_code: latestTargetGrade.result.code,

        enrollment_id: latestTargetGrade.enrollment_id,

        approved_by: latestTargetGrade.approved_by,

        approved_at: latestTargetGrade.approved_at,
      }
    : null;

  // ===============================================
  // FINAL RESULT
  // ===============================================

  return {
    eligible: errors.length === 0,

    attempt_type: attemptType,

    is_retake: isRetake,

    subject: {
      subject_id: Number(targetSubject.subject_id),

      subject_code: targetSubject.subject_code,

      subject_name: targetSubject.subject_name,

      units: Number(targetSubject.units || 0),
    },

    previous_grade: previousGrade,

    prerequisite_policy: isRetake ? "BYPASSED_FOR_VALID_RETAKE" : "REQUIRED",

    prerequisites,

    errors,
  };
}
// =====================================================
// ROUTE 1
// GET ENROLLMENT PERIOD MANAGEMENT DATA
//
// GET /api/registrar/enrollments/period
//
// Used by:
// Registrar Enrollment Period Management page
//
// Returns:
// - latest supported enrollment period
// - academic years
// - supported semesters
//
// SEMESTER POLICY:
// - First Semester only
// - Second Semester only
// - Summer is intentionally excluded
//
// JWT:
// - Registrar identity comes from req.user
// - No frontend user_id
// =====================================================

router.get("/period", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  let connection;

  try {
    connection = await db.getConnection();

    // ===============================================
    // GET LATEST SUPPORTED ENROLLMENT PERIOD
    //
    // Summer / semester_id = 3 is intentionally
    // excluded from the normal enrollment lifecycle.
    // ===============================================

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
            opener.username AS opened_by_username,

            ep.opened_at,

            ep.closed_by,
            closer.username AS closed_by_username,

            ep.closed_at,

            ep.remarks,
            ep.created_at,
            ep.updated_at

        FROM enrollment_periods ep

        INNER JOIN academic_years ay
            ON ay.academic_year_id =
               ep.academic_year_id

        INNER JOIN semesters sem
            ON sem.semester_id =
               ep.semester_id

        LEFT JOIN users opener
            ON opener.user_id =
               ep.opened_by

        LEFT JOIN users closer
            ON closer.user_id =
               ep.closed_by

        WHERE ep.semester_id IN (1, 2)

        ORDER BY
            ep.updated_at DESC,
            ep.opened_at DESC,
            ep.enrollment_period_id DESC

        LIMIT 1
      `,
    );

    // ===============================================
    // GET ACADEMIC YEARS
    // ===============================================

    const [academicYearRows] = await connection.execute(
      `
        SELECT
            academic_year_id,
            academic_year,
            is_current

        FROM academic_years

        ORDER BY
            academic_year DESC
      `,
    );

    // ===============================================
    // GET SUPPORTED SEMESTERS
    //
    // IMPORTANT:
    // Summer exists in the database for compatibility
    // / possible historical references, but it is NOT
    // part of this portal's enrollment progression.
    // ===============================================

    const [semesterRows] = await connection.execute(
      `
        SELECT
            semester_id,
            semester_name

        FROM semesters

        WHERE semester_id IN (1, 2)

        ORDER BY
            semester_id ASC
      `,
    );

    // ===============================================
    // FORMAT CURRENT/LATEST PERIOD
    // ===============================================

    let enrollmentPeriod = null;

    if (periodRows.length > 0) {
      const period = periodRows[0];

      enrollmentPeriod = {
        enrollment_period_id: Number(period.enrollment_period_id),

        academic_year_id: Number(period.academic_year_id),

        academic_year: period.academic_year,

        semester_id: Number(period.semester_id),

        semester_name: period.semester_name,

        status: period.status,

        opened_by: period.opened_by ? Number(period.opened_by) : null,

        opened_by_username: period.opened_by_username || null,

        opened_at: period.opened_at || null,

        closed_by: period.closed_by ? Number(period.closed_by) : null,

        closed_by_username: period.closed_by_username || null,

        closed_at: period.closed_at || null,

        remarks: period.remarks || null,

        created_at: period.created_at,

        updated_at: period.updated_at,
      };
    }

    // ===============================================
    // FORMAT ACADEMIC YEARS
    // ===============================================

    const academicYears = academicYearRows.map((row) => ({
      academic_year_id: Number(row.academic_year_id),

      academic_year: row.academic_year,

      is_current: Number(row.is_current) === 1,
    }));

    // ===============================================
    // FORMAT SUPPORTED SEMESTERS
    // ===============================================

    const semesters = semesterRows.map((row) => ({
      semester_id: Number(row.semester_id),

      semester_name: row.semester_name,
    }));

    // ===============================================
    // SUCCESS
    // ===============================================

    return res.status(200).json({
      success: true,

      enrollment_period: enrollmentPeriod,

      academic_years: academicYears,

      semesters,

      authenticated_registrar: {
        user_id: actor.user_id,
        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET ENROLLMENT PERIOD ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load enrollment period management data.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// ROUTE 2
// OPEN ENROLLMENT PERIOD
//
// POST /api/registrar/enrollments/period/open
//
// Body:
// {
//   "academic_year_id": 3,
//   "semester_id": 1,
//   "remarks": "Enrollment for 2027-2028 First Semester"
// }
//
// SEMESTER POLICY:
// - 1 = First Semester
// - 2 = Second Semester
// - Summer is NOT supported
//
// IMPORTANT:
// - Registrar identity comes from JWT.
// - Do NOT accept user_id from frontend.
// - Only one enrollment period may be Open.
// - If the same AY + semester already exists as Closed,
//   reopen it instead of creating a duplicate.
// - Opening a period makes its academic year current.
// - Academic-year rollover happens in the same
//   database transaction.
// =====================================================

router.post("/period/open", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // REQUEST BODY
  // =================================================

  const { academic_year_id, semester_id, remarks } = req.body;

  const academicYearId = toPositiveInt(academic_year_id);

  const semesterId = toPositiveInt(semester_id);

  const cleanRemarks =
    typeof remarks === "string" && remarks.trim() ? remarks.trim() : null;

  // =================================================
  // VALIDATE ACADEMIC YEAR
  // =================================================

  if (!academicYearId) {
    return res.status(400).json({
      success: false,
      message: "A valid academic_year_id is required.",
    });
  }

  // =================================================
  // VALIDATE SEMESTER ID
  // =================================================

  if (!semesterId) {
    return res.status(400).json({
      success: false,
      message: "A valid semester_id is required.",
    });
  }

  // =================================================
  // ENROLLMENT SEMESTER POLICY
  //
  // PTC Portal normal enrollment progression is:
  //
  // First Semester
  //      ↓
  // Second Semester
  //      ↓
  // Next AY First Semester
  //
  // Summer is intentionally excluded.
  //
  // IMPORTANT:
  // This check happens BEFORE opening a DB transaction,
  // so semester_id = 3 can never reach enrollment-period
  // creation/reopening logic.
  // =================================================

  const allowedSemesterIds = [1, 2];

  if (!allowedSemesterIds.includes(semesterId)) {
    return res.status(400).json({
      success: false,

      code: "UNSUPPORTED_ENROLLMENT_SEMESTER",

      message:
        "Only First Semester and Second Semester are supported for enrollment.",

      allowed_semester_ids: allowedSemesterIds,
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // START TRANSACTION
    // =================================================

    await connection.beginTransaction();

    // =================================================
    // VERIFY ACADEMIC YEAR
    // =================================================

    const [academicYearRows] = await connection.execute(
      `
          SELECT
              academic_year_id,
              academic_year,
              is_current

          FROM academic_years

          WHERE academic_year_id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [academicYearId],
    );

    if (academicYearRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,

        message: "Academic year not found.",

        academic_year_id: academicYearId,
      });
    }

    // =================================================
    // VERIFY SUPPORTED SEMESTER
    //
    // Although the policy guard above already accepts
    // only 1 and 2, verify the row still exists.
    // =================================================

    const [semesterRows] = await connection.execute(
      `
          SELECT
              semester_id,
              semester_name

          FROM semesters

          WHERE semester_id = ?
            AND semester_id IN (1, 2)

          LIMIT 1
        `,
      [semesterId],
    );

    if (semesterRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,

        message: "Supported semester was not found.",

        semester_id: semesterId,
      });
    }

    const semester = semesterRows[0];

    // =================================================
    // CHECK FOR ANOTHER OPEN PERIOD
    //
    // Only one normal enrollment period may be Open.
    // =================================================

    const [openPeriodRows] = await connection.execute(
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

              ep.remarks

          FROM enrollment_periods ep

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 ep.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 ep.semester_id

          WHERE ep.status = 'Open'
            AND ep.semester_id IN (1, 2)

          LIMIT 1

          FOR UPDATE
        `,
    );

    if (openPeriodRows.length > 0) {
      const openPeriod = openPeriodRows[0];

      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Another enrollment period is already open. Close it before opening another enrollment period.",

        enrollment_period: {
          enrollment_period_id: Number(openPeriod.enrollment_period_id),

          academic_year_id: Number(openPeriod.academic_year_id),

          academic_year: openPeriod.academic_year,

          semester_id: Number(openPeriod.semester_id),

          semester_name: openPeriod.semester_name,

          status: openPeriod.status,

          opened_by: openPeriod.opened_by ? Number(openPeriod.opened_by) : null,

          opened_at: openPeriod.opened_at,

          remarks: openPeriod.remarks || null,
        },
      });
    }

    // =================================================
    // CHECK EXISTING AY + SEMESTER PERIOD
    // =================================================

    const [existingRows] = await connection.execute(
      `
          SELECT
              enrollment_period_id,
              academic_year_id,
              semester_id,
              status,

              opened_by,
              opened_at,

              closed_by,
              closed_at,

              remarks

          FROM enrollment_periods

          WHERE academic_year_id = ?
            AND semester_id = ?
            AND semester_id IN (1, 2)

          LIMIT 1

          FOR UPDATE
        `,
      [academicYearId, semesterId],
    );

    let enrollmentPeriodId;

    let reopened = false;

    // =================================================
    // REOPEN EXISTING PERIOD
    // =================================================

    if (existingRows.length > 0) {
      const existingPeriod = existingRows[0];

      if (existingPeriod.status === "Open") {
        await connection.rollback();

        return res.status(409).json({
          success: false,

          message: "This enrollment period is already open.",
        });
      }

      enrollmentPeriodId = Number(existingPeriod.enrollment_period_id);

      reopened = true;

      const [updateResult] = await connection.execute(
        `
            UPDATE enrollment_periods

            SET
                status = 'Open',

                opened_by = ?,
                opened_at = NOW(),

                closed_by = NULL,
                closed_at = NULL,

                remarks =
                  COALESCE(
                    ?,
                    remarks
                  )

            WHERE enrollment_period_id = ?
          `,
        [actor.user_id, cleanRemarks, enrollmentPeriodId],
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();

        return res.status(500).json({
          success: false,

          message: "Enrollment period could not be reopened.",
        });
      }
    } else {
      // =================================================
      // CREATE NEW PERIOD
      // =================================================

      const [insertResult] = await connection.execute(
        `
            INSERT INTO enrollment_periods (
                academic_year_id,
                semester_id,
                status,

                opened_by,
                opened_at,

                closed_by,
                closed_at,

                remarks
            )

            VALUES (
                ?,
                ?,
                'Open',

                ?,
                NOW(),

                NULL,
                NULL,

                ?
            )
          `,
        [academicYearId, semesterId, actor.user_id, cleanRemarks],
      );

      enrollmentPeriodId = Number(insertResult.insertId);
    }

    // =================================================
    // CURRENT ACADEMIC YEAR ROLLOVER
    //
    // The AY containing the newly opened enrollment
    // period becomes the single current AY.
    // =================================================

    await connection.execute(
      `
        UPDATE academic_years

        SET is_current =
          CASE
            WHEN academic_year_id = ?
              THEN 1
            ELSE 0
          END
      `,
      [academicYearId],
    );

    // =================================================
    // GET FINAL PERIOD
    // =================================================

    const [finalRows] = await connection.execute(
      `
          SELECT
              ep.enrollment_period_id,

              ep.academic_year_id,
              ay.academic_year,
              ay.is_current
                AS academic_year_is_current,

              ep.semester_id,
              sem.semester_name,

              ep.status,

              ep.opened_by,
              opener.username
                AS opened_by_username,

              ep.opened_at,

              ep.closed_by,
              ep.closed_at,

              ep.remarks,
              ep.created_at,
              ep.updated_at

          FROM enrollment_periods ep

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 ep.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 ep.semester_id

          LEFT JOIN users opener
              ON opener.user_id =
                 ep.opened_by

          WHERE ep.enrollment_period_id = ?

          LIMIT 1
        `,
      [enrollmentPeriodId],
    );

    if (finalRows.length === 0) {
      await connection.rollback();

      return res.status(500).json({
        success: false,

        message: "Enrollment period was opened but could not be retrieved.",
      });
    }

    const period = finalRows[0];

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(reopened ? 200 : 201).json({
      success: true,

      message: reopened
        ? "Enrollment period reopened successfully."
        : "Enrollment period opened successfully.",

      reopened,

      enrollment_period: {
        enrollment_period_id: Number(period.enrollment_period_id),

        academic_year_id: Number(period.academic_year_id),

        academic_year: period.academic_year,

        academic_year_is_current: Number(period.academic_year_is_current) === 1,

        semester_id: Number(period.semester_id),

        semester_name: period.semester_name,

        status: period.status,

        opened_by: Number(period.opened_by),

        opened_by_username: period.opened_by_username || actor.username,

        opened_at: period.opened_at,

        closed_by: null,

        closed_at: null,

        remarks: period.remarks || null,

        created_at: period.created_at,

        updated_at: period.updated_at,
      },

      actor: {
        user_id: actor.user_id,
        username: actor.username,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("OPEN ENROLLMENT PERIOD ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("OPEN ENROLLMENT PERIOD ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to open enrollment period.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// ROUTE 3
// CLOSE ENROLLMENT PERIOD
//
// POST /api/registrar/enrollments/period/close
//
// Body:
// {
//   "enrollment_period_id": 8,
//   "remarks": "Enrollment period closed."
// }
//
// IMPORTANT:
// - Registrar identity comes from JWT.
// - No user_id / closed_by from frontend.
// - Period must exist.
// - Period must currently be Open.
// =====================================================

router.post("/period/close", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // REQUEST BODY
  // =================================================

  const { enrollment_period_id, remarks } = req.body;

  const enrollmentPeriodId = toPositiveInt(enrollment_period_id);

  const cleanRemarks =
    typeof remarks === "string" && remarks.trim() ? remarks.trim() : null;

  // =================================================
  // VALIDATE PERIOD ID
  // =================================================

  if (!enrollmentPeriodId) {
    return res.status(400).json({
      success: false,

      message: "A valid enrollment_period_id is required.",
    });
  }

  let connection;

  try {
    // =================================================
    // DATABASE CONNECTION
    // =================================================

    connection = await db.getConnection();

    // =================================================
    // START TRANSACTION
    // =================================================

    await connection.beginTransaction();

    // =================================================
    // GET ENROLLMENT PERIOD
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

              ep.remarks,

              ep.created_at,
              ep.updated_at

          FROM enrollment_periods ep

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 ep.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 ep.semester_id

          WHERE ep.enrollment_period_id = ?

          LIMIT 1

          FOR UPDATE
          `,
      [enrollmentPeriodId],
    );

    // =================================================
    // PERIOD NOT FOUND
    // =================================================

    if (periodRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,

        message: "Enrollment period not found.",
      });
    }

    const period = periodRows[0];

    // =================================================
    // MUST CURRENTLY BE OPEN
    // =================================================

    if (period.status !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Enrollment period cannot be closed because its current status is '${period.status}'.`,

        enrollment_period: {
          enrollment_period_id: Number(period.enrollment_period_id),

          academic_year_id: Number(period.academic_year_id),

          academic_year: period.academic_year,

          semester_id: Number(period.semester_id),

          semester_name: period.semester_name,

          status: period.status,
        },
      });
    }

    // =================================================
    // CLOSE PERIOD
    //
    // closed_by comes ONLY from authenticated JWT.
    // =================================================

    const [updateResult] = await connection.execute(
      `
          UPDATE enrollment_periods

          SET
              status = 'Closed',

              closed_by = ?,
              closed_at = NOW(),

              remarks =
                COALESCE(
                  ?,
                  remarks
                )

          WHERE enrollment_period_id = ?
            AND status = 'Open'
          `,
      [actor.user_id, cleanRemarks, enrollmentPeriodId],
    );

    // =================================================
    // VERIFY UPDATE
    // =================================================

    if (updateResult.affectedRows === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Enrollment period could not be closed.",
      });
    }

    // =================================================
    // GET UPDATED PERIOD
    // =================================================

    const [updatedRows] = await connection.execute(
      `
          SELECT
              ep.enrollment_period_id,

              ep.academic_year_id,
              ay.academic_year,

              ep.semester_id,
              sem.semester_name,

              ep.status,

              ep.opened_by,
              opener.username
                  AS opened_by_username,

              ep.opened_at,

              ep.closed_by,
              closer.username
                  AS closed_by_username,

              ep.closed_at,

              ep.remarks,

              ep.created_at,
              ep.updated_at

          FROM enrollment_periods ep

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 ep.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 ep.semester_id

          LEFT JOIN users opener
              ON opener.user_id =
                 ep.opened_by

          LEFT JOIN users closer
              ON closer.user_id =
                 ep.closed_by

          WHERE ep.enrollment_period_id = ?

          LIMIT 1
          `,
      [enrollmentPeriodId],
    );

    if (updatedRows.length === 0) {
      await connection.rollback();

      return res.status(500).json({
        success: false,

        message: "Enrollment period was closed but could not be retrieved.",
      });
    }

    const updatedPeriod = updatedRows[0];

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Enrollment period closed successfully.",

      enrollment_period: {
        enrollment_period_id: Number(updatedPeriod.enrollment_period_id),

        academic_year_id: Number(updatedPeriod.academic_year_id),

        academic_year: updatedPeriod.academic_year,

        semester_id: Number(updatedPeriod.semester_id),

        semester_name: updatedPeriod.semester_name,

        status: updatedPeriod.status,

        opened_by: updatedPeriod.opened_by
          ? Number(updatedPeriod.opened_by)
          : null,

        opened_by_username: updatedPeriod.opened_by_username || null,

        opened_at: updatedPeriod.opened_at,

        closed_by: updatedPeriod.closed_by
          ? Number(updatedPeriod.closed_by)
          : null,

        closed_by_username: updatedPeriod.closed_by_username || actor.username,

        closed_at: updatedPeriod.closed_at,

        remarks: updatedPeriod.remarks || null,

        created_at: updatedPeriod.created_at,

        updated_at: updatedPeriod.updated_at,
      },

      actor: {
        user_id: actor.user_id,

        username: actor.username,
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
        console.error("CLOSE ENROLLMENT PERIOD ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("CLOSE ENROLLMENT PERIOD ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to close enrollment period.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
// ROUTE 4
// GET PENDING ENROLLMENTS
//
// GET /api/registrar/enrollments/pending
//
// Purpose:
// - Registrar sees enrollments submitted by Students
// - Only returns enrollment_status = 'Pending'
// - Includes Student, Course, Academic Year, Semester
// - Includes active subject count and total units
//
// JWT:
// - Registrar must be authenticated
// - No user_id from frontend
// =====================================================

router.get("/pending", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  let connection;

  try {
    // =================================================
    // DATABASE CONNECTION
    // =================================================

    connection = await db.getConnection();

    // =================================================
    // GET PENDING ENROLLMENTS
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              e.enrollment_id,
              e.student_id,

              -- =========================================
              -- STUDENT
              -- =========================================

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,
              s.year_level,

              -- =========================================
              -- COURSE
              -- =========================================

              c.course_id,
              c.course_code,
              c.course_name,

              -- =========================================
              -- STUDENT'S CURRENT SECTION
              --
              -- This is informational only.
              -- It does NOT mean the Student selects
              -- subject sections during enrollment.
              -- =========================================

              s.section_id
                  AS student_section_id,

              student_sec.section_name
                  AS student_section_name,

              -- =========================================
              -- ACADEMIC PERIOD
              -- =========================================

              e.academic_year_id,
              ay.academic_year,

              e.semester_id,
              sem.semester_name,

              -- =========================================
              -- ENROLLMENT
              -- =========================================

              e.enrollment_status,
              e.remarks,
              e.created_at,

              -- =========================================
              -- ACTIVE SUBJECT COUNT
              -- =========================================

              (
                  SELECT COUNT(*)

                  FROM enrollment_subjects es_count

                  WHERE es_count.enrollment_id =
                        e.enrollment_id

                    AND es_count.status <> 'Dropped'
              ) AS total_subjects,

              -- =========================================
              -- TOTAL ACTIVE UNITS
              -- =========================================

              (
                  SELECT
                      COALESCE(
                          SUM(sub_units.units),
                          0
                      )

                  FROM enrollment_subjects es_units

                  INNER JOIN subjects sub_units
                      ON sub_units.subject_id =
                         es_units.subject_id

                  WHERE es_units.enrollment_id =
                        e.enrollment_id

                    AND es_units.status <> 'Dropped'
              ) AS total_units

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN courses c
              ON c.course_id =
                 s.course_id

          LEFT JOIN sections student_sec
              ON student_sec.section_id =
                 s.section_id

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          WHERE e.enrollment_status = 'Pending'

          ORDER BY
              e.created_at ASC,
              s.last_name ASC,
              s.first_name ASC
          `,
    );

    // =================================================
    // FORMAT RESPONSE
    // =================================================

    const enrollments = enrollmentRows.map((row) => ({
      enrollment_id: Number(row.enrollment_id),

      student_id: Number(row.student_id),

      student_number: row.student_number,

      first_name: row.first_name,

      middle_name: row.middle_name || null,

      last_name: row.last_name,

      student_name: [row.first_name, row.middle_name, row.last_name]
        .filter(Boolean)
        .join(" "),

      year_level:
        row.year_level !== null && row.year_level !== undefined
          ? Number(row.year_level)
          : null,

      course_id: row.course_id ? Number(row.course_id) : null,

      course_code: row.course_code || null,

      course_name: row.course_name || null,

      student_section_id: row.student_section_id
        ? Number(row.student_section_id)
        : null,

      student_section_name: row.student_section_name || null,

      academic_year_id: Number(row.academic_year_id),

      academic_year: row.academic_year,

      semester_id: Number(row.semester_id),

      semester_name: row.semester_name,

      enrollment_status: row.enrollment_status,

      remarks: row.remarks || null,

      total_subjects: Number(row.total_subjects || 0),

      total_units: Number(row.total_units || 0),

      created_at: row.created_at,
    }));

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      count: enrollments.length,

      enrollments,

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET PENDING ENROLLMENTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch pending enrollments.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
// ROUTE 5
// GET ALL REGISTRAR ENROLLMENTS
//
// GET /api/registrar/enrollments
//
// Optional query parameters:
//
// ?page=1
// ?limit=10
// ?search=Juan
// ?status=Pending
// ?course=1
// ?year=2
// ?section=1
// ?academic_year=2
// ?semester=1
//
// Purpose:
// - Registrar enrollment management list
// - Search students
// - Filter enrollments
// - Pagination
// - Return active subject count
// - Return total units
//
// JWT:
// - Registrar authenticated through req.user
// - No user_id from frontend
// =====================================================

router.get("/", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // QUERY PARAMETERS
  // =================================================

  const {
    page = "1",
    limit = "10",
    search = "",
    status = "",
    course = "",
    year = "",
    section = "",
    academic_year = "",
    semester = "",
  } = req.query;

  // =================================================
  // PAGINATION
  // =================================================

  let currentPage = Number(page);

  let perPage = Number(limit);

  if (!Number.isInteger(currentPage) || currentPage <= 0) {
    currentPage = 1;
  }

  if (!Number.isInteger(perPage) || perPage <= 0) {
    perPage = 10;
  }

  // Prevent huge requests
  if (perPage > 100) {
    perPage = 100;
  }

  const offset = (currentPage - 1) * perPage;

  // =================================================
  // WHERE CONDITIONS
  // =================================================

  const conditions = [];
  const params = [];

  // =================================================
  // SEARCH
  //
  // Search by:
  // - student number
  // - first name
  // - middle name
  // - last name
  // - username
  // =================================================

  const cleanSearch = String(search).trim();

  if (cleanSearch) {
    const searchValue = `%${cleanSearch}%`;

    conditions.push(`
        (
          s.student_number LIKE ?
          OR s.first_name LIKE ?
          OR s.middle_name LIKE ?
          OR s.last_name LIKE ?
          OR u.username LIKE ?
        )
      `);

    params.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    );
  }

  // =================================================
  // STATUS FILTER
  // =================================================

  const cleanStatus = String(status).trim();

  const allowedStatuses = [
    "Draft",
    "Pending",
    "Approved",
    "Rejected",
    "Cancelled",
  ];

  if (cleanStatus) {
    if (!allowedStatuses.includes(cleanStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment status.",
        allowed_statuses: allowedStatuses,
      });
    }

    conditions.push(`
        e.enrollment_status = ?
      `);

    params.push(cleanStatus);
  }

  // =================================================
  // COURSE FILTER
  // =================================================

  if (String(course).trim()) {
    const courseId = toPositiveInt(course);

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Invalid course filter.",
      });
    }

    conditions.push(`
        s.course_id = ?
      `);

    params.push(courseId);
  }

  // =================================================
  // YEAR LEVEL FILTER
  // =================================================

  if (String(year).trim()) {
    const yearLevel = toPositiveInt(year);

    if (!yearLevel) {
      return res.status(400).json({
        success: false,
        message: "Invalid year level filter.",
      });
    }

    conditions.push(`
        COALESCE(
          sec.year_level,
          s.year_level
        ) = ?
      `);

    params.push(yearLevel);
  }

  // =================================================
  // SECTION FILTER
  // =================================================

  if (String(section).trim()) {
    const sectionId = toPositiveInt(section);

    if (!sectionId) {
      return res.status(400).json({
        success: false,
        message: "Invalid section filter.",
      });
    }

    conditions.push(`
        sec.section_id = ?
      `);

    params.push(sectionId);
  }

  // =================================================
  // ACADEMIC YEAR FILTER
  // =================================================

  if (String(academic_year).trim()) {
    const academicYearId = toPositiveInt(academic_year);

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Invalid academic year filter.",
      });
    }

    conditions.push(`
        e.academic_year_id = ?
      `);

    params.push(academicYearId);
  }

  // =================================================
  // SEMESTER FILTER
  // =================================================

  if (String(semester).trim()) {
    const semesterId = toPositiveInt(semester);

    if (!semesterId) {
      return res.status(400).json({
        success: false,
        message: "Invalid semester filter.",
      });
    }

    conditions.push(`
        e.semester_id = ?
      `);

    params.push(semesterId);
  }

  // =================================================
  // WHERE CLAUSE
  // =================================================

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // TOTAL COUNT
    // =================================================

    const [countRows] = await connection.execute(
      `
          SELECT
              COUNT(
                DISTINCT
                e.enrollment_id
              ) AS total

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN users u
              ON u.user_id =
                 s.user_id

          LEFT JOIN sections sec
              ON sec.section_id =
                 s.section_id

          ${whereClause}
          `,
      params,
    );

    const total = Number(countRows[0]?.total || 0);

    // =================================================
    // GET ENROLLMENTS
    // =================================================

    const queryParams = [...params, perPage, offset];

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              -- =========================================
              -- ENROLLMENT
              -- =========================================

              e.enrollment_id,
              e.student_id,

              e.academic_year_id,
              e.semester_id,

              e.enrollment_status,
              e.remarks,

              e.approved_by,
              approver.username
                  AS approved_by_username,

              e.approved_at,
              e.created_at,

              -- =========================================
              -- STUDENT
              -- =========================================

              s.student_number,

              s.first_name,
              s.middle_name,
              s.last_name,

              s.year_level
                  AS student_year_level,

              u.username,

              -- =========================================
              -- COURSE
              -- =========================================

              c.course_id,
              c.course_code,
              c.course_name,

              -- =========================================
              -- STUDENT SECTION
              -- =========================================

              sec.section_id,
              sec.section_name,
              sec.year_level
                  AS section_year_level,

              -- =========================================
              -- ACADEMIC PERIOD
              -- =========================================

              ay.academic_year,
              sem.semester_name,

              -- =========================================
              -- ACTIVE SUBJECT COUNT
              -- =========================================

              COUNT(
                DISTINCT
                CASE
                  WHEN es.status =
                       'Enrolled'
                  THEN
                    es.enrollment_subject_id
                END
              ) AS total_subjects,

              -- =========================================
              -- TOTAL ACTIVE UNITS
              -- =========================================

              COALESCE(
                SUM(
                  CASE
                    WHEN es.status =
                         'Enrolled'
                    THEN sub.units
                    ELSE 0
                  END
                ),
                0
              ) AS total_units

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN users u
              ON u.user_id =
                 s.user_id

          LEFT JOIN courses c
              ON c.course_id =
                 s.course_id

          LEFT JOIN sections sec
              ON sec.section_id =
                 s.section_id

          LEFT JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          LEFT JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          LEFT JOIN users approver
              ON approver.user_id =
                 e.approved_by

          LEFT JOIN enrollment_subjects es
              ON es.enrollment_id =
                 e.enrollment_id

          LEFT JOIN subjects sub
              ON sub.subject_id =
                 es.subject_id

          ${whereClause}

          GROUP BY
              e.enrollment_id,
              e.student_id,

              e.academic_year_id,
              e.semester_id,

              e.enrollment_status,
              e.remarks,

              e.approved_by,
              approver.username,

              e.approved_at,
              e.created_at,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,
              s.year_level,

              u.username,

              c.course_id,
              c.course_code,
              c.course_name,

              sec.section_id,
              sec.section_name,
              sec.year_level,

              ay.academic_year,
              sem.semester_name

          ORDER BY
              e.created_at DESC,
              e.enrollment_id DESC

          LIMIT ?
          OFFSET ?
          `,
      queryParams,
    );

    // =================================================
    // FORMAT
    // =================================================

    const enrollments = enrollmentRows.map((row) => ({
      enrollment_id: Number(row.enrollment_id),

      student: {
        student_id: Number(row.student_id),

        student_number: row.student_number,

        student_name: [row.first_name, row.middle_name, row.last_name]
          .filter(Boolean)
          .join(" "),

        first_name: row.first_name,

        middle_name: row.middle_name || null,

        last_name: row.last_name,

        username: row.username || null,

        year_level:
          row.student_year_level !== null &&
          row.student_year_level !== undefined
            ? Number(row.student_year_level)
            : null,
      },

      course: {
        course_id: row.course_id ? Number(row.course_id) : null,

        course_code: row.course_code || null,

        course_name: row.course_name || null,
      },

      section: {
        section_id: row.section_id ? Number(row.section_id) : null,

        section_name: row.section_name || null,

        year_level:
          row.section_year_level !== null &&
          row.section_year_level !== undefined
            ? Number(row.section_year_level)
            : null,
      },

      academic_period: {
        academic_year_id: Number(row.academic_year_id),

        academic_year: row.academic_year,

        semester_id: Number(row.semester_id),

        semester_name: row.semester_name,
      },

      enrollment_status: row.enrollment_status,

      remarks: row.remarks || null,

      approval: {
        approved_by: row.approved_by ? Number(row.approved_by) : null,

        approved_by_username: row.approved_by_username || null,

        approved_at: row.approved_at || null,
      },

      total_subjects: Number(row.total_subjects || 0),

      total_units: Number(row.total_units || 0),

      created_at: row.created_at,
    }));

    // =================================================
    // PAGINATION
    // =================================================

    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      data: enrollments,

      pagination: {
        page: currentPage,

        limit: perPage,

        total,

        totalPages,

        hasNextPage: currentPage < totalPages,

        hasPreviousPage: currentPage > 1,
      },

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET REGISTRAR ENROLLMENTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load enrollments.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// ROUTE 6
// GET SINGLE ENROLLMENT DETAILS
//
// GET /api/registrar/enrollments/:id
//
// Example:
// GET /api/registrar/enrollments/3
//
// Purpose:
// - Registrar opens one enrollment
// - View Student information
// - View Course
// - View Academic Year / Semester
// - View enrollment status
// - View enrolled subjects
// - View section/offering assignment
// - View Faculty / Room / Schedule
//
// IMPORTANT:
// - Registrar authenticated through JWT
// - No user_id from frontend
// - Keep this route AFTER /pending and /period routes
// =====================================================

router.get("/:id", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // ENROLLMENT ID
  // =================================================

  const enrollmentId = toPositiveInt(req.params.id);

  if (!enrollmentId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // GET ENROLLMENT HEADER
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              -- =========================================
              -- ENROLLMENT
              -- =========================================

              e.enrollment_id,
              e.student_id,

              e.academic_year_id,
              e.semester_id,

              e.enrollment_status,
              e.remarks,

              e.approved_by,
              approver.username
                  AS approved_by_username,

              e.approved_at,
              e.created_at,

              -- =========================================
              -- STUDENT
              -- =========================================

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              s.gender,
              s.birth_date,
              s.contact_number,
              s.year_level,

              s.user_id,

              -- =========================================
              -- USER
              -- =========================================

              student_user.username,
              student_user.email,

              -- =========================================
              -- COURSE
              -- =========================================

              c.course_id,
              c.course_code,
              c.course_name,

              -- =========================================
              -- STUDENT CURRENT SECTION
              -- Informational only
              -- Student does not choose subject sections
              -- =========================================

              student_sec.section_id
                  AS student_section_id,
              student_sec.section_name
                  AS student_section_name,

              student_sec.year_level
                  AS student_section_year_level,

              -- =========================================
              -- ACADEMIC YEAR
              -- =========================================

              ay.academic_year,

              -- =========================================
              -- SEMESTER
              -- =========================================

              sem.semester_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN users student_user
              ON student_user.user_id =
                 s.user_id

          LEFT JOIN courses c
              ON c.course_id =
                 s.course_id

          LEFT JOIN sections student_sec
              ON student_sec.section_id =
                 s.section_id

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          LEFT JOIN users approver
              ON approver.user_id =
                 e.approved_by

          WHERE e.enrollment_id = ?

          LIMIT 1
          `,
      [enrollmentId],
    );

    // =================================================
    // ENROLLMENT NOT FOUND
    // =================================================

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const row = enrollmentRows[0];

    // =================================================
    // GET ENROLLMENT SUBJECTS
    // =================================================

    const [subjectRows] = await connection.execute(
      `
          SELECT
              -- =========================================
              -- ENROLLMENT SUBJECT
              -- =========================================

              es.enrollment_subject_id,
              es.enrollment_id,

              es.subject_id,

              es.status
                  AS enrollment_subject_status,

              -- =========================================
              -- SUBJECT
              -- =========================================

              sub.subject_code,
              sub.subject_name,
              sub.units,

              sub.lecture_hours,
              sub.laboratory_hours,

              -- =========================================
              -- ASSIGNED SECTION
              -- =========================================

              es.section_id,

              assigned_sec.section_name
                  AS section_name,

              assigned_sec.year_level
                  AS section_year_level,

              -- =========================================
              -- SECTION SUBJECT
              -- =========================================

              es.section_subject_id,

              ss.status
                  AS section_subject_status,

              -- =========================================
              -- OFFERING
              -- =========================================

              es.offering_id,

              so.status
                  AS offering_status,

              so.schedule_days,
              so.schedule_time,

              so.max_students
                  AS offering_max_students,

              -- =========================================
              -- FACULTY
              -- =========================================

              so.faculty_id,

              faculty_user.username
                  AS faculty_username,

              -- =========================================
              -- ROOM
              -- =========================================

              so.room_id,

              r.room_name,

              -- =========================================
              -- CURRENT OFFERING ENROLLMENT COUNT
              -- =========================================

              CASE
                WHEN es.offering_id IS NULL
                THEN 0
                ELSE (
                    SELECT COUNT(*)

                    FROM enrollment_subjects es_count

                    INNER JOIN enrollments e_count
                        ON e_count.enrollment_id =
                           es_count.enrollment_id

                    WHERE es_count.offering_id =
                          es.offering_id

                      AND es_count.status =
                          'Enrolled'

                      AND e_count.enrollment_status IN (
                          'Pending',
                          'Approved'
                      )
                )
              END AS enrolled_count

          FROM enrollment_subjects es

          INNER JOIN subjects sub
              ON sub.subject_id =
                 es.subject_id

          LEFT JOIN sections assigned_sec
              ON assigned_sec.section_id =
                 es.section_id

          LEFT JOIN section_subjects ss
              ON ss.section_subject_id =
                 es.section_subject_id

          LEFT JOIN subject_offerings so
              ON so.offering_id =
                 es.offering_id

          LEFT JOIN rooms r
              ON r.room_id =
                 so.room_id

          LEFT JOIN faculty f
              ON f.faculty_id =
                 so.faculty_id

          LEFT JOIN users faculty_user
              ON faculty_user.user_id =
                 f.user_id

          WHERE es.enrollment_id = ?

          ORDER BY
              sub.subject_code ASC,
              es.enrollment_subject_id ASC
          `,
      [enrollmentId],
    );

    // =================================================
    // FORMAT SUBJECTS
    // =================================================

    const subjects = subjectRows.map((subject) => {
      const maxStudents =
        subject.offering_max_students !== null &&
        subject.offering_max_students !== undefined
          ? Number(subject.offering_max_students)
          : null;

      const enrolledCount = Number(subject.enrolled_count || 0);

      return {
        enrollment_subject_id: Number(subject.enrollment_subject_id),

        enrollment_id: Number(subject.enrollment_id),

        subject_id: Number(subject.subject_id),

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        lecture_hours:
          subject.lecture_hours !== null && subject.lecture_hours !== undefined
            ? Number(subject.lecture_hours)
            : null,

        laboratory_hours:
          subject.laboratory_hours !== null &&
          subject.laboratory_hours !== undefined
            ? Number(subject.laboratory_hours)
            : null,

        status: subject.enrollment_subject_status,

        // =========================================
        // SECTION ASSIGNMENT
        // =========================================

        section: {
          section_id: subject.section_id ? Number(subject.section_id) : null,

          section_name: subject.section_name || null,

          year_level:
            subject.section_year_level !== null &&
            subject.section_year_level !== undefined
              ? Number(subject.section_year_level)
              : null,
        },

        // =========================================
        // SECTION SUBJECT
        // =========================================

        section_subject: {
          section_subject_id: subject.section_subject_id
            ? Number(subject.section_subject_id)
            : null,

          status: subject.section_subject_status || null,
        },

        // =========================================
        // OFFERING
        // =========================================

        offering: {
          offering_id: subject.offering_id ? Number(subject.offering_id) : null,

          status: subject.offering_status || null,

          schedule_days: subject.schedule_days || null,

          schedule_time: subject.schedule_time || null,

          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots:
            maxStudents !== null
              ? Math.max(maxStudents - enrolledCount, 0)
              : null,
        },

        // =========================================
        // FACULTY
        // =========================================

        faculty: {
          faculty_id: subject.faculty_id ? Number(subject.faculty_id) : null,

          username: subject.faculty_username || null,
        },

        // =========================================
        // ROOM
        // =========================================

        room: {
          room_id: subject.room_id ? Number(subject.room_id) : null,

          room_name: subject.room_name || null,
        },

        // =========================================
        // ASSIGNMENT STATE
        //
        // Useful later for Registrar UI.
        // =========================================

        assignment_complete: Boolean(
          subject.offering_id &&
          subject.section_id &&
          subject.section_subject_id,
        ),
      };
    });

    // =================================================
    // TOTAL SUBJECTS
    // =================================================

    const activeSubjects = subjects.filter(
      (subject) => subject.status === "Enrolled",
    );

    const totalUnits = activeSubjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    const assignedSubjects = activeSubjects.filter(
      (subject) => subject.assignment_complete,
    );

    const unassignedSubjects = activeSubjects.filter(
      (subject) => !subject.assignment_complete,
    );

    // =================================================
    // FORMAT ENROLLMENT
    // =================================================

    const enrollment = {
      enrollment_id: Number(row.enrollment_id),

      student: {
        student_id: Number(row.student_id),

        user_id: row.user_id ? Number(row.user_id) : null,

        student_number: row.student_number,

        first_name: row.first_name,

        middle_name: row.middle_name || null,

        last_name: row.last_name,

        student_name: [row.first_name, row.middle_name, row.last_name]
          .filter(Boolean)
          .join(" "),

        username: row.username || null,

        email: row.email || null,

        gender: row.gender || null,

        birth_date: row.birth_date || null,

        contact_number: row.contact_number || null,

        year_level:
          row.year_level !== null && row.year_level !== undefined
            ? Number(row.year_level)
            : null,
      },

      course: {
        course_id: row.course_id ? Number(row.course_id) : null,

        course_code: row.course_code || null,

        course_name: row.course_name || null,
      },

      student_section: {
        section_id: row.student_section_id
          ? Number(row.student_section_id)
          : null,

        section_name: row.student_section_name || null,

        year_level:
          row.student_section_year_level !== null &&
          row.student_section_year_level !== undefined
            ? Number(row.student_section_year_level)
            : null,
      },

      academic_period: {
        academic_year_id: Number(row.academic_year_id),

        academic_year: row.academic_year,

        semester_id: Number(row.semester_id),

        semester_name: row.semester_name,
      },

      enrollment_status: row.enrollment_status,

      remarks: row.remarks || null,

      approval: {
        approved_by: row.approved_by ? Number(row.approved_by) : null,

        approved_by_username: row.approved_by_username || null,

        approved_at: row.approved_at || null,
      },

      created_at: row.created_at,
    };

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      enrollment,

      subjects,

      summary: {
        total_subjects: activeSubjects.length,

        total_units: totalUnits,

        assigned_subjects: assignedSubjects.length,

        unassigned_subjects: unassignedSubjects.length,

        all_subjects_assigned:
          activeSubjects.length > 0 && unassignedSubjects.length === 0,
      },

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET SINGLE ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch enrollment details.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// GET AVAILABLE SUBJECT OFFERINGS
//
// GET /api/registrar/enrollments/:id/available-offerings
//
// OPTIONAL:
// ?subject_id=69
//
// PURPOSE:
//
// Return only offerings that can actually be assigned
// to subjects already inside this enrollment.
//
// IMPORTANT:
//
// - Registrar authentication required.
// - Enrollment must be Pending or Approved.
// - Subject must already belong to enrollment.
// - Subject must have status Enrolled.
// - Subject must belong to active curriculum.
// - Grade V2 eligibility is revalidated.
// - Approved subjects with ANY grade row are locked.
// - Same subject only.
// - Same course / AY / semester.
// - Offering must be Open.
// - Section Subject must be Open.
// - Regular subject -> matching year-level section.
// - Retake -> another compatible year-level section allowed.
// - Room is optional.
// - Capacity enforced.
// =====================================================

router.get("/:id/available-offerings", async (req, res) => {
  let connection;

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

    if (req.user.role_name !== "Registrar") {
      return res.status(403).json({
        success: false,
        message: "Registrar access is required.",
      });
    }

    // =================================================
    // 2. ENROLLMENT ID
    // =================================================

    const enrollmentId = Number(req.params.id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    // =================================================
    // 3. OPTIONAL SUBJECT FILTER
    // =================================================

    let requestedSubjectId = null;

    if (req.query.subject_id !== undefined) {
      requestedSubjectId = Number(req.query.subject_id);

      if (!Number.isInteger(requestedSubjectId) || requestedSubjectId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid subject ID.",
        });
      }
    }

    // =================================================
    // 4. CONNECTION
    // =================================================

    connection = await db.getConnection();

    // =================================================
    // 5. ENROLLMENT + STUDENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
            SELECT
                e.enrollment_id,
                e.student_id,
                e.academic_year_id,
                e.semester_id,
                e.enrollment_status,

                s.student_number,
                s.first_name,
                s.middle_name,
                s.last_name,

                s.course_id,
                s.year_level,

                c.course_code,
                c.course_name

            FROM enrollments e

            INNER JOIN students s
                ON s.student_id =
                   e.student_id

            INNER JOIN courses c
                ON c.course_id =
                   s.course_id

            WHERE e.enrollment_id = ?

            LIMIT 1
          `,
      [enrollmentId],
    );

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    const studentId = Number(enrollment.student_id);

    const courseId = Number(enrollment.course_id);

    const yearLevel = Number(enrollment.year_level);

    const academicYearId = Number(enrollment.academic_year_id);

    const semesterId = Number(enrollment.semester_id);

    const enrollmentStatus = String(enrollment.enrollment_status);

    // =================================================
    // 6. ENROLLMENT STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollmentStatus)) {
      return res.status(409).json({
        success: false,

        message: `Subject offerings cannot be assigned because enrollment status is "${enrollmentStatus}".`,
      });
    }

    // =================================================
    // 7. ACTIVE ASSIGNED CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
            SELECT
                sc.student_curriculum_id,
                sc.curriculum_id,

                cur.curriculum_name

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
          `,
      [studentId, courseId],
    );

    if (curriculumRows.length === 0) {
      return res.status(409).json({
        success: false,

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message: "The Student does not have a valid active curriculum.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 8. SUBJECTS ALREADY IN ENROLLMENT
    //
    // This endpoint is for placement.
    // It must NOT discover arbitrary new subjects.
    // =================================================

    const subjectFilter =
      requestedSubjectId !== null ? "AND es.subject_id = ?" : "";

    const subjectParams =
      requestedSubjectId !== null
        ? [enrollmentId, requestedSubjectId]
        : [enrollmentId];

    const [subjectRows] = await connection.execute(
      `
            SELECT
                es.enrollment_subject_id,
                es.subject_id,

                es.offering_id
                    AS current_offering_id,

                es.section_id
                    AS current_section_id,

                es.section_subject_id
                    AS current_section_subject_id,

                es.status,

                sub.subject_code,
                sub.subject_name,
                sub.units

            FROM enrollment_subjects es

            INNER JOIN subjects sub
                ON sub.subject_id =
                   es.subject_id

            WHERE es.enrollment_id = ?

              AND es.status = 'Enrolled'

              ${subjectFilter}

            ORDER BY
                sub.subject_code ASC,
                es.enrollment_subject_id ASC
          `,
      subjectParams,
    );

    // =================================================
    // 9. REQUESTED SUBJECT MUST ACTUALLY BE ENROLLED
    // =================================================

    if (requestedSubjectId !== null && subjectRows.length === 0) {
      return res.status(404).json({
        success: false,

        code: "ENROLLMENT_SUBJECT_NOT_FOUND",

        message:
          "The requested subject is not an active subject in this enrollment.",
      });
    }

    if (subjectRows.length === 0) {
      return res.status(200).json({
        success: true,

        enrollment: {
          enrollment_id: enrollmentId,

          student_id: studentId,

          student_number: enrollment.student_number,

          course_id: courseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,

          year_level: yearLevel,

          academic_year_id: academicYearId,

          semester_id: semesterId,

          enrollment_status: enrollmentStatus,
        },

        curriculum: {
          curriculum_id: curriculumId,

          curriculum_name: curriculum.curriculum_name,
        },

        count: 0,

        offerings: [],
      });
    }

    // =================================================
    // 10. VALIDATE EACH ENROLLMENT SUBJECT
    // =================================================

    const eligibleSubjectMap = new Map();

    for (const enrolledSubject of subjectRows) {
      const subjectId = Number(enrolledSubject.subject_id);

      const enrollmentSubjectId = Number(enrolledSubject.enrollment_subject_id);

      // ===============================================
      // SUBJECT MUST BELONG TO ACTIVE CURRICULUM
      // ===============================================

      const [curriculumSubjectRows] = await connection.execute(
        `
              SELECT
                  curriculum_subject_id,
                  subject_id,
                  year_level,
                  semester_id,
                  is_required,
                  display_order

              FROM curriculum_subjects

              WHERE curriculum_id = ?

                AND subject_id = ?

              LIMIT 1
            `,
        [curriculumId, subjectId],
      );

      if (curriculumSubjectRows.length === 0) {
        continue;
      }

      const curriculumSubject = curriculumSubjectRows[0];

      // ===============================================
      // APPROVED ENROLLMENT GRADE LOCK
      // ===============================================

      if (enrollmentStatus === "Approved") {
        const [gradeRows] = await connection.execute(
          `
                SELECT
                    grade_id,
                    grade_status,
                    final_rating

                FROM grades

                WHERE enrollment_subject_id = ?

                LIMIT 1
              `,
          [enrollmentSubjectId],
        );

        if (gradeRows.length > 0) {
          continue;
        }
      }

      // ===============================================
      // GRADE V2 ACADEMIC ELIGIBILITY
      // ===============================================

      const academicEligibility = await evaluateSubjectEligibility(
        studentId,
        subjectId,
        connection,
      );

      if (!academicEligibility.eligible) {
        continue;
      }

      if (
        ![ELIGIBILITY_TYPE.REGULAR, ELIGIBILITY_TYPE.RETAKE].includes(
          academicEligibility.eligibility_type,
        )
      ) {
        continue;
      }

      // ===============================================
      // REGULAR SUBJECT MUST BE CURRENT TERM
      // ===============================================

      if (academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR) {
        if (
          Number(curriculumSubject.year_level) !== yearLevel ||
          Number(curriculumSubject.semester_id) !== semesterId
        ) {
          continue;
        }
      }

      eligibleSubjectMap.set(subjectId, {
        enrollment_subject_id: enrollmentSubjectId,

        subject_id: subjectId,

        subject_code: enrolledSubject.subject_code,

        subject_name: enrolledSubject.subject_name,

        units: Number(enrolledSubject.units || 0),

        current_offering_id:
          enrolledSubject.current_offering_id !== null
            ? Number(enrolledSubject.current_offering_id)
            : null,

        current_section_id:
          enrolledSubject.current_section_id !== null
            ? Number(enrolledSubject.current_section_id)
            : null,

        current_section_subject_id:
          enrolledSubject.current_section_subject_id !== null
            ? Number(enrolledSubject.current_section_subject_id)
            : null,

        curriculum_subject: curriculumSubject,

        academic_eligibility: academicEligibility,
      });
    }

    // =================================================
    // 11. NOTHING CAN CURRENTLY BE PLACED
    // =================================================

    if (eligibleSubjectMap.size === 0) {
      return res.status(200).json({
        success: true,

        enrollment: {
          enrollment_id: enrollmentId,

          student_id: studentId,

          student_number: enrollment.student_number,

          course_id: courseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,

          year_level: yearLevel,

          academic_year_id: academicYearId,

          semester_id: semesterId,

          enrollment_status: enrollmentStatus,
        },

        curriculum: {
          curriculum_id: curriculumId,

          curriculum_name: curriculum.curriculum_name,
        },

        count: 0,

        offerings: [],
      });
    }

    // =================================================
    // 12. GET OFFERINGS FOR ELIGIBLE ENROLLED SUBJECTS
    // =================================================

    const eligibleSubjectIds = Array.from(eligibleSubjectMap.keys());

    const placeholders = eligibleSubjectIds.map(() => "?").join(",");

    const [offeringRows] = await connection.execute(
      `
            SELECT
                so.offering_id,
                so.section_subject_id,
                so.subject_id,
                so.section_id,

                so.faculty_id,
                so.room_id,

                so.academic_year_id,
                so.semester_id,

                so.schedule_days,
                so.schedule_time,

                so.max_students,

                so.status
                    AS offering_status,

                ss.subject_id
                    AS section_subject_subject_id,

                ss.section_id
                    AS section_subject_section_id,

                ss.academic_year_id
                    AS section_subject_academic_year_id,

                ss.semester_id
                    AS section_subject_semester_id,

                ss.status
                    AS section_subject_status,

                sec.section_name,

                sec.course_id
                    AS section_course_id,

                sec.year_level
                    AS section_year_level,

                sub.subject_code,
                sub.subject_name,
                sub.units,

                CONCAT(
                    f.first_name,
                    ' ',
                    COALESCE(
                        CONCAT(
                            f.middle_name,
                            ' '
                        ),
                        ''
                    ),
                    f.last_name
                ) AS faculty_name,

                r.room_name,

                r.capacity
                    AS room_capacity,

                (
                    SELECT
                        COUNT(*)

                    FROM enrollment_subjects es2

                    INNER JOIN enrollments e2
                        ON e2.enrollment_id =
                           es2.enrollment_id

                    WHERE es2.offering_id =
                          so.offering_id

                      AND es2.status IN (
                          'Enrolled',
                          'Completed',
                          'Failed',
                          'Incomplete'
                      )

                      AND e2.enrollment_status IN (
                          'Pending',
                          'Approved'
                      )
                ) AS enrolled_count

            FROM subject_offerings so

            INNER JOIN section_subjects ss
                ON ss.section_subject_id =
                   so.section_subject_id

            INNER JOIN sections sec
                ON sec.section_id =
                   so.section_id

            INNER JOIN subjects sub
                ON sub.subject_id =
                   so.subject_id

            LEFT JOIN faculty f
                ON f.faculty_id =
                   so.faculty_id

            LEFT JOIN rooms r
                ON r.room_id =
                   so.room_id

            WHERE so.subject_id IN (
                ${placeholders}
            )

              AND so.academic_year_id = ?

              AND so.semester_id = ?

              AND ss.academic_year_id = ?

              AND ss.semester_id = ?

              AND sec.course_id = ?

              AND so.status = 'Open'

              AND ss.status = 'Open'

            ORDER BY
                sub.subject_code ASC,
                sec.section_name ASC,
                so.offering_id ASC
          `,
      [
        ...eligibleSubjectIds,

        academicYearId,
        semesterId,

        academicYearId,
        semesterId,

        courseId,
      ],
    );

    // =================================================
    // 13. FILTER TO EXACT PUT ROUTE RULES
    // =================================================

    const offerings = [];

    for (const offering of offeringRows) {
      const subjectId = Number(offering.subject_id);

      const subjectInfo = eligibleSubjectMap.get(subjectId);

      if (!subjectInfo) {
        continue;
      }

      // ===============================================
      // RELATIONSHIP INTEGRITY
      // ===============================================

      if (
        Number(offering.section_subject_subject_id) !== subjectId ||
        Number(offering.section_subject_section_id) !==
          Number(offering.section_id)
      ) {
        continue;
      }

      // ===============================================
      // DON'T OFFER CURRENT OFFERING AS A CHANGE
      // ===============================================

      if (
        subjectInfo.current_offering_id !== null &&
        Number(offering.offering_id) === subjectInfo.current_offering_id
      ) {
        continue;
      }

      // ===============================================
      // REGULAR -> SAME YEAR-LEVEL SECTION
      // ===============================================

      if (
        subjectInfo.academic_eligibility.eligibility_type ===
          ELIGIBILITY_TYPE.REGULAR &&
        Number(offering.section_year_level) !== yearLevel
      ) {
        continue;
      }

      // ===============================================
      // READINESS
      //
      // Room remains optional.
      // ===============================================

      const maxStudents = Number(offering.max_students || 0);

      if (!offering.faculty_id) {
        continue;
      }

      if (!offering.schedule_days || !String(offering.schedule_days).trim()) {
        continue;
      }

      if (!offering.schedule_time || !String(offering.schedule_time).trim()) {
        continue;
      }

      if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
        continue;
      }

      // ===============================================
      // ROOM CAPACITY WHEN ROOM EXISTS
      // ===============================================

      if (
        offering.room_capacity !== null &&
        Number(offering.room_capacity) > 0 &&
        maxStudents > Number(offering.room_capacity)
      ) {
        continue;
      }

      // ===============================================
      // CAPACITY
      // ===============================================

      const enrolledCount = Number(offering.enrolled_count || 0);

      if (enrolledCount >= maxStudents) {
        continue;
      }

      // ===============================================
      // RETURN VALID OFFERING
      // ===============================================

      offerings.push({
        enrollment_subject_id: subjectInfo.enrollment_subject_id,

        subject_id: subjectId,

        subject_code: offering.subject_code,

        subject_name: offering.subject_name,

        units: Number(offering.units || 0),

        enrollment_type: subjectInfo.academic_eligibility.eligibility_type,

        offering_id: Number(offering.offering_id),

        section_subject_id: Number(offering.section_subject_id),

        section_id: Number(offering.section_id),

        section_name: offering.section_name,

        section_year_level: Number(offering.section_year_level),

        faculty_id: Number(offering.faculty_id),

        faculty_name: offering.faculty_name,

        room_id: offering.room_id !== null ? Number(offering.room_id) : null,

        room_name: offering.room_name,

        schedule_days: offering.schedule_days,

        schedule_time: offering.schedule_time,

        max_students: maxStudents,

        enrolled_count: enrolledCount,

        available_slots: Math.max(maxStudents - enrolledCount, 0),

        offering_status: offering.offering_status,

        section_subject_status: offering.section_subject_status,

        current_assignment: {
          offering_id: subjectInfo.current_offering_id,

          section_id: subjectInfo.current_section_id,

          section_subject_id: subjectInfo.current_section_subject_id,
        },

        academic_eligibility: {
          eligible: subjectInfo.academic_eligibility.eligible,

          eligibility_type: subjectInfo.academic_eligibility.eligibility_type,

          reason: subjectInfo.academic_eligibility.reason,

          latest_approved_grade:
            subjectInfo.academic_eligibility.latest_approved_grade,

          prerequisites: subjectInfo.academic_eligibility.prerequisites,
        },
      });
    }

    // =================================================
    // 14. RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      enrollment: {
        enrollment_id: enrollmentId,

        student_id: studentId,

        student_number: enrollment.student_number,

        student_name: [
          enrollment.first_name,
          enrollment.middle_name,
          enrollment.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course_id: courseId,

        course_code: enrollment.course_code,

        course_name: enrollment.course_name,

        year_level: yearLevel,

        academic_year_id: academicYearId,

        semester_id: semesterId,

        enrollment_status: enrollmentStatus,
      },

      curriculum: {
        curriculum_id: curriculumId,

        curriculum_name: curriculum.curriculum_name,
      },

      subject_filter: requestedSubjectId,

      count: offerings.length,

      offerings,
    });
  } catch (error) {
    console.error("GET REGISTRAR AVAILABLE OFFERINGS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch available subject offerings.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// ASSIGN / CHANGE SUBJECT OFFERING
//
// PUT /api/registrar/enrollments/:id/subjects/:enrollmentSubjectId
//
// BODY:
//
// {
//   "offering_id": 15,
//   "reason": "Registrar assigned student to this class."
// }
//
// PURPOSE:
//
// - Assign an offering to an unassigned Pending subject
// - Change an existing offering when correction is allowed
// - Supports Pending and Approved enrollments
// - Student never chooses the offering
// - Subject itself cannot be changed by this route
//
// IMPORTANT:
//
// Pending + unassigned:
//   Normal Registrar placement.
//
// Pending + already assigned:
//   Registrar placement correction.
//
// Approved:
//   Official correction.
//   Any existing Grade V2 row permanently locks placement
//   from ordinary correction.
//
// ACADEMIC RULES:
//
// - Subject must still be academically eligible.
// - Subject must belong to active Student curriculum.
// - Regular subject must belong to current curriculum term.
// - Regular subject must use matching year-level section.
// - Retake may use another compatible section.
// - Offering must be same subject/course/AY/semester.
// - Offering + section subject must both be Open.
// - Capacity enforced.
// - Room remains optional.
// - Every successful assignment/change is audited.
// =====================================================

router.put("/:id/subjects/:enrollmentSubjectId", async (req, res) => {
  let connection;
  let transactionActive = false;

  try {
    // =================================================
    // 1. AUTHENTICATED REGISTRAR
    // =================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (req.user.role_name !== "Registrar") {
      return res.status(403).json({
        success: false,
        message: "Registrar access is required.",
      });
    }

    const changedBy = Number(req.user.user_id);

    if (!Number.isInteger(changedBy) || changedBy <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated Registrar user ID is invalid.",
      });
    }

    // =================================================
    // 2. IDS
    // =================================================

    const enrollmentId = Number(req.params.id);

    const enrollmentSubjectId = Number(req.params.enrollmentSubjectId);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    if (!Number.isInteger(enrollmentSubjectId) || enrollmentSubjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment subject ID.",
      });
    }

    // =================================================
    // 3. REQUEST BODY
    //
    // Only offering_id is trusted for placement.
    // =================================================

    const offeringId = Number(req.body?.offering_id);

    if (!Number.isInteger(offeringId) || offeringId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid offering ID.",
      });
    }

    const providedReason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (providedReason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason must not exceed 500 characters.",
      });
    }

    // =================================================
    // 4. CONNECTION + TRANSACTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    // =================================================
    // 5. GET ENROLLMENT + STUDENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
            SELECT
                e.enrollment_id,
                e.student_id,
                e.academic_year_id,
                e.semester_id,
                e.enrollment_status,

                s.student_number,
                s.first_name,
                s.middle_name,
                s.last_name,

                s.course_id,
                s.year_level,

                c.course_code,
                c.course_name

            FROM enrollments e

            INNER JOIN students s
                ON s.student_id =
                   e.student_id

            INNER JOIN courses c
                ON c.course_id =
                   s.course_id

            WHERE e.enrollment_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentId],
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

    const studentId = Number(enrollment.student_id);

    const courseId = Number(enrollment.course_id);

    const yearLevel = Number(enrollment.year_level);

    const academicYearId = Number(enrollment.academic_year_id);

    const semesterId = Number(enrollment.semester_id);

    const enrollmentStatus = String(enrollment.enrollment_status);

    // =================================================
    // 6. ENROLLMENT STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollmentStatus)) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message: `Subject placement cannot be changed because enrollment status is "${enrollmentStatus}".`,
      });
    }

    // =================================================
    // 7. GET CURRENT ENROLLMENT SUBJECT
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

                sub.subject_code,
                sub.subject_name,
                sub.units,
                sub.is_active
                    AS subject_is_active,

                sec.section_name
                    AS current_section_name

            FROM enrollment_subjects es

            INNER JOIN subjects sub
                ON sub.subject_id =
                   es.subject_id

            LEFT JOIN sections sec
                ON sec.section_id =
                   es.section_id

            WHERE es.enrollment_subject_id = ?

              AND es.enrollment_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentSubjectId, enrollmentId],
    );

    if (subjectRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(404).json({
        success: false,
        message: "Enrollment subject not found.",
      });
    }

    const currentSubject = subjectRows[0];

    const subjectId = Number(currentSubject.subject_id);

    // =================================================
    // 8. SUBJECT STATUS
    // =================================================

    if (currentSubject.status !== "Enrolled") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "ENROLLMENT_SUBJECT_NOT_EDITABLE",

        message: `Subject placement cannot be changed because its status is "${currentSubject.status}".`,
      });
    }

    if (Number(currentSubject.subject_is_active) !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,
        message: "The enrollment subject is inactive.",
      });
    }

    // =================================================
    // 9. DETERMINE INITIAL ASSIGNMENT OR CORRECTION
    // =================================================

    const oldOfferingId =
      currentSubject.offering_id !== null
        ? Number(currentSubject.offering_id)
        : null;

    const oldSectionId =
      currentSubject.section_id !== null
        ? Number(currentSubject.section_id)
        : null;

    const oldSectionSubjectId =
      currentSubject.section_subject_id !== null
        ? Number(currentSubject.section_subject_id)
        : null;

    const isInitialAssignment =
      oldOfferingId === null &&
      oldSectionId === null &&
      oldSectionSubjectId === null;

    // =================================================
    // 10. REASON
    //
    // Initial Pending placement may use standard audit
    // text.
    //
    // Corrections / Approved changes need explicit
    // Registrar reason.
    // =================================================

    if (
      (!isInitialAssignment || enrollmentStatus === "Approved") &&
      !providedReason
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(400).json({
        success: false,

        code: "CORRECTION_REASON_REQUIRED",

        message:
          "A reason is required for this Registrar placement correction.",
      });
    }

    const auditReason =
      providedReason || "Registrar assigned subject offering.";

    // =================================================
    // 11. SAME OFFERING
    // =================================================

    if (oldOfferingId !== null && oldOfferingId === offeringId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,
        code: "OFFERING_ALREADY_ASSIGNED",
        message: "The selected offering is already assigned to this subject.",
      });
    }

    // =================================================
    // 12. GRADE LOCK
    //
    // Approved enrollment correction becomes unsafe
    // once ANY Grade V2 record exists:
    //
    // Draft
    // Submitted
    // Returned
    // Approved
    //
    // Normal correction must not silently move the
    // student after grading has started.
    // =================================================

    if (enrollmentStatus === "Approved") {
      const [gradeRows] = await connection.execute(
        `
              SELECT
                  grade_id,
                  grade_status,
                  final_rating

              FROM grades

              WHERE enrollment_subject_id = ?

              LIMIT 1

              FOR UPDATE
            `,
        [enrollmentSubjectId],
      );

      if (gradeRows.length > 0) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          code: "SUBJECT_GRADE_LOCKED",

          message:
            "This subject placement cannot be changed because grading has already started.",

          grade: {
            grade_id: Number(gradeRows[0].grade_id),

            grade_status: gradeRows[0].grade_status,

            final_rating:
              gradeRows[0].final_rating !== null
                ? Number(gradeRows[0].final_rating)
                : null,
          },
        });
      }
    }

    // =================================================
    // 13. ACTIVE ASSIGNED CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
            SELECT
                sc.student_curriculum_id,
                sc.curriculum_id,

                cur.curriculum_name

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
          `,
      [studentId, courseId],
    );

    if (curriculumRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message: "The Student does not have a valid active curriculum.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 14. SUBJECT MUST BELONG TO CURRICULUM
    // =================================================

    const [curriculumSubjectRows] = await connection.execute(
      `
            SELECT
                curriculum_subject_id,
                curriculum_id,
                subject_id,
                year_level,
                semester_id,
                is_required,
                display_order

            FROM curriculum_subjects

            WHERE curriculum_id = ?

              AND subject_id = ?

            LIMIT 1
          `,
      [curriculumId, subjectId],
    );

    if (curriculumSubjectRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SUBJECT_NOT_IN_ASSIGNED_CURRICULUM",

        message:
          "The enrollment subject does not belong to the Student's active curriculum.",
      });
    }

    const curriculumSubject = curriculumSubjectRows[0];

    // =================================================
    // 15. REVALIDATE GRADE V2 ELIGIBILITY
    //
    // Important if an official grade changed between
    // Student submission and Registrar placement.
    // =================================================

    const academicEligibility = await evaluateSubjectEligibility(
      studentId,
      subjectId,
      connection,
    );

    if (!academicEligibility.eligible) {
      await connection.rollback();
      transactionActive = false;

      let code = "SUBJECT_NOT_ACADEMICALLY_ELIGIBLE";

      if (
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.ALREADY_PASSED
      ) {
        code = "SUBJECT_ALREADY_PASSED";
      } else if (
        academicEligibility.eligibility_type ===
        ELIGIBILITY_TYPE.BLOCKED_PREREQUISITE
      ) {
        code = "PREREQUISITE_NOT_PASSED";
      } else if (
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.UNRESOLVED
      ) {
        code = "ACADEMIC_RESULT_UNRESOLVED";
      }

      return res.status(409).json({
        success: false,

        code,

        message:
          academicEligibility.reason ||
          "The Student is no longer academically eligible for this subject.",

        academic_eligibility: academicEligibility,
      });
    }

    // =================================================
    // 16. REGULAR TERM VALIDATION
    //
    // Retake may originate from an earlier term.
    // =================================================

    if (academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR) {
      if (
        Number(curriculumSubject.year_level) !== yearLevel ||
        Number(curriculumSubject.semester_id) !== semesterId
      ) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          code: "REGULAR_SUBJECT_OUTSIDE_CURRENT_TERM",

          message:
            "This Regular subject does not belong to the Student's current curriculum term.",
        });
      }
    }

    // =================================================
    // 17. GET AUTHORITATIVE OFFERING
    // =================================================

    const [offeringRows] = await connection.execute(
      `
            SELECT
                so.offering_id,
                so.section_subject_id,
                so.subject_id,
                so.section_id,

                so.faculty_id,
                so.room_id,

                so.academic_year_id,
                so.semester_id,

                so.schedule_days,
                so.schedule_time,

                so.max_students,

                so.status
                    AS offering_status,

                ss.subject_id
                    AS section_subject_subject_id,

                ss.section_id
                    AS section_subject_section_id,

                ss.academic_year_id
                    AS section_subject_academic_year_id,

                ss.semester_id
                    AS section_subject_semester_id,

                ss.status
                    AS section_subject_status,

                sec.section_name,

                sec.course_id
                    AS section_course_id,

                sec.year_level
                    AS section_year_level,

                sub.subject_code,
                sub.subject_name,
                sub.units,

                sub.is_active
                    AS offering_subject_is_active,

                r.capacity
                    AS room_capacity

            FROM subject_offerings so

            INNER JOIN section_subjects ss
                ON ss.section_subject_id =
                   so.section_subject_id

            INNER JOIN sections sec
                ON sec.section_id =
                   so.section_id

            INNER JOIN subjects sub
                ON sub.subject_id =
                   so.subject_id

            LEFT JOIN rooms r
                ON r.room_id =
                   so.room_id

            WHERE so.offering_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [offeringId],
    );

    if (offeringRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(404).json({
        success: false,
        message: "Subject offering not found.",
      });
    }

    const offering = offeringRows[0];

    // =================================================
    // 18. OFFERING MUST BE SAME SUBJECT
    // =================================================

    if (Number(offering.subject_id) !== subjectId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_SUBJECT_MISMATCH",

        message: "The selected offering belongs to a different subject.",
      });
    }

    // =================================================
    // 19. RELATIONSHIP INTEGRITY
    // =================================================

    if (
      Number(offering.section_subject_subject_id) !== subjectId ||
      Number(offering.section_subject_section_id) !==
        Number(offering.section_id)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "INVALID_OFFERING_RELATIONSHIP",

        message:
          "The selected offering has an invalid section-subject relationship.",
      });
    }

    // =================================================
    // 20. ACTIVE SUBJECT
    // =================================================

    if (Number(offering.offering_subject_is_active) !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,
        message: "The offering subject is inactive.",
      });
    }

    // =================================================
    // 21. COURSE
    // =================================================

    if (Number(offering.section_course_id) !== courseId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_COURSE_MISMATCH",

        message: "The selected offering belongs to a different course.",
      });
    }

    // =================================================
    // 22. ACADEMIC YEAR
    // =================================================

    if (
      Number(offering.academic_year_id) !== academicYearId ||
      Number(offering.section_subject_academic_year_id) !== academicYearId
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_ACADEMIC_YEAR_MISMATCH",

        message: "The selected offering belongs to a different academic year.",
      });
    }

    // =================================================
    // 23. SEMESTER
    // =================================================

    if (
      Number(offering.semester_id) !== semesterId ||
      Number(offering.section_subject_semester_id) !== semesterId
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_SEMESTER_MISMATCH",

        message: "The selected offering belongs to a different semester.",
      });
    }

    // =================================================
    // 24. OPEN STATUS
    //
    // Both layers must be Open.
    // =================================================

    if (offering.offering_status !== "Open") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_NOT_OPEN",

        message: `The selected offering is currently "${offering.offering_status}".`,
      });
    }

    if (offering.section_subject_status !== "Open") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SECTION_SUBJECT_NOT_OPEN",

        message: `The selected section subject is currently "${offering.section_subject_status}".`,
      });
    }

    // =================================================
    // 25. REGULAR SECTION YEAR LEVEL
    //
    // Retakes may use a compatible lower/higher
    // section when necessary.
    // =================================================

    if (
      academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR &&
      Number(offering.section_year_level) !== yearLevel
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "REGULAR_SECTION_YEAR_LEVEL_MISMATCH",

        message:
          "A Regular subject must be assigned to a section matching the Student's current year level.",

        student_year_level: yearLevel,

        section_year_level: Number(offering.section_year_level),
      });
    }

    // =================================================
    // 26. OFFERING READINESS
    //
    // Room remains OPTIONAL.
    // =================================================

    const maxStudents = Number(offering.max_students || 0);

    const missingConfiguration = [];

    if (!offering.faculty_id) {
      missingConfiguration.push("faculty");
    }

    if (!offering.schedule_days || !String(offering.schedule_days).trim()) {
      missingConfiguration.push("schedule_days");
    }

    if (!offering.schedule_time || !String(offering.schedule_time).trim()) {
      missingConfiguration.push("schedule_time");
    }

    if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
      missingConfiguration.push("capacity");
    }

    if (missingConfiguration.length > 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_NOT_READY",

        message: "The selected offering is not fully configured.",

        missing_configuration: missingConfiguration,
      });
    }

    // =================================================
    // 27. ROOM CAPACITY
    //
    // Only enforce when a room exists.
    // =================================================

    if (
      offering.room_capacity !== null &&
      Number(offering.room_capacity) > 0 &&
      maxStudents > Number(offering.room_capacity)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_EXCEEDS_ROOM_CAPACITY",

        message: "The offering capacity exceeds the assigned room capacity.",
      });
    }

    // =================================================
    // 28. CAPACITY
    //
    // Exclude this enrollment_subject because this
    // route may move an already assigned student.
    // =================================================

    const [capacityRows] = await connection.execute(
      `
            SELECT
                COUNT(*) AS enrolled_count

            FROM enrollment_subjects es

            INNER JOIN enrollments e
                ON e.enrollment_id =
                   es.enrollment_id

            WHERE es.offering_id = ?

              AND es.enrollment_subject_id <> ?

              AND es.status IN (
                  'Enrolled',
                  'Completed',
                  'Failed',
                  'Incomplete'
              )

              AND e.enrollment_status IN (
                  'Pending',
                  'Approved'
              )
          `,
      [offeringId, enrollmentSubjectId],
    );

    const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

    if (enrolledCount >= maxStudents) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_FULL",

        message: "The selected offering is already full.",

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots: 0,
        },
      });
    }

    // =================================================
    // 29. UPDATE PLACEMENT
    // =================================================

    const [updateResult] = await connection.execute(
      `
            UPDATE enrollment_subjects

            SET
                offering_id = ?,
                section_id = ?,
                section_subject_id = ?

            WHERE enrollment_subject_id = ?

              AND enrollment_id = ?

              AND status = 'Enrolled'
          `,
      [
        Number(offering.offering_id),

        Number(offering.section_id),

        Number(offering.section_subject_id),

        enrollmentSubjectId,
        enrollmentId,
      ],
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message:
          "Subject placement could not be updated because the enrollment subject changed.",
      });
    }

    // =================================================
    // 30. AUDIT HISTORY
    // =================================================

    await connection.execute(
      `
          INSERT INTO enrollment_subject_changes (
              enrollment_id,
              enrollment_subject_id,
              subject_id,

              change_type,

              old_offering_id,
              old_section_id,
              old_section_subject_id,

              new_offering_id,
              new_section_id,
              new_section_subject_id,

              reason,
              changed_by
          )

          VALUES (
              ?,
              ?,
              ?,

              'CHANGE',

              ?,
              ?,
              ?,

              ?,
              ?,
              ?,

              ?,
              ?
          )
        `,
      [
        enrollmentId,
        enrollmentSubjectId,
        subjectId,

        oldOfferingId,
        oldSectionId,
        oldSectionSubjectId,

        Number(offering.offering_id),

        Number(offering.section_id),

        Number(offering.section_subject_id),

        auditReason,
        changedBy,
      ],
    );

    // =================================================
    // 31. COMMIT
    // =================================================

    await connection.commit();

    transactionActive = false;

    // =================================================
    // 32. RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message: isInitialAssignment
        ? "Subject offering assigned successfully."
        : "Subject offering changed successfully.",

      assignment_type: isInitialAssignment
        ? "INITIAL_ASSIGNMENT"
        : "CORRECTION",

      enrollment: {
        enrollment_id: enrollmentId,

        enrollment_status: enrollmentStatus,

        student_id: studentId,

        student_number: enrollment.student_number,
      },

      enrollment_subject: {
        enrollment_subject_id: enrollmentSubjectId,

        enrollment_id: enrollmentId,

        subject_id: subjectId,

        subject_code: offering.subject_code,

        subject_name: offering.subject_name,

        units: Number(offering.units || 0),

        status: currentSubject.status,

        offering_id: Number(offering.offering_id),

        section_id: Number(offering.section_id),

        section_subject_id: Number(offering.section_subject_id),

        section_name: offering.section_name,

        section_year_level: Number(offering.section_year_level),

        faculty_id: Number(offering.faculty_id),

        room_id: offering.room_id !== null ? Number(offering.room_id) : null,

        schedule_days: offering.schedule_days,

        schedule_time: offering.schedule_time,
      },

      academic_eligibility: {
        eligible: academicEligibility.eligible,

        eligibility_type: academicEligibility.eligibility_type,

        reason: academicEligibility.reason,

        latest_approved_grade: academicEligibility.latest_approved_grade,

        prerequisites: academicEligibility.prerequisites,
      },

      history: {
        change_type: "CHANGE",

        old_offering_id: oldOfferingId,

        old_section_id: oldSectionId,

        old_section_subject_id: oldSectionSubjectId,

        new_offering_id: Number(offering.offering_id),

        new_section_id: Number(offering.section_id),

        new_section_subject_id: Number(offering.section_subject_id),

        reason: auditReason,

        changed_by: changedBy,
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "REGISTRAR ASSIGN OFFERING ROLLBACK ERROR:",
          rollbackError,
        );
      }
    }

    console.error("REGISTRAR ASSIGN OFFERING ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to assign subject offering.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// ROUTE 9
// GET ENROLLMENT CORRECTION / CHANGE HISTORY
//
// GET
// /api/registrar/enrollments/:id/corrections
//
// Purpose:
// - Show Registrar changes made to enrollment subjects
// - ADD
// - DROP
// - REMOVE
// - CHANGE
//
// Includes:
// - Subject
// - Old offering / section
// - New offering / section
// - Reason
// - Registrar who made the change
// - Date/time
//
// JWT:
// - Registrar authenticated through req.user
// =====================================================

router.get("/:id/corrections", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // ENROLLMENT ID
  // =================================================

  const enrollmentId = toPositiveInt(req.params.id);

  if (!enrollmentId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // VERIFY ENROLLMENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              e.enrollment_id,
              e.student_id,

              e.academic_year_id,
              e.semester_id,

              e.enrollment_status,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              c.course_id,
              c.course_code,
              c.course_name,

              ay.academic_year,
              sem.semester_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN courses c
              ON c.course_id =
                 s.course_id

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          WHERE e.enrollment_id = ?

          LIMIT 1
          `,
      [enrollmentId],
    );

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // GET CHANGE HISTORY
    // =================================================

    const [historyRows] = await connection.execute(
      `
          SELECT
              esc.change_id,
              esc.enrollment_id,
              esc.enrollment_subject_id,
              esc.subject_id,

              esc.change_type,

              -- =========================================
              -- SUBJECT
              -- =========================================

              sub.subject_code,
              sub.subject_name,
              sub.units,

              -- =========================================
              -- OLD ASSIGNMENT
              -- =========================================

              esc.old_offering_id,
              esc.old_section_id,
              esc.old_section_subject_id,

              old_sec.section_name
                  AS old_section_name,

              old_so.schedule_days
                  AS old_schedule_days,

              old_so.schedule_time
                  AS old_schedule_time,

              old_so.status
                  AS old_offering_status,

              -- =========================================
              -- NEW ASSIGNMENT
              -- =========================================

              esc.new_offering_id,
              esc.new_section_id,
              esc.new_section_subject_id,

              new_sec.section_name
                  AS new_section_name,

              new_so.schedule_days
                  AS new_schedule_days,

              new_so.schedule_time
                  AS new_schedule_time,

              new_so.status
                  AS new_offering_status,

              -- =========================================
              -- REASON / ACTOR
              -- =========================================

              esc.reason,
              esc.changed_by,

              changer.username
                  AS changed_by_username,

              esc.created_at

          FROM enrollment_subject_changes esc

          LEFT JOIN subjects sub
              ON sub.subject_id =
                 esc.subject_id

          -- =============================================
          -- OLD OFFERING / SECTION
          -- =============================================

          LEFT JOIN subject_offerings old_so
              ON old_so.offering_id =
                 esc.old_offering_id

          LEFT JOIN sections old_sec
              ON old_sec.section_id =
                 esc.old_section_id

          -- =============================================
          -- NEW OFFERING / SECTION
          -- =============================================

          LEFT JOIN subject_offerings new_so
              ON new_so.offering_id =
                 esc.new_offering_id

          LEFT JOIN sections new_sec
              ON new_sec.section_id =
                 esc.new_section_id

          -- =============================================
          -- REGISTRAR
          -- =============================================

          LEFT JOIN users changer
              ON changer.user_id =
                 esc.changed_by

          WHERE esc.enrollment_id = ?

          ORDER BY
              esc.created_at DESC,
              esc.change_id DESC
          `,
      [enrollmentId],
    );

    // =================================================
    // FORMAT HISTORY
    // =================================================

    const history = historyRows.map((row) => ({
      change_id: Number(row.change_id),

      enrollment_id: Number(row.enrollment_id),

      enrollment_subject_id: row.enrollment_subject_id
        ? Number(row.enrollment_subject_id)
        : null,

      subject: {
        subject_id: row.subject_id ? Number(row.subject_id) : null,

        subject_code: row.subject_code || null,

        subject_name: row.subject_name || null,

        units:
          row.units !== null && row.units !== undefined
            ? Number(row.units)
            : null,
      },

      change_type: row.change_type,

      // ===========================================
      // OLD
      // ===========================================

      old: {
        offering_id: row.old_offering_id ? Number(row.old_offering_id) : null,

        section_id: row.old_section_id ? Number(row.old_section_id) : null,

        section_name: row.old_section_name || null,

        section_subject_id: row.old_section_subject_id
          ? Number(row.old_section_subject_id)
          : null,

        schedule_days: row.old_schedule_days || null,

        schedule_time: row.old_schedule_time || null,

        offering_status: row.old_offering_status || null,
      },

      // ===========================================
      // NEW
      // ===========================================

      new: {
        offering_id: row.new_offering_id ? Number(row.new_offering_id) : null,

        section_id: row.new_section_id ? Number(row.new_section_id) : null,

        section_name: row.new_section_name || null,

        section_subject_id: row.new_section_subject_id
          ? Number(row.new_section_subject_id)
          : null,

        schedule_days: row.new_schedule_days || null,

        schedule_time: row.new_schedule_time || null,

        offering_status: row.new_offering_status || null,
      },

      reason: row.reason || null,

      changed_by: {
        user_id: row.changed_by ? Number(row.changed_by) : null,

        username: row.changed_by_username || null,
      },

      created_at: row.created_at,
    }));

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      enrollment: {
        enrollment_id: Number(enrollment.enrollment_id),

        student_id: Number(enrollment.student_id),

        student_number: enrollment.student_number,

        student_name: [
          enrollment.first_name,
          enrollment.middle_name,
          enrollment.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course: {
          course_id: enrollment.course_id ? Number(enrollment.course_id) : null,

          course_code: enrollment.course_code || null,

          course_name: enrollment.course_name || null,
        },

        academic_period: {
          academic_year_id: Number(enrollment.academic_year_id),

          academic_year: enrollment.academic_year,

          semester_id: Number(enrollment.semester_id),

          semester_name: enrollment.semester_name,
        },

        enrollment_status: enrollment.enrollment_status,
      },

      count: history.length,

      history,

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET ENROLLMENT CORRECTION HISTORY ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load enrollment correction history.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// ADD SUBJECT TO ENROLLMENT
//
// POST /api/registrar/enrollments/:id/subjects
//
// BODY:
//
// {
//   "offering_id": 123,
//   "reason": "Registrar added subject."
// }
//
// ALLOWED:
//
// Pending enrollment
// Approved enrollment correction
//
// ACADEMIC RULES:
//
// REGULAR:
// - Must belong to Student's active curriculum
// - Must belong to Student's current year level
// - Must belong to enrollment semester
// - Must satisfy prerequisites
// - Must not already be passed
//
// RETAKE:
// - Must belong to Student's active curriculum
// - Latest official Approved rating must be 4.00 or 5.00
// - Must still satisfy prerequisites
//
// IMPORTANT:
//
// - Registrar chooses the offering.
// - Subject is derived from the offering.
// - Frontend cannot inject subject_id / section_id.
// - Grade V2 academic evaluation is authoritative.
// - Every change is audited.
// =====================================================

router.post("/:id/subjects", async (req, res) => {
  let connection;
  let transactionActive = false;

  try {
    // =================================================
    // 1. AUTHENTICATED REGISTRAR
    // =================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (req.user.role_name !== "Registrar") {
      return res.status(403).json({
        success: false,
        message: "Registrar access is required.",
      });
    }

    const changedBy = Number(req.user.user_id);

    if (!Number.isInteger(changedBy) || changedBy <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated Registrar user ID is invalid.",
      });
    }

    // =================================================
    // 2. ENROLLMENT ID
    // =================================================

    const enrollmentId = Number(req.params.id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    // =================================================
    // 3. REQUEST BODY
    //
    // Registrar sends ONLY offering_id.
    //
    // section_id / subject_id / section_subject_id
    // are derived from the authoritative offering.
    // =================================================

    const offeringId = Number(req.body?.offering_id);

    if (!Number.isInteger(offeringId) || offeringId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid offering ID.",
      });
    }

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Reason is required when the Registrar adds a subject.",
      });
    }

    if (reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason must not exceed 500 characters.",
      });
    }

    // =================================================
    // 4. CONNECTION + TRANSACTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    // =================================================
    // 5. GET ENROLLMENT + STUDENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              e.enrollment_id,
              e.student_id,
              e.academic_year_id,
              e.semester_id,
              e.enrollment_status,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,
              s.course_id,
              s.year_level,

              c.course_code,
              c.course_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          INNER JOIN courses c
              ON c.course_id =
                 s.course_id

          WHERE e.enrollment_id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [enrollmentId],
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

    const studentId = Number(enrollment.student_id);

    const studentCourseId = Number(enrollment.course_id);

    const studentYearLevel = Number(enrollment.year_level);

    // =================================================
    // 6. ENROLLMENT STATUS
    //
    // Pending:
    // Registrar is still preparing official placement.
    //
    // Approved:
    // Registrar correction; must be audited.
    // =================================================

    const enrollmentStatus = String(enrollment.enrollment_status);

    if (!["Pending", "Approved"].includes(enrollmentStatus)) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message: `Subject cannot be added because enrollment status is "${enrollmentStatus}".`,
      });
    }

    // =================================================
    // 7. ACTIVE ASSIGNED CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
          SELECT
              sc.student_curriculum_id,
              sc.curriculum_id,
              sc.status AS assignment_status,

              cur.curriculum_name,
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
          "The Student does not have a valid active curriculum for this enrollment.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 8. GET AUTHORITATIVE OFFERING
    //
    // We derive:
    //
    // subject
    // section
    // section_subject
    // faculty
    // room
    // schedule
    //
    // from offering_id.
    // =================================================

    const [offeringRows] = await connection.execute(
      `
          SELECT
              so.offering_id,
              so.section_subject_id,
              so.subject_id,
              so.section_id,

              so.faculty_id,
              so.room_id,

              so.academic_year_id,
              so.semester_id,

              so.schedule_days,
              so.schedule_time,

              so.max_students,

              so.status
                  AS offering_status,

              ss.subject_id
                  AS section_subject_subject_id,

              ss.section_id
                  AS section_subject_section_id,

              ss.academic_year_id
                  AS section_subject_academic_year_id,

              ss.semester_id
                  AS section_subject_semester_id,

              ss.status
                  AS section_subject_status,

              sec.course_id
                  AS section_course_id,

              sec.year_level
                  AS section_year_level,

              sec.section_name,

              sub.subject_code,
              sub.subject_name,
              sub.units,
              sub.is_active
                  AS subject_is_active,

              r.capacity
                  AS room_capacity

          FROM subject_offerings so

          INNER JOIN section_subjects ss
              ON ss.section_subject_id =
                 so.section_subject_id

          INNER JOIN sections sec
              ON sec.section_id =
                 so.section_id

          INNER JOIN subjects sub
              ON sub.subject_id =
                 so.subject_id

          LEFT JOIN rooms r
              ON r.room_id =
                 so.room_id

          WHERE so.offering_id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [offeringId],
    );

    if (offeringRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(404).json({
        success: false,
        message: "Subject offering not found.",
      });
    }

    const offering = offeringRows[0];

    const subjectId = Number(offering.subject_id);

    // =================================================
    // 9. OFFERING RELATIONSHIP INTEGRITY
    // =================================================

    if (
      Number(offering.section_subject_subject_id) !== subjectId ||
      Number(offering.section_subject_section_id) !==
        Number(offering.section_id)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "INVALID_OFFERING_RELATIONSHIP",

        message:
          "The subject offering has an invalid section-subject relationship.",
      });
    }

    // =================================================
    // 10. ACTIVE SUBJECT
    // =================================================

    if (Number(offering.subject_is_active) !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,
        message: "The subject connected to this offering is inactive.",
      });
    }

    // =================================================
    // 11. COURSE
    //
    // Registrar cannot place BSIT Student into a
    // different Course's section.
    // =================================================

    if (Number(offering.section_course_id) !== studentCourseId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_COURSE_MISMATCH",

        message: "The selected offering belongs to a different course.",
      });
    }

    // =================================================
    // 12. ACADEMIC YEAR
    // =================================================

    if (
      Number(offering.academic_year_id) !==
        Number(enrollment.academic_year_id) ||
      Number(offering.section_subject_academic_year_id) !==
        Number(enrollment.academic_year_id)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_ACADEMIC_YEAR_MISMATCH",

        message:
          "The selected offering does not belong to the enrollment academic year.",
      });
    }

    // =================================================
    // 13. SEMESTER
    // =================================================

    if (
      Number(offering.semester_id) !== Number(enrollment.semester_id) ||
      Number(offering.section_subject_semester_id) !==
        Number(enrollment.semester_id)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_SEMESTER_MISMATCH",

        message:
          "The selected offering does not belong to the enrollment semester.",
      });
    }

    // =================================================
    // 14. OFFERING + SECTION SUBJECT MUST BE OPEN
    // =================================================

    if (offering.offering_status !== "Open") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_NOT_OPEN",

        message: `The selected offering is currently "${offering.offering_status}".`,
      });
    }

    if (offering.section_subject_status !== "Open") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SECTION_SUBJECT_NOT_OPEN",

        message: `The section subject is currently "${offering.section_subject_status}".`,
      });
    }

    // =================================================
    // 15. OFFERING READINESS
    //
    // Open offerings should already be configured,
    // but re-check here for defense in depth.
    // =================================================

    const maxStudents = Number(offering.max_students || 0);

    const configurationMissing = [];

    if (!offering.faculty_id) {
      configurationMissing.push("faculty");
    }

    if (!offering.schedule_days || !String(offering.schedule_days).trim()) {
      configurationMissing.push("schedule_days");
    }

    if (!offering.schedule_time || !String(offering.schedule_time).trim()) {
      configurationMissing.push("schedule_time");
    }

    if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
      configurationMissing.push("capacity");
    }

    if (configurationMissing.length > 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_NOT_READY",

        message: "The selected offering is not fully configured.",

        missing_configuration: configurationMissing,
      });
    }
    // =================================================
    // 16. ROOM CAPACITY
    // =================================================

    if (
      offering.room_capacity !== null &&
      Number(offering.room_capacity) > 0 &&
      maxStudents > Number(offering.room_capacity)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_EXCEEDS_ROOM_CAPACITY",

        message: "The offering capacity exceeds the assigned room capacity.",
      });
    }
    // =================================================
    // 17. SUBJECT MUST BELONG TO ACTIVE CURRICULUM
    //
    // Normal Registrar additions are curriculum-bound.
    //
    // Special non-curriculum exceptions should use a
    // separate explicit audited workflow later.
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
              cs.display_order

          FROM curriculum_subjects cs

          WHERE cs.curriculum_id = ?

            AND cs.subject_id = ?

          LIMIT 1
        `,
      [curriculumId, subjectId],
    );

    if (curriculumSubjectRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SUBJECT_NOT_IN_ASSIGNED_CURRICULUM",

        message:
          "The selected subject does not belong to the Student's active curriculum.",
      });
    }

    const curriculumSubject = curriculumSubjectRows[0];

    // =================================================
    // 18. GRADE V2 ACADEMIC ELIGIBILITY
    //
    // Shared service checks:
    //
    // Approved enrollment
    // + Approved grade
    // + final_rating
    // + prerequisites
    //
    // This replaces old duplicated Grade V1 logic.
    // =================================================

    const academicEligibility = await evaluateSubjectEligibility(
      studentId,
      subjectId,
      connection,
    );

    if (!academicEligibility.eligible) {
      await connection.rollback();
      transactionActive = false;

      let code = "SUBJECT_NOT_ACADEMICALLY_ELIGIBLE";

      if (
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.ALREADY_PASSED
      ) {
        code = "SUBJECT_ALREADY_PASSED";
      } else if (
        academicEligibility.eligibility_type ===
        ELIGIBILITY_TYPE.BLOCKED_PREREQUISITE
      ) {
        code = "PREREQUISITE_NOT_PASSED";
      } else if (
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.UNRESOLVED
      ) {
        code = "ACADEMIC_RESULT_UNRESOLVED";
      }

      return res.status(409).json({
        success: false,

        code,

        message:
          academicEligibility.reason ||
          "The Student is not academically eligible for this subject.",

        academic_eligibility: academicEligibility,
      });
    }

    // =================================================
    // 19. REGULAR SUBJECT TERM PROTECTION
    //
    // A subject with no previous attempt may be
    // "Regular" academically, but Registrar must not
    // add a future/past regular subject outside the
    // Student's current curriculum term.
    //
    // Retakes are different:
    // they may originate from an older term.
    // =================================================

    if (academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR) {
      if (
        Number(curriculumSubject.year_level) !== studentYearLevel ||
        Number(curriculumSubject.semester_id) !== Number(enrollment.semester_id)
      ) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          code: "REGULAR_SUBJECT_OUTSIDE_CURRENT_TERM",

          message:
            "A Regular subject can only be added from the Student's current curriculum year and semester.",

          curriculum_subject: {
            curriculum_subject_id: Number(
              curriculumSubject.curriculum_subject_id,
            ),

            subject_id: subjectId,

            year_level: Number(curriculumSubject.year_level),

            semester_id: Number(curriculumSubject.semester_id),
          },

          student_current_term: {
            year_level: studentYearLevel,

            semester_id: Number(enrollment.semester_id),
          },
        });
      }
    }

    // =================================================
    // 20. DUPLICATE / PREVIOUS MEMBERSHIP
    // =================================================

    const [existingRows] = await connection.execute(
      `
          SELECT
              enrollment_subject_id,
              subject_id,
              offering_id,
              section_id,
              section_subject_id,
              status

          FROM enrollment_subjects

          WHERE enrollment_id = ?

            AND subject_id = ?

          ORDER BY
              enrollment_subject_id DESC

          FOR UPDATE
        `,
      [enrollmentId, subjectId],
    );

    const activeExisting = existingRows.find(
      (row) => !["Dropped", "Withdrawn"].includes(String(row.status)),
    );

    if (activeExisting) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SUBJECT_ALREADY_IN_ENROLLMENT",

        message: "This subject is already part of the enrollment.",

        enrollment_subject_id: Number(activeExisting.enrollment_subject_id),

        status: activeExisting.status,
      });
    }

    // =================================================
    // 21. CAPACITY
    //
    // Count all official/current assigned membership,
    // not only freshly Enrolled rows.
    // =================================================

    const [capacityRows] = await connection.execute(
      `
          SELECT
              COUNT(*) AS enrolled_count

          FROM enrollment_subjects es

          INNER JOIN enrollments e
              ON e.enrollment_id =
                 es.enrollment_id

          WHERE es.offering_id = ?

            AND es.status IN (
                'Enrolled',
                'Completed',
                'Failed',
                'Incomplete'
            )

            AND e.enrollment_status IN (
                'Pending',
                'Approved'
            )
        `,
      [offeringId],
    );

    const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

    if (enrolledCount >= maxStudents) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_FULL",

        message: "The selected subject offering is already full.",

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots: 0,
        },
      });
    }

    // =================================================
    // 22. RESTORE DROPPED/WITHDRAWN ROW OR INSERT NEW
    // =================================================

    const restorable = existingRows.find((row) =>
      ["Dropped", "Withdrawn"].includes(String(row.status)),
    );

    let enrollmentSubjectId;
    let restored = false;

    if (restorable) {
      // ===============================================
      // GRADE LOCK
      //
      // Never reuse/change a historical
      // enrollment_subject once any grade row exists.
      // ===============================================

      const [gradeRows] = await connection.execute(
        `
            SELECT
                grade_id,
                grade_status

            FROM grades

            WHERE enrollment_subject_id = ?

            LIMIT 1

            FOR UPDATE
          `,
        [Number(restorable.enrollment_subject_id)],
      );

      if (gradeRows.length > 0) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          code: "SUBJECT_GRADE_LOCKED",

          message:
            "This previous subject record cannot be restored because a grade record already exists for it.",

          grade: {
            grade_id: Number(gradeRows[0].grade_id),

            grade_status: gradeRows[0].grade_status,
          },
        });
      }

      enrollmentSubjectId = Number(restorable.enrollment_subject_id);

      const [restoreResult] = await connection.execute(
        `
            UPDATE enrollment_subjects

            SET
                offering_id = ?,
                section_id = ?,
                section_subject_id = ?,
                status = 'Enrolled'

            WHERE enrollment_subject_id = ?

              AND enrollment_id = ?

              AND status IN (
                  'Dropped',
                  'Withdrawn'
              )
          `,
        [
          Number(offering.offering_id),

          Number(offering.section_id),

          Number(offering.section_subject_id),

          enrollmentSubjectId,
          enrollmentId,
        ],
      );

      if (restoreResult.affectedRows !== 1) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          message:
            "The previous subject record could not be restored because its status changed.",
        });
      }

      restored = true;

      // ===============================================
      // AUDIT RESTORATION AS ADD
      // ===============================================

      await connection.execute(
        `
          INSERT INTO enrollment_subject_changes (
              enrollment_id,
              enrollment_subject_id,
              subject_id,

              change_type,

              old_offering_id,
              old_section_id,
              old_section_subject_id,

              new_offering_id,
              new_section_id,
              new_section_subject_id,

              reason,
              changed_by
          )

          VALUES (
              ?,
              ?,
              ?,

              'ADD',

              ?,
              ?,
              ?,

              ?,
              ?,
              ?,

              ?,
              ?
          )
        `,
        [
          enrollmentId,
          enrollmentSubjectId,
          subjectId,

          restorable.offering_id,
          restorable.section_id,
          restorable.section_subject_id,

          Number(offering.offering_id),

          Number(offering.section_id),

          Number(offering.section_subject_id),

          reason,
          changedBy,
        ],
      );
    } else {
      // ===============================================
      // INSERT NEW MEMBERSHIP
      // ===============================================

      const [insertResult] = await connection.execute(
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
                ?,
                ?,
                ?,
                'Enrolled'
            )
          `,
        [
          enrollmentId,
          subjectId,

          Number(offering.offering_id),

          Number(offering.section_id),

          Number(offering.section_subject_id),
        ],
      );

      if (insertResult.affectedRows !== 1) {
        await connection.rollback();
        transactionActive = false;

        return res.status(500).json({
          success: false,
          message: "Subject could not be added to the enrollment.",
        });
      }

      enrollmentSubjectId = Number(insertResult.insertId);

      // ===============================================
      // AUDIT NEW ADDITION
      //
      // Correct change_type = ADD
      // ===============================================

      await connection.execute(
        `
          INSERT INTO enrollment_subject_changes (
              enrollment_id,
              enrollment_subject_id,
              subject_id,

              change_type,

              old_offering_id,
              old_section_id,
              old_section_subject_id,

              new_offering_id,
              new_section_id,
              new_section_subject_id,

              reason,
              changed_by
          )

          VALUES (
              ?,
              ?,
              ?,

              'ADD',

              NULL,
              NULL,
              NULL,

              ?,
              ?,
              ?,

              ?,
              ?
          )
        `,
        [
          enrollmentId,
          enrollmentSubjectId,
          subjectId,

          Number(offering.offering_id),

          Number(offering.section_id),

          Number(offering.section_subject_id),

          reason,
          changedBy,
        ],
      );
    }

    // =================================================
    // 23. COMMIT
    // =================================================

    await connection.commit();

    transactionActive = false;

    // =================================================
    // 24. RESPONSE
    // =================================================

    return res.status(restored ? 200 : 201).json({
      success: true,

      message: restored
        ? "Previously dropped subject restored successfully."
        : "Subject added to enrollment successfully.",

      restored,

      enrollment: {
        enrollment_id: enrollmentId,

        enrollment_status: enrollmentStatus,

        student_id: studentId,

        student_number: enrollment.student_number,
      },

      enrollment_subject: {
        enrollment_subject_id: enrollmentSubjectId,

        enrollment_id: enrollmentId,

        subject_id: subjectId,

        subject_code: offering.subject_code,

        subject_name: offering.subject_name,

        units: Number(offering.units || 0),

        offering_id: Number(offering.offering_id),

        section_id: Number(offering.section_id),

        section_subject_id: Number(offering.section_subject_id),

        section_name: offering.section_name,

        faculty_id: Number(offering.faculty_id),

        room_id: offering.room_id !== null ? Number(offering.room_id) : null,

        schedule_days: offering.schedule_days,

        schedule_time: offering.schedule_time,

        status: "Enrolled",
      },

      academic_eligibility: {
        eligible: academicEligibility.eligible,

        eligibility_type: academicEligibility.eligibility_type,

        reason: academicEligibility.reason,

        latest_approved_grade: academicEligibility.latest_approved_grade,

        prerequisites: academicEligibility.prerequisites,
      },

      history: {
        change_type: "ADD",

        reason,

        changed_by: changedBy,
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("REGISTRAR ADD SUBJECT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("REGISTRAR ADD SUBJECT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to add subject to enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// GET SUBJECTS AVAILABLE FOR ADDITION
//
// GET /api/registrar/enrollments/:id/available-subjects
//
// PURPOSE:
//
// Show ONLY subjects that Registrar can actually add.
//
// RULES:
//
// - Registrar authentication required.
// - Enrollment must be Pending or Approved.
// - Student must have an active curriculum.
// - Subject must belong to that curriculum.
// - Regular subject:
//      current year level + enrollment semester.
// - Retake:
//      Approved 4.00 / 5.00 result.
// - Passed subject excluded.
// - Missing prerequisite excluded.
// - Unresolved academic result excluded.
// - Subject already active in enrollment excluded.
// - Offering must be Open.
// - Section Subject must be Open.
// - Same Course / AY / semester.
// - Offering must be configured.
// - Capacity must still be available.
// =====================================================

router.get("/:id/available-subjects", async (req, res) => {
  let connection;

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

    if (req.user.role_name !== "Registrar") {
      return res.status(403).json({
        success: false,
        message: "Registrar access is required.",
      });
    }

    // =================================================
    // 2. ENROLLMENT ID
    // =================================================

    const enrollmentId = Number(req.params.id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    // =================================================
    // 3. CONNECTION
    // =================================================

    connection = await db.getConnection();

    // =================================================
    // 4. GET ENROLLMENT + STUDENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              e.enrollment_id,
              e.student_id,
              e.academic_year_id,
              e.semester_id,
              e.enrollment_status,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              s.course_id,
              s.year_level,

              c.course_code,
              c.course_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          INNER JOIN courses c
              ON c.course_id =
                 s.course_id

          WHERE e.enrollment_id = ?

          LIMIT 1
        `,
      [enrollmentId],
    );

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    const studentId = Number(enrollment.student_id);

    const courseId = Number(enrollment.course_id);

    const yearLevel = Number(enrollment.year_level);

    const academicYearId = Number(enrollment.academic_year_id);

    const semesterId = Number(enrollment.semester_id);

    const enrollmentStatus = String(enrollment.enrollment_status);

    // =================================================
    // 5. ENROLLMENT STATUS
    //
    // Must match POST /:id/subjects.
    // =================================================

    if (!["Pending", "Approved"].includes(enrollmentStatus)) {
      return res.status(409).json({
        success: false,

        message: `Subjects cannot be added because enrollment status is "${enrollmentStatus}".`,
      });
    }

    // =================================================
    // 6. ACTIVE ASSIGNED CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
          SELECT
              sc.student_curriculum_id,
              sc.curriculum_id,
              sc.status AS assignment_status,

              cur.curriculum_name,
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
        `,
      [studentId, courseId],
    );

    if (curriculumRows.length === 0) {
      return res.status(409).json({
        success: false,

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message: "The Student does not have a valid active curriculum.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 7. GET ALL CURRICULUM SUBJECTS
    //
    // We need all terms because a Retake may come
    // from an earlier year or semester.
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

              sub.subject_code,
              sub.subject_name,
              sub.units,
              sub.lecture_hours,
              sub.laboratory_hours,
              sub.is_active

          FROM curriculum_subjects cs

          INNER JOIN subjects sub
              ON sub.subject_id =
                 cs.subject_id

          WHERE cs.curriculum_id = ?

            AND sub.is_active = 1

          ORDER BY
              cs.year_level ASC,
              cs.semester_id ASC,
              cs.display_order ASC,
              sub.subject_code ASC
        `,
      [curriculumId],
    );

    // =================================================
    // 8. CURRENT ACTIVE ENROLLMENT SUBJECTS
    //
    // Dropped / Withdrawn may potentially be restored,
    // so they are not considered active duplicates.
    // =================================================

    const [existingRows] = await connection.execute(
      `
          SELECT
              enrollment_subject_id,
              subject_id,
              status

          FROM enrollment_subjects

          WHERE enrollment_id = ?
        `,
      [enrollmentId],
    );

    const activeSubjectIds = new Set(
      existingRows
        .filter((row) => !["Dropped", "Withdrawn"].includes(String(row.status)))
        .map((row) => Number(row.subject_id)),
    );

    // =================================================
    // 9. DETERMINE ACADEMICALLY ELIGIBLE SUBJECTS
    //
    // Shared Grade V2 service is authoritative.
    // =================================================

    const eligibleSubjectMap = new Map();

    for (const subject of curriculumSubjectRows) {
      const subjectId = Number(subject.subject_id);

      // -----------------------------------------------
      // ALREADY ACTIVE
      // -----------------------------------------------

      if (activeSubjectIds.has(subjectId)) {
        continue;
      }

      const eligibility = await evaluateSubjectEligibility(
        studentId,
        subjectId,
        connection,
      );

      if (!eligibility.eligible) {
        continue;
      }

      // -----------------------------------------------
      // REGULAR
      //
      // Must be current curriculum term.
      // -----------------------------------------------

      if (eligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR) {
        if (
          Number(subject.year_level) !== yearLevel ||
          Number(subject.semester_id) !== semesterId
        ) {
          continue;
        }
      }

      // -----------------------------------------------
      // Only Regular / Retake can be added here.
      // -----------------------------------------------

      if (
        ![ELIGIBILITY_TYPE.REGULAR, ELIGIBILITY_TYPE.RETAKE].includes(
          eligibility.eligibility_type,
        )
      ) {
        continue;
      }

      eligibleSubjectMap.set(subjectId, {
        curriculum_subject: subject,

        eligibility,
      });
    }

    // =================================================
    // 10. NO ACADEMICALLY ELIGIBLE SUBJECTS
    // =================================================

    if (eligibleSubjectMap.size === 0) {
      return res.status(200).json({
        success: true,

        enrollment: {
          enrollment_id: enrollmentId,

          student_id: studentId,

          student_number: enrollment.student_number,

          course_id: courseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,

          year_level: yearLevel,

          academic_year_id: academicYearId,

          semester_id: semesterId,

          enrollment_status: enrollmentStatus,
        },

        curriculum: {
          curriculum_id: curriculumId,

          curriculum_name: curriculum.curriculum_name,
        },

        totalSubjects: 0,

        subjects: [],
      });
    }

    // =================================================
    // 11. GET OPEN OFFERINGS
    //
    // Only offerings for academically eligible
    // curriculum subjects.
    // =================================================

    const eligibleSubjectIds = Array.from(eligibleSubjectMap.keys());

    const placeholders = eligibleSubjectIds.map(() => "?").join(",");

    const [offeringRows] = await connection.execute(
      `
          SELECT
              so.offering_id,
              so.section_subject_id,
              so.subject_id,
              so.section_id,

              so.faculty_id,
              so.room_id,

              so.academic_year_id,
              so.semester_id,

              so.schedule_days,
              so.schedule_time,

              so.max_students,

              so.status
                  AS offering_status,

              ss.status
                  AS section_subject_status,

              ss.subject_id
                  AS section_subject_subject_id,

              ss.section_id
                  AS section_subject_section_id,

              sec.section_name,
              sec.course_id
                  AS section_course_id,

              sec.year_level
                  AS section_year_level,

              sub.subject_code,
              sub.subject_name,
              sub.units,

              r.capacity
                  AS room_capacity,

              (
                  SELECT
                      COUNT(*)

                  FROM enrollment_subjects es2

                  INNER JOIN enrollments e2
                      ON e2.enrollment_id =
                         es2.enrollment_id

                  WHERE es2.offering_id =
                        so.offering_id

                    AND es2.status IN (
                        'Enrolled',
                        'Completed',
                        'Failed',
                        'Incomplete'
                    )

                    AND e2.enrollment_status IN (
                        'Pending',
                        'Approved'
                    )
              ) AS enrolled_count

          FROM subject_offerings so

          INNER JOIN section_subjects ss
              ON ss.section_subject_id =
                 so.section_subject_id

          INNER JOIN sections sec
              ON sec.section_id =
                 so.section_id

          INNER JOIN subjects sub
              ON sub.subject_id =
                 so.subject_id

          LEFT JOIN rooms r
              ON r.room_id =
                 so.room_id

          WHERE so.subject_id IN (
              ${placeholders}
          )

            AND so.academic_year_id = ?

            AND so.semester_id = ?

            AND ss.academic_year_id = ?

            AND ss.semester_id = ?

            AND sec.course_id = ?

            AND so.status = 'Open'

            AND ss.status = 'Open'

          ORDER BY
              sub.subject_code ASC,
              sec.section_name ASC,
              so.offering_id ASC
        `,
      [
        ...eligibleSubjectIds,

        academicYearId,
        semesterId,

        academicYearId,
        semesterId,

        courseId,
      ],
    );

    // =================================================
    // 12. GROUP SUBJECTS + VALID OFFERINGS
    // =================================================

    const subjectMap = new Map();

    for (const row of offeringRows) {
      const subjectId = Number(row.subject_id);

      const academicData = eligibleSubjectMap.get(subjectId);

      if (!academicData) {
        continue;
      }

      const {
        curriculum_subject: curriculumSubject,

        eligibility,
      } = academicData;

      // ===============================================
      // OFFERING RELATIONSHIP
      // ===============================================

      if (
        Number(row.section_subject_subject_id) !== subjectId ||
        Number(row.section_subject_section_id) !== Number(row.section_id)
      ) {
        continue;
      }

      // ===============================================
      // REGULAR SECTION YEAR LEVEL
      //
      // Regular students should use a section matching
      // their current year level.
      //
      // Retakes may use another compatible section.
      // ===============================================

      if (
        eligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR &&
        Number(row.section_year_level) !== yearLevel
      ) {
        continue;
      }

      // ===============================================
      // CONFIGURATION / READINESS
      // ===============================================

      const maxStudents = Number(row.max_students || 0);

      if (!row.faculty_id) {
        continue;
      }

      if (!row.schedule_days || !String(row.schedule_days).trim()) {
        continue;
      }

      if (!row.schedule_time || !String(row.schedule_time).trim()) {
        continue;
      }

      if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
        continue;
      }
      // ===============================================
      // ROOM CAPACITY
      // ===============================================

      if (
        row.room_capacity !== null &&
        Number(row.room_capacity) > 0 &&
        maxStudents > Number(row.room_capacity)
      ) {
        continue;
      }

      // ===============================================
      // OFFERING CAPACITY
      // ===============================================

      const enrolledCount = Number(row.enrolled_count || 0);

      if (enrolledCount >= maxStudents) {
        continue;
      }

      // ===============================================
      // CREATE SUBJECT GROUP
      // ===============================================

      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          subject_id: subjectId,

          subject_code: row.subject_code,

          subject_name: row.subject_name,

          units: Number(row.units || 0),

          curriculum_subject_id: Number(
            curriculumSubject.curriculum_subject_id,
          ),

          curriculum_year_level: Number(curriculumSubject.year_level),

          curriculum_semester_id: Number(curriculumSubject.semester_id),

          enrollment_type: eligibility.eligibility_type,

          academic_eligibility: {
            eligible: eligibility.eligible,

            eligibility_type: eligibility.eligibility_type,

            reason: eligibility.reason,

            latest_approved_grade: eligibility.latest_approved_grade,

            prerequisites: eligibility.prerequisites,
          },

          available_sections: [],
        });
      }

      // ===============================================
      // ADD OFFERING / SECTION
      // ===============================================

      subjectMap.get(subjectId).available_sections.push({
        offering_id: Number(row.offering_id),

        section_subject_id: Number(row.section_subject_id),

        section_id: Number(row.section_id),

        section_name: row.section_name,

        section_year_level: Number(row.section_year_level),

        faculty_id: Number(row.faculty_id),

        room_id: row.room_id !== null ? Number(row.room_id) : null,

        schedule_days: row.schedule_days,

        schedule_time: row.schedule_time,

        enrolled_count: enrolledCount,

        max_students: maxStudents,

        available_slots: Math.max(maxStudents - enrolledCount, 0),

        status: row.offering_status,
      });
    }

    // =================================================
    // 13. REMOVE SUBJECTS WITH ZERO VALID OFFERINGS
    // =================================================

    const availableSubjects = Array.from(subjectMap.values())
      .filter((subject) => subject.available_sections.length > 0)
      .sort((a, b) =>
        String(a.subject_code).localeCompare(String(b.subject_code)),
      );

    // =================================================
    // 14. RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      enrollment: {
        enrollment_id: enrollmentId,

        student_id: studentId,

        student_number: enrollment.student_number,

        student_name: [
          enrollment.first_name,
          enrollment.middle_name,
          enrollment.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course_id: courseId,

        course_code: enrollment.course_code,

        course_name: enrollment.course_name,

        year_level: yearLevel,

        academic_year_id: academicYearId,

        semester_id: semesterId,

        enrollment_status: enrollmentStatus,
      },

      curriculum: {
        curriculum_id: curriculumId,

        curriculum_name: curriculum.curriculum_name,
      },

      totalSubjects: availableSubjects.length,

      subjects: availableSubjects,
    });
  } catch (error) {
    console.error("GET REGISTRAR AVAILABLE SUBJECTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to retrieve available subjects.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// ROUTE 12
// DROP SUBJECT FROM ENROLLMENT
//
// PATCH
// /api/registrar/enrollments/:id/subjects/:enrollmentSubjectId/drop
//
// BODY:
//
// {
//   "reason": "Registrar dropped subject for correction."
// }
//
// ALLOWED ENROLLMENT STATUS:
// - Pending
// - Approved
//
// IMPORTANT:
//
// - Registrar comes from req.user
// - Never DELETE enrollment_subjects
// - Subject must currently be Enrolled
// - Any Grade V2 row locks the subject from dropping
// - Approved enrollment may never become empty
// - Existing placement IDs remain on the historical row
// - DROP history is recorded
// - audit_trail is recorded
// - Everything happens inside one transaction
// =====================================================

router.patch("/:id/subjects/:enrollmentSubjectId/drop", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // 1. IDS
  // =================================================

  const enrollmentId = toPositiveInt(req.params.id);

  const enrollmentSubjectId = toPositiveInt(req.params.enrollmentSubjectId);

  if (!enrollmentId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment ID.",
    });
  }

  if (!enrollmentSubjectId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment subject ID.",
    });
  }

  // =================================================
  // 2. REASON
  //
  // Official correction must always explain why.
  // =================================================

  const dropReason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  if (!dropReason) {
    return res.status(400).json({
      success: false,

      code: "DROP_REASON_REQUIRED",

      message: "A reason is required when dropping an enrollment subject.",
    });
  }

  if (dropReason.length > 500) {
    return res.status(400).json({
      success: false,

      message: "Drop reason must not exceed 500 characters.",
    });
  }

  let connection;
  let transactionActive = false;

  try {
    // =================================================
    // 3. START TRANSACTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    // =================================================
    // 4. LOCK ENROLLMENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
            SELECT
                e.enrollment_id,
                e.student_id,

                e.academic_year_id,
                e.semester_id,

                e.enrollment_status,

                s.student_number,
                s.first_name,
                s.middle_name,
                s.last_name,

                s.course_id,

                c.course_code,
                c.course_name,

                ay.academic_year,
                sem.semester_name

            FROM enrollments e

            INNER JOIN students s
                ON s.student_id =
                   e.student_id

            LEFT JOIN courses c
                ON c.course_id =
                   s.course_id

            INNER JOIN academic_years ay
                ON ay.academic_year_id =
                   e.academic_year_id

            INNER JOIN semesters sem
                ON sem.semester_id =
                   e.semester_id

            WHERE e.enrollment_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentId],
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
    // 5. ENROLLMENT STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "ENROLLMENT_NOT_EDITABLE",

        message: `Subject cannot be dropped because enrollment status is "${enrollment.enrollment_status}".`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // 6. LOCK ENROLLMENT SUBJECT
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

                sub.subject_code,
                sub.subject_name,
                sub.units,

                sec.section_name,

                so.schedule_days,
                so.schedule_time,

                so.faculty_id,
                so.room_id

            FROM enrollment_subjects es

            INNER JOIN subjects sub
                ON sub.subject_id =
                   es.subject_id

            LEFT JOIN sections sec
                ON sec.section_id =
                   es.section_id

            LEFT JOIN subject_offerings so
                ON so.offering_id =
                   es.offering_id

            WHERE es.enrollment_subject_id = ?

              AND es.enrollment_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentSubjectId, enrollmentId],
    );

    if (subjectRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(404).json({
        success: false,

        message: "Enrollment subject not found.",
      });
    }

    const subject = subjectRows[0];

    // =================================================
    // 7. MUST CURRENTLY BE ENROLLED
    // =================================================

    if (subject.status !== "Enrolled") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "ENROLLMENT_SUBJECT_NOT_EDITABLE",

        message: `Subject cannot be dropped because its current status is "${subject.status}".`,
      });
    }

    // =================================================
    // 8. GRADE V2 LOCK
    //
    // ANY grade row means grading has started.
    //
    // Draft     -> locked
    // Submitted -> locked
    // Returned  -> locked
    // Approved  -> locked
    //
    // Ordinary enrollment correction must never
    // invalidate an existing grade relationship.
    // =================================================

    const [gradeRows] = await connection.execute(
      `
            SELECT
                grade_id,
                enrollment_subject_id,
                faculty_id,
                final_rating,
                grade_status

            FROM grades

            WHERE enrollment_subject_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentSubjectId],
    );

    if (gradeRows.length > 0) {
      const grade = gradeRows[0];

      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SUBJECT_GRADE_LOCKED",

        message:
          "This subject cannot be dropped because grading has already started.",

        grade: {
          grade_id: Number(grade.grade_id),

          grade_status: grade.grade_status,

          final_rating:
            grade.final_rating !== null ? Number(grade.final_rating) : null,
        },
      });
    }

    // =================================================
    // 9. APPROVED ENROLLMENT MUST NOT BECOME EMPTY
    //
    // We lock all OTHER active subjects so another
    // correction cannot remove them concurrently.
    //
    // Active membership states:
    // - Enrolled
    // - Completed
    // - Failed
    // - Incomplete
    //
    // Dropped / Withdrawn are not active.
    // =================================================

    let remainingActiveSubjects = null;

    if (enrollment.enrollment_status === "Approved") {
      const [remainingRows] = await connection.execute(
        `
              SELECT
                  enrollment_subject_id,
                  subject_id,
                  status

              FROM enrollment_subjects

              WHERE enrollment_id = ?

                AND enrollment_subject_id <> ?

                AND status IN (
                    'Enrolled',
                    'Completed',
                    'Failed',
                    'Incomplete'
                )

              FOR UPDATE
            `,
        [enrollmentId, enrollmentSubjectId],
      );

      remainingActiveSubjects = remainingRows.length;

      if (remainingActiveSubjects === 0) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          code: "APPROVED_ENROLLMENT_CANNOT_BE_EMPTY",

          message:
            "The final active subject cannot be dropped from an Approved enrollment.",

          enrollment: {
            enrollment_id: enrollmentId,

            enrollment_status: enrollment.enrollment_status,

            active_subjects_after_drop: 0,
          },
        });
      }
    }

    // =================================================
    // 10. SAVE OLD VALUES
    // =================================================

    const oldValues = {
      subject_id: Number(subject.subject_id),

      offering_id:
        subject.offering_id !== null ? Number(subject.offering_id) : null,

      section_id:
        subject.section_id !== null ? Number(subject.section_id) : null,

      section_subject_id:
        subject.section_subject_id !== null
          ? Number(subject.section_subject_id)
          : null,

      status: subject.status,
    };

    // =================================================
    // 11. NEW VALUES
    //
    // IMPORTANT:
    //
    // Placement IDs remain physically stored on the
    // enrollment_subject row for historical reference.
    //
    // Only status becomes Dropped.
    // =================================================

    const newValues = {
      subject_id: Number(subject.subject_id),

      offering_id: oldValues.offering_id,

      section_id: oldValues.section_id,

      section_subject_id: oldValues.section_subject_id,

      status: "Dropped",
    };

    // =================================================
    // 12. DROP
    // =================================================

    const [updateResult] = await connection.execute(
      `
            UPDATE enrollment_subjects

            SET
                status = 'Dropped'

            WHERE enrollment_subject_id = ?

              AND enrollment_id = ?

              AND status = 'Enrolled'
          `,
      [enrollmentSubjectId, enrollmentId],
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message:
          "Enrollment subject could not be dropped because its status changed.",
      });
    }

    // =================================================
    // 13. ENROLLMENT SUBJECT CHANGE HISTORY
    //
    // The active placement becomes logically NULL
    // after DROP, while the enrollment_subject record
    // itself preserves its old placement IDs.
    // =================================================

    await connection.execute(
      `
          INSERT INTO enrollment_subject_changes (
              enrollment_id,
              enrollment_subject_id,
              subject_id,

              change_type,

              old_offering_id,
              old_section_id,
              old_section_subject_id,

              new_offering_id,
              new_section_id,
              new_section_subject_id,

              reason,
              changed_by
          )

          VALUES (
              ?,
              ?,
              ?,

              'DROP',

              ?,
              ?,
              ?,

              NULL,
              NULL,
              NULL,

              ?,
              ?
          )
        `,
      [
        enrollmentId,
        enrollmentSubjectId,
        Number(subject.subject_id),

        oldValues.offering_id,
        oldValues.section_id,
        oldValues.section_subject_id,

        dropReason,

        Number(actor.user_id),
      ],
    );

    // =================================================
    // 14. GENERIC AUDIT TRAIL
    // =================================================

    await connection.execute(
      `
          INSERT INTO audit_trail (
              user_id,
              table_name,
              record_id,
              action,
              old_values,
              new_values
          )

          VALUES (
              ?,
              'enrollment_subjects',
              ?,
              'UPDATE',
              ?,
              ?
          )
        `,
      [
        Number(actor.user_id),

        enrollmentSubjectId,

        JSON.stringify(oldValues),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // 15. COMMIT
    // =================================================

    await connection.commit();

    transactionActive = false;

    // =================================================
    // 16. SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Subject dropped from enrollment successfully.",

      enrollment: {
        enrollment_id: Number(enrollment.enrollment_id),

        enrollment_status: enrollment.enrollment_status,

        student_id: Number(enrollment.student_id),

        student_number: enrollment.student_number,

        student_name: [
          enrollment.first_name,
          enrollment.middle_name,
          enrollment.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course: {
          course_id:
            enrollment.course_id !== null ? Number(enrollment.course_id) : null,

          course_code: enrollment.course_code || null,

          course_name: enrollment.course_name || null,
        },

        academic_period: {
          academic_year_id: Number(enrollment.academic_year_id),

          academic_year: enrollment.academic_year,

          semester_id: Number(enrollment.semester_id),

          semester_name: enrollment.semester_name,
        },

        remaining_active_subjects: remainingActiveSubjects,
      },

      enrollment_subject: {
        enrollment_subject_id: Number(subject.enrollment_subject_id),

        enrollment_id: Number(subject.enrollment_id),

        subject_id: Number(subject.subject_id),

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        previous_status: subject.status,

        status: "Dropped",

        offering_id: oldValues.offering_id,

        section_id: oldValues.section_id,

        section_name: subject.section_name || null,

        section_subject_id: oldValues.section_subject_id,

        schedule_days: subject.schedule_days || null,

        schedule_time: subject.schedule_time || null,

        faculty_id:
          subject.faculty_id !== null ? Number(subject.faculty_id) : null,

        room_id: subject.room_id !== null ? Number(subject.room_id) : null,
      },

      history: {
        change_type: "DROP",

        old: {
          offering_id: oldValues.offering_id,

          section_id: oldValues.section_id,

          section_subject_id: oldValues.section_subject_id,
        },

        new: {
          offering_id: null,
          section_id: null,
          section_subject_id: null,
        },

        reason: dropReason,

        changed_by: Number(actor.user_id),
      },

      actor: {
        user_id: Number(actor.user_id),

        username: actor.username,
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("DROP SUBJECT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("DROP SUBJECT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to drop subject from enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// VALIDATE ENROLLMENT BEFORE APPROVAL
//
// GET /api/registrar/enrollments/:id/validate
//
// PURPOSE:
//
// Perform the complete final validation required before
// Registrar may approve a Pending enrollment.
//
// IMPORTANT:
//
// This route DOES NOT approve anything.
// It only reports:
//
// valid
// can_approve
// errors
// warnings
//
// RULES:
//
// - Authenticated Registrar only
// - Enrollment must be Pending
// - Student must have active curriculum
// - Must contain at least one active subject
// - No duplicate active subjects
// - Every active subject must:
//      * belong to active curriculum
//      * remain academically eligible
//      * satisfy prerequisite rules
//      * have complete Registrar placement
//      * point to the same subject
//      * point to the same section
//      * use same AY / semester
//      * use same course
//      * use Open offering
//      * use Open section_subject
//      * use correct year-level section for Regular
//      * have faculty / schedule / capacity
//      * not exceed room capacity when room exists
//      * not exceed offering capacity
//
// Room assignment remains optional.
// =====================================================

router.get("/:id/validate", async (req, res) => {
  let connection;

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

    if (req.user.role_name !== "Registrar") {
      return res.status(403).json({
        success: false,
        message: "Registrar access is required.",
      });
    }

    // =================================================
    // 2. ENROLLMENT ID
    // =================================================

    const enrollmentId = Number(req.params.id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    // =================================================
    // 3. DATABASE CONNECTION
    // =================================================

    connection = await db.getConnection();

    // =================================================
    // 4. GET ENROLLMENT + STUDENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
          SELECT
              e.enrollment_id,
              e.student_id,
              e.academic_year_id,
              e.semester_id,
              e.enrollment_status,
              e.remarks,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              s.course_id,
              s.year_level,

              c.course_code,
              c.course_name,

              ay.academic_year,
              sem.semester_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          INNER JOIN courses c
              ON c.course_id =
                 s.course_id

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          WHERE e.enrollment_id = ?

          LIMIT 1
        `,
      [enrollmentId],
    );

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    const studentId = Number(enrollment.student_id);

    const courseId = Number(enrollment.course_id);

    const yearLevel = Number(enrollment.year_level);

    const academicYearId = Number(enrollment.academic_year_id);

    const semesterId = Number(enrollment.semester_id);

    // =================================================
    // 5. COLLECT VALIDATION RESULTS
    // =================================================

    const errors = [];
    const warnings = [];

    // =================================================
    // 6. ENROLLMENT STATUS
    // =================================================

    if (enrollment.enrollment_status !== "Pending") {
      errors.push({
        code: "ENROLLMENT_NOT_PENDING",

        message: `Enrollment must be Pending before approval. Current status is "${enrollment.enrollment_status}".`,
      });
    }

    // =================================================
    // 7. ACTIVE CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
          SELECT
              sc.student_curriculum_id,
              sc.curriculum_id,
              sc.status
                  AS assignment_status,

              cur.curriculum_name,
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
        `,
      [studentId, courseId],
    );

    let curriculum = null;
    let curriculumId = null;

    if (curriculumRows.length === 0) {
      errors.push({
        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message: "The Student does not have a valid active curriculum.",
      });
    } else {
      curriculum = curriculumRows[0];

      curriculumId = Number(curriculum.curriculum_id);
    }

    // =================================================
    // 8. GET ENROLLMENT SUBJECTS
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

              sub.subject_code,
              sub.subject_name,
              sub.units,
              sub.is_active
                  AS subject_is_active

          FROM enrollment_subjects es

          INNER JOIN subjects sub
              ON sub.subject_id =
                 es.subject_id

          WHERE es.enrollment_id = ?

          ORDER BY
              es.enrollment_subject_id ASC
        `,
      [enrollmentId],
    );

    // =================================================
    // 9. ACTIVE SUBJECTS
    // =================================================

    const activeSubjects = subjectRows.filter(
      (subject) => !["Dropped", "Withdrawn"].includes(String(subject.status)),
    );

    if (activeSubjects.length === 0) {
      errors.push({
        code: "NO_ACTIVE_SUBJECTS",

        message:
          "Enrollment must contain at least one active subject before approval.",
      });
    }

    // =================================================
    // 10. DUPLICATE ACTIVE SUBJECTS
    // =================================================

    const subjectFrequency = new Map();

    for (const subject of activeSubjects) {
      const subjectId = Number(subject.subject_id);

      subjectFrequency.set(
        subjectId,
        (subjectFrequency.get(subjectId) || 0) + 1,
      );
    }

    for (const [subjectId, count] of subjectFrequency.entries()) {
      if (count > 1) {
        const matchingSubject = activeSubjects.find(
          (subject) => Number(subject.subject_id) === subjectId,
        );

        errors.push({
          code: "DUPLICATE_ACTIVE_SUBJECT",

          message: `Subject "${matchingSubject?.subject_code || subjectId}" appears more than once in the active enrollment.`,

          subject_id: subjectId,

          count,
        });
      }
    }

    // =================================================
    // 11. VALIDATE EVERY ACTIVE SUBJECT
    // =================================================

    const validatedSubjects = [];

    for (const subject of activeSubjects) {
      const enrollmentSubjectId = Number(subject.enrollment_subject_id);

      const subjectId = Number(subject.subject_id);

      const subjectErrors = [];
      const subjectWarnings = [];

      let curriculumSubject = null;
      let academicEligibility = null;
      let offering = null;

      // ===============================================
      // SUBJECT STATUS
      // ===============================================

      if (subject.status !== "Enrolled") {
        subjectErrors.push({
          code: "INVALID_PRE_APPROVAL_SUBJECT_STATUS",

          message: `Subject status must be "Enrolled" before enrollment approval. Current status is "${subject.status}".`,
        });
      }

      // ===============================================
      // ACTIVE SUBJECT MASTER RECORD
      // ===============================================

      if (Number(subject.subject_is_active) !== 1) {
        subjectErrors.push({
          code: "SUBJECT_INACTIVE",

          message: "The subject is inactive.",
        });
      }

      // ===============================================
      // CURRICULUM MEMBERSHIP
      // ===============================================

      if (curriculumId !== null) {
        const [curriculumSubjectRows] = await connection.execute(
          `
              SELECT
                  curriculum_subject_id,
                  curriculum_id,
                  subject_id,
                  year_level,
                  semester_id,
                  is_required,
                  display_order

              FROM curriculum_subjects

              WHERE curriculum_id = ?

                AND subject_id = ?

              LIMIT 1
            `,
          [curriculumId, subjectId],
        );

        if (curriculumSubjectRows.length === 0) {
          subjectErrors.push({
            code: "SUBJECT_NOT_IN_ASSIGNED_CURRICULUM",

            message:
              "Subject does not belong to the Student's active curriculum.",
          });
        } else {
          curriculumSubject = curriculumSubjectRows[0];
        }
      }

      // ===============================================
      // ACADEMIC ELIGIBILITY
      // ===============================================

      if (curriculumSubject !== null) {
        academicEligibility = await evaluateSubjectEligibility(
          studentId,
          subjectId,
          connection,
        );

        if (!academicEligibility.eligible) {
          let code = "SUBJECT_NOT_ACADEMICALLY_ELIGIBLE";

          if (
            academicEligibility.eligibility_type ===
            ELIGIBILITY_TYPE.ALREADY_PASSED
          ) {
            code = "SUBJECT_ALREADY_PASSED";
          } else if (
            academicEligibility.eligibility_type ===
            ELIGIBILITY_TYPE.BLOCKED_PREREQUISITE
          ) {
            code = "PREREQUISITE_NOT_PASSED";
          } else if (
            academicEligibility.eligibility_type === ELIGIBILITY_TYPE.UNRESOLVED
          ) {
            code = "ACADEMIC_RESULT_UNRESOLVED";
          }

          subjectErrors.push({
            code,

            message:
              academicEligibility.reason ||
              "Subject is not academically eligible.",
          });
        }

        // =============================================
        // REGULAR CURRENT-TERM RULE
        // =============================================

        if (
          academicEligibility?.eligible &&
          academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR
        ) {
          if (
            Number(curriculumSubject.year_level) !== yearLevel ||
            Number(curriculumSubject.semester_id) !== semesterId
          ) {
            subjectErrors.push({
              code: "REGULAR_SUBJECT_OUTSIDE_CURRENT_TERM",

              message:
                "Regular subject does not belong to the Student's current year level and semester.",
            });
          }
        }
      }

      // ===============================================
      // COMPLETE REGISTRAR PLACEMENT
      // ===============================================

      const offeringId =
        subject.offering_id !== null ? Number(subject.offering_id) : null;

      const sectionId =
        subject.section_id !== null ? Number(subject.section_id) : null;

      const sectionSubjectId =
        subject.section_subject_id !== null
          ? Number(subject.section_subject_id)
          : null;

      if (!offeringId || !sectionId || !sectionSubjectId) {
        subjectErrors.push({
          code: "SUBJECT_PLACEMENT_INCOMPLETE",

          message:
            "Registrar placement is incomplete. Offering, section, and section subject are required before approval.",
        });
      }

      // ===============================================
      // VALIDATE AUTHORITATIVE OFFERING
      // ===============================================

      if (offeringId && sectionId && sectionSubjectId) {
        const [offeringRows] = await connection.execute(
          `
              SELECT
                  so.offering_id,
                  so.subject_id,
                  so.section_id,
                  so.section_subject_id,

                  so.faculty_id,
                  so.room_id,

                  so.academic_year_id,
                  so.semester_id,

                  so.schedule_days,
                  so.schedule_time,

                  so.max_students,

                  so.status
                      AS offering_status,

                  ss.subject_id
                      AS section_subject_subject_id,

                  ss.section_id
                      AS section_subject_section_id,

                  ss.academic_year_id
                      AS section_subject_academic_year_id,

                  ss.semester_id
                      AS section_subject_semester_id,

                  ss.status
                      AS section_subject_status,

                  sec.section_name,

                  sec.course_id
                      AS section_course_id,

                  sec.year_level
                      AS section_year_level,

                  r.capacity
                      AS room_capacity

              FROM subject_offerings so

              INNER JOIN section_subjects ss
                  ON ss.section_subject_id =
                     so.section_subject_id

              INNER JOIN sections sec
                  ON sec.section_id =
                     so.section_id

              LEFT JOIN rooms r
                  ON r.room_id =
                     so.room_id

              WHERE so.offering_id = ?

              LIMIT 1
            `,
          [offeringId],
        );

        if (offeringRows.length === 0) {
          subjectErrors.push({
            code: "OFFERING_NOT_FOUND",

            message: "The assigned offering no longer exists.",
          });
        } else {
          offering = offeringRows[0];

          // ===========================================
          // STORED PLACEMENT MUST MATCH OFFERING
          // ===========================================

          if (
            Number(offering.section_id) !== sectionId ||
            Number(offering.section_subject_id) !== sectionSubjectId
          ) {
            subjectErrors.push({
              code: "PLACEMENT_RELATIONSHIP_MISMATCH",

              message:
                "Stored section placement does not match the assigned offering.",
            });
          }

          // ===========================================
          // SAME SUBJECT
          // ===========================================

          if (Number(offering.subject_id) !== subjectId) {
            subjectErrors.push({
              code: "OFFERING_SUBJECT_MISMATCH",

              message: "The assigned offering belongs to a different subject.",
            });
          }

          // ===========================================
          // SECTION SUBJECT RELATIONSHIP
          // ===========================================

          if (
            Number(offering.section_subject_subject_id) !== subjectId ||
            Number(offering.section_subject_section_id) !== sectionId
          ) {
            subjectErrors.push({
              code: "INVALID_SECTION_SUBJECT_RELATIONSHIP",

              message: "The assigned section-subject relationship is invalid.",
            });
          }

          // ===========================================
          // COURSE
          // ===========================================

          if (Number(offering.section_course_id) !== courseId) {
            subjectErrors.push({
              code: "OFFERING_COURSE_MISMATCH",

              message: "The assigned offering belongs to a different course.",
            });
          }

          // ===========================================
          // ACADEMIC YEAR
          // ===========================================

          if (
            Number(offering.academic_year_id) !== academicYearId ||
            Number(offering.section_subject_academic_year_id) !== academicYearId
          ) {
            subjectErrors.push({
              code: "OFFERING_ACADEMIC_YEAR_MISMATCH",

              message:
                "The assigned offering does not belong to the enrollment academic year.",
            });
          }

          // ===========================================
          // SEMESTER
          // ===========================================

          if (
            Number(offering.semester_id) !== semesterId ||
            Number(offering.section_subject_semester_id) !== semesterId
          ) {
            subjectErrors.push({
              code: "OFFERING_SEMESTER_MISMATCH",

              message:
                "The assigned offering does not belong to the enrollment semester.",
            });
          }

          // ===========================================
          // OPEN STATUS
          // ===========================================

          if (offering.offering_status !== "Open") {
            subjectErrors.push({
              code: "OFFERING_NOT_OPEN",

              message: `Assigned offering is "${offering.offering_status}" instead of Open.`,
            });
          }

          if (offering.section_subject_status !== "Open") {
            subjectErrors.push({
              code: "SECTION_SUBJECT_NOT_OPEN",

              message: `Assigned section subject is "${offering.section_subject_status}" instead of Open.`,
            });
          }

          // ===========================================
          // REGULAR YEAR-LEVEL SECTION
          // ===========================================

          if (
            academicEligibility?.eligible &&
            academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR &&
            Number(offering.section_year_level) !== yearLevel
          ) {
            subjectErrors.push({
              code: "REGULAR_SECTION_YEAR_LEVEL_MISMATCH",

              message:
                "Regular subject is assigned to a section that does not match the Student's current year level.",
            });
          }

          // ===========================================
          // READINESS
          //
          // Room remains optional.
          // ===========================================

          const maxStudents = Number(offering.max_students || 0);

          if (!offering.faculty_id) {
            subjectErrors.push({
              code: "OFFERING_FACULTY_MISSING",

              message: "Assigned offering has no faculty.",
            });
          }

          if (
            !offering.schedule_days ||
            !String(offering.schedule_days).trim()
          ) {
            subjectErrors.push({
              code: "OFFERING_SCHEDULE_DAYS_MISSING",

              message: "Assigned offering has no schedule days.",
            });
          }

          if (
            !offering.schedule_time ||
            !String(offering.schedule_time).trim()
          ) {
            subjectErrors.push({
              code: "OFFERING_SCHEDULE_TIME_MISSING",

              message: "Assigned offering has no schedule time.",
            });
          }

          if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
            subjectErrors.push({
              code: "OFFERING_CAPACITY_INVALID",

              message:
                "Assigned offering does not have a valid positive capacity.",
            });
          }

          // ===========================================
          // ROOM CAPACITY
          // ===========================================

          if (
            maxStudents > 0 &&
            offering.room_capacity !== null &&
            Number(offering.room_capacity) > 0 &&
            maxStudents > Number(offering.room_capacity)
          ) {
            subjectErrors.push({
              code: "OFFERING_EXCEEDS_ROOM_CAPACITY",

              message: "Offering capacity exceeds the assigned room capacity.",
            });
          }

          // ===========================================
          // CURRENT OFFERING OCCUPANCY
          //
          // Current student is included.
          // Therefore invalid only when count > max.
          // ===========================================

          if (maxStudents > 0) {
            const [capacityRows] = await connection.execute(
              `
                  SELECT
                      COUNT(*) AS enrolled_count

                  FROM enrollment_subjects es

                  INNER JOIN enrollments e
                      ON e.enrollment_id =
                         es.enrollment_id

                  WHERE es.offering_id = ?

                    AND es.status IN (
                        'Enrolled',
                        'Completed',
                        'Failed',
                        'Incomplete'
                    )

                    AND e.enrollment_status IN (
                        'Pending',
                        'Approved'
                    )
                `,
              [offeringId],
            );

            const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

            if (enrolledCount > maxStudents) {
              subjectErrors.push({
                code: "OFFERING_OVER_CAPACITY",

                message:
                  "Assigned offering currently exceeds its maximum capacity.",

                max_students: maxStudents,

                enrolled_count: enrolledCount,
              });
            }
          }
        }
      }

      // ===============================================
      // STORE SUBJECT RESULT
      // ===============================================

      const subjectValid = subjectErrors.length === 0;

      validatedSubjects.push({
        enrollment_subject_id: enrollmentSubjectId,

        subject_id: subjectId,

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        status: subject.status,

        valid: subjectValid,

        enrollment_type: academicEligibility?.eligibility_type || null,

        placement: {
          offering_id: offeringId,

          section_id: sectionId,

          section_subject_id: sectionSubjectId,

          section_name: offering?.section_name || null,
        },

        errors: subjectErrors,

        warnings: subjectWarnings,
      });

      // ===============================================
      // ADD SUBJECT ERRORS TO GLOBAL ERRORS
      // ===============================================

      for (const subjectError of subjectErrors) {
        errors.push({
          ...subjectError,

          enrollment_subject_id: enrollmentSubjectId,

          subject_id: subjectId,

          subject_code: subject.subject_code,
        });
      }

      for (const subjectWarning of subjectWarnings) {
        warnings.push({
          ...subjectWarning,

          enrollment_subject_id: enrollmentSubjectId,

          subject_id: subjectId,

          subject_code: subject.subject_code,
        });
      }
    }

    // =================================================
    // 12. TOTAL UNITS
    // =================================================

    const totalUnits = activeSubjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    // =================================================
    // 13. FINAL RESULT
    // =================================================

    const valid = errors.length === 0;

    return res.status(200).json({
      success: true,

      valid,

      can_approve: valid && enrollment.enrollment_status === "Pending",

      enrollment: {
        enrollment_id: enrollmentId,

        student_id: studentId,

        student_number: enrollment.student_number,

        student_name: [
          enrollment.first_name,
          enrollment.middle_name,
          enrollment.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course_id: courseId,

        course_code: enrollment.course_code,

        course_name: enrollment.course_name,

        year_level: yearLevel,

        academic_year_id: academicYearId,

        academic_year: enrollment.academic_year,

        semester_id: semesterId,

        semester_name: enrollment.semester_name,

        enrollment_status: enrollment.enrollment_status,
      },

      curriculum: curriculum
        ? {
            curriculum_id: curriculumId,

            curriculum_name: curriculum.curriculum_name,
          }
        : null,

      summary: {
        total_records: subjectRows.length,

        active_subjects: activeSubjects.length,

        total_units: totalUnits,

        validation_errors: errors.length,

        validation_warnings: warnings.length,
      },

      subjects: validatedSubjects,

      errors,
      warnings,
    });
  } catch (error) {
    console.error("VALIDATE REGISTRAR ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to validate enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// APPROVE ENROLLMENT
//
// POST /api/registrar/enrollments/:id/approve
//
// OPTIONAL BODY:
//
// {
//   "remarks": "Enrollment verified and approved."
// }
//
// IMPORTANT:
//
// - Registrar identity comes ONLY from req.user.
// - Frontend does NOT send approved_by.
// - Enrollment must be Pending.
// - Final validation is repeated INSIDE the transaction.
// - Preview /validate can never replace final validation.
// - Only after all checks pass:
//       Pending -> Approved
//
// Approved enrollment becomes the authoritative source
// of current-semester class membership.
// =====================================================

router.post("/:id/approve", async (req, res) => {
  let connection;
  let transactionActive = false;

  try {
    // =================================================
    // 1. AUTHENTICATED REGISTRAR
    // =================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (req.user.role_name !== "Registrar") {
      return res.status(403).json({
        success: false,
        message: "Registrar access is required.",
      });
    }

    const approvedBy = Number(req.user.user_id);

    if (!Number.isInteger(approvedBy) || approvedBy <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated Registrar user ID is invalid.",
      });
    }

    // =================================================
    // 2. ENROLLMENT ID
    // =================================================

    const enrollmentId = Number(req.params.id);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    // =================================================
    // 3. OPTIONAL REMARKS
    // =================================================

    let approvalRemarks = null;

    if (typeof req.body?.remarks === "string") {
      const trimmed = req.body.remarks.trim();

      if (trimmed.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Approval remarks must not exceed 255 characters.",
        });
      }

      if (trimmed) {
        approvalRemarks = trimmed;
      }
    }

    // =================================================
    // 4. TRANSACTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    // =================================================
    // 5. LOCK ENROLLMENT + STUDENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
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

              e.created_at,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              s.course_id,
              s.year_level,

              c.course_code,
              c.course_name,

              ay.academic_year,
              sem.semester_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          INNER JOIN courses c
              ON c.course_id =
                 s.course_id

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          WHERE e.enrollment_id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [enrollmentId],
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
    // 6. MUST STILL BE PENDING
    // =================================================

    if (enrollment.enrollment_status !== "Pending") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "ENROLLMENT_NOT_PENDING",

        message: `Enrollment cannot be approved because its current status is "${enrollment.enrollment_status}".`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    const studentId = Number(enrollment.student_id);

    const courseId = Number(enrollment.course_id);

    const yearLevel = Number(enrollment.year_level);

    const academicYearId = Number(enrollment.academic_year_id);

    const semesterId = Number(enrollment.semester_id);

    // =================================================
    // 7. VALID ACTIVE CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
          SELECT
              sc.student_curriculum_id,
              sc.curriculum_id,

              cur.curriculum_name,
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
      [studentId, courseId],
    );

    if (curriculumRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "VALID_ACTIVE_CURRICULUM_REQUIRED",

        message:
          "Enrollment cannot be approved because the Student does not have a valid active curriculum.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 8. LOCK ALL ENROLLMENT SUBJECTS
    // =================================================

    const [allSubjectRows] = await connection.execute(
      `
          SELECT
              es.enrollment_subject_id,
              es.enrollment_id,

              es.subject_id,

              es.offering_id,
              es.section_id,
              es.section_subject_id,

              es.status,

              sub.subject_code,
              sub.subject_name,
              sub.units,
              sub.is_active
                  AS subject_is_active

          FROM enrollment_subjects es

          INNER JOIN subjects sub
              ON sub.subject_id =
                 es.subject_id

          WHERE es.enrollment_id = ?

          ORDER BY
              es.enrollment_subject_id ASC

          FOR UPDATE
        `,
      [enrollmentId],
    );

    // =================================================
    // 9. ACTIVE SUBJECTS
    // =================================================

    const subjectRows = allSubjectRows.filter(
      (subject) => !["Dropped", "Withdrawn"].includes(String(subject.status)),
    );

    if (subjectRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "NO_ACTIVE_SUBJECTS",

        message:
          "Enrollment cannot be approved because it has no active subjects.",
      });
    }

    // =================================================
    // 10. VALIDATION ERRORS
    // =================================================

    const validationErrors = [];

    // =================================================
    // 11. DUPLICATE ACTIVE SUBJECTS
    // =================================================

    const subjectCounts = new Map();

    for (const subject of subjectRows) {
      const subjectId = Number(subject.subject_id);

      subjectCounts.set(subjectId, (subjectCounts.get(subjectId) || 0) + 1);
    }

    for (const [subjectId, count] of subjectCounts.entries()) {
      if (count > 1) {
        const duplicate = subjectRows.find(
          (subject) => Number(subject.subject_id) === subjectId,
        );

        validationErrors.push({
          code: "DUPLICATE_ACTIVE_SUBJECT",

          message: `Subject "${duplicate?.subject_code || subjectId}" appears more than once in the active enrollment.`,

          subject_id: subjectId,

          count,
        });
      }
    }

    // =================================================
    // 12. VALIDATE EACH SUBJECT
    // =================================================

    for (const subject of subjectRows) {
      const enrollmentSubjectId = Number(subject.enrollment_subject_id);

      const subjectId = Number(subject.subject_id);

      const addError = (code, message, extra = {}) => {
        validationErrors.push({
          code,
          message,

          enrollment_subject_id: enrollmentSubjectId,

          subject_id: subjectId,

          subject_code: subject.subject_code,

          ...extra,
        });
      };

      // ===============================================
      // SUBJECT MUST STILL BE ENROLLED
      // ===============================================

      if (subject.status !== "Enrolled") {
        addError(
          "INVALID_PRE_APPROVAL_SUBJECT_STATUS",
          `Subject status must be "Enrolled" before enrollment approval. Current status is "${subject.status}".`,
        );
      }

      // ===============================================
      // SUBJECT MASTER MUST BE ACTIVE
      // ===============================================

      if (Number(subject.subject_is_active) !== 1) {
        addError("SUBJECT_INACTIVE", "Subject is inactive.");
      }

      // ===============================================
      // CURRICULUM MEMBERSHIP
      // ===============================================

      const [curriculumSubjectRows] = await connection.execute(
        `
            SELECT
                curriculum_subject_id,
                curriculum_id,
                subject_id,
                year_level,
                semester_id,
                is_required,
                display_order

            FROM curriculum_subjects

            WHERE curriculum_id = ?

              AND subject_id = ?

            LIMIT 1
          `,
        [curriculumId, subjectId],
      );

      if (curriculumSubjectRows.length === 0) {
        addError(
          "SUBJECT_NOT_IN_ASSIGNED_CURRICULUM",
          "Subject does not belong to the Student's active curriculum.",
        );

        continue;
      }

      const curriculumSubject = curriculumSubjectRows[0];

      // ===============================================
      // FINAL GRADE V2 ACADEMIC CHECK
      // ===============================================

      const academicEligibility = await evaluateSubjectEligibility(
        studentId,
        subjectId,
        connection,
      );

      if (!academicEligibility.eligible) {
        let code = "SUBJECT_NOT_ACADEMICALLY_ELIGIBLE";

        if (
          academicEligibility.eligibility_type ===
          ELIGIBILITY_TYPE.ALREADY_PASSED
        ) {
          code = "SUBJECT_ALREADY_PASSED";
        } else if (
          academicEligibility.eligibility_type ===
          ELIGIBILITY_TYPE.BLOCKED_PREREQUISITE
        ) {
          code = "PREREQUISITE_NOT_PASSED";
        } else if (
          academicEligibility.eligibility_type === ELIGIBILITY_TYPE.UNRESOLVED
        ) {
          code = "ACADEMIC_RESULT_UNRESOLVED";
        }

        addError(
          code,

          academicEligibility.reason ||
            "Student is no longer academically eligible for this subject.",

          {
            eligibility_type: academicEligibility.eligibility_type,

            latest_approved_grade: academicEligibility.latest_approved_grade,

            prerequisites: academicEligibility.prerequisites,
          },
        );
      }

      // ===============================================
      // REGULAR SUBJECT CURRENT TERM
      // ===============================================

      if (
        academicEligibility.eligible &&
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR
      ) {
        if (
          Number(curriculumSubject.year_level) !== yearLevel ||
          Number(curriculumSubject.semester_id) !== semesterId
        ) {
          addError(
            "REGULAR_SUBJECT_OUTSIDE_CURRENT_TERM",
            "Regular subject does not belong to the Student's current curriculum year and semester.",
          );
        }
      }

      // ===============================================
      // COMPLETE PLACEMENT
      // ===============================================

      const offeringId =
        subject.offering_id !== null ? Number(subject.offering_id) : null;

      const sectionId =
        subject.section_id !== null ? Number(subject.section_id) : null;

      const sectionSubjectId =
        subject.section_subject_id !== null
          ? Number(subject.section_subject_id)
          : null;

      if (!offeringId) {
        addError(
          "OFFERING_NOT_ASSIGNED",
          "Subject does not have an offering assignment.",
        );
      }

      if (!sectionId) {
        addError(
          "SECTION_NOT_ASSIGNED",
          "Subject does not have a section assignment.",
        );
      }

      if (!sectionSubjectId) {
        addError(
          "SECTION_SUBJECT_NOT_ASSIGNED",
          "Subject does not have a section-subject assignment.",
        );
      }

      if (!offeringId || !sectionId || !sectionSubjectId) {
        continue;
      }

      // ===============================================
      // AUTHORITATIVE OFFERING
      // ===============================================

      const [offeringRows] = await connection.execute(
        `
            SELECT
                so.offering_id,
                so.subject_id,
                so.section_id,
                so.section_subject_id,

                so.faculty_id,
                so.room_id,

                so.academic_year_id,
                so.semester_id,

                so.schedule_days,
                so.schedule_time,

                so.max_students,

                so.status
                    AS offering_status,

                ss.subject_id
                    AS section_subject_subject_id,

                ss.section_id
                    AS section_subject_section_id,

                ss.academic_year_id
                    AS section_subject_academic_year_id,

                ss.semester_id
                    AS section_subject_semester_id,

                ss.status
                    AS section_subject_status,

                sec.section_name,

                sec.course_id
                    AS section_course_id,

                sec.year_level
                    AS section_year_level,

                r.capacity
                    AS room_capacity

            FROM subject_offerings so

            INNER JOIN section_subjects ss
                ON ss.section_subject_id =
                   so.section_subject_id

            INNER JOIN sections sec
                ON sec.section_id =
                   so.section_id

            LEFT JOIN rooms r
                ON r.room_id =
                   so.room_id

            WHERE so.offering_id = ?

            LIMIT 1

            FOR UPDATE
          `,
        [offeringId],
      );

      if (offeringRows.length === 0) {
        addError("OFFERING_NOT_FOUND", "Assigned offering no longer exists.");

        continue;
      }

      const offering = offeringRows[0];

      // ===============================================
      // STORED PLACEMENT MUST MATCH OFFERING
      // ===============================================

      if (Number(offering.section_id) !== sectionId) {
        addError(
          "OFFERING_SECTION_MISMATCH",
          "Assigned offering belongs to a different section.",
        );
      }

      if (Number(offering.section_subject_id) !== sectionSubjectId) {
        addError(
          "OFFERING_SECTION_SUBJECT_MISMATCH",
          "Assigned offering belongs to a different section-subject record.",
        );
      }

      // ===============================================
      // SAME SUBJECT
      // ===============================================

      if (Number(offering.subject_id) !== subjectId) {
        addError(
          "OFFERING_SUBJECT_MISMATCH",
          "Assigned offering belongs to a different subject.",
        );
      }

      // ===============================================
      // SECTION SUBJECT INTEGRITY
      // ===============================================

      if (Number(offering.section_subject_subject_id) !== subjectId) {
        addError(
          "SECTION_SUBJECT_WRONG_SUBJECT",
          "Assigned section-subject belongs to a different subject.",
        );
      }

      if (Number(offering.section_subject_section_id) !== sectionId) {
        addError(
          "SECTION_SUBJECT_WRONG_SECTION",
          "Assigned section-subject belongs to a different section.",
        );
      }

      // ===============================================
      // COURSE
      // ===============================================

      if (Number(offering.section_course_id) !== courseId) {
        addError(
          "SECTION_COURSE_MISMATCH",
          "Assigned section does not belong to the Student's course.",
        );
      }

      // ===============================================
      // ACADEMIC YEAR
      // ===============================================

      if (
        Number(offering.academic_year_id) !== academicYearId ||
        Number(offering.section_subject_academic_year_id) !== academicYearId
      ) {
        addError(
          "OFFERING_ACADEMIC_YEAR_MISMATCH",
          "Assigned offering/section-subject belongs to a different academic year.",
        );
      }

      // ===============================================
      // SEMESTER
      // ===============================================

      if (
        Number(offering.semester_id) !== semesterId ||
        Number(offering.section_subject_semester_id) !== semesterId
      ) {
        addError(
          "OFFERING_SEMESTER_MISMATCH",
          "Assigned offering/section-subject belongs to a different semester.",
        );
      }

      // ===============================================
      // OPEN STATUS
      // ===============================================

      if (offering.offering_status !== "Open") {
        addError(
          "OFFERING_NOT_OPEN",
          `Offering status is "${offering.offering_status}".`,
        );
      }

      if (offering.section_subject_status !== "Open") {
        addError(
          "SECTION_SUBJECT_NOT_OPEN",
          `Section-subject status is "${offering.section_subject_status}".`,
        );
      }

      // ===============================================
      // REGULAR -> SAME YEAR LEVEL SECTION
      // ===============================================

      if (
        academicEligibility.eligible &&
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR &&
        Number(offering.section_year_level) !== yearLevel
      ) {
        addError(
          "REGULAR_SECTION_YEAR_LEVEL_MISMATCH",
          "Regular subject is assigned to a section that does not match the Student's current year level.",
        );
      }

      // ===============================================
      // READINESS
      //
      // Room remains optional.
      // ===============================================

      const maxStudents = Number(offering.max_students || 0);

      const missingConfiguration = [];

      if (!offering.faculty_id) {
        missingConfiguration.push("faculty");
      }

      if (!offering.schedule_days || !String(offering.schedule_days).trim()) {
        missingConfiguration.push("schedule_days");
      }

      if (!offering.schedule_time || !String(offering.schedule_time).trim()) {
        missingConfiguration.push("schedule_time");
      }

      if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
        missingConfiguration.push("capacity");
      }

      if (missingConfiguration.length > 0) {
        addError(
          "OFFERING_NOT_READY",
          "Assigned offering is not completely configured.",
          {
            missing_configuration: missingConfiguration,
          },
        );
      }

      // ===============================================
      // ROOM CAPACITY
      //
      // Only applies when room exists.
      // ===============================================

      if (
        offering.room_capacity !== null &&
        Number(offering.room_capacity) > 0 &&
        maxStudents > Number(offering.room_capacity)
      ) {
        addError(
          "OFFERING_EXCEEDS_ROOM_CAPACITY",
          "Offering capacity exceeds the assigned room capacity.",
        );
      }

      // ===============================================
      // CAPACITY
      //
      // This Pending Student is ALREADY included.
      //
      // enrolled_count == max → still valid
      // enrolled_count > max  → invalid
      // ===============================================

      if (maxStudents > 0) {
        const [capacityRows] = await connection.execute(
          `
              SELECT
                  COUNT(*) AS enrolled_count

              FROM enrollment_subjects es

              INNER JOIN enrollments e
                  ON e.enrollment_id =
                     es.enrollment_id

              WHERE es.offering_id = ?

                AND es.status IN (
                    'Enrolled',
                    'Completed',
                    'Failed',
                    'Incomplete'
                )

                AND e.enrollment_status IN (
                    'Pending',
                    'Approved'
                )
            `,
          [offeringId],
        );

        const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

        if (enrolledCount > maxStudents) {
          addError(
            "OFFERING_OVER_CAPACITY",
            "Offering currently exceeds its maximum student capacity.",
            {
              max_students: maxStudents,

              enrolled_count: enrolledCount,
            },
          );
        }
      }
    }

    // =================================================
    // 13. BLOCK IF ANY FINAL VALIDATION FAILED
    // =================================================

    if (validationErrors.length > 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "ENROLLMENT_APPROVAL_VALIDATION_FAILED",

        message: "Enrollment failed final approval validation.",

        can_approve: false,

        validation_errors: validationErrors,
      });
    }

    // =================================================
    // 14. TOTAL UNITS
    // =================================================

    const totalUnits = subjectRows.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    // =================================================
    // 15. OLD AUDIT VALUES
    // =================================================

    const oldValues = {
      enrollment_status: enrollment.enrollment_status,

      remarks: enrollment.remarks || null,

      approved_by:
        enrollment.approved_by !== null ? Number(enrollment.approved_by) : null,

      approved_at: enrollment.approved_at || null,
    };

    // =================================================
    // 16. APPROVE
    //
    // IMPORTANT:
    // approved_by comes ONLY from JWT.
    // =================================================

    const [updateResult] = await connection.execute(
      `
          UPDATE enrollments

          SET
              enrollment_status =
                  'Approved',

              approved_by = ?,

              approved_at =
                  CURRENT_TIMESTAMP,

              remarks =
                  COALESCE(
                    ?,
                    remarks
                  )

          WHERE enrollment_id = ?

            AND enrollment_status =
                'Pending'
        `,
      [approvedBy, approvalRemarks, enrollmentId],
    );

    // =================================================
    // 17. CONCURRENCY PROTECTION
    // =================================================

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message:
          "Enrollment could not be approved because its status changed before approval.",
      });
    }

    // =================================================
    // 18. GET APPROVED RECORD
    // =================================================

    const [approvedRows] = await connection.execute(
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

          WHERE enrollment_id = ?

          LIMIT 1
        `,
      [enrollmentId],
    );

    const approvedEnrollment = approvedRows[0];

    // =================================================
    // 19. NEW AUDIT VALUES
    // =================================================

    const newValues = {
      enrollment_status: approvedEnrollment.enrollment_status,

      remarks: approvedEnrollment.remarks || null,

      approved_by:
        approvedEnrollment.approved_by !== null
          ? Number(approvedEnrollment.approved_by)
          : null,

      approved_at: approvedEnrollment.approved_at || null,
    };

    // =================================================
    // 20. AUDIT TRAIL
    // =================================================

    await connection.execute(
      `
        INSERT INTO audit_trail (
            user_id,
            table_name,
            record_id,
            action,
            old_values,
            new_values
        )

        VALUES (
            ?,
            'enrollments',
            ?,
            'UPDATE',
            ?,
            ?
        )
      `,
      [
        approvedBy,
        enrollmentId,

        JSON.stringify(oldValues),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // 21. COMMIT
    // =================================================

    await connection.commit();

    transactionActive = false;

    // =================================================
    // 22. SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Enrollment approved successfully.",

      enrollment: {
        enrollment_id: enrollmentId,

        student_id: studentId,

        student_number: enrollment.student_number,

        student_name: [
          enrollment.first_name,
          enrollment.middle_name,
          enrollment.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course_id: courseId,

        course_code: enrollment.course_code,

        course_name: enrollment.course_name,

        year_level: yearLevel,

        academic_year_id: academicYearId,

        academic_year: enrollment.academic_year,

        semester_id: semesterId,

        semester_name: enrollment.semester_name,

        enrollment_status: "Approved",

        remarks: approvedEnrollment.remarks || null,

        approved_by: {
          user_id: approvedBy,

          username: req.user.username || null,
        },

        approved_at: approvedEnrollment.approved_at,

        created_at: approvedEnrollment.created_at,
      },

      summary: {
        total_subjects: subjectRows.length,

        total_units: totalUnits,
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("APPROVE ENROLLMENT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("APPROVE ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to approve enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// ROUTE 15
// REJECT ENROLLMENT
//
// POST
// /api/registrar/enrollments/:id/reject
//
// Body:
// {
//   "remarks": "Incomplete enrollment requirements."
// }
//
// Rules:
// - Only Pending enrollment can be rejected
// - Rejection reason is required
// - Registrar comes ONLY from req.user
// - Frontend does NOT send rejected_by
// - approved_by / approved_at are cleared
// - Rejection actor/time is preserved in audit_trail
//
// Enrollment remains in the database.
// Subjects are NOT deleted.
// =====================================================

router.post("/:id/reject", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // ENROLLMENT ID
  // =================================================

  const enrollmentId = toPositiveInt(req.params.id);

  if (!enrollmentId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment ID.",
    });
  }

  // =================================================
  // REJECTION REASON
  // =================================================

  const rejectionReason =
    typeof req.body?.remarks === "string" ? req.body.remarks.trim() : "";

  if (!rejectionReason) {
    return res.status(400).json({
      success: false,
      message: "Rejection reason is required.",
    });
  }

  // Optional safety limit because remarks
  // column is VARCHAR(255).
  if (rejectionReason.length > 255) {
    return res.status(400).json({
      success: false,
      message: "Rejection reason must not exceed 255 characters.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // START TRANSACTION
    // =================================================

    await connection.beginTransaction();

    // =================================================
    // GET + LOCK ENROLLMENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
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

              e.created_at,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              s.course_id,
              s.year_level,

              c.course_code,
              c.course_name,

              ay.academic_year,
              sem.semester_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN courses c
              ON c.course_id =
                 s.course_id

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          WHERE e.enrollment_id = ?

          LIMIT 1

          FOR UPDATE
          `,
      [enrollmentId],
    );

    // =================================================
    // NOT FOUND
    // =================================================

    if (enrollmentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // ONLY PENDING CAN BE REJECTED
    // =================================================

    if (enrollment.enrollment_status !== "Pending") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Enrollment cannot be rejected because its current status is '${enrollment.enrollment_status}'.`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // COUNT SUBJECTS
    //
    // Rejection does NOT modify subjects.
    // =================================================

    const [subjectCountRows] = await connection.execute(
      `
          SELECT
              COUNT(*) AS total_subjects,

              SUM(
                CASE
                  WHEN status = 'Enrolled'
                  THEN 1
                  ELSE 0
                END
              ) AS active_subjects,

              SUM(
                CASE
                  WHEN status = 'Dropped'
                  THEN 1
                  ELSE 0
                END
              ) AS dropped_subjects

          FROM enrollment_subjects

          WHERE enrollment_id = ?
          `,
      [enrollmentId],
    );

    const totalSubjects = Number(subjectCountRows[0]?.total_subjects || 0);

    const activeSubjects = Number(subjectCountRows[0]?.active_subjects || 0);

    const droppedSubjects = Number(subjectCountRows[0]?.dropped_subjects || 0);

    // =================================================
    // OLD VALUES FOR AUDIT
    // =================================================

    const oldValues = {
      enrollment_status: enrollment.enrollment_status,

      remarks: enrollment.remarks || null,

      approved_by: enrollment.approved_by
        ? Number(enrollment.approved_by)
        : null,

      approved_at: enrollment.approved_at || null,
    };

    // =================================================
    // REJECT
    //
    // IMPORTANT:
    // We intentionally clear approval metadata.
    //
    // Rejection actor is stored in audit_trail,
    // not in approved_by.
    // =================================================

    const [updateResult] = await connection.execute(
      `
          UPDATE enrollments

          SET
              enrollment_status =
                  'Rejected',

              remarks = ?,

              approved_by = NULL,

              approved_at = NULL

          WHERE enrollment_id = ?

            AND enrollment_status =
                'Pending'
          `,
      [rejectionReason, enrollmentId],
    );

    // =================================================
    // CONCURRENCY SAFETY
    // =================================================

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Enrollment could not be rejected because its status changed before rejection.",
      });
    }

    // =================================================
    // NEW VALUES
    // =================================================

    const newValues = {
      enrollment_status: "Rejected",

      remarks: rejectionReason,

      approved_by: null,

      approved_at: null,

      rejected_by: actor.user_id,
    };

    // =================================================
    // AUDIT TRAIL
    //
    // audit_trail.created_at records rejection time.
    // =================================================

    await connection.execute(
      `
        INSERT INTO audit_trail (
            user_id,
            table_name,
            record_id,
            action,
            old_values,
            new_values
        )

        VALUES (
            ?,
            'enrollments',
            ?,
            'UPDATE',
            ?,
            ?
        )
        `,
      [
        actor.user_id,

        enrollmentId,

        JSON.stringify(oldValues),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // GET FINAL ENROLLMENT
    // =================================================

    const [rejectedRows] = await connection.execute(
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

          WHERE enrollment_id = ?

          LIMIT 1
          `,
      [enrollmentId],
    );

    const rejectedEnrollment = rejectedRows[0];

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Enrollment rejected successfully.",

      enrollment: {
        enrollment_id: Number(rejectedEnrollment.enrollment_id),

        student: {
          student_id: Number(enrollment.student_id),

          student_number: enrollment.student_number,

          student_name: [
            enrollment.first_name,
            enrollment.middle_name,
            enrollment.last_name,
          ]
            .filter(Boolean)
            .join(" "),

          year_level:
            enrollment.year_level !== null &&
            enrollment.year_level !== undefined
              ? Number(enrollment.year_level)
              : null,
        },

        course: {
          course_id: enrollment.course_id ? Number(enrollment.course_id) : null,

          course_code: enrollment.course_code || null,

          course_name: enrollment.course_name || null,
        },

        academic_period: {
          academic_year_id: Number(enrollment.academic_year_id),

          academic_year: enrollment.academic_year,

          semester_id: Number(enrollment.semester_id),

          semester_name: enrollment.semester_name,
        },

        enrollment_status: rejectedEnrollment.enrollment_status,

        rejection_reason: rejectedEnrollment.remarks,

        rejected_by: {
          user_id: actor.user_id,

          username: actor.username,
        },

        approval: {
          approved_by: null,
          approved_at: null,
        },

        created_at: rejectedEnrollment.created_at,
      },

      subjects: {
        total: totalSubjects,

        active: activeSubjects,

        dropped: droppedSubjects,
      },

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("REJECT ENROLLMENT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("REJECT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to reject enrollment.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// ROUTE 16
// GET COMPLETE ENROLLMENT HISTORY / TIMELINE
//
// GET
// /api/registrar/enrollments/:id/history
//
// Purpose:
// - Read-only enrollment lifecycle history
// - Enrollment creation
// - Pending / Approved / Rejected updates from audit trail
// - Subject ADD / DROP / REMOVE / CHANGE
// - Old and new offering / section information
//
// Does NOT modify anything.
// =====================================================

router.get("/:id/history", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // ENROLLMENT ID
  // =================================================

  const enrollmentId = toPositiveInt(req.params.id);

  if (!enrollmentId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // GET ENROLLMENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
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

              e.created_at,

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              s.course_id,
              s.year_level,

              c.course_code,
              c.course_name,

              ay.academic_year,
              sem.semester_name,

              approver.username
                  AS approved_by_username

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN courses c
              ON c.course_id =
                 s.course_id

          INNER JOIN academic_years ay
              ON ay.academic_year_id =
                 e.academic_year_id

          INNER JOIN semesters sem
              ON sem.semester_id =
                 e.semester_id

          LEFT JOIN users approver
              ON approver.user_id =
                 e.approved_by

          WHERE e.enrollment_id = ?

          LIMIT 1
          `,
      [enrollmentId],
    );

    // =================================================
    // NOT FOUND
    // =================================================

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // SUBJECT CHANGE HISTORY
    // =================================================

    const [subjectChangeRows] = await connection.execute(
      `
          SELECT
              esc.change_id,

              esc.enrollment_id,
              esc.enrollment_subject_id,
              esc.subject_id,

              esc.change_type,

              esc.old_offering_id,
              esc.old_section_id,
              esc.old_section_subject_id,

              esc.new_offering_id,
              esc.new_section_id,
              esc.new_section_subject_id,

              esc.reason,

              esc.changed_by,

              changer.username
                  AS changed_by_username,

              sub.subject_code,
              sub.subject_name,
              sub.units,

              old_sec.section_name
                  AS old_section_name,

              new_sec.section_name
                  AS new_section_name,

              old_off.schedule_days
                  AS old_schedule_days,

              old_off.schedule_time
                  AS old_schedule_time,

              new_off.schedule_days
                  AS new_schedule_days,

              new_off.schedule_time
                  AS new_schedule_time,

              old_off.status
                  AS old_offering_status,

              new_off.status
                  AS new_offering_status,

              esc.created_at

          FROM enrollment_subject_changes esc

          LEFT JOIN users changer
              ON changer.user_id =
                 esc.changed_by

          LEFT JOIN subjects sub
              ON sub.subject_id =
                 esc.subject_id

          LEFT JOIN sections old_sec
              ON old_sec.section_id =
                 esc.old_section_id

          LEFT JOIN sections new_sec
              ON new_sec.section_id =
                 esc.new_section_id

          LEFT JOIN subject_offerings old_off
              ON old_off.offering_id =
                 esc.old_offering_id

          LEFT JOIN subject_offerings new_off
              ON new_off.offering_id =
                 esc.new_offering_id

          WHERE esc.enrollment_id = ?

          ORDER BY
              esc.created_at ASC,
              esc.change_id ASC
          `,
      [enrollmentId],
    );

    // =================================================
    // ENROLLMENT AUDIT HISTORY
    //
    // We only read audit records for the enrollment
    // itself here.
    //
    // Subject changes are already represented through
    // enrollment_subject_changes, avoiding duplicate
    // timeline events.
    // =================================================

    const [enrollmentAuditRows] = await connection.execute(
      `
          SELECT
              at.user_id,

              at.table_name,
              at.record_id,

              at.action,

              at.old_values,
              at.new_values,

              at.created_at,

              u.username
                  AS actor_username

          FROM audit_trail at

          LEFT JOIN users u
              ON u.user_id =
                 at.user_id

          WHERE at.table_name =
                'enrollments'

            AND at.record_id = ?

          ORDER BY
              at.created_at ASC
          `,
      [enrollmentId],
    );

    // =================================================
    // SAFE JSON PARSER
    //
    // mysql2 may return JSON columns as:
    // - object
    // - string
    // - Buffer
    // - null
    // =================================================

    const parseAuditJson = (value) => {
      if (value === null || value === undefined) {
        return null;
      }

      if (typeof value === "object") {
        if (Buffer.isBuffer(value)) {
          try {
            return JSON.parse(value.toString("utf8"));
          } catch {
            return value.toString("utf8");
          }
        }

        return value;
      }

      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }

      return value;
    };

    // =================================================
    // TIMELINE
    // =================================================

    const timeline = [];

    // =================================================
    // ENROLLMENT CREATED EVENT
    //
    // enrollments.created_at is authoritative for
    // creation even if older records do not have an
    // audit INSERT entry.
    // =================================================

    timeline.push({
      event_type: "ENROLLMENT_CREATED",

      category: "ENROLLMENT",

      title: "Enrollment created",

      description: `Enrollment record created with status '${enrollment.enrollment_status === "Draft" ? "Draft" : "Initial"}'.`,

      enrollment_id: enrollmentId,

      subject: null,

      old: null,

      new: {
        enrollment_id: enrollmentId,

        student_id: Number(enrollment.student_id),

        academic_year_id: Number(enrollment.academic_year_id),

        semester_id: Number(enrollment.semester_id),
      },

      reason: null,

      actor: {
        user_id: null,
        username: null,
      },

      created_at: enrollment.created_at,
    });

    // =================================================
    // ENROLLMENT AUDIT EVENTS
    // =================================================

    for (const audit of enrollmentAuditRows) {
      const oldValues = parseAuditJson(audit.old_values);

      const newValues = parseAuditJson(audit.new_values);

      const oldStatus =
        oldValues && typeof oldValues === "object"
          ? oldValues.enrollment_status || null
          : null;

      const newStatus =
        newValues && typeof newValues === "object"
          ? newValues.enrollment_status || null
          : null;

      let eventType = "ENROLLMENT_UPDATE";

      let title = "Enrollment updated";

      let description = "Enrollment information was updated.";

      // ===============================================
      // STATUS CHANGE
      // ===============================================

      if (oldStatus && newStatus && oldStatus !== newStatus) {
        eventType = "ENROLLMENT_STATUS_CHANGE";

        title = `${oldStatus} → ${newStatus}`;

        description = `Enrollment status changed from '${oldStatus}' to '${newStatus}'.`;
      }

      // ===============================================
      // APPROVED
      // ===============================================

      if (newStatus === "Approved") {
        eventType = "ENROLLMENT_APPROVED";

        title = "Enrollment approved";

        description = "Enrollment was approved by the Registrar.";
      }

      // ===============================================
      // REJECTED
      // ===============================================

      if (newStatus === "Rejected") {
        eventType = "ENROLLMENT_REJECTED";

        title = "Enrollment rejected";

        description = newValues?.remarks
          ? `Enrollment was rejected: ${newValues.remarks}`
          : "Enrollment was rejected by the Registrar.";
      }

      timeline.push({
        event_type: eventType,

        category: "ENROLLMENT",

        title,

        description,

        enrollment_id: enrollmentId,

        subject: null,

        action: audit.action,

        old: oldValues,

        new: newValues,

        reason:
          newValues && typeof newValues === "object"
            ? newValues.remarks || null
            : null,

        actor: {
          user_id: audit.user_id ? Number(audit.user_id) : null,

          username: audit.actor_username || null,
        },

        created_at: audit.created_at,
      });
    }

    // =================================================
    // SUBJECT CHANGE EVENTS
    // =================================================

    for (const change of subjectChangeRows) {
      let title = "Subject changed";

      let description = "Enrollment subject was changed.";

      // ===============================================
      // ADD
      // ===============================================

      if (change.change_type === "ADD") {
        title = "Subject added";

        description = `${change.subject_code || "Subject"} was added to the enrollment.`;
      }

      // ===============================================
      // DROP
      // ===============================================

      if (change.change_type === "DROP") {
        title = "Subject dropped";

        description = `${change.subject_code || "Subject"} was dropped from the enrollment.`;
      }

      // ===============================================
      // REMOVE
      // ===============================================

      if (change.change_type === "REMOVE") {
        title = "Subject removed";

        description = `${change.subject_code || "Subject"} was removed from the enrollment.`;
      }

      // ===============================================
      // CHANGE
      // ===============================================

      if (change.change_type === "CHANGE") {
        title = "Subject assignment changed";

        description = `${change.subject_code || "Subject"} section/offering assignment was changed.`;
      }

      timeline.push({
        event_type: `SUBJECT_${change.change_type}`,

        category: "SUBJECT",

        title,

        description,

        change_id: Number(change.change_id),

        enrollment_id: enrollmentId,

        enrollment_subject_id: change.enrollment_subject_id
          ? Number(change.enrollment_subject_id)
          : null,

        subject: {
          subject_id: change.subject_id ? Number(change.subject_id) : null,

          subject_code: change.subject_code || null,

          subject_name: change.subject_name || null,

          units:
            change.units !== null && change.units !== undefined
              ? Number(change.units)
              : null,
        },

        change_type: change.change_type,

        old: {
          offering_id: change.old_offering_id
            ? Number(change.old_offering_id)
            : null,

          section_id: change.old_section_id
            ? Number(change.old_section_id)
            : null,

          section_name: change.old_section_name || null,

          section_subject_id: change.old_section_subject_id
            ? Number(change.old_section_subject_id)
            : null,

          schedule_days: change.old_schedule_days || null,

          schedule_time: change.old_schedule_time || null,

          offering_status: change.old_offering_status || null,
        },

        new: {
          offering_id: change.new_offering_id
            ? Number(change.new_offering_id)
            : null,

          section_id: change.new_section_id
            ? Number(change.new_section_id)
            : null,

          section_name: change.new_section_name || null,

          section_subject_id: change.new_section_subject_id
            ? Number(change.new_section_subject_id)
            : null,

          schedule_days: change.new_schedule_days || null,

          schedule_time: change.new_schedule_time || null,

          offering_status: change.new_offering_status || null,
        },

        reason: change.reason || null,

        actor: {
          user_id: change.changed_by ? Number(change.changed_by) : null,

          username: change.changed_by_username || null,
        },

        created_at: change.created_at,
      });
    }

    // =================================================
    // SORT COMPLETE TIMELINE
    //
    // Newest event first.
    // =================================================

    timeline.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;

      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

      return bTime - aTime;
    });

    // =================================================
    // SUMMARY COUNTS
    // =================================================

    const subjectChangeCounts = {
      ADD: 0,
      DROP: 0,
      REMOVE: 0,
      CHANGE: 0,
    };

    for (const change of subjectChangeRows) {
      if (
        Object.prototype.hasOwnProperty.call(
          subjectChangeCounts,
          change.change_type,
        )
      ) {
        subjectChangeCounts[change.change_type] += 1;
      }
    }

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      enrollment: {
        enrollment_id: Number(enrollment.enrollment_id),

        student: {
          student_id: Number(enrollment.student_id),

          student_number: enrollment.student_number,

          student_name: [
            enrollment.first_name,
            enrollment.middle_name,
            enrollment.last_name,
          ]
            .filter(Boolean)
            .join(" "),

          year_level:
            enrollment.year_level !== null &&
            enrollment.year_level !== undefined
              ? Number(enrollment.year_level)
              : null,
        },

        course: {
          course_id: enrollment.course_id ? Number(enrollment.course_id) : null,

          course_code: enrollment.course_code || null,

          course_name: enrollment.course_name || null,
        },

        academic_period: {
          academic_year_id: Number(enrollment.academic_year_id),

          academic_year: enrollment.academic_year,

          semester_id: Number(enrollment.semester_id),

          semester_name: enrollment.semester_name,
        },

        enrollment_status: enrollment.enrollment_status,

        remarks: enrollment.remarks || null,

        approval: {
          approved_by: enrollment.approved_by
            ? Number(enrollment.approved_by)
            : null,

          approved_by_username: enrollment.approved_by_username || null,

          approved_at: enrollment.approved_at || null,
        },

        created_at: enrollment.created_at,
      },

      summary: {
        total_events: timeline.length,

        enrollment_audit_events: enrollmentAuditRows.length,

        subject_change_events: subjectChangeRows.length,

        subject_changes: {
          added: subjectChangeCounts.ADD,

          dropped: subjectChangeCounts.DROP,

          removed: subjectChangeCounts.REMOVE,

          changed: subjectChangeCounts.CHANGE,
        },
      },

      timeline,

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET ENROLLMENT HISTORY ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch enrollment history.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// =====================================================
// ROUTE 17
// ATOMICALLY REPLACE AN ENROLLMENT SUBJECT
//
// PUT
// /api/registrar/enrollments/:id/subjects/:enrollmentSubjectId/replace
//
// BODY:
//
// {
//   "offering_id": 25,
//   "reason": "Incorrect subject was assigned."
// }
//
// PURPOSE:
//
// Replace one subject with a DIFFERENT subject.
//
// IMPORTANT:
//
// - Registrar actor comes from req.user.
// - Frontend sends offering_id only.
// - Backend derives subject / section / section_subject.
// - Pending and Approved enrollments are supported.
// - Any Grade V2 row on the OLD subject blocks replacement.
// - Replacement subject must be academically eligible.
// - Regular subject must belong to the student's current term.
// - Valid Retake may come from an earlier curriculum term.
// - Old subject is NOT deleted.
// - Old subject becomes Dropped.
// - New subject gets a new enrollment_subject row.
// - History is REMOVE + ADD.
// - Everything happens inside one transaction.
//
// SAME SUBJECT / DIFFERENT OFFERING:
// Use the normal assignment/change route instead.
// =====================================================

router.put("/:id/subjects/:enrollmentSubjectId/replace", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // 1. IDS
  // =================================================

  const enrollmentId = toPositiveInt(req.params.id);

  const enrollmentSubjectId = toPositiveInt(req.params.enrollmentSubjectId);

  if (!enrollmentId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment ID.",
    });
  }

  if (!enrollmentSubjectId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment subject ID.",
    });
  }

  // =================================================
  // 2. REQUEST BODY
  // =================================================

  const offeringId = toPositiveInt(req.body?.offering_id);

  if (!offeringId) {
    return res.status(400).json({
      success: false,
      message: "A valid offering_id is required.",
    });
  }

  const replacementReason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  if (!replacementReason) {
    return res.status(400).json({
      success: false,

      code: "REPLACEMENT_REASON_REQUIRED",

      message: "Replacement reason is required.",
    });
  }

  if (replacementReason.length > 500) {
    return res.status(400).json({
      success: false,

      message: "Replacement reason must not exceed 500 characters.",
    });
  }

  let connection;
  let transactionActive = false;

  try {
    // =================================================
    // 3. TRANSACTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionActive = true;

    // =================================================
    // 4. LOCK ENROLLMENT + STUDENT
    // =================================================

    const [enrollmentRows] = await connection.execute(
      `
            SELECT
                e.enrollment_id,
                e.student_id,

                e.academic_year_id,
                e.semester_id,

                e.enrollment_status,

                s.student_number,
                s.first_name,
                s.middle_name,
                s.last_name,

                s.course_id,
                s.year_level,

                c.course_code,
                c.course_name,

                ay.academic_year,
                sem.semester_name

            FROM enrollments e

            INNER JOIN students s
                ON s.student_id =
                   e.student_id

            LEFT JOIN courses c
                ON c.course_id =
                   s.course_id

            INNER JOIN academic_years ay
                ON ay.academic_year_id =
                   e.academic_year_id

            INNER JOIN semesters sem
                ON sem.semester_id =
                   e.semester_id

            WHERE e.enrollment_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentId],
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
    // 5. EDITABLE ENROLLMENT STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "ENROLLMENT_NOT_EDITABLE",

        message: `Subject cannot be replaced because enrollment status is "${enrollment.enrollment_status}".`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // 6. STUDENT COURSE / YEAR
    // =================================================

    const studentId = Number(enrollment.student_id);

    const studentCourseId = toPositiveInt(enrollment.course_id);

    const studentYearLevel = toPositiveInt(enrollment.year_level);

    const academicYearId = Number(enrollment.academic_year_id);

    const semesterId = Number(enrollment.semester_id);

    if (!studentCourseId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message: "Student does not have a valid course assignment.",
      });
    }

    if (!studentYearLevel) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message: "Student does not have a valid year level.",
      });
    }

    // =================================================
    // 7. ACTIVE CURRICULUM
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
            SELECT
                sc.student_curriculum_id,
                sc.curriculum_id,

                cur.curriculum_name,
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

        message: "Student does not have a valid active curriculum.",
      });
    }

    const curriculum = curriculumRows[0];

    const curriculumId = Number(curriculum.curriculum_id);

    // =================================================
    // 8. LOCK OLD ENROLLMENT SUBJECT
    // =================================================

    const [oldSubjectRows] = await connection.execute(
      `
            SELECT
                es.enrollment_subject_id,
                es.enrollment_id,

                es.subject_id,

                es.offering_id,
                es.section_id,
                es.section_subject_id,

                es.status,

                sub.subject_code,
                sub.subject_name,
                sub.units,

                sec.section_name,

                so.schedule_days,
                so.schedule_time

            FROM enrollment_subjects es

            INNER JOIN subjects sub
                ON sub.subject_id =
                   es.subject_id

            LEFT JOIN sections sec
                ON sec.section_id =
                   es.section_id

            LEFT JOIN subject_offerings so
                ON so.offering_id =
                   es.offering_id

            WHERE es.enrollment_subject_id = ?

              AND es.enrollment_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentSubjectId, enrollmentId],
    );

    if (oldSubjectRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(404).json({
        success: false,

        message: "Enrollment subject not found.",
      });
    }

    const oldSubject = oldSubjectRows[0];

    // =================================================
    // 9. OLD SUBJECT MUST BE ENROLLED
    // =================================================

    if (oldSubject.status !== "Enrolled") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "ENROLLMENT_SUBJECT_NOT_EDITABLE",

        message: `Subject cannot be replaced because its current status is "${oldSubject.status}".`,
      });
    }

    // =================================================
    // 10. GRADE V2 LOCK
    //
    // ANY grade row means grading has started.
    //
    // Draft
    // Submitted
    // Returned
    // Approved
    //
    // All lock replacement.
    // =================================================

    const [gradeRows] = await connection.execute(
      `
            SELECT
                grade_id,
                enrollment_subject_id,
                faculty_id,

                final_rating,
                remarks,
                grade_status

            FROM grades

            WHERE enrollment_subject_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentSubjectId],
    );

    if (gradeRows.length > 0) {
      const grade = gradeRows[0];

      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SUBJECT_GRADE_LOCKED",

        message:
          "This subject cannot be replaced because grading has already started.",

        grade: {
          grade_id: Number(grade.grade_id),

          grade_status: grade.grade_status,

          final_rating:
            grade.final_rating !== null ? Number(grade.final_rating) : null,

          remarks: grade.remarks || null,
        },
      });
    }

    // =================================================
    // 11. LOCK TARGET OFFERING
    // =================================================

    const [offeringRows] = await connection.execute(
      `
            SELECT
                so.offering_id,

                so.subject_id,
                so.section_id,
                so.section_subject_id,

                so.faculty_id,
                so.room_id,

                so.academic_year_id,
                so.semester_id,

                so.schedule_days,
                so.schedule_time,

                so.max_students,

                so.status
                    AS offering_status,

                sub.subject_code,
                sub.subject_name,
                sub.units,

                sub.lecture_hours,
                sub.laboratory_hours,

                sub.is_active
                    AS subject_is_active,

                ss.status
                    AS section_subject_status,

                ss.subject_id
                    AS ss_subject_id,

                ss.section_id
                    AS ss_section_id,

                ss.academic_year_id
                    AS ss_academic_year_id,

                ss.semester_id
                    AS ss_semester_id,

                sec.section_name,
                sec.year_level,

                sec.course_id
                    AS section_course_id,

                course.course_code
                    AS section_course_code,

                course.course_name
                    AS section_course_name,

                r.room_name,
                r.capacity
                    AS room_capacity

            FROM subject_offerings so

            INNER JOIN subjects sub
                ON sub.subject_id =
                   so.subject_id

            INNER JOIN section_subjects ss
                ON ss.section_subject_id =
                   so.section_subject_id

            INNER JOIN sections sec
                ON sec.section_id =
                   so.section_id

            LEFT JOIN courses course
                ON course.course_id =
                   sec.course_id

            LEFT JOIN rooms r
                ON r.room_id =
                   so.room_id

            WHERE so.offering_id = ?

            LIMIT 1

            FOR UPDATE
          `,
      [offeringId],
    );

    if (offeringRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(404).json({
        success: false,

        message: "Replacement subject offering not found.",
      });
    }

    const newOffering = offeringRows[0];

    // =================================================
    // 12. MUST BE A DIFFERENT SUBJECT
    //
    // Same subject:
    // use assignment/change offering route.
    // =================================================

    if (Number(newOffering.subject_id) === Number(oldSubject.subject_id)) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SAME_SUBJECT_USE_CHANGE_OFFERING",

        message:
          "Replacement offering belongs to the same subject. Use the subject assignment/change route instead.",

        current_subject_id: Number(oldSubject.subject_id),

        replacement_subject_id: Number(newOffering.subject_id),
      });
    }

    // =================================================
    // 13. TARGET SUBJECT ACTIVE
    // =================================================

    if (Number(newOffering.subject_is_active) !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SUBJECT_INACTIVE",

        message: "Replacement subject is inactive.",
      });
    }

    // =================================================
    // 14. OFFERING ACADEMIC PERIOD
    // =================================================

    if (Number(newOffering.academic_year_id) !== academicYearId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_ACADEMIC_YEAR_MISMATCH",

        message:
          "Replacement offering does not belong to the enrollment academic year.",
      });
    }

    if (Number(newOffering.semester_id) !== semesterId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_SEMESTER_MISMATCH",

        message:
          "Replacement offering does not belong to the enrollment semester.",
      });
    }

    // =================================================
    // 15. SAME COURSE
    // =================================================

    if (Number(newOffering.section_course_id) !== studentCourseId) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_COURSE_MISMATCH",

        message: "Replacement section does not belong to the Student's course.",

        student_course: {
          course_id: studentCourseId,

          course_code: enrollment.course_code,
        },

        replacement_course: {
          course_id:
            newOffering.section_course_id !== null
              ? Number(newOffering.section_course_id)
              : null,

          course_code: newOffering.section_course_code || null,
        },
      });
    }

    // =================================================
    // 16. SECTION-SUBJECT RELATIONSHIP
    // =================================================

    if (
      Number(newOffering.ss_subject_id) !== Number(newOffering.subject_id) ||
      Number(newOffering.ss_section_id) !== Number(newOffering.section_id) ||
      Number(newOffering.ss_academic_year_id) !==
        Number(newOffering.academic_year_id) ||
      Number(newOffering.ss_semester_id) !== Number(newOffering.semester_id)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "INVALID_SECTION_SUBJECT_RELATIONSHIP",

        message:
          "Replacement offering has an invalid section-subject relationship.",
      });
    }

    // =================================================
    // 17. OPEN STATUS
    // =================================================

    if (newOffering.offering_status !== "Open") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_NOT_OPEN",

        message: `Replacement offering is "${newOffering.offering_status}".`,
      });
    }

    if (newOffering.section_subject_status !== "Open") {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SECTION_SUBJECT_NOT_OPEN",

        message: `Replacement section-subject is "${newOffering.section_subject_status}".`,
      });
    }

    // =================================================
    // 18. READINESS
    //
    // Room remains OPTIONAL.
    // =================================================

    const maxStudents = Number(newOffering.max_students || 0);

    const missingConfiguration = [];

    if (!newOffering.faculty_id) {
      missingConfiguration.push("faculty");
    }

    if (
      !newOffering.schedule_days ||
      !String(newOffering.schedule_days).trim()
    ) {
      missingConfiguration.push("schedule_days");
    }

    if (
      !newOffering.schedule_time ||
      !String(newOffering.schedule_time).trim()
    ) {
      missingConfiguration.push("schedule_time");
    }

    if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
      missingConfiguration.push("capacity");
    }

    if (missingConfiguration.length > 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_INCOMPLETE",

        message:
          "Replacement offering is incomplete and is not ready for enrollment.",

        missing_configuration: missingConfiguration,
      });
    }

    // =================================================
    // 19. OPTIONAL ROOM CAPACITY
    // =================================================

    if (
      newOffering.room_capacity !== null &&
      Number(newOffering.room_capacity) > 0 &&
      maxStudents > Number(newOffering.room_capacity)
    ) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_EXCEEDS_ROOM_CAPACITY",

        message:
          "Replacement offering capacity exceeds the assigned room capacity.",

        room: {
          room_id:
            newOffering.room_id !== null ? Number(newOffering.room_id) : null,

          room_name: newOffering.room_name || null,

          room_capacity: Number(newOffering.room_capacity),
        },

        offering_capacity: maxStudents,
      });
    }

    // =================================================
    // 20. TARGET SUBJECT MUST BELONG TO
    //     ACTIVE STUDENT CURRICULUM
    // =================================================

    const [curriculumSubjectRows] = await connection.execute(
      `
            SELECT
                curriculum_subject_id,
                curriculum_id,
                subject_id,

                year_level,
                semester_id,

                is_required,
                display_order

            FROM curriculum_subjects

            WHERE curriculum_id = ?

              AND subject_id = ?

            LIMIT 1
          `,
      [curriculumId, Number(newOffering.subject_id)],
    );

    if (curriculumSubjectRows.length === 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "SUBJECT_NOT_IN_ASSIGNED_CURRICULUM",

        message:
          "Replacement subject does not belong to the Student's active curriculum.",
      });
    }

    const curriculumSubject = curriculumSubjectRows[0];

    // =================================================
    // 21. SHARED GRADE V2 ACADEMIC ELIGIBILITY
    // =================================================

    const academicEligibility = await evaluateSubjectEligibility(
      studentId,
      Number(newOffering.subject_id),
      connection,
    );

    if (!academicEligibility.eligible) {
      let code = "SUBJECT_ACADEMICALLY_INELIGIBLE";

      if (
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.ALREADY_PASSED
      ) {
        code = "SUBJECT_ALREADY_PASSED";
      } else if (
        academicEligibility.eligibility_type ===
        ELIGIBILITY_TYPE.BLOCKED_PREREQUISITE
      ) {
        code = "PREREQUISITE_NOT_PASSED";
      } else if (
        academicEligibility.eligibility_type === ELIGIBILITY_TYPE.UNRESOLVED
      ) {
        code = "ACADEMIC_RESULT_UNRESOLVED";
      }

      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code,

        message:
          academicEligibility.reason ||
          `Student is not academically eligible to take replacement subject ${newOffering.subject_code}.`,

        academic_eligibility: academicEligibility,
      });
    }

    // =================================================
    // 22. REGULAR SUBJECT CURRENT-TERM RULE
    //
    // Regular:
    // curriculum year + semester must match student.
    //
    // Retake:
    // may originate from an earlier curriculum term.
    // =================================================

    if (academicEligibility.eligibility_type === ELIGIBILITY_TYPE.REGULAR) {
      if (
        Number(curriculumSubject.year_level) !== studentYearLevel ||
        Number(curriculumSubject.semester_id) !== semesterId
      ) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          code: "REGULAR_SUBJECT_OUTSIDE_CURRENT_TERM",

          message:
            "A Regular replacement subject can only come from the Student's current curriculum year and semester.",

          curriculum_subject: {
            curriculum_subject_id: Number(
              curriculumSubject.curriculum_subject_id,
            ),

            subject_id: Number(curriculumSubject.subject_id),

            year_level: Number(curriculumSubject.year_level),

            semester_id: Number(curriculumSubject.semester_id),
          },

          student_current_term: {
            year_level: studentYearLevel,

            semester_id: semesterId,
          },
        });
      }

      // ===============================================
      // REGULAR SUBJECT MUST USE SAME YEAR SECTION
      // ===============================================

      if (Number(newOffering.year_level) !== studentYearLevel) {
        await connection.rollback();
        transactionActive = false;

        return res.status(409).json({
          success: false,

          code: "REGULAR_SECTION_YEAR_LEVEL_MISMATCH",

          message:
            "Regular replacement subject must use a section matching the Student's current year level.",

          student_year_level: studentYearLevel,

          section_year_level: Number(newOffering.year_level),
        });
      }
    }

    // =================================================
    // 23. DUPLICATE TARGET SUBJECT
    //
    // Do not create another active attempt in this
    // same enrollment.
    // =================================================

    const [duplicateRows] = await connection.execute(
      `
            SELECT
                enrollment_subject_id,
                status

            FROM enrollment_subjects

            WHERE enrollment_id = ?

              AND subject_id = ?

              AND enrollment_subject_id <> ?

              AND status IN (
                  'Enrolled',
                  'Completed',
                  'Failed',
                  'Incomplete'
              )

            LIMIT 1

            FOR UPDATE
          `,
      [enrollmentId, Number(newOffering.subject_id), enrollmentSubjectId],
    );

    if (duplicateRows.length > 0) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "DUPLICATE_ACTIVE_SUBJECT",

        message: "Replacement subject is already part of this enrollment.",

        existing_subject: {
          enrollment_subject_id: Number(duplicateRows[0].enrollment_subject_id),

          status: duplicateRows[0].status,
        },
      });
    }

    // =================================================
    // 24. TARGET OFFERING CAPACITY
    //
    // New subject is not inserted yet.
    // Therefore enrolled_count >= max means FULL.
    // =================================================

    const [capacityRows] = await connection.execute(
      `
            SELECT
                COUNT(*) AS enrolled_count

            FROM enrollment_subjects es

            INNER JOIN enrollments e
                ON e.enrollment_id =
                   es.enrollment_id

            WHERE es.offering_id = ?

              AND es.status IN (
                  'Enrolled',
                  'Completed',
                  'Failed',
                  'Incomplete'
              )

              AND e.enrollment_status IN (
                  'Pending',
                  'Approved'
              )

              AND es.enrollment_subject_id <> ?
          `,
      [offeringId, enrollmentSubjectId],
    );

    const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

    if (enrolledCount >= maxStudents) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        code: "OFFERING_FULL",

        message: "Replacement subject offering is already full.",

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots: 0,
        },
      });
    }

    // =================================================
    // 25. OLD VALUES
    // =================================================

    const oldValues = {
      enrollment_id: enrollmentId,

      enrollment_subject_id: enrollmentSubjectId,

      subject_id: Number(oldSubject.subject_id),

      offering_id:
        oldSubject.offering_id !== null ? Number(oldSubject.offering_id) : null,

      section_id:
        oldSubject.section_id !== null ? Number(oldSubject.section_id) : null,

      section_subject_id:
        oldSubject.section_subject_id !== null
          ? Number(oldSubject.section_subject_id)
          : null,

      status: oldSubject.status,
    };

    // =================================================
    // 26. MARK OLD SUBJECT DROPPED
    //
    // Never hard-delete academic enrollment history.
    // =================================================

    const [oldUpdateResult] = await connection.execute(
      `
            UPDATE enrollment_subjects

            SET status = 'Dropped'

            WHERE enrollment_subject_id = ?

              AND enrollment_id = ?

              AND status = 'Enrolled'
          `,
      [enrollmentSubjectId, enrollmentId],
    );

    if (oldUpdateResult.affectedRows !== 1) {
      await connection.rollback();
      transactionActive = false;

      return res.status(409).json({
        success: false,

        message:
          "Original subject could not be replaced because its status changed.",
      });
    }

    // =================================================
    // 27. INSERT NEW SUBJECT
    // =================================================

    const [insertResult] = await connection.execute(
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

                ?,
                ?,
                ?,

                'Enrolled'
            )
          `,
      [
        enrollmentId,

        Number(newOffering.subject_id),

        Number(newOffering.offering_id),

        Number(newOffering.section_id),

        Number(newOffering.section_subject_id),
      ],
    );

    const newEnrollmentSubjectId = Number(insertResult.insertId);

    // =================================================
    // 28. OLD SUBJECT HISTORY -> REMOVE
    //
    // DB enum:
    // ADD / DROP / REMOVE / CHANGE
    //
    // There is intentionally no REPLACE enum.
    // =================================================

    await connection.execute(
      `
          INSERT INTO enrollment_subject_changes (
              enrollment_id,
              enrollment_subject_id,
              subject_id,

              change_type,

              old_offering_id,
              old_section_id,
              old_section_subject_id,

              new_offering_id,
              new_section_id,
              new_section_subject_id,

              reason,
              changed_by
          )

          VALUES (
              ?,
              ?,
              ?,

              'REMOVE',

              ?,
              ?,
              ?,

              NULL,
              NULL,
              NULL,

              ?,
              ?
          )
        `,
      [
        enrollmentId,
        enrollmentSubjectId,
        Number(oldSubject.subject_id),

        oldValues.offering_id,
        oldValues.section_id,
        oldValues.section_subject_id,

        replacementReason,
        Number(actor.user_id),
      ],
    );

    // =================================================
    // 29. NEW SUBJECT HISTORY -> ADD
    // =================================================

    await connection.execute(
      `
          INSERT INTO enrollment_subject_changes (
              enrollment_id,
              enrollment_subject_id,
              subject_id,

              change_type,

              old_offering_id,
              old_section_id,
              old_section_subject_id,

              new_offering_id,
              new_section_id,
              new_section_subject_id,

              reason,
              changed_by
          )

          VALUES (
              ?,
              ?,
              ?,

              'ADD',

              NULL,
              NULL,
              NULL,

              ?,
              ?,
              ?,

              ?,
              ?
          )
        `,
      [
        enrollmentId,
        newEnrollmentSubjectId,
        Number(newOffering.subject_id),

        Number(newOffering.offering_id),

        Number(newOffering.section_id),

        Number(newOffering.section_subject_id),

        replacementReason,
        Number(actor.user_id),
      ],
    );

    // =================================================
    // 30. AUDIT OLD SUBJECT
    // =================================================

    const oldSubjectNewValues = {
      ...oldValues,
      status: "Dropped",
    };

    await connection.execute(
      `
          INSERT INTO audit_trail (
              user_id,
              table_name,
              record_id,
              action,
              old_values,
              new_values
          )

          VALUES (
              ?,
              'enrollment_subjects',
              ?,
              'UPDATE',
              ?,
              ?
          )
        `,
      [
        Number(actor.user_id),

        enrollmentSubjectId,

        JSON.stringify(oldValues),

        JSON.stringify(oldSubjectNewValues),
      ],
    );

    // =================================================
    // 31. AUDIT NEW SUBJECT
    // =================================================

    const newValues = {
      enrollment_id: enrollmentId,

      enrollment_subject_id: newEnrollmentSubjectId,

      subject_id: Number(newOffering.subject_id),

      offering_id: Number(newOffering.offering_id),

      section_id: Number(newOffering.section_id),

      section_subject_id: Number(newOffering.section_subject_id),

      status: "Enrolled",

      academic_eligibility: {
        eligible: true,

        eligibility_type: academicEligibility.eligibility_type,

        reason: academicEligibility.reason,

        latest_approved_grade: academicEligibility.latest_approved_grade,

        prerequisites: academicEligibility.prerequisites,
      },
    };

    await connection.execute(
      `
          INSERT INTO audit_trail (
              user_id,
              table_name,
              record_id,
              action,
              old_values,
              new_values
          )

          VALUES (
              ?,
              'enrollment_subjects',
              ?,
              'INSERT',
              ?,
              ?
          )
        `,
      [
        Number(actor.user_id),

        newEnrollmentSubjectId,

        JSON.stringify(null),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // 32. COMMIT
    // =================================================

    await connection.commit();

    transactionActive = false;

    // =================================================
    // 33. RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Enrollment subject replaced successfully.",

      enrollment: {
        enrollment_id: enrollmentId,

        enrollment_status: enrollment.enrollment_status,

        student_id: studentId,

        student_number: enrollment.student_number,

        student_name: [
          enrollment.first_name,
          enrollment.middle_name,
          enrollment.last_name,
        ]
          .filter(Boolean)
          .join(" "),

        course: {
          course_id: studentCourseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,
        },

        academic_period: {
          academic_year_id: academicYearId,

          academic_year: enrollment.academic_year,

          semester_id: semesterId,

          semester_name: enrollment.semester_name,
        },

        curriculum: {
          curriculum_id: curriculumId,

          curriculum_name: curriculum.curriculum_name,
        },
      },

      replaced_subject: {
        enrollment_subject_id: enrollmentSubjectId,

        subject_id: Number(oldSubject.subject_id),

        subject_code: oldSubject.subject_code,

        subject_name: oldSubject.subject_name,

        units: Number(oldSubject.units || 0),

        offering_id: oldValues.offering_id,

        section_id: oldValues.section_id,

        section_name: oldSubject.section_name || null,

        section_subject_id: oldValues.section_subject_id,

        previous_status: "Enrolled",

        status: "Dropped",
      },

      new_subject: {
        enrollment_subject_id: newEnrollmentSubjectId,

        subject_id: Number(newOffering.subject_id),

        subject_code: newOffering.subject_code,

        subject_name: newOffering.subject_name,

        units: Number(newOffering.units || 0),

        enrollment_type: academicEligibility.eligibility_type,

        academic_eligibility: academicEligibility,

        status: "Enrolled",

        offering: {
          offering_id: Number(newOffering.offering_id),

          status: newOffering.offering_status,

          schedule_days: newOffering.schedule_days || null,

          schedule_time: newOffering.schedule_time || null,

          faculty_id:
            newOffering.faculty_id !== null
              ? Number(newOffering.faculty_id)
              : null,
        },

        section: {
          section_id: Number(newOffering.section_id),

          section_name: newOffering.section_name,

          year_level:
            newOffering.year_level !== null &&
            newOffering.year_level !== undefined
              ? Number(newOffering.year_level)
              : null,
        },

        section_subject: {
          section_subject_id: Number(newOffering.section_subject_id),

          status: newOffering.section_subject_status,
        },

        room: {
          room_id:
            newOffering.room_id !== null ? Number(newOffering.room_id) : null,

          room_name: newOffering.room_name || null,
        },
      },

      capacity: {
        max_students: maxStudents,

        enrolled_count_after_replace: enrolledCount + 1,

        available_slots_after_replace: Math.max(
          maxStudents - (enrolledCount + 1),
          0,
        ),
      },

      history: {
        operations: [
          {
            change_type: "REMOVE",

            enrollment_subject_id: enrollmentSubjectId,

            subject_id: Number(oldSubject.subject_id),
          },

          {
            change_type: "ADD",

            enrollment_subject_id: newEnrollmentSubjectId,

            subject_id: Number(newOffering.subject_id),
          },
        ],

        reason: replacementReason,

        changed_by: Number(actor.user_id),
      },

      actor: {
        user_id: Number(actor.user_id),

        username: actor.username,
      },
    });
  } catch (error) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("REPLACE SUBJECT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("REPLACE SUBJECT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to replace enrollment subject.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// EXPORT
// =====================================================

export default router;
