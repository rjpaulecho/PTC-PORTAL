import express from "express";
import db from "../../db.js";

const router = express.Router();

// =====================================================
// OFFICIAL GRADE CLASSIFIER
// =====================================================
//
// IMPORTANT:
//
// Academic result is determined by final_rating.
//
// 1.00 - 3.00 = Passed
// 4.00        = Incomplete / Retake
// 5.00        = Failed / Retake
//
// remarks is supporting information only.
// It does NOT override the numeric final_rating.
//
// =====================================================

function classifyFinalRating(value) {
  if (value === null || value === undefined || value === "") {
    return {
      code: "NO_FINAL_RATING",
      classification: "Unknown",
      passed: false,
      retake: false,
      valid: false,
      final_rating: null,
    };
  }

  const rating = Number(value);

  if (!Number.isFinite(rating)) {
    return {
      code: "INVALID_FINAL_RATING",
      classification: "Unknown",
      passed: false,
      retake: false,
      valid: false,
      final_rating: null,
    };
  }

  // ===================================================
  // PASSED
  // ===================================================

  if (rating >= 1.0 && rating <= 3.0) {
    return {
      code: "PASSED",
      classification: "Passed",
      passed: true,
      retake: false,
      valid: true,
      final_rating: rating,
    };
  }

  // ===================================================
  // INCOMPLETE
  // ===================================================

  if (rating === 4.0) {
    return {
      code: "INCOMPLETE",
      classification: "Incomplete",
      passed: false,
      retake: true,
      valid: true,
      final_rating: rating,
    };
  }

  // ===================================================
  // FAILED
  // ===================================================

  if (rating === 5.0) {
    return {
      code: "FAILED",
      classification: "Failed",
      passed: false,
      retake: true,
      valid: true,
      final_rating: rating,
    };
  }

  // ===================================================
  // UNSUPPORTED OFFICIAL RATING
  // ===================================================

  return {
    code: "INVALID_FINAL_RATING",
    classification: "Unknown",
    passed: false,
    retake: false,
    valid: false,
    final_rating: rating,
  };
}

// =====================================================
// GET STUDENT OFFICIAL ACADEMIC RECORD
// =====================================================
//
// GET /api/student/academic-records
//
// SECURITY:
//
// - Student JWT required.
// - Student identity comes ONLY from req.user.
// - No student_id query parameter.
// - No student_id request body.
// - Student can only retrieve their own record.
//
// ACADEMIC TRUTH:
//
// grades
//   ↓ enrollment_subject_id
// enrollment_subjects
//   ↓ enrollment_id
// enrollments
//   ↓ student_id
// authenticated Student
//
// Only:
//
// grade_status = 'Approved'
// enrollment_status = 'Approved'
//
// Normal semesters only:
//
// semester_id IN (1, 2)
//
// =====================================================

router.get("/", async (req, res) => {
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
    // 3. AUTHENTICATED STUDENT PROFILE
    // =================================================
    //
    // Do not trust a Student ID from the frontend.
    //
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

            u.email,

            s.course_id,
            c.course_code,
            c.course_name,

            s.year_level,

            s.status_id,
            student_status.status_name
                AS student_status

        FROM students s

        INNER JOIN users u
            ON u.user_id =
               s.user_id

        INNER JOIN courses c
            ON c.course_id =
               s.course_id

        LEFT JOIN student_statuses student_status
            ON student_status.status_id =
               s.status_id

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

    const courseId = Number(student.course_id);

    // =================================================
    // 4. ACTIVE CURRICULUM
    // =================================================
    //
    // Academic history can still exist without an active
    // curriculum, so curriculum is nullable in response.
    //
    // =================================================

    const [curriculumRows] = await db.execute(
      `
        SELECT
            sc.student_curriculum_id,
            sc.curriculum_id,
            sc.assigned_date,
            sc.status
                AS assignment_status,

            cur.curriculum_name,
            cur.effective_year,
            cur.total_units,
            cur.course_id

        FROM student_curriculum sc

        INNER JOIN curriculum cur
            ON cur.curriculum_id =
               sc.curriculum_id

        WHERE sc.student_id = ?

          AND sc.status =
              'Active'

          AND cur.is_active = 1

          AND cur.course_id = ?

        ORDER BY
            sc.student_curriculum_id DESC

        LIMIT 1
        `,
      [studentId, courseId],
    );

    let curriculum = null;

    if (curriculumRows.length > 0) {
      const row = curriculumRows[0];

      curriculum = {
        curriculum_id: Number(row.curriculum_id),

        curriculum_name: row.curriculum_name,

        effective_year:
          row.effective_year !== null && row.effective_year !== undefined
            ? Number(row.effective_year)
            : null,

        total_units:
          row.total_units !== null && row.total_units !== undefined
            ? Number(row.total_units)
            : null,

        status: row.assignment_status,

        assigned_date: row.assigned_date,
      };
    }

    // =================================================
    // 5. OFFICIAL APPROVED ACADEMIC HISTORY
    // =================================================
    //
    // CURRENT GRADE SCHEMA:
    //
    // grades.enrollment_subject_id
    //
    // DO NOT use the old legacy assumption:
    //
    // grades.student_id
    // grades.subject_id
    // grades.enrollment_id
    //
    // The exact academic attempt is:
    //
    // grades
    //  -> enrollment_subjects
    //  -> enrollments
    //  -> student
    //
    // =================================================

    const [recordRows] = await db.execute(
      `
        SELECT
            -- =========================================
            -- GRADE
            -- =========================================

            g.grade_id,
            g.enrollment_subject_id,
            g.faculty_id,

            g.prelim_grade,
            g.midterm_grade,
            g.final_grade,
            g.final_rating,

            g.remarks,
            g.grade_status,

            g.submitted_at,

            g.reviewed_by,
            reviewer.username
                AS reviewed_by_username,

            g.reviewed_at,
            g.review_remarks,

            g.created_at
                AS grade_created_at,

            g.updated_at
                AS grade_updated_at,

            -- =========================================
            -- EXACT ENROLLMENT SUBJECT ATTEMPT
            -- =========================================

            es.enrollment_id,
            es.subject_id,
            es.status
                AS subject_status,

            es.offering_id,
            es.section_id,
            es.section_subject_id,

            -- =========================================
            -- SUBJECT
            -- =========================================

            sub.subject_code,
            sub.subject_name,
            sub.units,

            -- =========================================
            -- OFFICIAL ENROLLMENT
            -- =========================================

            e.student_id,

            e.academic_year_id,
            ay.academic_year,

            e.semester_id,
            sem.semester_name,

            e.enrollment_status,

            -- =========================================
            -- FACULTY
            -- =========================================

            faculty.employee_number
                AS faculty_employee_number,

            faculty.first_name
                AS faculty_first_name,

            faculty.middle_name
                AS faculty_middle_name,

            faculty.last_name
                AS faculty_last_name

        FROM grades g

        INNER JOIN enrollment_subjects es
            ON es.enrollment_subject_id =
               g.enrollment_subject_id

        INNER JOIN enrollments e
            ON e.enrollment_id =
               es.enrollment_id

        INNER JOIN subjects sub
            ON sub.subject_id =
               es.subject_id

        INNER JOIN academic_years ay
            ON ay.academic_year_id =
               e.academic_year_id

        INNER JOIN semesters sem
            ON sem.semester_id =
               e.semester_id

        LEFT JOIN faculty
            ON faculty.faculty_id =
               g.faculty_id

        LEFT JOIN users reviewer
            ON reviewer.user_id =
               g.reviewed_by

        WHERE e.student_id = ?

          AND e.enrollment_status =
              'Approved'

          AND g.grade_status =
              'Approved'

          AND g.final_rating
              IS NOT NULL

          AND e.semester_id
              IN (1, 2)

        ORDER BY
            e.academic_year_id ASC,
            e.semester_id ASC,
            es.enrollment_subject_id ASC,
            g.grade_id ASC
        `,
      [studentId],
    );

    // =================================================
    // 6. FORMAT OFFICIAL RECORDS
    // =================================================

    const records = recordRows.map((row) => {
      const finalRating =
        row.final_rating !== null && row.final_rating !== undefined
          ? Number(row.final_rating)
          : null;

      const result = classifyFinalRating(finalRating);

      const facultyName = [
        row.faculty_first_name,
        row.faculty_middle_name,
        row.faculty_last_name,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        grade_id: Number(row.grade_id),

        enrollment_subject_id: Number(row.enrollment_subject_id),

        enrollment_id: Number(row.enrollment_id),

        subject_id: Number(row.subject_id),

        subject_code: row.subject_code,

        subject_name: row.subject_name,

        units: Number(row.units || 0),

        academic_year_id: Number(row.academic_year_id),

        academic_year: row.academic_year,

        semester_id: Number(row.semester_id),

        semester_name: row.semester_name,

        enrollment_status: row.enrollment_status,

        subject_status: row.subject_status,

        prelim_grade:
          row.prelim_grade !== null && row.prelim_grade !== undefined
            ? Number(row.prelim_grade)
            : null,

        midterm_grade:
          row.midterm_grade !== null && row.midterm_grade !== undefined
            ? Number(row.midterm_grade)
            : null,

        final_grade:
          row.final_grade !== null && row.final_grade !== undefined
            ? Number(row.final_grade)
            : null,

        // =========================================
        // OFFICIAL ACADEMIC RESULT VALUE
        // =========================================

        final_rating: finalRating,

        remarks: row.remarks || null,

        grade_status: row.grade_status,

        classification: result.classification,

        result_code: result.code,

        passed: result.passed,

        retake: result.retake,

        valid_result: result.valid,

        faculty:
          row.faculty_id !== null && row.faculty_id !== undefined
            ? {
                faculty_id: Number(row.faculty_id),

                employee_number: row.faculty_employee_number || null,

                faculty_name: facultyName || "Assigned Faculty",
              }
            : null,

        approval: {
          reviewed_by:
            row.reviewed_by !== null && row.reviewed_by !== undefined
              ? Number(row.reviewed_by)
              : null,

          reviewed_by_username: row.reviewed_by_username || null,

          reviewed_at: row.reviewed_at || null,

          review_remarks: row.review_remarks || null,
        },

        submitted_at: row.submitted_at || null,

        created_at: row.grade_created_at || null,

        updated_at: row.grade_updated_at || null,
      };
    });

    // =================================================
    // 7. SUMMARY
    // =================================================

    const passedRecords = records.filter(
      (record) => record.classification === "Passed",
    );

    const incompleteRecords = records.filter(
      (record) => record.classification === "Incomplete",
    );

    const failedRecords = records.filter(
      (record) => record.classification === "Failed",
    );

    const retakeRecords = records.filter((record) => record.retake);

    const totalRecordedUnits = records.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    const earnedUnits = passedRecords.reduce(
      (total, record) => total + Number(record.units || 0),
      0,
    );

    // =================================================
    // 8. STUDENT RESPONSE
    // =================================================

    const studentResponse = {
      student_id: studentId,

      student_number: student.student_number,

      first_name: student.first_name,

      middle_name: student.middle_name || null,

      last_name: student.last_name,

      student_name: [student.first_name, student.middle_name, student.last_name]
        .filter(Boolean)
        .join(" "),

      email: student.email || null,

      year_level:
        student.year_level !== null && student.year_level !== undefined
          ? Number(student.year_level)
          : 0,

      status: student.student_status || "Unknown",

      course: {
        course_id: courseId,

        course_code: student.course_code,

        course_name: student.course_name,
      },

      curriculum,
    };

    // =================================================
    // 9. SUCCESS RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      student: studentResponse,

      summary: {
        total_approved_subjects: records.length,

        total_recorded_units: totalRecordedUnits,

        earned_units: earnedUnits,

        passed_subjects: passedRecords.length,

        incomplete_subjects: incompleteRecords.length,

        failed_subjects: failedRecords.length,

        retake_subjects: retakeRecords.length,
      },

      records,
    });
  } catch (error) {
    console.error("GET /api/student/academic-records ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to retrieve Student academic record.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;
