// routes/registrar/studentRecords.js

import express from "express";
import db from "../../db.js";

const router = express.Router();

// =====================================================
// SHARED STUDENT SELECT
// =====================================================

const STUDENT_SELECT = `
SELECT

    s.student_id,
    s.student_number,

    s.first_name,
    s.middle_name,
    s.last_name,

    s.gender,
    s.birth_date,
    s.contact_number,

    u.email,

    c.course_id,
    c.course_code,

    s.year_level,

    st.status_name AS status,

    sec.section_id,
    sec.section_name,

    sem.semester_id,
    sem.semester_name,

    addr.house_no,
    addr.street,
    addr.barangay,
    addr.city,
    addr.province,
    addr.zip_code

FROM students s

LEFT JOIN users u
    ON u.user_id = s.user_id

LEFT JOIN courses c
    ON c.course_id = s.course_id

LEFT JOIN sections sec
    ON sec.section_id = s.section_id

LEFT JOIN semesters sem
    ON sem.semester_id = s.semester_id

LEFT JOIN student_statuses st
    ON st.status_id = s.status_id

LEFT JOIN student_addresses addr
    ON addr.student_id = s.student_id
`;

// =====================================================
// HELPER
// =====================================================

async function getStudent(studentId) {
  const [rows] = await db.execute(
    `
    ${STUDENT_SELECT}

    WHERE s.student_id = ?
    `,
    [studentId],
  );

  return rows.length > 0 ? rows[0] : null;
}
// =====================================================
// PHASE 1
// GET ALL STUDENTS
// =====================================================

router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const offset = (page - 1) * limit;

    const search = req.query.search?.trim() || "";
    const course = req.query.course || "";
    const year = req.query.year || "";
    const section = req.query.section || "";

    let sql = `
        ${STUDENT_SELECT}

        WHERE 1=1
    `;

    const params = [];

    // ----------------------------------------
    // SEARCH
    // ----------------------------------------

    if (search) {
      sql += `
        AND (
            s.student_number LIKE ?
            OR s.first_name LIKE ?
            OR s.middle_name LIKE ?
            OR s.last_name LIKE ?
        )
      `;

      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    // ----------------------------------------
    // COURSE
    // ----------------------------------------

    if (course) {
      sql += `
        AND c.course_code = ?
      `;

      params.push(course);
    }

    // ----------------------------------------
    // YEAR LEVEL
    // ----------------------------------------

    if (year) {
      sql += `
        AND s.year_level = ?
      `;

      params.push(year);
    }

    // ----------------------------------------
    // SECTION
    // ----------------------------------------

    if (section) {
      sql += `
        AND sec.section_name = ?
      `;

      params.push(section);
    }

    // ----------------------------------------
    // SORTING + PAGINATION
    // ----------------------------------------

    sql += `
        ORDER BY
            s.last_name ASC,
            s.first_name ASC

        LIMIT ?
        OFFSET ?
    `;

    params.push(limit);
    params.push(offset);

    const [students] = await db.execute(sql, params);

    // =====================================================
    // COUNT QUERY
    // =====================================================

    let countSql = `
      SELECT COUNT(*) AS total

      FROM students s

      LEFT JOIN courses c
        ON c.course_id = s.course_id

      LEFT JOIN sections sec
        ON sec.section_id = s.section_id

      WHERE 1=1
    `;

    const countParams = [];

    if (search) {
      countSql += `
        AND (
          s.student_number LIKE ?
          OR s.first_name LIKE ?
          OR s.middle_name LIKE ?
          OR s.last_name LIKE ?
        )
      `;

      countParams.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    }

    if (course) {
      countSql += `
        AND c.course_code = ?
      `;

      countParams.push(course);
    }

    if (year) {
      countSql += `
        AND s.year_level = ?
      `;

      countParams.push(year);
    }

    if (section) {
      countSql += `
        AND sec.section_name = ?
      `;

      countParams.push(section);
    }

    const [countRows] = await db.execute(countSql, countParams);

    const totalStudents = countRows[0].total;
    const totalPages = Math.ceil(totalStudents / limit);

    res.json({
      success: true,
      page,
      limit,
      count: students.length,
      totalStudents,
      totalPages,
      students,
    });
  } catch (error) {
    console.error("GET STUDENTS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch students.",
    });
  }
});
// =====================================================
// GET SINGLE STUDENT PROFILE
//
// GET /api/registrar/students/:id
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const student = await getStudent(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    res.json({
      success: true,
      student,
    });
  } catch (error) {
    console.error("GET STUDENT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student.",
    });
  }
});
// =====================================================
// GET OFFICIAL ACADEMIC RECORDS
//
// GET /api/registrar/students/:id/academic-records
//
// OFFICIAL ACADEMIC TRUTH:
//
// Approved Enrollment
//        +
// Enrollment Subject
//        +
// Approved Grade
//
// Grade V2:
// grades.enrollment_subject_id
//        ↓
// enrollment_subjects.enrollment_subject_id
//
// Draft / Submitted / Returned grades are NOT official.
// =====================================================

router.get("/:id/academic-records", async (req, res) => {
  try {
    const studentId = Number(req.params.id);

    // =====================================================
    // VALIDATE STUDENT ID
    // =====================================================

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID.",
      });
    }

    // =====================================================
    // GET STUDENT
    // =====================================================

    const student = await getStudent(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    // =====================================================
    // GET OFFICIAL ACADEMIC RECORDS
    // =====================================================

    const [rows] = await db.execute(
      `
      SELECT

          -- =============================================
          -- ENROLLMENT
          -- =============================================

          e.enrollment_id,

          e.academic_year_id,
          ay.academic_year,

          sem.semester_id,
          sem.semester_name,

          e.enrollment_status,

          -- =============================================
          -- ENROLLMENT SUBJECT
          -- =============================================

          es.enrollment_subject_id,

          es.subject_id,

          es.offering_id,
          es.section_id,
          es.section_subject_id,

          es.status
              AS subject_status,

          -- =============================================
          -- SUBJECT
          -- =============================================

          sub.subject_code,
          sub.subject_name,

          sub.units,

          sub.lecture_hours,
          sub.laboratory_hours,

          -- =============================================
          -- SECTION
          -- =============================================

          sec.section_name,

          -- =============================================
          -- OFFICIAL GRADE
          -- =============================================

          g.grade_id,
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
              AS grade_updated_at

      FROM enrollments e

      INNER JOIN academic_years ay
          ON ay.academic_year_id =
             e.academic_year_id

      INNER JOIN semesters sem
          ON sem.semester_id =
             e.semester_id

      INNER JOIN enrollment_subjects es
          ON es.enrollment_id =
             e.enrollment_id

      INNER JOIN subjects sub
          ON sub.subject_id =
             es.subject_id

      INNER JOIN grades g
          ON g.enrollment_subject_id =
             es.enrollment_subject_id

          AND g.grade_status =
              'Approved'

      LEFT JOIN sections sec
          ON sec.section_id =
             es.section_id

      LEFT JOIN users reviewer
          ON reviewer.user_id =
             g.reviewed_by

      WHERE
          e.student_id = ?

          AND e.enrollment_status =
              'Approved'

      ORDER BY
          ay.academic_year DESC,
          sem.semester_id ASC,
          sub.subject_code ASC
      `,
      [studentId],
    );

    // =====================================================
    // FORMAT RECORDS
    // =====================================================

    const records = rows.map((row) => {
      const finalRating =
        row.final_rating !== null ? Number(row.final_rating) : null;

      // ===================================================
      // ACADEMIC RESULT
      //
      // Numeric grade is authoritative:
      //
      // 1.00 - 3.00 = Passed
      // 4.00        = Incomplete
      // 5.00        = Failed
      // ===================================================

      let academicResult = null;

      if (finalRating !== null) {
        if (finalRating >= 1 && finalRating <= 3) {
          academicResult = "Passed";
        } else if (finalRating === 4) {
          academicResult = "Incomplete";
        } else if (finalRating === 5) {
          academicResult = "Failed";
        }
      }

      return {
        // ===============================================
        // ENROLLMENT
        // ===============================================

        enrollment_id: Number(row.enrollment_id),

        academic_year_id: Number(row.academic_year_id),

        academic_year: row.academic_year,

        semester_id: Number(row.semester_id),

        semester_name: row.semester_name,

        enrollment_status: row.enrollment_status,

        // ===============================================
        // SUBJECT ATTEMPT
        // ===============================================

        enrollment_subject_id: Number(row.enrollment_subject_id),

        subject_id: Number(row.subject_id),

        subject_code: row.subject_code,

        subject_name: row.subject_name,

        units: Number(row.units || 0),

        lecture_hours:
          row.lecture_hours !== null ? Number(row.lecture_hours) : null,

        laboratory_hours:
          row.laboratory_hours !== null ? Number(row.laboratory_hours) : null,

        subject_status: row.subject_status,

        // ===============================================
        // PLACEMENT
        // ===============================================

        offering_id: row.offering_id !== null ? Number(row.offering_id) : null,

        section_id: row.section_id !== null ? Number(row.section_id) : null,

        section_subject_id:
          row.section_subject_id !== null
            ? Number(row.section_subject_id)
            : null,

        section_name: row.section_name || null,

        // ===============================================
        // GRADE
        // ===============================================

        grade_id: Number(row.grade_id),

        faculty_id: row.faculty_id !== null ? Number(row.faculty_id) : null,

        prelim_grade:
          row.prelim_grade !== null ? Number(row.prelim_grade) : null,

        midterm_grade:
          row.midterm_grade !== null ? Number(row.midterm_grade) : null,

        final_grade: row.final_grade !== null ? Number(row.final_grade) : null,

        final_rating: finalRating,

        academic_result: academicResult,

        remarks: row.remarks,

        grade_status: row.grade_status,

        submitted_at: row.submitted_at,

        reviewed_by: row.reviewed_by !== null ? Number(row.reviewed_by) : null,

        reviewed_by_username: row.reviewed_by_username || null,

        reviewed_at: row.reviewed_at,

        review_remarks: row.review_remarks,

        grade_created_at: row.grade_created_at,

        grade_updated_at: row.grade_updated_at,
      };
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      student,

      totalSubjects: records.length,

      records,
    });
  } catch (error) {
    console.error("GET ACADEMIC RECORDS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch academic records.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
// =====================================================
// GET STUDENT DOCUMENTS
//
// GET /api/registrar/students/:id/documents
// =====================================================

router.get("/:id/documents", async (req, res) => {
  try {
    const { id } = req.params;

    // =====================================================
    // GET STUDENT
    // =====================================================

    const student = await getStudent(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    // =====================================================
    // GET DOCUMENTS
    // =====================================================

    const [documents] = await db.execute(
      `
      SELECT

          sd.document_id,
          sd.student_id,

          sd.document_type,

          sd.file_name,
          sd.file_path,

          sd.verification_status,

          sd.remarks,

          sd.verified_by,
          u.username AS verified_by_username,

          sd.verified_at,
          sd.uploaded_at

      FROM student_documents sd

      LEFT JOIN users u
          ON u.user_id = sd.verified_by

      WHERE sd.student_id = ?

      ORDER BY sd.uploaded_at DESC
      `,
      [student.student_id],
    );

    // =====================================================
    // FORMAT FILE URL
    // =====================================================

    const formattedDocuments = documents.map((doc) => ({
      ...doc,
      document_url: doc.file_path
        ? `${req.protocol}://${req.get("host")}/${doc.file_path.replace(/^\/+/, "")}`
        : null,
    }));

    res.json({
      success: true,
      student,
      totalDocuments: formattedDocuments.length,
      documents: formattedDocuments,
    });
  } catch (error) {
    console.error("GET STUDENT DOCUMENTS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch student documents.",
    });
  }
});
// =====================================================
// VERIFY STUDENT DOCUMENT
//
// PUT /api/registrar/students/documents/:documentId/verify
// =====================================================

router.put("/documents/:documentId/verify", async (req, res) => {
  let conn;

  try {
    const { documentId } = req.params;
    const { verification_status, remarks } = req.body;

    const verified_by = req.user.user_id;

    // =====================================================
    // VALIDATION
    // =====================================================

    const allowedStatuses = ["Verified", "Rejected"];

    if (!allowedStatuses.includes(verification_status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification status.",
      });
    }

    if (verification_status === "Rejected" && (!remarks || !remarks.trim())) {
      return res.status(400).json({
        success: false,
        message: "Remarks are required when rejecting a document.",
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    // =====================================================
    // CHECK DOCUMENT
    // =====================================================

    const [documentRows] = await conn.execute(
      `
      SELECT
          document_id,
          student_id,
          document_type,
          verification_status
      FROM student_documents
      WHERE document_id = ?
      `,
      [documentId],
    );

    if (documentRows.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    const document = documentRows[0];

    // =====================================================
    // PREVENT DOUBLE VERIFICATION
    // =====================================================

    if (
      document.verification_status === "Verified" ||
      document.verification_status === "Rejected"
    ) {
      await conn.rollback();

      return res.status(409).json({
        success: false,
        message: `Document has already been ${document.verification_status.toLowerCase()}.`,
      });
    }

    // =====================================================
    // UPDATE DOCUMENT
    // =====================================================

    await conn.execute(
      `
      UPDATE student_documents
      SET
          verification_status = ?,
          remarks = ?,
          verified_by = ?,
          verified_at = NOW()
      WHERE document_id = ?
      `,
      [verification_status, remarks || null, verified_by, documentId],
    );

    // =====================================================
    // ACTIVITY LOG
    // =====================================================

    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    await conn.execute(
      `
      INSERT INTO activity_logs
      (
          user_id,
          activity_type,
          module_name,
          description,
          ip_address
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        verified_by,
        "Document Verification",
        "Student Records",
        `${verification_status} ${document.document_type} document (ID: ${documentId})`,
        ipAddress,
      ],
    );

    // =====================================================
    // RETURN UPDATED DOCUMENT
    // =====================================================

    const [updatedRows] = await conn.execute(
      `
      SELECT
          sd.document_id,
          sd.student_id,
          sd.document_type,
          sd.file_name,
          sd.file_path,
          sd.verification_status,
          sd.remarks,
          sd.verified_by,
          u.username AS verified_by_username,
          sd.verified_at,
          sd.uploaded_at

      FROM student_documents sd

      LEFT JOIN users u
          ON u.user_id = sd.verified_by

      WHERE sd.document_id = ?
      `,
      [documentId],
    );

    await conn.commit();

    res.json({
      success: true,
      message: `Document ${verification_status.toLowerCase()} successfully.`,
      document: updatedRows[0],
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("DOCUMENT VERIFICATION ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to verify document.",
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});
export default router;
