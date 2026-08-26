// routes/registrar/enrollments.js

import express from "express";
import db from "../../db.js";

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
// - latest enrollment period
// - academic years
// - semesters
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
    // GET LATEST ENROLLMENT PERIOD
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
    // GET SEMESTERS
    // ===============================================

    const [semesterRows] = await connection.execute(
      `
          SELECT
              semester_id,
              semester_name

          FROM semesters

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
    // FORMAT SEMESTERS
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
//   "academic_year_id": 2,
//   "semester_id": 1,
//   "remarks": "Enrollment for 2026-2027 First Semester"
// }
//
// IMPORTANT:
// - Registrar identity comes from JWT.
// - Do NOT accept user_id from frontend.
// - Only one enrollment period may be Open.
// - If the same AY + semester already exists as Closed,
//   reopen it instead of creating a duplicate.
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
  // VALIDATE SEMESTER
  // =================================================

  if (!semesterId) {
    return res.status(400).json({
      success: false,
      message: "A valid semester_id is required.",
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

    const academicYear = academicYearRows[0];

    // =================================================
    // VERIFY SEMESTER
    // =================================================

    const [semesterRows] = await connection.execute(
      `
          SELECT
              semester_id,
              semester_name

          FROM semesters

          WHERE semester_id = ?

          LIMIT 1
          `,
      [semesterId],
    );

    if (semesterRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,

        message: "Semester not found.",

        semester_id: semesterId,
      });
    }

    const semester = semesterRows[0];

    // =================================================
    // CHECK FOR ANOTHER OPEN PERIOD
    //
    // There must only be one Open enrollment period.
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
    // CHECK IF THIS AY + SEMESTER ALREADY EXISTS
    //
    // enrollment_periods should reuse an existing
    // Closed period instead of inserting a duplicate.
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

      // This normally cannot happen because the
      // previous Open query already catches it.
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
    // GET FINAL PERIOD
    // =================================================

    const [finalRows] = await connection.execute(
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
    // =================================================
    // ROLLBACK
    // =================================================

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
    // =================================================
    // RELEASE CONNECTION
    // =================================================

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
// ROUTE 7
// GET AVAILABLE SUBJECT OFFERINGS
//
// GET /api/registrar/enrollments/:id/available-offerings
//
// Optional:
// ?subject_id=1
//
// Examples:
//
// GET /api/registrar/enrollments/3/available-offerings
//
// GET /api/registrar/enrollments/3/available-offerings?subject_id=1
//
// Purpose:
// - Registrar chooses section/offering
// - Student does NOT choose section
// - Only Pending / Approved enrollment
// - Same academic year
// - Same semester
// - Same student course
// - Only subjects already inside enrollment
// - Only Open section subjects
// - Only Open subject offerings
// - Shows capacity
//
// JWT:
// - Registrar comes from req.user
// =====================================================

router.get("/:id/available-offerings", async (req, res) => {
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
  // OPTIONAL SUBJECT ID
  // =================================================

  let subjectId = null;

  if (
    req.query.subject_id !== undefined &&
    String(req.query.subject_id).trim() !== ""
  ) {
    subjectId = toPositiveInt(req.query.subject_id);

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject ID.",
      });
    }
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

              s.student_number,

              s.first_name,
              s.middle_name,
              s.last_name,

              s.course_id,

              s.section_id
                  AS student_section_id,

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
    // REGISTRAR ASSIGNMENT STATUS
    //
    // Draft:
    // Student has not submitted yet.
    //
    // Pending:
    // Registrar may assign offering.
    //
    // Approved:
    // Registrar may view offerings for corrections.
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      return res.status(409).json({
        success: false,

        message:
          "Available offerings can only be viewed for Pending or Approved enrollments.",

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // COURSE REQUIRED
    // =================================================

    const courseId = toPositiveInt(enrollment.course_id);

    if (!courseId) {
      return res.status(409).json({
        success: false,

        message: "Student does not have a valid course assignment.",
      });
    }

    // =================================================
    // IF SUBJECT FILTER EXISTS:
    // VERIFY SUBJECT IS ACTUALLY IN THIS ENROLLMENT
    // =================================================

    if (subjectId) {
      const [enrollmentSubjectRows] = await connection.execute(
        `
            SELECT
                es.enrollment_subject_id,
                es.subject_id,
                es.status,

                sub.subject_code,
                sub.subject_name

            FROM enrollment_subjects es

            INNER JOIN subjects sub
                ON sub.subject_id =
                   es.subject_id

            WHERE es.enrollment_id = ?
              AND es.subject_id = ?
              AND es.status <> 'Enrolled'

            LIMIT 1
            `,
        [enrollmentId, subjectId],
      );

      if (enrollmentSubjectRows.length === 0) {
        return res.status(404).json({
          success: false,

          message: "The requested subject is not part of this enrollment.",

          subject_id: subjectId,
        });
      }
    }

    // =================================================
    // SUBJECT FILTER
    // =================================================

    const subjectCondition = subjectId
      ? `
            AND so.subject_id = ?
          `
      : "";

    // =================================================
    // PARAMETERS
    // =================================================

    const queryParams = [
      enrollment.academic_year_id,
      enrollment.semester_id,

      courseId,

      enrollmentId,
    ];

    if (subjectId) {
      queryParams.push(subjectId);
    }

    // =================================================
    // GET AVAILABLE OFFERINGS
    //
    // IMPORTANT:
    // Only subjects that already belong to the
    // student's enrollment are returned.
    // =================================================

    const [offeringRows] = await connection.execute(
      `
          SELECT
              -- =========================================
              -- OFFERING
              -- =========================================

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

              -- =========================================
              -- SUBJECT
              -- =========================================

              sub.subject_code,
              sub.subject_name,
              sub.units,

              sub.lecture_hours,
              sub.laboratory_hours,

              -- =========================================
              -- SECTION SUBJECT
              -- =========================================

              ss.status
                  AS section_subject_status,

              -- =========================================
              -- SECTION
              -- =========================================

              sec.section_name,
              sec.year_level,

              sec.course_id
                  AS section_course_id,

              -- =========================================
              -- COURSE
              -- =========================================

              section_course.course_code
                  AS section_course_code,

              section_course.course_name
                  AS section_course_name,

              -- =========================================
              -- FACULTY
              -- =========================================

              f.faculty_id,

              TRIM(
                CONCAT_WS(
                  ' ',
                  f.first_name,
                  NULLIF(
                    f.middle_name,
                    ''
                  ),
                  f.last_name
                )
              ) AS faculty_name,

              -- =========================================
              -- ROOM
              -- =========================================

              r.room_id,
              r.room_name,

              -- =========================================
              -- CURRENT ENROLLED COUNT
              -- =========================================

              (
                SELECT
                    COUNT(*)

                FROM enrollment_subjects es_count

                INNER JOIN enrollments e_count
                    ON e_count.enrollment_id =
                       es_count.enrollment_id

                WHERE es_count.offering_id =
                      so.offering_id

                  AND es_count.status =
                      'Enrolled'

                  AND e_count.enrollment_status
                      IN (
                        'Pending',
                        'Approved'
                      )
              ) AS enrolled_count

          FROM subject_offerings so

          INNER JOIN section_subjects ss
              ON ss.section_subject_id =
                 so.section_subject_id

          INNER JOIN subjects sub
              ON sub.subject_id =
                 so.subject_id

          INNER JOIN sections sec
              ON sec.section_id =
                 so.section_id

          LEFT JOIN courses section_course
              ON section_course.course_id =
                 sec.course_id

          LEFT JOIN faculty f
              ON f.faculty_id =
                 so.faculty_id

          LEFT JOIN rooms r
              ON r.room_id =
                 so.room_id

          WHERE so.academic_year_id = ?

            AND so.semester_id = ?

            -- ===========================================
            -- SAME STUDENT COURSE
            -- ===========================================

            AND sec.course_id = ?

            -- ===========================================
            -- SUBJECT MUST ALREADY EXIST
            -- IN THIS ENROLLMENT
            -- ===========================================

           AND EXISTS (
    SELECT 1

    FROM enrollment_subjects current_es

    WHERE current_es.enrollment_id = ?

      AND current_es.subject_id =
          so.subject_id

      AND current_es.status =
          'Enrolled'
)

            -- ===========================================
            -- SECTION SUBJECT MUST MATCH OFFERING
            -- ===========================================

            AND ss.subject_id =
                so.subject_id

            AND ss.section_id =
                so.section_id

            AND ss.academic_year_id =
                so.academic_year_id

            AND ss.semester_id =
                so.semester_id

            -- ===========================================
            -- OPEN ONLY
            -- ===========================================
AND ss.status = 'Open'

AND so.status = 'Open'

-- =================================================
-- READY FOR ENROLLMENT CONFIGURATION
--
-- Room is intentionally optional.
-- Enrollment must never expose an incomplete class
-- even if bad/legacy data somehow has status = Open.
-- =================================================

AND so.faculty_id IS NOT NULL

AND so.schedule_days IS NOT NULL
AND TRIM(so.schedule_days) <> ''

AND so.schedule_time IS NOT NULL
AND TRIM(so.schedule_time) <> ''

AND so.max_students > 0

${subjectCondition}

          ORDER BY
              sub.subject_code ASC,
              sec.section_name ASC,
              so.schedule_days ASC,
              so.schedule_time ASC
          `,
      queryParams,
    );

    // =================================================
    // FORMAT OFFERINGS
    // =================================================

    const offerings = offeringRows
      .map((row) => {
        const maxStudents = Number(row.max_students || 0);

        const enrolledCount = Number(row.enrolled_count || 0);

        const availableSlots = Math.max(maxStudents - enrolledCount, 0);

        return {
          offering_id: Number(row.offering_id),

          subject: {
            subject_id: Number(row.subject_id),

            subject_code: row.subject_code,

            subject_name: row.subject_name,

            units: Number(row.units || 0),

            lecture_hours:
              row.lecture_hours !== null && row.lecture_hours !== undefined
                ? Number(row.lecture_hours)
                : null,

            laboratory_hours:
              row.laboratory_hours !== null &&
              row.laboratory_hours !== undefined
                ? Number(row.laboratory_hours)
                : null,
          },

          section: {
            section_id: Number(row.section_id),

            section_name: row.section_name,

            year_level:
              row.year_level !== null && row.year_level !== undefined
                ? Number(row.year_level)
                : null,

            course_id: row.section_course_id
              ? Number(row.section_course_id)
              : null,

            course_code: row.section_course_code || null,

            course_name: row.section_course_name || null,
          },

          section_subject: {
            section_subject_id: Number(row.section_subject_id),

            status: row.section_subject_status,
          },

          faculty: {
            faculty_id: row.faculty_id ? Number(row.faculty_id) : null,

            faculty_name: row.faculty_name || null,
          },

          room: {
            room_id: row.room_id ? Number(row.room_id) : null,

            room_name: row.room_name || null,
          },

          schedule: {
            days: row.schedule_days || null,

            time: row.schedule_time || null,
          },

          capacity: {
            max_students: maxStudents,

            enrolled_count: enrolledCount,

            available_slots: availableSlots,

            is_full: availableSlots <= 0,
          },

          offering_status: row.offering_status,

          academic_year_id: Number(row.academic_year_id),

          semester_id: Number(row.semester_id),
        };
      })
      .filter((offering) => offering.capacity.available_slots > 0);

    // =================================================
    // SUCCESS
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

        course_id: courseId,

        course_code: enrollment.course_code,

        course_name: enrollment.course_name,

        academic_year_id: Number(enrollment.academic_year_id),

        academic_year: enrollment.academic_year,

        semester_id: Number(enrollment.semester_id),

        semester_name: enrollment.semester_name,

        enrollment_status: enrollment.enrollment_status,
      },

      subject_filter: subjectId,

      count: offerings.length,

      offerings,

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET AVAILABLE OFFERINGS ERROR:", error);

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
// ROUTE 8
// ASSIGN / CHANGE SUBJECT OFFERING AND SECTION
//
// PUT
// /api/registrar/enrollments/:id/subjects/:enrollmentSubjectId
//
// Body:
// {
//   "offering_id": 15,
//   "reason": "Assigned by Registrar"
// }
//
// Purpose:
// - Registrar assigns a section/offering
// - Registrar can correct an existing assignment
// - Student never chooses the section
//
// Allowed enrollment statuses:
// - Pending
// - Approved
//
// Validations:
// - Enrollment exists
// - Enrollment subject exists
// - Subject status is Enrolled
// - Offering exists
// - Same subject
// - Same academic year
// - Same semester
// - Same student's course
// - Section subject is Open
// - Offering is Open
// - Offering has capacity
//
// Records:
// - enrollment_subject_changes = CHANGE
// - audit_trail = UPDATE
//
// Actor:
// - req.user.user_id only
// =====================================================

router.put("/:id/subjects/:enrollmentSubjectId", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // IDS
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
  // BODY
  // =================================================

  const offeringId = toPositiveInt(req.body?.offering_id);

  if (!offeringId) {
    return res.status(400).json({
      success: false,
      message: "A valid offering_id is required.",
    });
  }

  const cleanReason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "Registrar assigned/changed subject offering";
  if (cleanReason.length > 500) {
    return res.status(400).json({
      success: false,
      message: "Assignment reason must not exceed 500 characters.",
    });
  }
  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // TRANSACTION
    // =================================================

    await connection.beginTransaction();

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

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,

              s.course_id,

              c.course_code,
              c.course_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN courses c
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

      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // ENROLLMENT STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject assignment is not allowed while enrollment status is '${enrollment.enrollment_status}'.`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // STUDENT COURSE
    // =================================================

    const studentCourseId = toPositiveInt(enrollment.course_id);

    if (!studentCourseId) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Student does not have a valid course assignment.",
      });
    }

    // =================================================
    // GET CURRENT ENROLLMENT SUBJECT
    // =================================================

    const [currentRows] = await connection.execute(
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
              sub.units

          FROM enrollment_subjects es

          INNER JOIN subjects sub
              ON sub.subject_id =
                 es.subject_id

          WHERE es.enrollment_subject_id = ?

            AND es.enrollment_id = ?

          LIMIT 1

          FOR UPDATE
          `,
      [enrollmentSubjectId, enrollmentId],
    );

    if (currentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,

        message: "Enrollment subject not found.",
      });
    }

    const currentSubject = currentRows[0];

    // =================================================
    // SUBJECT STATUS
    // =================================================

    if (currentSubject.status !== "Enrolled") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject assignment cannot be changed because its status is '${currentSubject.status}'.`,
      });
    }

    // =================================================
    // SAME OFFERING
    // =================================================

    if (
      currentSubject.offering_id !== null &&
      Number(currentSubject.offering_id) === offeringId
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "This offering is already assigned to the enrollment subject.",
      });
    }

    // =================================================
    // GET TARGET OFFERING
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

              ss.status
                  AS section_subject_status,

              sub.subject_code,
              sub.subject_name,
              sub.units,

              sec.section_name,
              sec.year_level,

              sec.course_id
                  AS section_course_id,

              c.course_code
                  AS section_course_code,

              c.course_name
                  AS section_course_name,

              f.faculty_id,

              TRIM(
                CONCAT_WS(
                  ' ',
                  f.first_name,
                  NULLIF(
                    f.middle_name,
                    ''
                  ),
                  f.last_name
                )
              ) AS faculty_name,

              r.room_id,
              r.room_name

          FROM subject_offerings so

          INNER JOIN section_subjects ss
              ON ss.section_subject_id =
                 so.section_subject_id

          INNER JOIN subjects sub
              ON sub.subject_id =
                 so.subject_id

          INNER JOIN sections sec
              ON sec.section_id =
                 so.section_id

          LEFT JOIN courses c
              ON c.course_id =
                 sec.course_id

          LEFT JOIN faculty f
              ON f.faculty_id =
                 so.faculty_id

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

      return res.status(404).json({
        success: false,

        message: "Subject offering not found.",
      });
    }

    const offering = offeringRows[0];

    // =================================================
    // SAME SUBJECT
    // =================================================

    if (Number(offering.subject_id) !== Number(currentSubject.subject_id)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "The selected offering belongs to a different subject.",

        current_subject_id: Number(currentSubject.subject_id),

        offering_subject_id: Number(offering.subject_id),
      });
    }

    // =================================================
    // SAME ACADEMIC YEAR
    // =================================================

    if (
      Number(offering.academic_year_id) !== Number(enrollment.academic_year_id)
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "The selected offering does not belong to the enrollment academic year.",
      });
    }

    // =================================================
    // SAME SEMESTER
    // =================================================

    if (Number(offering.semester_id) !== Number(enrollment.semester_id)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "The selected offering does not belong to the enrollment semester.",
      });
    }

    // =================================================
    // SAME COURSE
    //
    // Prevent examples such as:
    // BSA Student -> BSIT section
    // =================================================

    if (Number(offering.section_course_id) !== studentCourseId) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "The selected section does not belong to the student's course.",

        student_course: {
          course_id: studentCourseId,

          course_code: enrollment.course_code,
        },

        selected_section_course: {
          course_id: offering.section_course_id
            ? Number(offering.section_course_id)
            : null,

          course_code: offering.section_course_code || null,
        },
      });
    }

    // =================================================
    // VERIFY SECTION SUBJECT RELATIONSHIP
    // =================================================

    const [sectionSubjectRows] = await connection.execute(
      `
          SELECT
              section_subject_id,
              section_id,
              subject_id,
              academic_year_id,
              semester_id,
              status

          FROM section_subjects

          WHERE section_subject_id = ?

            AND section_id = ?

            AND subject_id = ?

            AND academic_year_id = ?

            AND semester_id = ?

          LIMIT 1

          FOR UPDATE
          `,
      [
        offering.section_subject_id,
        offering.section_id,
        offering.subject_id,
        offering.academic_year_id,
        offering.semester_id,
      ],
    );

    if (sectionSubjectRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "The selected offering has an invalid section-subject relationship.",
      });
    }

    // =================================================
    // SECTION SUBJECT OPEN
    // =================================================

    if (offering.section_subject_status !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `The selected section subject is '${offering.section_subject_status}'.`,
      });
    }

    // =================================================
    // OFFERING OPEN
    // =================================================

    if (offering.offering_status !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `The selected offering is '${offering.offering_status}'.`,
      });
    }

    // =================================================
    // OFFERING MUST BE READY FOR ENROLLMENT
    //
    // Class Offering owns configuration.
    //
    // Enrollment only consumes offerings that are:
    // - Open
    // - faculty assigned
    // - schedule days assigned
    // - schedule time assigned
    // - capacity > 0
    //
    // room_id is intentionally OPTIONAL.
    // =================================================

    const missingOfferingConfiguration = [];

    if (!offering.faculty_id) {
      missingOfferingConfiguration.push("faculty_id");
    }

    if (!offering.schedule_days || !String(offering.schedule_days).trim()) {
      missingOfferingConfiguration.push("schedule_days");
    }

    if (!offering.schedule_time || !String(offering.schedule_time).trim()) {
      missingOfferingConfiguration.push("schedule_time");
    }

    if (Number(offering.max_students || 0) <= 0) {
      missingOfferingConfiguration.push("max_students");
    }

    if (missingOfferingConfiguration.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "The selected offering is incomplete and is not ready for enrollment assignment.",

        missing_configuration: missingOfferingConfiguration,
      });
    }

    // =================================================
    // CAPACITY
    // =================================================================================================

    const maxStudents = Number(offering.max_students || 0);

    if (maxStudents <= 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "The selected offering does not have available enrollment capacity.",
      });
    }

    const [capacityRows] = await connection.execute(
      `
          SELECT
              COUNT(*) AS enrolled_count

          FROM enrollment_subjects es

          INNER JOIN enrollments e
              ON e.enrollment_id =
                 es.enrollment_id

          WHERE es.offering_id = ?

            AND es.status =
                'Enrolled'

            AND e.enrollment_status
                IN (
                  'Pending',
                  'Approved'
                )

            AND es.enrollment_subject_id
                <> ?
          `,
      [offeringId, enrollmentSubjectId],
    );

    const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

    if (enrolledCount >= maxStudents) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "The selected offering is already full.",

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots: 0,
        },
      });
    }

    // =================================================
    // SAVE OLD VALUES
    // =================================================

    const oldValues = {
      offering_id: currentSubject.offering_id
        ? Number(currentSubject.offering_id)
        : null,

      section_id: currentSubject.section_id
        ? Number(currentSubject.section_id)
        : null,

      section_subject_id: currentSubject.section_subject_id
        ? Number(currentSubject.section_subject_id)
        : null,

      status: currentSubject.status,
    };

    // =================================================
    // NEW VALUES
    // =================================================

    const newValues = {
      offering_id: Number(offering.offering_id),

      section_id: Number(offering.section_id),

      section_subject_id: Number(offering.section_subject_id),

      status: currentSubject.status,
    };

    // =================================================
    // UPDATE ENROLLMENT SUBJECT
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
        newValues.offering_id,
        newValues.section_id,
        newValues.section_subject_id,

        enrollmentSubjectId,
        enrollmentId,
      ],
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Enrollment subject could not be updated.",
      });
    }

    // =================================================
    // CHANGE HISTORY
    //
    // Current DB enum supports:
    // ADD / DROP / REMOVE / CHANGE
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
        currentSubject.subject_id,

        oldValues.offering_id,
        oldValues.section_id,
        oldValues.section_subject_id,

        newValues.offering_id,
        newValues.section_id,
        newValues.section_subject_id,

        cleanReason,

        actor.user_id,
      ],
    );

    // =================================================
    // AUDIT TRAIL
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
        actor.user_id,

        enrollmentSubjectId,

        JSON.stringify(oldValues),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Subject offering and section assigned successfully.",

      enrollment: {
        enrollment_id: enrollmentId,

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

        course_id: studentCourseId,

        course_code: enrollment.course_code,
      },

      enrollment_subject: {
        enrollment_subject_id: enrollmentSubjectId,

        subject_id: Number(currentSubject.subject_id),

        subject_code: currentSubject.subject_code,

        subject_name: currentSubject.subject_name,

        units: Number(currentSubject.units || 0),

        status: currentSubject.status,

        offering: {
          offering_id: Number(offering.offering_id),

          status: offering.offering_status,

          schedule_days: offering.schedule_days || null,

          schedule_time: offering.schedule_time || null,
        },

        section: {
          section_id: Number(offering.section_id),

          section_name: offering.section_name,

          year_level:
            offering.year_level !== null && offering.year_level !== undefined
              ? Number(offering.year_level)
              : null,
        },

        section_subject: {
          section_subject_id: Number(offering.section_subject_id),

          status: offering.section_subject_status,
        },

        faculty: {
          faculty_id: offering.faculty_id ? Number(offering.faculty_id) : null,

          faculty_name: offering.faculty_name || null,
        },

        room: {
          room_id: offering.room_id ? Number(offering.room_id) : null,

          room_name: offering.room_name || null,
        },
      },

      capacity: {
        max_students: maxStudents,

        enrolled_count_after_assignment: enrolledCount + 1,

        available_slots_after_assignment: Math.max(
          maxStudents - (enrolledCount + 1),
          0,
        ),
      },

      change: {
        change_type: "CHANGE",

        old: oldValues,

        new: newValues,

        reason: cleanReason,

        changed_by: actor.user_id,
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
        console.error("ASSIGN SUBJECT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("ASSIGN SUBJECT OFFERING ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to assign subject offering and section.",

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
// ROUTE 10
// ADD SUBJECT TO ENROLLMENT
//
// POST /api/registrar/enrollments/:id/subjects
//
// Body:
// {
//   "offering_id": 15,
//   "reason": "Registrar added subject"
// }
//
// Allowed enrollment statuses:
// - Pending
// - Approved
//
// Important:
// - Frontend sends only offering_id.
// - Backend derives:
//      subject_id
//      section_id
//      section_subject_id
// - Student cannot choose these.
// - Registrar actor comes from JWT.
// =====================================================

router.post("/:id/subjects", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // VALIDATE ENROLLMENT ID
  // =================================================

  const enrollmentId = toPositiveInt(req.params.id);

  if (!enrollmentId) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment ID.",
    });
  }

  // =================================================
  // VALIDATE BODY
  // =================================================

  const offeringId = toPositiveInt(req.body?.offering_id);

  if (!offeringId) {
    return res.status(400).json({
      success: false,
      message: "A valid offering_id is required.",
    });
  }

  const cleanReason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "Registrar added subject";

  let connection;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

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

              s.student_number,
              s.first_name,
              s.middle_name,
              s.last_name,
              s.course_id,

              c.course_code,
              c.course_name

          FROM enrollments e

          INNER JOIN students s
              ON s.student_id =
                 e.student_id

          LEFT JOIN courses c
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

      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    const enrollment = enrollmentRows[0];

    // =================================================
    // ENROLLMENT STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject cannot be added because enrollment status is '${enrollment.enrollment_status}'.`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    const studentCourseId = toPositiveInt(enrollment.course_id);

    if (!studentCourseId) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Student does not have a valid course assignment.",
      });
    }

    // =================================================
    // GET OFFERING
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

              ss.status
                  AS section_subject_status,

              sub.subject_code,
              sub.subject_name,
              sub.units,

              sub.lecture_hours,
              sub.laboratory_hours,

              sec.section_name,
              sec.year_level,

              sec.course_id
                  AS section_course_id,

              course.course_code
                  AS section_course_code,

              course.course_name
                  AS section_course_name,

              f.faculty_id,

              TRIM(
                CONCAT_WS(
                  ' ',
                  f.first_name,
                  NULLIF(
                    f.middle_name,
                    ''
                  ),
                  f.last_name
                )
              ) AS faculty_name,

              r.room_id,
              r.room_name

          FROM subject_offerings so

          INNER JOIN section_subjects ss
              ON ss.section_subject_id =
                 so.section_subject_id

          INNER JOIN subjects sub
              ON sub.subject_id =
                 so.subject_id

          INNER JOIN sections sec
              ON sec.section_id =
                 so.section_id

          LEFT JOIN courses course
              ON course.course_id =
                 sec.course_id

          LEFT JOIN faculty f
              ON f.faculty_id =
                 so.faculty_id

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

      return res.status(404).json({
        success: false,
        message: "Subject offering not found.",
      });
    }

    const offering = offeringRows[0];

    // =================================================
    // OFFERING MUST BE OPEN
    // =================================================

    if (offering.offering_status !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject offering is '${offering.offering_status}'.`,
      });
    }

    // =================================================
    // SECTION SUBJECT MUST BE OPEN
    // =================================================

    if (offering.section_subject_status !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Section subject is '${offering.section_subject_status}'.`,
      });
    }

    // =================================================
    // OFFERING MUST BE READY FOR ENROLLMENT
    //
    // Defense-in-depth:
    //
    // Route 11 only displays READY offerings,
    // but Route 10 must independently validate
    // the offering because the frontend can never
    // be trusted as authorization.
    //
    // Required:
    // - Faculty
    // - Schedule days
    // - Schedule time
    // - Positive capacity
    //
    // Room is intentionally OPTIONAL.
    // =================================================

    const missingOfferingConfiguration = [];

    if (!offering.faculty_id) {
      missingOfferingConfiguration.push("faculty_id");
    }

    if (!offering.schedule_days || !String(offering.schedule_days).trim()) {
      missingOfferingConfiguration.push("schedule_days");
    }

    if (!offering.schedule_time || !String(offering.schedule_time).trim()) {
      missingOfferingConfiguration.push("schedule_time");
    }

    const maxStudents = Number(offering.max_students || 0);

    if (maxStudents <= 0) {
      missingOfferingConfiguration.push("max_students");
    }

    if (missingOfferingConfiguration.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        code: "OFFERING_INCOMPLETE",

        message:
          "The selected offering is incomplete and is not ready for enrollment.",

        missing_configuration: missingOfferingConfiguration,
      });
    }
    // =================================================
    // SAME ACADEMIC YEAR
    // =================================================

    if (
      Number(offering.academic_year_id) !== Number(enrollment.academic_year_id)
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Subject offering does not belong to the enrollment academic year.",
      });
    }

    // =================================================
    // SAME SEMESTER
    // =================================================

    if (Number(offering.semester_id) !== Number(enrollment.semester_id)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Subject offering does not belong to the enrollment semester.",
      });
    }

    // =================================================
    // SAME COURSE
    //
    // Prevent:
    // BSA student -> BSIT section
    // BSIT student -> BSA section
    // =================================================

    if (Number(offering.section_course_id) !== studentCourseId) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "The selected section does not belong to the student's course.",

        student_course: {
          course_id: studentCourseId,

          course_code: enrollment.course_code,
        },

        selected_section_course: {
          course_id: offering.section_course_id
            ? Number(offering.section_course_id)
            : null,

          course_code: offering.section_course_code || null,
        },
      });
    }

    // =================================================
    // VERIFY SECTION SUBJECT RELATIONSHIP
    // =================================================

    const [sectionSubjectRows] = await connection.execute(
      `
          SELECT
              section_subject_id,
              section_id,
              subject_id,
              academic_year_id,
              semester_id,
              status

          FROM section_subjects

          WHERE section_subject_id = ?

            AND section_id = ?

            AND subject_id = ?

            AND academic_year_id = ?

            AND semester_id = ?

          LIMIT 1

          FOR UPDATE
          `,
      [
        offering.section_subject_id,
        offering.section_id,
        offering.subject_id,
        offering.academic_year_id,
        offering.semester_id,
      ],
    );

    if (sectionSubjectRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Offering has an invalid section-subject relationship.",
      });
    }

    // =================================================
    // PREVENT DUPLICATE ACTIVE SUBJECT
    // =================================================

    const [duplicateRows] = await connection.execute(
      `
          SELECT
              enrollment_subject_id,
              offering_id,
              section_id,
              section_subject_id,
              status

          FROM enrollment_subjects

          WHERE enrollment_id = ?
            AND subject_id = ?

            AND status IN (
              'Enrolled',
              'Completed'
            )

          LIMIT 1

          FOR UPDATE
          `,
      [enrollmentId, offering.subject_id],
    );

    if (duplicateRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "This subject is already part of the enrollment.",

        existing_subject: {
          enrollment_subject_id: Number(duplicateRows[0].enrollment_subject_id),

          status: duplicateRows[0].status,
        },
      });
    }

    const [capacityRows] = await connection.execute(
      `
          SELECT
              COUNT(*) AS enrolled_count

          FROM enrollment_subjects es

          INNER JOIN enrollments e
              ON e.enrollment_id =
                es.enrollment_id

          WHERE es.offering_id = ?

            AND es.status =
                'Enrolled'

            AND e.enrollment_status
                IN (
                  'Pending',
                  'Approved'
                )
          `,
      [offeringId],
    );

    const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

    if (enrolledCount >= maxStudents) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Subject offering is already full.",

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots: 0,
        },
      });
    }

    // =================================================
    // INSERT ENROLLMENT SUBJECT
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
        offering.subject_id,

        offering.offering_id,
        offering.section_id,
        offering.section_subject_id,
      ],
    );

    const enrollmentSubjectId = Number(insertResult.insertId);

    // =================================================
    // RECORD ADD HISTORY
    //
    // IMPORTANT:
    // This MUST be ADD.
    // Not DROP.
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
        enrollmentSubjectId,
        offering.subject_id,

        offering.offering_id,
        offering.section_id,
        offering.section_subject_id,

        cleanReason,
        actor.user_id,
      ],
    );

    // =================================================
    // AUDIT TRAIL
    // =================================================

    const newValues = {
      enrollment_id: enrollmentId,

      subject_id: Number(offering.subject_id),

      offering_id: Number(offering.offering_id),

      section_id: Number(offering.section_id),

      section_subject_id: Number(offering.section_subject_id),

      status: "Enrolled",
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
        actor.user_id,
        enrollmentSubjectId,

        JSON.stringify(null),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(201).json({
      success: true,

      message: "Subject added to enrollment successfully.",

      enrollment: {
        enrollment_id: enrollmentId,

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
          course_id: studentCourseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,
        },
      },

      enrollment_subject: {
        enrollment_subject_id: enrollmentSubjectId,

        enrollment_id: enrollmentId,

        subject: {
          subject_id: Number(offering.subject_id),

          subject_code: offering.subject_code,

          subject_name: offering.subject_name,

          units: Number(offering.units || 0),

          lecture_hours:
            offering.lecture_hours !== null &&
            offering.lecture_hours !== undefined
              ? Number(offering.lecture_hours)
              : null,

          laboratory_hours:
            offering.laboratory_hours !== null &&
            offering.laboratory_hours !== undefined
              ? Number(offering.laboratory_hours)
              : null,
        },

        status: "Enrolled",

        academic_eligibility: {
          eligible: true,

          attempt_type: academicEligibility.attempt_type,

          is_retake: academicEligibility.is_retake,

          previous_grade: academicEligibility.previous_grade,

          prerequisite_policy: academicEligibility.prerequisite_policy,

          prerequisites: academicEligibility.prerequisites,
        },

        offering: {
          offering_id: Number(offering.offering_id),

          status: offering.offering_status,

          schedule_days: offering.schedule_days || null,

          schedule_time: offering.schedule_time || null,
        },

        offering: {
          offering_id: Number(offering.offering_id),

          status: offering.offering_status,

          schedule_days: offering.schedule_days || null,

          schedule_time: offering.schedule_time || null,
        },

        section: {
          section_id: Number(offering.section_id),

          section_name: offering.section_name,

          year_level:
            offering.year_level !== null && offering.year_level !== undefined
              ? Number(offering.year_level)
              : null,
        },

        section_subject: {
          section_subject_id: Number(offering.section_subject_id),

          status: offering.section_subject_status,
        },

        faculty: {
          faculty_id: offering.faculty_id ? Number(offering.faculty_id) : null,

          faculty_name: offering.faculty_name || null,
        },

        room: {
          room_id: offering.room_id ? Number(offering.room_id) : null,

          room_name: offering.room_name || null,
        },
      },

      capacity: {
        max_students: maxStudents,

        enrolled_count_after_add: enrolledCount + 1,

        available_slots_after_add: Math.max(
          maxStudents - (enrolledCount + 1),
          0,
        ),
      },

      history: {
        change_type: "ADD",

        reason: cleanReason,

        changed_by: actor.user_id,
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
        console.error("ADD SUBJECT ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("ADD SUBJECT ERROR:", error);

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
// ROUTE 11
// GET SUBJECTS AVAILABLE FOR ADDITION
//
// GET
// /api/registrar/enrollments/:id/available-subjects
//
// Purpose:
// - Used before POST /:id/subjects
// - Shows subjects Registrar may add
// - Groups available offerings by subject
//
// Structural rules:
// - Enrollment must be Pending or Approved
// - Same academic year
// - Same semester
// - Same student course
// - Section subject must be Open
// - Subject offering must be Open
// - Offering must have available capacity
// - Subject must not already be Enrolled/Completed
//
// IMPORTANT:
// This route determines structural availability.
// Academic eligibility such as prerequisites and
// retake eligibility will be handled by the dedicated
// academic validation services.
// =====================================================

router.get("/:id/available-subjects", async (req, res) => {
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
    // STATUS
    //
    // Same rule as Route 10.
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      return res.status(409).json({
        success: false,

        message: `Subjects cannot be added while enrollment status is '${enrollment.enrollment_status}'.`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // COURSE
    // =================================================

    const courseId = toPositiveInt(enrollment.course_id);

    if (!courseId) {
      return res.status(409).json({
        success: false,

        message: "Student does not have a valid course assignment.",
      });
    }

    // =================================================
    // GET STRUCTURALLY AVAILABLE OFFERINGS
    //
    // One subject may have many offerings/sections.
    // We retrieve each valid offering first, then
    // group them by subject.
    // =================================================

    const [rows] = await connection.execute(
      `
          SELECT
              -- =========================================
              -- SUBJECT
              -- =========================================

              sub.subject_id,
              sub.subject_code,
              sub.subject_name,
              sub.units,

              sub.lecture_hours,
              sub.laboratory_hours,

              -- =========================================
              -- OFFERING
              -- =========================================

              so.offering_id,

              so.academic_year_id,
              so.semester_id,

              so.schedule_days,
              so.schedule_time,

              so.max_students,

              so.status
                  AS offering_status,

              -- =========================================
              -- SECTION SUBJECT
              -- =========================================

              ss.section_subject_id,

              ss.status
                  AS section_subject_status,

              -- =========================================
              -- SECTION
              -- =========================================

              sec.section_id,
              sec.section_name,
              sec.year_level,

              sec.course_id
                  AS section_course_id,

              -- =========================================
              -- COURSE
              -- =========================================

              section_course.course_code
                  AS section_course_code,

              section_course.course_name
                  AS section_course_name,

              -- =========================================
              -- FACULTY
              -- =========================================

              so.faculty_id,

              TRIM(
                CONCAT_WS(
                  ' ',
                  f.first_name,
                  NULLIF(
                    f.middle_name,
                    ''
                  ),
                  f.last_name
                )
              ) AS faculty_name,

              -- =========================================
              -- ROOM
              -- =========================================

              so.room_id,
              r.room_name,

              -- =========================================
              -- CURRENT CAPACITY
              -- =========================================

              (
                SELECT
                    COUNT(*)

                FROM enrollment_subjects es_count

                INNER JOIN enrollments e_count
                    ON e_count.enrollment_id =
                       es_count.enrollment_id

                WHERE es_count.offering_id =
                      so.offering_id

                  AND es_count.status =
                      'Enrolled'

                  AND e_count.enrollment_status
                      IN (
                        'Pending',
                        'Approved'
                      )
              ) AS enrolled_count

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

          LEFT JOIN courses section_course
              ON section_course.course_id =
                 sec.course_id

          LEFT JOIN faculty f
              ON f.faculty_id =
                 so.faculty_id

          LEFT JOIN rooms r
              ON r.room_id =
                 so.room_id

          WHERE
              -- =========================================
              -- SAME ACADEMIC YEAR
              -- =========================================

              so.academic_year_id = ?

              -- =========================================
              -- SAME SEMESTER
              -- =========================================

              AND so.semester_id = ?

              -- =========================================
              -- SAME COURSE
              -- =========================================

              AND sec.course_id = ?

              -- =========================================
              -- OFFERING MUST BE OPEN
              -- =========================================

           AND so.status = 'Open'

AND ss.status = 'Open'

-- ===========================================
-- OFFERING MUST BE READY FOR ENROLLMENT
--
-- Room is intentionally optional.
-- ===========================================

AND so.faculty_id IS NOT NULL

AND so.schedule_days IS NOT NULL
AND TRIM(so.schedule_days) <> ''

AND so.schedule_time IS NOT NULL
AND TRIM(so.schedule_time) <> ''

              -- =========================================
              -- VERIFY OFFERING / SECTION SUBJECT MATCH
              -- =========================================

              AND ss.subject_id =
                  so.subject_id

              AND ss.section_id =
                  so.section_id

              AND ss.academic_year_id =
                  so.academic_year_id

              AND ss.semester_id =
                  so.semester_id

              -- =========================================
              -- CAPACITY MUST EXIST
              -- =========================================

              AND so.max_students > 0

              -- =========================================
              -- SUBJECT MUST NOT ALREADY BE ACTIVE
              --
              -- Match Route 10 duplicate validation.
              -- =========================================

              AND NOT EXISTS (
                  SELECT 1

                  FROM enrollment_subjects existing_es

                  WHERE existing_es.enrollment_id = ?

                    AND existing_es.subject_id =
                        so.subject_id

                    AND existing_es.status
                        IN (
                          'Enrolled',
                          'Completed'
                        )
              )

          ORDER BY
              sub.subject_code ASC,
              sec.section_name ASC,
              so.schedule_days ASC,
              so.schedule_time ASC
          `,
      [
        enrollment.academic_year_id,
        enrollment.semester_id,
        courseId,
        enrollmentId,
      ],
    );

    // =================================================
    // GROUP OFFERINGS BY SUBJECT
    // =================================================

    const subjectMap = new Map();

    for (const row of rows) {
      const subjectId = Number(row.subject_id);

      const maxStudents = Number(row.max_students || 0);

      const enrolledCount = Number(row.enrolled_count || 0);

      const availableSlots = Math.max(maxStudents - enrolledCount, 0);

      // ===============================================
      // DO NOT RETURN FULL OFFERINGS
      // ===============================================

      if (availableSlots <= 0) {
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

          lecture_hours:
            row.lecture_hours !== null && row.lecture_hours !== undefined
              ? Number(row.lecture_hours)
              : null,

          laboratory_hours:
            row.laboratory_hours !== null && row.laboratory_hours !== undefined
              ? Number(row.laboratory_hours)
              : null,

          offering_count: 0,

          available_offerings: [],
        });
      }

      const subject = subjectMap.get(subjectId);

      // ===============================================
      // ADD OFFERING
      // ===============================================

      subject.available_offerings.push({
        offering_id: Number(row.offering_id),

        offering_status: row.offering_status,

        section: {
          section_id: Number(row.section_id),

          section_name: row.section_name,

          year_level:
            row.year_level !== null && row.year_level !== undefined
              ? Number(row.year_level)
              : null,

          course_id: row.section_course_id
            ? Number(row.section_course_id)
            : null,

          course_code: row.section_course_code || null,

          course_name: row.section_course_name || null,
        },

        section_subject: {
          section_subject_id: Number(row.section_subject_id),

          status: row.section_subject_status,
        },

        faculty: {
          faculty_id: row.faculty_id ? Number(row.faculty_id) : null,

          faculty_name: row.faculty_name || null,
        },

        room: {
          room_id: row.room_id ? Number(row.room_id) : null,

          room_name: row.room_name || null,
        },

        schedule: {
          days: row.schedule_days || null,

          time: row.schedule_time || null,
        },

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots: availableSlots,

          is_full: false,
        },

        academic_year_id: Number(row.academic_year_id),

        semester_id: Number(row.semester_id),
      });

      subject.offering_count = subject.available_offerings.length;
    }

    // =================================================
    // CONVERT STRUCTURAL RESULTS
    // =================================================

    const structurallyAvailableSubjects = Array.from(subjectMap.values());

    // =================================================
    // APPLY ACADEMIC ELIGIBILITY
    //
    // A subject is returned to the Registrar only when:
    //
    // STRUCTURAL ELIGIBILITY
    // +
    // ACADEMIC ELIGIBILITY
    //
    // Academic rules:
    //
    // - Already passed 1.00-3.00
    //     -> BLOCK
    //
    // - Regular/new subject
    //     -> prerequisites required
    //
    // - Approved 4.00 / 5.00
    //     -> valid Retake
    //
    // - Valid Retake
    //     -> missing legacy prerequisite history
    //        does not block the retake
    //
    // IMPORTANT:
    // This uses the reusable
    // evaluateStudentSubjectEligibility()
    // helper.
    //
    // =================================================

    const availableSubjects = [];

    const academicallyIneligibleSubjects = [];

    for (const subject of structurallyAvailableSubjects) {
      const academicEligibility = await evaluateStudentSubjectEligibility(
        connection,
        {
          studentId: Number(enrollment.student_id),

          subjectId: Number(subject.subject_id),
        },
      );

      // ===============================================
      // NOT ACADEMICALLY ELIGIBLE
      //
      // Do NOT expose it as an available subject.
      // Keep internal response information so the
      // Registrar UI can later explain why it was
      // excluded if we choose to display that.
      // ===============================================

      if (!academicEligibility.eligible) {
        academicallyIneligibleSubjects.push({
          subject_id: Number(subject.subject_id),

          subject_code: subject.subject_code,

          subject_name: subject.subject_name,

          attempt_type: academicEligibility.attempt_type,

          is_retake: academicEligibility.is_retake,

          previous_grade: academicEligibility.previous_grade,

          prerequisite_policy: academicEligibility.prerequisite_policy,

          prerequisites: academicEligibility.prerequisites,

          errors: academicEligibility.errors,
        });

        continue;
      }

      // ===============================================
      // ELIGIBLE
      //
      // Add academic information to subject so the
      // frontend knows whether this is:
      //
      // Regular
      // or
      // Retake
      // ===============================================

      availableSubjects.push({
        ...subject,

        academic_eligibility: {
          eligible: true,

          attempt_type: academicEligibility.attempt_type,

          is_retake: academicEligibility.is_retake,

          previous_grade: academicEligibility.previous_grade,

          prerequisite_policy: academicEligibility.prerequisite_policy,

          prerequisites: academicEligibility.prerequisites,
        },
      });
    }

    // =================================================
    // COUNT TOTAL AVAILABLE OFFERINGS
    // =================================================

    const totalOfferings = availableSubjects.reduce(
      (total, subject) => total + Number(subject.offering_count || 0),

      0,
    );
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

        year_level:
          enrollment.year_level !== null && enrollment.year_level !== undefined
            ? Number(enrollment.year_level)
            : null,

        course: {
          course_id: courseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,
        },

        academic_period: {
          academic_year_id: Number(enrollment.academic_year_id),

          academic_year: enrollment.academic_year,

          semester_id: Number(enrollment.semester_id),

          semester_name: enrollment.semester_name,
        },

        enrollment_status: enrollment.enrollment_status,
      },

      total_subjects: availableSubjects.length,

      total_offerings: totalOfferings,

      academic_summary: {
        structurally_available_subjects: structurallyAvailableSubjects.length,

        academically_eligible_subjects: availableSubjects.length,

        academically_ineligible_subjects: academicallyIneligibleSubjects.length,
      },

      subjects: availableSubjects,

      academically_ineligible_subjects: academicallyIneligibleSubjects,

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("GET AVAILABLE SUBJECTS ERROR:", error);

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
// Body:
// {
//   "reason": "Registrar dropped subject for correction."
// }
//
// Allowed enrollment statuses:
// - Pending
// - Approved
//
// Important:
// - Does NOT DELETE enrollment_subjects row
// - Changes status to Dropped
// - Preserves old offering/section information
// - Records DROP history
// - Records audit trail
// - Registrar actor comes from JWT
// =====================================================

router.patch("/:id/subjects/:enrollmentSubjectId/drop", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // VALIDATE IDS
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
  // REASON
  // =================================================

  const dropReason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "Registrar dropped subject";

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // START TRANSACTION
    // =================================================

    await connection.beginTransaction();

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

    // =================================================
    // ENROLLMENT NOT FOUND
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
    // ENROLLMENT STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject cannot be dropped because enrollment status is '${enrollment.enrollment_status}'.`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // GET ENROLLMENT SUBJECT
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

    // =================================================
    // SUBJECT NOT FOUND
    // =================================================

    if (subjectRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,

        message: "Enrollment subject not found.",
      });
    }

    const subject = subjectRows[0];

    // =================================================
    // SUBJECT MUST CURRENTLY BE ENROLLED
    // =================================================

    if (subject.status !== "Enrolled") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject cannot be dropped because its current status is '${subject.status}'.`,
      });
    }

    // =================================================
    // SAVE OLD VALUES
    // =================================================

    const oldValues = {
      subject_id: Number(subject.subject_id),

      offering_id: subject.offering_id ? Number(subject.offering_id) : null,

      section_id: subject.section_id ? Number(subject.section_id) : null,

      section_subject_id: subject.section_subject_id
        ? Number(subject.section_subject_id)
        : null,

      status: subject.status,
    };

    // =================================================
    // NEW VALUES
    //
    // We keep the assignment IDs for historical
    // reference. Only status changes to Dropped.
    // =================================================

    const newValues = {
      subject_id: Number(subject.subject_id),

      offering_id: oldValues.offering_id,

      section_id: oldValues.section_id,

      section_subject_id: oldValues.section_subject_id,

      status: "Dropped",
    };

    // =================================================
    // DROP SUBJECT
    // =================================================

    const [updateResult] = await connection.execute(
      `
          UPDATE enrollment_subjects

          SET status = 'Dropped'

          WHERE enrollment_subject_id = ?

            AND enrollment_id = ?

            AND status = 'Enrolled'
          `,
      [enrollmentSubjectId, enrollmentId],
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Enrollment subject could not be dropped.",
      });
    }

    // =================================================
    // RECORD DROP HISTORY
    //
    // Current DB change_type supports:
    // ADD
    // DROP
    // REMOVE
    // CHANGE
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
        subject.subject_id,

        oldValues.offering_id,
        oldValues.section_id,
        oldValues.section_subject_id,

        dropReason,

        actor.user_id,
      ],
    );

    // =================================================
    // AUDIT TRAIL
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
        actor.user_id,

        enrollmentSubjectId,

        JSON.stringify(oldValues),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // SUCCESS
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
      },

      enrollment_subject: {
        enrollment_subject_id: Number(subject.enrollment_subject_id),

        enrollment_id: Number(subject.enrollment_id),

        subject_id: Number(subject.subject_id),

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        status: "Dropped",

        previous_status: subject.status,

        offering_id: oldValues.offering_id,

        section_id: oldValues.section_id,

        section_name: subject.section_name || null,

        section_subject_id: oldValues.section_subject_id,

        schedule_days: subject.schedule_days || null,

        schedule_time: subject.schedule_time || null,

        faculty_id: subject.faculty_id ? Number(subject.faculty_id) : null,

        room_id: subject.room_id ? Number(subject.room_id) : null,
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

        changed_by: actor.user_id,
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
// ROUTE 13
// VALIDATE ENROLLMENT BEFORE APPROVAL
//
// GET
// /api/registrar/enrollments/:id/validate
//
// Purpose:
// - Final structural + academic validation before approval
// - Does NOT modify the enrollment
//
// Checks:
// 1. Enrollment exists
// 2. Enrollment status is Pending
// 3. Student has a valid course
// 4. At least one active Enrolled subject exists
// 5. No duplicate active subjects
//
// STRUCTURAL:
// 6. Every active subject has:
//      offering_id
//      section_id
//      section_subject_id
// 7. Offering exists
// 8. Offering subject matches enrollment subject
// 9. Offering section matches enrollment subject
// 10. Section-subject relationship matches
// 11. Same academic year
// 12. Same semester
// 13. Same student course
//
// READY:
// 14. Section subject is Open
// 15. Offering is Open
// 16. Faculty is assigned
// 17. Schedule days exist
// 18. Schedule time exists
// 19. Positive capacity
// 20. Offering is not over capacity
// 21. Room is OPTIONAL
//
// ACADEMIC:
// 22. Approved 1.00 - 3.00 means already passed
// 23. Regular subjects must satisfy prerequisites
// 24. Approved 4.00 / 5.00 means valid Retake
// 25. Valid Retakes bypass missing prerequisite history
//
// IMPORTANT:
// - Dropped subjects are ignored.
// - This route performs no UPDATE.
// - Approval Route 14 repeats critical checks
//   inside its own transaction.
// =====================================================

router.get("/:id/validate", async (req, res) => {
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
    // VALIDATION RESULTS
    // =================================================

    const errors = [];
    const warnings = [];

    // =================================================
    // STATUS CHECK
    // =================================================

    if (enrollment.enrollment_status !== "Pending") {
      errors.push({
        code: "INVALID_ENROLLMENT_STATUS",

        message: `Enrollment must be Pending before approval. Current status is '${enrollment.enrollment_status}'.`,
      });
    }

    // =================================================
    // COURSE CHECK
    // =================================================

    const studentCourseId = toPositiveInt(enrollment.course_id);

    if (!studentCourseId) {
      errors.push({
        code: "STUDENT_COURSE_MISSING",

        message: "Student does not have a valid course assignment.",
      });
    }

    // =================================================
    // GET ACTIVE SUBJECTS
    //
    // Only Enrolled subjects participate in the
    // current enrollment.
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

              -- =========================================
              -- OFFERING
              -- =========================================

              so.subject_id
                  AS offering_subject_id,

              so.section_id
                  AS offering_section_id,

              so.section_subject_id
                  AS offering_section_subject_id,

              so.academic_year_id
                  AS offering_academic_year_id,

              so.semester_id
                  AS offering_semester_id,

              so.faculty_id,

              so.max_students,

              so.status
                  AS offering_status,

              so.schedule_days,
              so.schedule_time,

              -- =========================================
              -- SECTION SUBJECT
              -- =========================================

              ss.subject_id
                  AS ss_subject_id,

              ss.section_id
                  AS ss_section_id,

              ss.academic_year_id
                  AS ss_academic_year_id,

              ss.semester_id
                  AS ss_semester_id,

              ss.status
                  AS section_subject_status,

              -- =========================================
              -- SECTION
              -- =========================================

              sec.section_name,

              sec.course_id
                  AS section_course_id,

              course.course_code
                  AS section_course_code,

              -- =========================================
              -- CURRENT CAPACITY
              -- =========================================

              (
                SELECT
                    COUNT(*)

                FROM enrollment_subjects es_count

                INNER JOIN enrollments e_count
                    ON e_count.enrollment_id =
                       es_count.enrollment_id

                WHERE es_count.offering_id =
                      es.offering_id

                  AND es_count.status =
                      'Enrolled'

                  AND e_count.enrollment_status
                      IN (
                        'Pending',
                        'Approved'
                      )
              ) AS enrolled_count

          FROM enrollment_subjects es

          INNER JOIN subjects sub
              ON sub.subject_id =
                 es.subject_id

          LEFT JOIN subject_offerings so
              ON so.offering_id =
                 es.offering_id

          LEFT JOIN section_subjects ss
              ON ss.section_subject_id =
                 es.section_subject_id

          LEFT JOIN sections sec
              ON sec.section_id =
                 es.section_id

          LEFT JOIN courses course
              ON course.course_id =
                 sec.course_id

          WHERE es.enrollment_id = ?

            AND es.status =
                'Enrolled'

          ORDER BY
              sub.subject_code ASC,
              es.enrollment_subject_id ASC
        `,
      [enrollmentId],
    );

    // =================================================
    // MUST HAVE SUBJECTS
    // =================================================

    if (subjectRows.length === 0) {
      errors.push({
        code: "NO_ENROLLED_SUBJECTS",

        message:
          "Enrollment cannot be approved because it has no active enrolled subjects.",
      });
    }

    // =================================================
    // DUPLICATE SUBJECT CHECK
    // =================================================

    const subjectOccurrences = new Map();

    for (const subject of subjectRows) {
      const subjectId = Number(subject.subject_id);

      const currentCount = subjectOccurrences.get(subjectId) || 0;

      subjectOccurrences.set(subjectId, currentCount + 1);
    }

    for (const [subjectId, count] of subjectOccurrences) {
      if (count > 1) {
        const duplicate = subjectRows.find(
          (subject) => Number(subject.subject_id) === subjectId,
        );

        errors.push({
          code: "DUPLICATE_ACTIVE_SUBJECT",

          message: `Subject '${duplicate?.subject_code || subjectId}' appears more than once as an active enrolled subject.`,

          subject_id: subjectId,

          occurrences: count,
        });
      }
    }

    // =================================================
    // VALIDATE EACH SUBJECT
    // =================================================

    const subjects = [];

    for (const subject of subjectRows) {
      const subjectErrors = [];

      const subjectId = Number(subject.subject_id);

      // ===============================================
      // ASSIGNMENT IDS
      // ===============================================

      if (!subject.offering_id) {
        subjectErrors.push({
          code: "OFFERING_NOT_ASSIGNED",

          message: "Subject does not have an offering assignment.",
        });
      }

      if (!subject.section_id) {
        subjectErrors.push({
          code: "SECTION_NOT_ASSIGNED",

          message: "Subject does not have a section assignment.",
        });
      }

      if (!subject.section_subject_id) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_NOT_ASSIGNED",

          message: "Subject does not have a section-subject assignment.",
        });
      }

      // ===============================================
      // OFFERING EXISTS
      // ===============================================

      if (subject.offering_id && !subject.offering_subject_id) {
        subjectErrors.push({
          code: "OFFERING_NOT_FOUND",

          message: "Assigned subject offering no longer exists.",
        });
      }

      // ===============================================
      // SAME SUBJECT
      // ===============================================

      if (
        subject.offering_subject_id &&
        Number(subject.offering_subject_id) !== subjectId
      ) {
        subjectErrors.push({
          code: "OFFERING_SUBJECT_MISMATCH",

          message: "Assigned offering belongs to a different subject.",
        });
      }

      // ===============================================
      // SAME SECTION
      // ===============================================

      if (
        subject.offering_section_id &&
        subject.section_id &&
        Number(subject.offering_section_id) !== Number(subject.section_id)
      ) {
        subjectErrors.push({
          code: "OFFERING_SECTION_MISMATCH",

          message:
            "Assigned offering and enrollment subject have different sections.",
        });
      }

      // ===============================================
      // SAME SECTION SUBJECT
      // ===============================================

      if (
        subject.offering_section_subject_id &&
        subject.section_subject_id &&
        Number(subject.offering_section_subject_id) !==
          Number(subject.section_subject_id)
      ) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_MISMATCH",

          message:
            "Assigned offering and enrollment subject have different section-subject records.",
        });
      }

      // ===============================================
      // SECTION SUBJECT DATA VALIDATION
      // ===============================================

      if (subject.section_subject_id && !subject.ss_subject_id) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_NOT_FOUND",

          message: "Assigned section-subject record no longer exists.",
        });
      }

      if (
        subject.ss_subject_id &&
        Number(subject.ss_subject_id) !== subjectId
      ) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_WRONG_SUBJECT",

          message: "Section-subject record belongs to a different subject.",
        });
      }

      if (
        subject.ss_section_id &&
        subject.section_id &&
        Number(subject.ss_section_id) !== Number(subject.section_id)
      ) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_WRONG_SECTION",

          message: "Section-subject record belongs to a different section.",
        });
      }

      // ===============================================
      // ACADEMIC YEAR
      // ===============================================

      if (
        subject.offering_academic_year_id &&
        Number(subject.offering_academic_year_id) !==
          Number(enrollment.academic_year_id)
      ) {
        subjectErrors.push({
          code: "OFFERING_ACADEMIC_YEAR_MISMATCH",

          message: "Offering belongs to a different academic year.",
        });
      }

      if (
        subject.ss_academic_year_id &&
        Number(subject.ss_academic_year_id) !==
          Number(enrollment.academic_year_id)
      ) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_ACADEMIC_YEAR_MISMATCH",

          message: "Section-subject belongs to a different academic year.",
        });
      }

      // ===============================================
      // SEMESTER
      // ===============================================

      if (
        subject.offering_semester_id &&
        Number(subject.offering_semester_id) !== Number(enrollment.semester_id)
      ) {
        subjectErrors.push({
          code: "OFFERING_SEMESTER_MISMATCH",

          message: "Offering belongs to a different semester.",
        });
      }

      if (
        subject.ss_semester_id &&
        Number(subject.ss_semester_id) !== Number(enrollment.semester_id)
      ) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_SEMESTER_MISMATCH",

          message: "Section-subject belongs to a different semester.",
        });
      }

      // ===============================================
      // SAME COURSE
      // ===============================================

      if (
        studentCourseId &&
        subject.section_course_id &&
        Number(subject.section_course_id) !== studentCourseId
      ) {
        subjectErrors.push({
          code: "SECTION_COURSE_MISMATCH",

          message: `Section '${subject.section_name || subject.section_id}' does not belong to the student's course.`,

          student_course_id: studentCourseId,

          section_course_id: Number(subject.section_course_id),
        });
      }

      // ===============================================
      // OPEN SECTION SUBJECT
      // ===============================================

      if (
        subject.section_subject_id &&
        subject.section_subject_status !== "Open"
      ) {
        subjectErrors.push({
          code: "SECTION_SUBJECT_NOT_OPEN",

          message: `Section-subject status is '${subject.section_subject_status || "Unknown"}'.`,
        });
      }

      // ===============================================
      // OPEN OFFERING
      // ===============================================

      if (subject.offering_id && subject.offering_status !== "Open") {
        subjectErrors.push({
          code: "OFFERING_NOT_OPEN",

          message: `Offering status is '${subject.offering_status || "Unknown"}'.`,
        });
      }

      // ===============================================
      // OFFERING READY FOR ENROLLMENT
      //
      // Required:
      // - faculty
      // - schedule days
      // - schedule time
      // - positive capacity
      //
      // Room is intentionally OPTIONAL.
      // ===============================================

      const maxStudents = Number(subject.max_students || 0);

      const enrolledCount = Number(subject.enrolled_count || 0);

      if (subject.offering_id) {
        const missingOfferingConfiguration = [];

        if (!subject.faculty_id) {
          missingOfferingConfiguration.push("faculty_id");
        }

        if (!subject.schedule_days || !String(subject.schedule_days).trim()) {
          missingOfferingConfiguration.push("schedule_days");
        }

        if (!subject.schedule_time || !String(subject.schedule_time).trim()) {
          missingOfferingConfiguration.push("schedule_time");
        }

        if (maxStudents <= 0) {
          missingOfferingConfiguration.push("max_students");
        }

        if (missingOfferingConfiguration.length > 0) {
          subjectErrors.push({
            code: "OFFERING_INCOMPLETE",

            message:
              "Assigned offering is incomplete and is not ready for enrollment approval.",

            missing_configuration: missingOfferingConfiguration,
          });
        }
      }

      // ===============================================
      // CAPACITY
      //
      // Pending enrollment is already counted.
      //
      // enrolled_count == max_students
      //     -> VALID
      //
      // enrolled_count > max_students
      //     -> INVALID
      // ===============================================

      if (
        subject.offering_id &&
        maxStudents > 0 &&
        enrolledCount > maxStudents
      ) {
        subjectErrors.push({
          code: "OFFERING_OVER_CAPACITY",

          message: "Offering has exceeded its maximum student capacity.",

          max_students: maxStudents,

          enrolled_count: enrolledCount,
        });
      }

      // ===============================================
      // ACADEMIC ELIGIBILITY
      //
      // IMPORTANT:
      //
      // This MUST happen INSIDE the subject loop
      // and BEFORE subjects.push().
      //
      // Approved 1.00 - 3.00
      //   -> already passed
      //   -> BLOCK
      //
      // Regular/new subject
      //   -> prerequisites required
      //
      // Approved 4.00 / 5.00
      //   -> valid Retake
      //
      // Valid Retake
      //   -> prerequisite history does not block
      //
      // Draft / Submitted / Returned grades
      //   -> ignored
      // ===============================================

      const academicEligibility = await evaluateStudentSubjectEligibility(
        connection,
        {
          studentId: Number(enrollment.student_id),

          subjectId: subjectId,
        },
      );

      // ===============================================
      // ADD ACADEMIC ERRORS
      // ===============================================

      if (!academicEligibility.eligible) {
        for (const academicIssue of academicEligibility.errors) {
          subjectErrors.push({
            ...academicIssue,

            category: "ACADEMIC",
          });
        }
      }

      // ===============================================
      // COPY SUBJECT ERRORS TO GLOBAL ERRORS
      // ===============================================

      for (const issue of subjectErrors) {
        errors.push({
          ...issue,

          enrollment_subject_id: Number(subject.enrollment_subject_id),

          subject_id: subjectId,

          subject_code: subject.subject_code,
        });
      }

      // ===============================================
      // SUBJECT VALIDATION RESULT
      // ===============================================

      subjects.push({
        enrollment_subject_id: Number(subject.enrollment_subject_id),

        subject_id: subjectId,

        subject_code: subject.subject_code,

        subject_name: subject.subject_name,

        units: Number(subject.units || 0),

        offering_id: subject.offering_id ? Number(subject.offering_id) : null,

        section_id: subject.section_id ? Number(subject.section_id) : null,

        section_name: subject.section_name || null,

        section_subject_id: subject.section_subject_id
          ? Number(subject.section_subject_id)
          : null,

        offering_status: subject.offering_status || null,

        section_subject_status: subject.section_subject_status || null,

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots:
            maxStudents > 0 ? Math.max(maxStudents - enrolledCount, 0) : 0,
        },

        academic_eligibility: {
          eligible: academicEligibility.eligible,

          attempt_type: academicEligibility.attempt_type,

          is_retake: academicEligibility.is_retake,

          previous_grade: academicEligibility.previous_grade,

          prerequisite_policy: academicEligibility.prerequisite_policy,

          prerequisites: academicEligibility.prerequisites,

          errors: academicEligibility.errors,
        },

        valid: subjectErrors.length === 0,

        errors: subjectErrors,
      });
    }

    // =================================================
    // TOTALS
    // =================================================

    const totalUnits = subjectRows.reduce(
      (total, subject) => total + Number(subject.units || 0),

      0,
    );

    // =================================================
    // OPTIONAL WARNING FOR OLD TEST DATA
    //
    // Pending enrollment should not already contain
    // approval metadata.
    // =================================================

    if (
      enrollment.enrollment_status === "Pending" &&
      (enrollment.approved_by || enrollment.approved_at)
    ) {
      warnings.push({
        code: "STALE_APPROVAL_METADATA",

        message:
          "Pending enrollment contains old approval metadata. The approval route should overwrite or normalize this metadata.",
      });
    }

    // =================================================
    // FINAL RESULT
    // =================================================

    const readyForApproval = errors.length === 0;

    return res.status(200).json({
      success: true,

      ready_for_approval: readyForApproval,

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
          course_id: studentCourseId,

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

      summary: {
        total_enrolled_subjects: subjectRows.length,

        total_units: totalUnits,

        valid_subjects: subjects.filter((subject) => subject.valid).length,

        invalid_subjects: subjects.filter((subject) => !subject.valid).length,

        error_count: errors.length,

        warning_count: warnings.length,
      },

      subjects,

      errors,

      warnings,

      actor: {
        user_id: actor.user_id,

        username: actor.username,
      },
    });
  } catch (error) {
    console.error("VALIDATE ENROLLMENT ERROR:", error);

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
// ROUTE 14
// APPROVE ENROLLMENT
//
// POST
// /api/registrar/enrollments/:id/approve
//
// Optional Body:
// {
//   "remarks": "Enrollment verified and approved."
// }
//
// Purpose:
// - Final approval of a Pending enrollment
//
// Rules:
// - Registrar comes from JWT
// - Never trust approved_by from frontend
// - Enrollment must be Pending
// - Student must have valid course
// - Must contain active Enrolled subjects
// - No duplicate active subjects
//
// STRUCTURAL:
// - Every subject must have:
//      offering_id
//      section_id
//      section_subject_id
// - Offering / section / section-subject must match
// - Same academic year
// - Same semester
// - Same student course
//
// READY:
// - Section subject must be Open
// - Offering must be Open
// - Faculty must be assigned
// - Schedule days must exist
// - Schedule time must exist
// - max_students must be positive
// - Offering must not be over capacity
// - Room is OPTIONAL
//
// ACADEMIC:
// - Only Approved final grades count
// - 1.00 - 3.00 = Passed -> cannot enroll again
// - 4.00 = Incomplete -> valid Retake
// - 5.00 = Failed -> valid Retake
// - Regular subjects must satisfy prerequisites
// - Valid Retakes are not blocked by missing
//   prerequisite history
//
// Writes:
// - enrollments.enrollment_status -> Approved
// - approved_by -> req.user.user_id
// - approved_at -> CURRENT_TIMESTAMP
// - audit_trail UPDATE
//
// Everything happens inside one transaction.
// =====================================================

router.post("/:id/approve", async (req, res) => {
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
  // OPTIONAL REMARKS
  // =================================================

  let approvalRemarks = null;

  if (typeof req.body?.remarks === "string") {
    const trimmed = req.body.remarks.trim();

    if (trimmed) {
      approvalRemarks = trimmed;
    }
  }

  let connection;

  try {
    connection = await db.getConnection();

    // =================================================
    // START TRANSACTION
    // =================================================

    await connection.beginTransaction();

    // =================================================
    // LOCK ENROLLMENT
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
    // ENROLLMENT NOT FOUND
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
    // MUST BE PENDING
    // =================================================

    if (enrollment.enrollment_status !== "Pending") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Enrollment cannot be approved because its current status is '${enrollment.enrollment_status}'.`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // STUDENT COURSE
    // =================================================

    const studentCourseId = toPositiveInt(enrollment.course_id);

    if (!studentCourseId) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Enrollment cannot be approved because the student does not have a valid course assignment.",
      });
    }

    // =================================================
    // GET + LOCK ACTIVE ENROLLMENT SUBJECTS
    // =================================================

    const [subjectRows] = await connection.execute(
      `
          SELECT
              es.enrollment_subject_id,
              es.enrollment_id,

              es.subject_id,

              es.offering_id
                  AS assigned_offering_id,

              es.section_id
                  AS assigned_section_id,

              es.section_subject_id
                  AS assigned_section_subject_id,

              es.status,

              sub.subject_code,
              sub.subject_name,
              sub.units,

              -- =========================================
              -- OFFERING
              -- =========================================

              so.offering_id
                  AS offering_exists_id,

              so.subject_id
                  AS offering_subject_id,

              so.section_id
                  AS offering_section_id,

              so.section_subject_id
                  AS offering_section_subject_id,

              so.academic_year_id
                  AS offering_academic_year_id,

              so.semester_id
                  AS offering_semester_id,

              -- =========================================
              -- READY CONFIGURATION
              -- =========================================

              so.faculty_id,

              so.schedule_days,
              so.schedule_time,

              so.max_students,

              so.status
                  AS offering_status,

              -- =========================================
              -- SECTION SUBJECT
              -- =========================================

              ss.section_subject_id
                  AS ss_exists_id,

              ss.subject_id
                  AS ss_subject_id,

              ss.section_id
                  AS ss_section_id,

              ss.academic_year_id
                  AS ss_academic_year_id,

              ss.semester_id
                  AS ss_semester_id,

              ss.status
                  AS section_subject_status,

              -- =========================================
              -- SECTION
              -- =========================================

              sec.section_id
                  AS section_exists_id,

              sec.section_name,

              sec.course_id
                  AS section_course_id,

              -- =========================================
              -- CURRENT CAPACITY
              -- =========================================

              (
                SELECT
                    COUNT(*)

                FROM enrollment_subjects es_count

                INNER JOIN enrollments e_count
                    ON e_count.enrollment_id =
                       es_count.enrollment_id

                WHERE es_count.offering_id =
                      es.offering_id

                  AND es_count.status =
                      'Enrolled'

                  AND e_count.enrollment_status
                      IN (
                        'Pending',
                        'Approved'
                      )
              ) AS enrolled_count

          FROM enrollment_subjects es

          INNER JOIN subjects sub
              ON sub.subject_id =
                 es.subject_id

          LEFT JOIN subject_offerings so
              ON so.offering_id =
                 es.offering_id

          LEFT JOIN section_subjects ss
              ON ss.section_subject_id =
                 es.section_subject_id

          LEFT JOIN sections sec
              ON sec.section_id =
                 es.section_id

          WHERE es.enrollment_id = ?

            AND es.status =
                'Enrolled'

          ORDER BY
              es.enrollment_subject_id ASC

          FOR UPDATE
        `,
      [enrollmentId],
    );

    // =================================================
    // MUST HAVE AT LEAST ONE ACTIVE SUBJECT
    // =================================================

    if (subjectRows.length === 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Enrollment cannot be approved because it has no active enrolled subjects.",
      });
    }

    // =================================================
    // VALIDATION ERRORS
    // =================================================

    const validationErrors = [];

    // =================================================
    // DUPLICATE ACTIVE SUBJECT CHECK
    // =================================================

    const subjectCounts = new Map();

    for (const subject of subjectRows) {
      const subjectId = Number(subject.subject_id);

      subjectCounts.set(subjectId, (subjectCounts.get(subjectId) || 0) + 1);
    }

    for (const [subjectId, count] of subjectCounts) {
      if (count > 1) {
        const duplicate = subjectRows.find(
          (subject) => Number(subject.subject_id) === subjectId,
        );

        validationErrors.push({
          code: "DUPLICATE_ACTIVE_SUBJECT",

          message: `Subject '${duplicate?.subject_code || subjectId}' appears more than once in the active enrollment.`,

          subject_id: subjectId,

          occurrences: count,
        });
      }
    }

    // =================================================
    // VALIDATE EVERY SUBJECT
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
      // ASSIGNMENTS REQUIRED
      // ===============================================

      if (!subject.assigned_offering_id) {
        addError(
          "OFFERING_NOT_ASSIGNED",
          "Subject does not have an offering assignment.",
        );
      }

      if (!subject.assigned_section_id) {
        addError(
          "SECTION_NOT_ASSIGNED",
          "Subject does not have a section assignment.",
        );
      }

      if (!subject.assigned_section_subject_id) {
        addError(
          "SECTION_SUBJECT_NOT_ASSIGNED",
          "Subject does not have a section-subject assignment.",
        );
      }

      // ===============================================
      // RELATED RECORDS MUST EXIST
      // ===============================================

      if (subject.assigned_offering_id && !subject.offering_exists_id) {
        addError(
          "OFFERING_NOT_FOUND",
          "Assigned subject offering does not exist.",
        );
      }

      if (subject.assigned_section_subject_id && !subject.ss_exists_id) {
        addError(
          "SECTION_SUBJECT_NOT_FOUND",
          "Assigned section-subject record does not exist.",
        );
      }

      if (subject.assigned_section_id && !subject.section_exists_id) {
        addError("SECTION_NOT_FOUND", "Assigned section does not exist.");
      }

      // ===============================================
      // OFFERING MUST MATCH SUBJECT
      // ===============================================

      if (
        subject.offering_subject_id &&
        Number(subject.offering_subject_id) !== subjectId
      ) {
        addError(
          "OFFERING_SUBJECT_MISMATCH",
          "Assigned offering belongs to a different subject.",
        );
      }

      // ===============================================
      // OFFERING MUST MATCH SECTION
      // ===============================================

      if (
        subject.offering_section_id &&
        subject.assigned_section_id &&
        Number(subject.offering_section_id) !==
          Number(subject.assigned_section_id)
      ) {
        addError(
          "OFFERING_SECTION_MISMATCH",
          "Assigned offering belongs to a different section.",
        );
      }

      // ===============================================
      // OFFERING MUST MATCH SECTION SUBJECT
      // ===============================================

      if (
        subject.offering_section_subject_id &&
        subject.assigned_section_subject_id &&
        Number(subject.offering_section_subject_id) !==
          Number(subject.assigned_section_subject_id)
      ) {
        addError(
          "OFFERING_SECTION_SUBJECT_MISMATCH",
          "Assigned offering belongs to a different section-subject record.",
        );
      }

      // ===============================================
      // SECTION SUBJECT -> SUBJECT
      // ===============================================

      if (
        subject.ss_subject_id &&
        Number(subject.ss_subject_id) !== subjectId
      ) {
        addError(
          "SECTION_SUBJECT_WRONG_SUBJECT",
          "Section-subject belongs to a different subject.",
        );
      }

      // ===============================================
      // SECTION SUBJECT -> SECTION
      // ===============================================

      if (
        subject.ss_section_id &&
        subject.assigned_section_id &&
        Number(subject.ss_section_id) !== Number(subject.assigned_section_id)
      ) {
        addError(
          "SECTION_SUBJECT_WRONG_SECTION",
          "Section-subject belongs to a different section.",
        );
      }

      // ===============================================
      // ACADEMIC YEAR
      // ===============================================

      if (
        subject.offering_academic_year_id &&
        Number(subject.offering_academic_year_id) !==
          Number(enrollment.academic_year_id)
      ) {
        addError(
          "OFFERING_ACADEMIC_YEAR_MISMATCH",
          "Offering belongs to a different academic year.",
        );
      }

      if (
        subject.ss_academic_year_id &&
        Number(subject.ss_academic_year_id) !==
          Number(enrollment.academic_year_id)
      ) {
        addError(
          "SECTION_SUBJECT_ACADEMIC_YEAR_MISMATCH",
          "Section-subject belongs to a different academic year.",
        );
      }

      // ===============================================
      // SEMESTER
      // ===============================================

      if (
        subject.offering_semester_id &&
        Number(subject.offering_semester_id) !== Number(enrollment.semester_id)
      ) {
        addError(
          "OFFERING_SEMESTER_MISMATCH",
          "Offering belongs to a different semester.",
        );
      }

      if (
        subject.ss_semester_id &&
        Number(subject.ss_semester_id) !== Number(enrollment.semester_id)
      ) {
        addError(
          "SECTION_SUBJECT_SEMESTER_MISMATCH",
          "Section-subject belongs to a different semester.",
        );
      }

      // ===============================================
      // COURSE
      // ===============================================

      if (
        subject.section_course_id &&
        Number(subject.section_course_id) !== studentCourseId
      ) {
        addError(
          "SECTION_COURSE_MISMATCH",

          "Assigned section does not belong to the student's course.",

          {
            student_course_id: studentCourseId,

            section_course_id: Number(subject.section_course_id),
          },
        );
      }

      // ===============================================
      // SECTION SUBJECT MUST BE OPEN
      // ===============================================

      if (
        subject.assigned_section_subject_id &&
        subject.section_subject_status !== "Open"
      ) {
        addError(
          "SECTION_SUBJECT_NOT_OPEN",

          `Section-subject status is '${subject.section_subject_status || "Unknown"}'.`,
        );
      }

      // ===============================================
      // OFFERING MUST BE OPEN
      // ===============================================

      if (subject.assigned_offering_id && subject.offering_status !== "Open") {
        addError(
          "OFFERING_NOT_OPEN",

          `Offering status is '${subject.offering_status || "Unknown"}'.`,
        );
      }

      // ===============================================
      // OFFERING MUST BE READY FOR ENROLLMENT
      //
      // Room is intentionally OPTIONAL.
      // ===============================================

      const maxStudents = Number(subject.max_students || 0);

      const enrolledCount = Number(subject.enrolled_count || 0);

      if (subject.assigned_offering_id) {
        const missingOfferingConfiguration = [];

        if (!subject.faculty_id) {
          missingOfferingConfiguration.push("faculty_id");
        }

        if (!subject.schedule_days || !String(subject.schedule_days).trim()) {
          missingOfferingConfiguration.push("schedule_days");
        }

        if (!subject.schedule_time || !String(subject.schedule_time).trim()) {
          missingOfferingConfiguration.push("schedule_time");
        }

        if (maxStudents <= 0) {
          missingOfferingConfiguration.push("max_students");
        }

        if (missingOfferingConfiguration.length > 0) {
          addError(
            "OFFERING_INCOMPLETE",

            "Assigned offering is incomplete and is not ready for enrollment approval.",

            {
              missing_configuration: missingOfferingConfiguration,
            },
          );
        }
      }

      // ===============================================
      // CAPACITY
      //
      // Pending + Approved enrollment subjects count.
      //
      // IMPORTANT:
      //
      // This Pending enrollment is already included
      // in enrolled_count.
      //
      // Therefore:
      //
      // enrolled_count == max_students
      //     -> VALID
      //
      // enrolled_count > max_students
      //     -> INVALID
      // ===============================================

      if (
        subject.assigned_offering_id &&
        maxStudents > 0 &&
        enrolledCount > maxStudents
      ) {
        addError(
          "OFFERING_OVER_CAPACITY",

          "Offering has exceeded its maximum student capacity.",

          {
            max_students: maxStudents,

            enrolled_count: enrolledCount,
          },
        );
      }

      // ===============================================
      // FINAL ACADEMIC ELIGIBILITY CHECK
      //
      // Route 13 provides preview validation.
      //
      // Route 14 MUST repeat this check inside the
      // transaction because Route 13 can be bypassed.
      //
      // Approved final grade:
      //
      // 1.00 - 3.00
      //     -> Passed
      //     -> BLOCK taking subject again
      //
      // 4.00
      //     -> Incomplete
      //     -> valid Retake
      //
      // 5.00
      //     -> Failed
      //     -> valid Retake
      //
      // Regular/new subject:
      //     -> prerequisites required
      //
      // Valid Retake:
      //     -> prerequisite history does not block
      //
      // Draft / Submitted / Returned grades:
      //     -> ignored by eligibility helper
      // ===============================================

      const academicEligibility = await evaluateStudentSubjectEligibility(
        connection,
        {
          studentId: Number(enrollment.student_id),

          subjectId: subjectId,
        },
      );

      // ===============================================
      // COPY ACADEMIC ERRORS INTO FINAL APPROVAL
      // ===============================================

      if (!academicEligibility.eligible) {
        for (const academicIssue of academicEligibility.errors) {
          const { code, message, ...academicDetails } = academicIssue;

          addError(
            code || "ACADEMIC_ELIGIBILITY_FAILED",

            message ||
              `Student is not academically eligible to take ${subject.subject_code}.`,

            {
              category: "ACADEMIC",

              attempt_type: academicEligibility.attempt_type,

              is_retake: academicEligibility.is_retake,

              previous_grade: academicEligibility.previous_grade,

              prerequisite_policy: academicEligibility.prerequisite_policy,

              prerequisites: academicEligibility.prerequisites,

              ...academicDetails,
            },
          );
        }
      }
    }

    // =================================================
    // BLOCK APPROVAL WHEN VALIDATION FAILS
    // =================================================

    if (validationErrors.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Enrollment failed final approval validation.",

        ready_for_approval: false,

        validation_errors: validationErrors,
      });
    }

    // =================================================
    // TOTAL UNITS
    // =================================================

    const totalUnits = subjectRows.reduce(
      (total, subject) => total + Number(subject.units || 0),

      0,
    );

    // =================================================
    // OLD AUDIT VALUES
    // =================================================

    const oldValues = {
      enrollment_status: enrollment.enrollment_status,

      approved_by: enrollment.approved_by
        ? Number(enrollment.approved_by)
        : null,

      approved_at: enrollment.approved_at || null,

      remarks: enrollment.remarks || null,
    };

    // =================================================
    // APPROVE
    //
    // approved_by ALWAYS comes from JWT actor.
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
      [actor.user_id, approvalRemarks, enrollmentId],
    );

    // =================================================
    // PROTECT AGAINST STATUS RACE
    // =================================================

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Enrollment could not be approved because its status changed before approval.",
      });
    }

    // =================================================
    // FETCH APPROVED RECORD
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
    // NEW AUDIT VALUES
    // =================================================

    const newValues = {
      enrollment_status: approvedEnrollment.enrollment_status,

      approved_by: approvedEnrollment.approved_by
        ? Number(approvedEnrollment.approved_by)
        : null,

      approved_at: approvedEnrollment.approved_at || null,

      remarks: approvedEnrollment.remarks || null,
    };

    // =================================================
    // AUDIT TRAIL
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
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // SUCCESS RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Enrollment approved successfully.",

      enrollment: {
        enrollment_id: enrollmentId,

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
          course_id: studentCourseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,
        },

        academic_period: {
          academic_year_id: Number(enrollment.academic_year_id),

          academic_year: enrollment.academic_year,

          semester_id: Number(enrollment.semester_id),

          semester_name: enrollment.semester_name,
        },

        enrollment_status: "Approved",

        remarks: approvedEnrollment.remarks || null,

        approved_by: {
          user_id: actor.user_id,

          username: actor.username,
        },

        approved_at: approvedEnrollment.approved_at,

        created_at: approvedEnrollment.created_at,
      },

      summary: {
        total_subjects: subjectRows.length,

        total_units: totalUnits,
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
// Body:
// {
//   "offering_id": 25,
//   "reason": "Incorrect subject was assigned."
// }
//
// Purpose:
// - Replace one subject with a DIFFERENT subject
// - Everything happens in ONE transaction
//
// Allowed enrollment statuses:
// - Pending
// - Approved
//
// Important:
// - Frontend sends offering_id only
// - Backend derives:
//      subject_id
//      section_id
//      section_subject_id
//
// Old subject:
// - NOT physically deleted
// - status becomes Dropped
// - REMOVE history is written
//
// New subject:
// - inserted as Enrolled
// - ADD history is written
//
// Same subject but different section?
// Use Route 8 instead.
// =====================================================

router.put("/:id/subjects/:enrollmentSubjectId/replace", async (req, res) => {
  const actor = getRegistrarActor(req, res);

  if (!actor) {
    return;
  }

  // =================================================
  // VALIDATE IDS
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
  // BODY
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
      message: "Replacement reason is required.",
    });
  }

  if (replacementReason.length > 255) {
    return res.status(400).json({
      success: false,
      message: "Replacement reason must not exceed 255 characters.",
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
    // STATUS
    // =================================================

    if (!["Pending", "Approved"].includes(enrollment.enrollment_status)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject cannot be replaced because enrollment status is '${enrollment.enrollment_status}'.`,

        enrollment_status: enrollment.enrollment_status,
      });
    }

    // =================================================
    // COURSE
    // =================================================

    const studentCourseId = toPositiveInt(enrollment.course_id);

    if (!studentCourseId) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Student does not have a valid course assignment.",
      });
    }

    // =================================================
    // GET + LOCK CURRENT SUBJECT
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

      return res.status(404).json({
        success: false,

        message: "Enrollment subject not found.",
      });
    }

    const oldSubject = oldSubjectRows[0];

    // =================================================
    // OLD SUBJECT MUST BE ACTIVE
    // =================================================

    if (oldSubject.status !== "Enrolled") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Subject cannot be replaced because its current status is '${oldSubject.status}'.`,
      });
    }

    // =================================================
    // GET + LOCK TARGET OFFERING
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

              r.room_name

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

      return res.status(404).json({
        success: false,

        message: "Replacement subject offering not found.",
      });
    }

    const newOffering = offeringRows[0];

    // =================================================
    // MUST BE A DIFFERENT SUBJECT
    //
    // If same subject:
    // use Route 8 to change section/offering.
    // =================================================

    if (Number(newOffering.subject_id) === Number(oldSubject.subject_id)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Replacement offering belongs to the same subject. Use the subject assignment/change route instead.",

        current_subject_id: Number(oldSubject.subject_id),

        replacement_subject_id: Number(newOffering.subject_id),
      });
    }

    // =================================================
    // SAME ACADEMIC YEAR
    // =================================================

    if (
      Number(newOffering.academic_year_id) !==
      Number(enrollment.academic_year_id)
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Replacement offering does not belong to the enrollment academic year.",
      });
    }

    // =================================================
    // SAME SEMESTER
    // =================================================

    if (Number(newOffering.semester_id) !== Number(enrollment.semester_id)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Replacement offering does not belong to the enrollment semester.",
      });
    }

    // =================================================
    // SAME COURSE
    // =================================================

    if (Number(newOffering.section_course_id) !== studentCourseId) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Replacement section does not belong to the student's course.",

        student_course: {
          course_id: studentCourseId,

          course_code: enrollment.course_code,
        },

        replacement_course: {
          course_id: newOffering.section_course_id
            ? Number(newOffering.section_course_id)
            : null,

          course_code: newOffering.section_course_code || null,
        },
      });
    }

    // =================================================
    // VERIFY SECTION-SUBJECT RELATIONSHIP
    // =================================================

    if (
      Number(newOffering.ss_subject_id) !== Number(newOffering.subject_id) ||
      Number(newOffering.ss_section_id) !== Number(newOffering.section_id) ||
      Number(newOffering.ss_academic_year_id) !==
        Number(newOffering.academic_year_id) ||
      Number(newOffering.ss_semester_id) !== Number(newOffering.semester_id)
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message:
          "Replacement offering has an invalid section-subject relationship.",
      });
    }

    // =================================================
    // OFFERING MUST BE OPEN
    // =================================================

    if (newOffering.offering_status !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Replacement offering is '${newOffering.offering_status}'.`,
      });
    }

    // =================================================
    // SECTION SUBJECT MUST BE OPEN
    // =================================================

    if (newOffering.section_subject_status !== "Open") {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: `Replacement section-subject is '${newOffering.section_subject_status}'.`,
      });
    }
    // =================================================
    // REPLACEMENT OFFERING MUST BE READY
    //
    // Required:
    // - faculty
    // - schedule days
    // - schedule time
    // - positive capacity
    //
    // Room is intentionally OPTIONAL.
    // =================================================

    const missingOfferingConfiguration = [];

    if (!newOffering.faculty_id) {
      missingOfferingConfiguration.push("faculty_id");
    }

    if (
      !newOffering.schedule_days ||
      !String(newOffering.schedule_days).trim()
    ) {
      missingOfferingConfiguration.push("schedule_days");
    }

    if (
      !newOffering.schedule_time ||
      !String(newOffering.schedule_time).trim()
    ) {
      missingOfferingConfiguration.push("schedule_time");
    }

    const maxStudents = Number(newOffering.max_students || 0);

    if (maxStudents <= 0) {
      missingOfferingConfiguration.push("max_students");
    }

    if (missingOfferingConfiguration.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        code: "OFFERING_INCOMPLETE",

        message:
          "Replacement offering is incomplete and is not ready for enrollment.",

        missing_configuration: missingOfferingConfiguration,
      });
    }
    // =================================================
    // DUPLICATE NEW SUBJECT
    //
    // Do not allow replacement with a subject
    // already active/completed in this enrollment.
    // =================================================

    const [duplicateRows] = await connection.execute(
      `
          SELECT
              enrollment_subject_id,
              status

          FROM enrollment_subjects

          WHERE enrollment_id = ?

            AND subject_id = ?

            AND enrollment_subject_id
                <> ?

            AND status IN (
              'Enrolled',
              'Completed'
            )

          LIMIT 1

          FOR UPDATE
          `,
      [enrollmentId, newOffering.subject_id, enrollmentSubjectId],
    );

    if (duplicateRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Replacement subject is already part of this enrollment.",

        existing_subject: {
          enrollment_subject_id: Number(duplicateRows[0].enrollment_subject_id),

          status: duplicateRows[0].status,
        },
      });
    }
    // =================================================
    // ACADEMIC ELIGIBILITY OF REPLACEMENT SUBJECT
    // =================================================

    const academicEligibility = await evaluateStudentSubjectEligibility(
      connection,
      {
        studentId: Number(enrollment.student_id),
        subjectId: Number(newOffering.subject_id),
      },
    );

    if (!academicEligibility.eligible) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        code: "SUBJECT_ACADEMICALLY_INELIGIBLE",

        message: `Student is not academically eligible to take replacement subject ${newOffering.subject_code}.`,

        academic_eligibility: {
          eligible: false,
          attempt_type: academicEligibility.attempt_type,
          is_retake: academicEligibility.is_retake,
          previous_grade: academicEligibility.previous_grade,
          prerequisite_policy: academicEligibility.prerequisite_policy,
          prerequisites: academicEligibility.prerequisites,
          errors: academicEligibility.errors,
        },
      });
    }
    // =================================================
    // CAPACITY
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

            AND es.status =
                'Enrolled'

            AND e.enrollment_status
                IN (
                  'Pending',
                  'Approved'
                )

            AND es.enrollment_subject_id
                <> ?
          `,
      [offeringId, enrollmentSubjectId],
    );

    const enrolledCount = Number(capacityRows[0]?.enrolled_count || 0);

    if (enrolledCount >= maxStudents) {
      await connection.rollback();

      return res.status(409).json({
        success: false,

        message: "Replacement subject offering is already full.",

        capacity: {
          max_students: maxStudents,

          enrolled_count: enrolledCount,

          available_slots: 0,
        },
      });
    }

    // =================================================
    // OLD VALUES
    // =================================================

    const oldValues = {
      enrollment_id: enrollmentId,

      enrollment_subject_id: enrollmentSubjectId,

      subject_id: Number(oldSubject.subject_id),

      offering_id: oldSubject.offering_id
        ? Number(oldSubject.offering_id)
        : null,

      section_id: oldSubject.section_id ? Number(oldSubject.section_id) : null,

      section_subject_id: oldSubject.section_subject_id
        ? Number(oldSubject.section_subject_id)
        : null,

      status: oldSubject.status,
    };

    // =================================================
    // MARK OLD SUBJECT DROPPED
    //
    // Do NOT hard-delete historical enrollment data.
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

      return res.status(409).json({
        success: false,

        message:
          "Original subject could not be replaced because its status changed.",
      });
    }

    // =================================================
    // INSERT NEW SUBJECT
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

        newOffering.subject_id,

        newOffering.offering_id,
        newOffering.section_id,
        newOffering.section_subject_id,
      ],
    );

    const newEnrollmentSubjectId = Number(insertResult.insertId);

    // =================================================
    // REMOVE HISTORY FOR OLD SUBJECT
    //
    // Database enum does NOT contain REPLACE.
    // We therefore record:
    //
    // old subject -> REMOVE
    // new subject -> ADD
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
        oldSubject.subject_id,

        oldValues.offering_id,
        oldValues.section_id,
        oldValues.section_subject_id,

        replacementReason,
        actor.user_id,
      ],
    );

    // =================================================
    // ADD HISTORY FOR NEW SUBJECT
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
        newOffering.subject_id,

        newOffering.offering_id,
        newOffering.section_id,
        newOffering.section_subject_id,

        replacementReason,
        actor.user_id,
      ],
    );

    // =================================================
    // AUDIT OLD SUBJECT
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
        actor.user_id,

        enrollmentSubjectId,

        JSON.stringify(oldValues),

        JSON.stringify(oldSubjectNewValues),
      ],
    );

    // =================================================
    // AUDIT NEW SUBJECT
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

        attempt_type: academicEligibility.attempt_type,

        is_retake: academicEligibility.is_retake,

        previous_grade: academicEligibility.previous_grade,

        prerequisite_policy: academicEligibility.prerequisite_policy,

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
        actor.user_id,

        newEnrollmentSubjectId,

        JSON.stringify(null),

        JSON.stringify(newValues),
      ],
    );

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Enrollment subject replaced successfully.",

      enrollment: {
        enrollment_id: enrollmentId,

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
          course_id: studentCourseId,

          course_code: enrollment.course_code,

          course_name: enrollment.course_name,
        },

        academic_period: {
          academic_year_id: Number(enrollment.academic_year_id),

          academic_year: enrollment.academic_year,

          semester_id: Number(enrollment.semester_id),

          semester_name: enrollment.semester_name,
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

        lecture_hours:
          newOffering.lecture_hours !== null &&
          newOffering.lecture_hours !== undefined
            ? Number(newOffering.lecture_hours)
            : null,

        laboratory_hours:
          newOffering.laboratory_hours !== null &&
          newOffering.laboratory_hours !== undefined
            ? Number(newOffering.laboratory_hours)
            : null,

        status: "Enrolled",

        offering: {
          offering_id: Number(newOffering.offering_id),

          status: newOffering.offering_status,

          schedule_days: newOffering.schedule_days || null,

          schedule_time: newOffering.schedule_time || null,
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
          room_id: newOffering.room_id ? Number(newOffering.room_id) : null,

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

        changed_by: actor.user_id,
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
