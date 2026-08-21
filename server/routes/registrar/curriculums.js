// routes/registrar/curriculums.js

import express from "express";
import db from "../../db.js";

const router = express.Router();
// =====================================================
// RECALCULATE CURRICULUM TOTAL UNITS
//
// Source of truth:
// curriculum_subjects -> subjects.units
//
// This keeps curriculum.total_units synchronized
// with its mapped subjects.
// =====================================================

async function recalculateCurriculumUnits(connection, curriculumId) {
  const [rows] = await connection.execute(
    `
      SELECT
        COALESCE(SUM(s.units), 0) AS total_units
      FROM curriculum_subjects cs

      INNER JOIN subjects s
        ON s.subject_id = cs.subject_id

      WHERE cs.curriculum_id = ?
    `,
    [curriculumId],
  );

  const totalUnits = Number(rows[0]?.total_units || 0);

  await connection.execute(
    `
      UPDATE curriculum
      SET total_units = ?
      WHERE curriculum_id = ?
    `,
    [totalUnits, curriculumId],
  );

  return totalUnits;
}
console.log("REGISTRAR CURRICULUM ROUTER LOADED");
// =====================================================
// GET ALL REGISTRAR CURRICULUMS
//
// GET /api/registrar/curriculums
//
// Query parameters:
// ?page=1
// ?limit=10
// ?search=BSIT
// ?course=1
// ?effective_year=2019
// ?is_active=1
// =====================================================

router.get("/", async (req, res) => {
  console.log("GET /api/registrar/curriculums HIT");
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      course = "",
      effective_year = "",
      is_active = "",
    } = req.query;

    let currentPage = Number(page);
    let perPage = Number(limit);

    if (!Number.isInteger(currentPage) || currentPage <= 0) {
      currentPage = 1;
    }

    if (!Number.isInteger(perPage) || perPage <= 0 || perPage > 100) {
      perPage = 10;
    }

    const offset = (currentPage - 1) * perPage;

    const where = [];
    const params = [];

    // =================================================
    // SEARCH
    // =================================================

    if (String(search).trim()) {
      where.push(`
        (
          c.curriculum_name LIKE ?
          OR co.course_code LIKE ?
          OR co.course_name LIKE ?
        )
      `);

      const searchValue = `%${String(search).trim()}%`;

      params.push(searchValue, searchValue, searchValue);
    }

    // =================================================
    // COURSE
    // =================================================

    if (String(course) !== "") {
      const courseId = Number(course);

      if (Number.isInteger(courseId) && courseId > 0) {
        where.push("c.course_id = ?");
        params.push(courseId);
      }
    }

    // =================================================
    // EFFECTIVE YEAR
    // =================================================

    if (String(effective_year) !== "") {
      const year = Number(effective_year);

      if (Number.isInteger(year)) {
        where.push("c.effective_year = ?");
        params.push(year);
      }
    }

    // =================================================
    // STATUS
    // =================================================

    if (String(is_active) !== "") {
      const active = Number(is_active);

      if (active === 0 || active === 1) {
        where.push("c.is_active = ?");
        params.push(active);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // =================================================
    // COUNT
    // =================================================

    const countSql = `
      SELECT COUNT(*) AS total
      FROM curriculum AS c
      INNER JOIN courses AS co
        ON co.course_id = c.course_id
      ${whereClause}
    `;

    console.log("CURRICULUM COUNT SQL:");
    console.log(countSql);
    console.log("COUNT PARAMS:", params);

    const [countRows] = await db.execute(countSql, params);

    const total = Number(countRows[0]?.total || 0);

    // =================================================
    // DATA
    // =================================================

    const dataSql = `
      SELECT
        c.curriculum_id,
        c.course_id,
        co.course_code,
        co.course_name,
        c.curriculum_name,
        c.effective_year,
        c.total_units,
        c.is_active,
        COUNT(DISTINCT cs.curriculum_subject_id) AS subject_count

      FROM curriculum AS c

      INNER JOIN courses AS co
        ON co.course_id = c.course_id

      LEFT JOIN curriculum_subjects AS cs
        ON cs.curriculum_id = c.curriculum_id

      ${whereClause}

      GROUP BY
        c.curriculum_id,
        c.course_id,
        co.course_code,
        co.course_name,
        c.curriculum_name,
        c.effective_year,
        c.total_units,
        c.is_active

      ORDER BY
        co.course_code ASC,
        c.effective_year DESC,
        c.curriculum_id DESC

      LIMIT ${perPage}
      OFFSET ${offset}
    `;

    console.log("CURRICULUM DATA SQL:");
    console.log(dataSql);
    console.log("DATA PARAMS:", params);

    const [curriculums] = await db.execute(dataSql, params);

    const totalPages = total === 0 ? 1 : Math.ceil(total / perPage);

    return res.json({
      success: true,

      data: curriculums,

      pagination: {
        page: currentPage,
        limit: perPage,
        total,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
    });
  } catch (error) {
    console.error("GET REGISTRAR CURRICULUMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch curricula.",
    });
  }
});
// =====================================================
// GET COURSES FOR CURRICULUM FORM
//
// GET /api/registrar/curriculums/courses
//
// Purpose:
// Return available courses for the Add Curriculum modal.
// =====================================================

router.get("/courses", async (req, res) => {
  try {
    const [courses] = await db.execute(
      `
        SELECT
          course_id,
          course_code,
          course_name
        FROM courses
        ORDER BY course_code ASC
      `,
    );

    return res.json({
      success: true,
      courses,
    });
  } catch (error) {
    console.error("GET CURRICULUM COURSES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch courses.",
    });
  }
});
// =====================================================
// GET CURRICULUM DETAILS
//
// GET /api/registrar/curriculums/:id
//
// Returns:
// - Curriculum information
// - All mapped subjects
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const curriculumId = Number(req.params.id);

    if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum ID.",
      });
    }

    // =================================================
    // GET CURRICULUM
    // =================================================

    const [curriculumRows] = await db.execute(
      `
        SELECT
          c.curriculum_id,
          c.course_id,
          co.course_code,
          co.course_name,

          c.curriculum_name,
          c.effective_year,
          c.total_units,
          c.is_active

        FROM curriculum c

        INNER JOIN courses co
          ON co.course_id = c.course_id

        WHERE c.curriculum_id = ?

        LIMIT 1
        `,
      [curriculumId],
    );

    if (curriculumRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Curriculum not found.",
      });
    }

    // =================================================
    // GET CURRICULUM SUBJECTS
    // =================================================

    const [subjects] = await db.execute(
      `
        SELECT
          cs.curriculum_subject_id,
          cs.curriculum_id,
          cs.subject_id,

          s.subject_code,
          s.subject_name,
          s.units,
          s.lecture_hours,
          s.laboratory_hours,

          cs.year_level,
          cs.semester_id,

          sem.semester_name,

          cs.is_required,
          cs.display_order

        FROM curriculum_subjects cs

        INNER JOIN subjects s
          ON s.subject_id = cs.subject_id

        INNER JOIN semesters sem
          ON sem.semester_id = cs.semester_id

        WHERE cs.curriculum_id = ?

        ORDER BY
          cs.year_level ASC,
          cs.semester_id ASC,
          cs.display_order ASC,
          s.subject_code ASC
        `,
      [curriculumId],
    );

    // =================================================
    // CALCULATE SUBJECT TOTALS
    // =================================================

    const totalSubjects = subjects.length;

    const mappedUnits = subjects.reduce(
      (total, subject) => total + Number(subject.units || 0),
      0,
    );

    return res.json({
      success: true,

      curriculum: curriculumRows[0],

      totalSubjects,

      mappedUnits,

      subjects,
    });
  } catch (error) {
    console.error("GET CURRICULUM DETAILS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch curriculum details.",
    });
  }
});

// =====================================================
// GET AVAILABLE SUBJECTS
//
// GET /api/registrar/curriculums/:id/available-subjects
//
// Purpose:
// Show existing subjects that can be added to the
// selected curriculum.
// =====================================================

router.get("/:id/available-subjects", async (req, res) => {
  try {
    const curriculumId = Number(req.params.id);

    if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum ID.",
      });
    }

    // -------------------------------------------------
    // VERIFY CURRICULUM
    // -------------------------------------------------

    const [curriculumRows] = await db.execute(
      `
          SELECT
            curriculum_id,
            course_id,
            curriculum_name
          FROM curriculum
          WHERE curriculum_id = ?
          LIMIT 1
          `,
      [curriculumId],
    );

    if (curriculumRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Curriculum not found.",
      });
    }

    // -------------------------------------------------
    // GET SUBJECTS
    // -------------------------------------------------

    const [subjects] = await db.execute(
      `
          SELECT
            s.subject_id,
            s.subject_code,
            s.subject_name,
            s.units,
            s.lecture_hours,
            s.laboratory_hours

          FROM subjects s

          ORDER BY
            s.subject_code ASC
          `,
    );

    return res.json({
      success: true,

      curriculum: curriculumRows[0],

      count: subjects.length,

      subjects,
    });
  } catch (error) {
    console.error("GET AVAILABLE CURRICULUM SUBJECTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch available subjects.",
    });
  }
});
// =====================================================
// CREATE CURRICULUM
//
// POST /api/registrar/curriculums
//
// Body:
// {
//   "course_id": 1,
//   "curriculum_name": "BSIT Curriculum 2026",
//   "effective_year": 2026,
//   "is_active": 1
// }
//
// Notes:
// - total_units starts at 0.
// - Total units will be based on mapped subjects.
// - One curriculum per course per effective year.
// =====================================================

router.post("/", async (req, res) => {
  let connection;

  try {
    const {
      course_id,
      curriculum_name,
      effective_year,
      is_active = 1,
    } = req.body;

    const courseId = Number(course_id);
    const effectiveYear = Number(effective_year);

    // =================================================
    // VALIDATE COURSE
    // =================================================

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid course ID is required.",
      });
    }

    // =================================================
    // VALIDATE CURRICULUM NAME
    // =================================================

    if (
      typeof curriculum_name !== "string" ||
      curriculum_name.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Curriculum name is required.",
      });
    }

    const curriculumName = curriculum_name.trim();

    if (curriculumName.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Curriculum name must not exceed 255 characters.",
      });
    }

    // =================================================
    // VALIDATE EFFECTIVE YEAR
    // =================================================

    if (
      !Number.isInteger(effectiveYear) ||
      effectiveYear < 1900 ||
      effectiveYear > 2100
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid effective year is required.",
      });
    }

    // =================================================
    // VALIDATE STATUS
    // =================================================

    const activeStatus = Number(is_active) === 1 ? 1 : 0;

    // =================================================
    // CONNECTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // VERIFY COURSE
    // =================================================

    const [courseRows] = await connection.execute(
      `
        SELECT
          course_id,
          course_code,
          course_name
        FROM courses
        WHERE course_id = ?
        LIMIT 1
      `,
      [courseId],
    );

    if (courseRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Selected course was not found.",
      });
    }

    // =================================================
    // CHECK DUPLICATE CURRICULUM
    //
    // Same course + same effective year
    // is not allowed.
    // =================================================

    const [existingRows] = await connection.execute(
      `
        SELECT
          curriculum_id,
          curriculum_name,
          effective_year,
          is_active
        FROM curriculum
        WHERE course_id = ?
          AND effective_year = ?
        LIMIT 1
      `,
      [courseId, effectiveYear],
    );

    if (existingRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "A curriculum already exists for this course and effective year.",
        curriculum_id: existingRows[0].curriculum_id,
        curriculum: existingRows[0],
      });
    }

    // =================================================
    // CREATE CURRICULUM
    //
    // total_units starts at 0 because no subjects
    // have been mapped yet.
    // =================================================

    const [result] = await connection.execute(
      `
        INSERT INTO curriculum (
          course_id,
          curriculum_name,
          effective_year,
          total_units,
          is_active
        )
        VALUES (?, ?, ?, 0, ?)
      `,
      [courseId, curriculumName, effectiveYear, activeStatus],
    );

    // =================================================
    // GET CREATED CURRICULUM
    // =================================================

    const [createdRows] = await connection.execute(
      `
        SELECT
          c.curriculum_id,
          c.course_id,
          co.course_code,
          co.course_name,
          c.curriculum_name,
          c.effective_year,
          c.total_units,
          c.is_active
        FROM curriculum c

        INNER JOIN courses co
          ON co.course_id = c.course_id

        WHERE c.curriculum_id = ?

        LIMIT 1
      `,
      [result.insertId],
    );

    await connection.commit();

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,

      message: "Curriculum created successfully.",

      curriculum: createdRows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    // =================================================
    // DATABASE DUPLICATE PROTECTION
    // =================================================

    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message:
          "A curriculum already exists for this course and effective year.",
      });
    }

    console.error("CREATE CURRICULUM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create curriculum.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// UPDATE CURRICULUM
//
// PUT /api/registrar/curriculums/:id
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const curriculumId = Number(req.params.id);

    const { curriculum_name, effective_year, total_units, is_active } =
      req.body;

    if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum ID.",
      });
    }

    const updates = [];
    const params = [];

    if (curriculum_name !== undefined) {
      if (
        typeof curriculum_name !== "string" ||
        curriculum_name.trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Curriculum name cannot be empty.",
        });
      }

      updates.push("curriculum_name = ?");

      params.push(curriculum_name.trim());
    }

    if (effective_year !== undefined) {
      const year = Number(effective_year);

      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return res.status(400).json({
          success: false,
          message: "Invalid effective year.",
        });
      }

      updates.push("effective_year = ?");

      params.push(year);
    }

    if (total_units !== undefined) {
      const units = Number(total_units);

      if (!Number.isInteger(units) || units < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid total units.",
        });
      }

      updates.push("total_units = ?");

      params.push(units);
    }

    if (is_active !== undefined) {
      updates.push("is_active = ?");

      params.push(Number(is_active) === 1 ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No curriculum fields were provided for update.",
      });
    }

    params.push(curriculumId);

    const [result] = await db.execute(
      `
        UPDATE curriculum
        SET ${updates.join(", ")}
        WHERE curriculum_id = ?
        `,
      params,
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Curriculum not found.",
      });
    }

    return res.json({
      success: true,
      message: "Curriculum updated successfully.",
    });
  } catch (error) {
    console.error("UPDATE CURRICULUM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update curriculum.",
    });
  }
});

// =====================================================
// ADD SUBJECT TO CURRICULUM
//
// POST /api/registrar/curriculums/:id/subjects
//
// Body:
// {
//   "subject_id": 64,
//   "year_level": 4,
//   "semester_id": 1,
//   "is_required": 1,
//   "display_order": 1
// }
// =====================================================

router.post("/:id/subjects", async (req, res) => {
  let connection;

  try {
    const curriculumId = Number(req.params.id);

    const {
      subject_id,
      year_level,
      semester_id,
      is_required = 1,
      display_order,
    } = req.body;

    const subjectId = Number(subject_id);

    const yearLevel = Number(year_level);

    const semesterId = Number(semester_id);

    const displayOrder = Number(display_order);

    // -------------------------------------------------
    // VALIDATE IDS
    // -------------------------------------------------

    if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum ID.",
      });
    }

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject ID.",
      });
    }

    if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 4) {
      return res.status(400).json({
        success: false,
        message: "Year level must be between 1 and 4.",
      });
    }

    if (!Number.isInteger(semesterId) || semesterId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid semester ID.",
      });
    }

    if (!Number.isInteger(displayOrder) || displayOrder <= 0) {
      return res.status(400).json({
        success: false,
        message: "Display order must be greater than zero.",
      });
    }

    // -------------------------------------------------
    // CONNECTION
    // -------------------------------------------------

    connection = await db.getConnection();

    await connection.beginTransaction();

    // -------------------------------------------------
    // VERIFY CURRICULUM
    // -------------------------------------------------

    const [curriculumRows] = await connection.execute(
      `
          SELECT
            curriculum_id,
            course_id,
            curriculum_name
          FROM curriculum
          WHERE curriculum_id = ?
          LIMIT 1
          `,
      [curriculumId],
    );

    if (curriculumRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Curriculum not found.",
      });
    }

    // -------------------------------------------------
    // VERIFY SUBJECT
    // -------------------------------------------------

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
      [subjectId],
    );

    if (subjectRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    // -------------------------------------------------
    // VERIFY SEMESTER
    // -------------------------------------------------

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
      });
    }

    // -------------------------------------------------
    // DUPLICATE CHECK
    //
    // Important:
    // Your current DB unique key is based on:
    // curriculum_id + subject_id + semester_id
    // -------------------------------------------------

    const [duplicateRows] = await connection.execute(
      `
          SELECT
            curriculum_subject_id,
            year_level,
            semester_id
          FROM curriculum_subjects
          WHERE curriculum_id = ?
            AND subject_id = ?
            AND semester_id = ?
          LIMIT 1
          `,
      [curriculumId, subjectId, semesterId],
    );

    if (duplicateRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "This subject is already mapped to this curriculum for the selected semester.",
        curriculum_subject_id: duplicateRows[0].curriculum_subject_id,
      });
    }

    // -------------------------------------------------
    // INSERT
    // -------------------------------------------------

    const [result] = await connection.execute(
      `
          INSERT INTO curriculum_subjects (
            curriculum_id,
            subject_id,
            year_level,
            semester_id,
            is_required,
            display_order
          )
          VALUES (?, ?, ?, ?, ?, ?)
          `,
      [
        curriculumId,
        subjectId,
        yearLevel,
        semesterId,
        Number(is_required) === 1 ? 1 : 0,
        displayOrder,
      ],
    );
    const totalUnits = await recalculateCurriculumUnits(
      connection,
      curriculumId,
    );
    await connection.commit();

    return res.status(201).json({
      success: true,

      message: "Subject added to curriculum successfully.",

      curriculum_subject_id: result.insertId,

      curriculum_id: curriculumId,

      subject: subjectRows[0],

      year_level: yearLevel,

      semester_id: semesterId,

      is_required: Number(is_required) === 1 ? 1 : 0,

      display_order: displayOrder,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("ADD SUBJECT TO CURRICULUM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add subject to curriculum.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// UPDATE CURRICULUM SUBJECT MAPPING
//
// PUT /api/registrar/curriculums/:id/subjects/:curriculumSubjectId
//
// Body:
// {
//   "year_level": 4,
//   "semester_id": 1,
//   "is_required": 1,
//   "display_order": 3
// }
// =====================================================

router.put("/:id/subjects/:curriculumSubjectId", async (req, res) => {
  try {
    const curriculumId = Number(req.params.id);

    const curriculumSubjectId = Number(req.params.curriculumSubjectId);

    if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum ID.",
      });
    }

    if (!Number.isInteger(curriculumSubjectId) || curriculumSubjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum subject ID.",
      });
    }

    const { year_level, semester_id, is_required, display_order } = req.body;

    const updates = [];
    const params = [];

    if (year_level !== undefined) {
      const value = Number(year_level);

      if (!Number.isInteger(value) || value < 1 || value > 4) {
        return res.status(400).json({
          success: false,
          message: "Year level must be between 1 and 4.",
        });
      }

      updates.push("year_level = ?");

      params.push(value);
    }

    if (semester_id !== undefined) {
      const value = Number(semester_id);

      if (!Number.isInteger(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid semester ID.",
        });
      }

      updates.push("semester_id = ?");

      params.push(value);
    }

    if (is_required !== undefined) {
      updates.push("is_required = ?");

      params.push(Number(is_required) === 1 ? 1 : 0);
    }

    if (display_order !== undefined) {
      const value = Number(display_order);

      if (!Number.isInteger(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message: "Display order must be greater than zero.",
        });
      }

      updates.push("display_order = ?");

      params.push(value);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields were provided for update.",
      });
    }

    // -------------------------------------------------
    // CHECK MAPPING EXISTS
    // -------------------------------------------------

    const [existingRows] = await db.execute(
      `
          SELECT
            curriculum_subject_id,
            subject_id,
            year_level,
            semester_id
          FROM curriculum_subjects
          WHERE curriculum_subject_id = ?
            AND curriculum_id = ?
          LIMIT 1
          `,
      [curriculumSubjectId, curriculumId],
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Curriculum subject mapping not found.",
      });
    }

    // -------------------------------------------------
    // UPDATE
    // -------------------------------------------------

    params.push(curriculumSubjectId, curriculumId);

    await db.execute(
      `
        UPDATE curriculum_subjects
        SET ${updates.join(", ")}
        WHERE curriculum_subject_id = ?
          AND curriculum_id = ?
        `,
      params,
    );

    return res.json({
      success: true,
      message: "Curriculum subject updated successfully.",
    });
  } catch (error) {
    // Handle the actual database unique constraint
    // cleanly if semester is changed to a duplicate.
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message:
          "This subject is already mapped to this curriculum for the selected semester.",
      });
    }

    console.error("UPDATE CURRICULUM SUBJECT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update curriculum subject.",
    });
  }
});
// =====================================================
// REMOVE SUBJECT FROM CURRICULUM
//
// DELETE /api/registrar/curriculums/:id/subjects/:curriculumSubjectId
//
// Removes the subject mapping only.
// The actual subject remains in the subjects table.
//
// Also recalculates curriculum.total_units.
// =====================================================

router.delete("/:id/subjects/:curriculumSubjectId", async (req, res) => {
  let connection;

  try {
    const curriculumId = Number(req.params.id);

    const curriculumSubjectId = Number(req.params.curriculumSubjectId);

    // -------------------------------------------------
    // VALIDATE CURRICULUM ID
    // -------------------------------------------------

    if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum ID.",
      });
    }

    // -------------------------------------------------
    // VALIDATE MAPPING ID
    // -------------------------------------------------

    if (!Number.isInteger(curriculumSubjectId) || curriculumSubjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum subject ID.",
      });
    }

    // -------------------------------------------------
    // CONNECTION
    // -------------------------------------------------

    connection = await db.getConnection();

    await connection.beginTransaction();

    // -------------------------------------------------
    // FIND MAPPING
    // -------------------------------------------------

    const [existingRows] = await connection.execute(
      `
        SELECT
          cs.curriculum_subject_id,
          cs.curriculum_id,
          cs.subject_id,

          s.subject_code,
          s.subject_name,
          s.units,

          cs.year_level,
          cs.semester_id,
          cs.is_required,
          cs.display_order

        FROM curriculum_subjects cs

        INNER JOIN subjects s
          ON s.subject_id = cs.subject_id

        WHERE cs.curriculum_subject_id = ?
          AND cs.curriculum_id = ?

        LIMIT 1
      `,
      [curriculumSubjectId, curriculumId],
    );

    if (existingRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Curriculum subject mapping not found.",
      });
    }

    const removedSubject = existingRows[0];

    // -------------------------------------------------
    // DELETE MAPPING
    // -------------------------------------------------

    await connection.execute(
      `
        DELETE FROM curriculum_subjects
        WHERE curriculum_subject_id = ?
          AND curriculum_id = ?
      `,
      [curriculumSubjectId, curriculumId],
    );

    // -------------------------------------------------
    // RECALCULATE TOTAL UNITS
    // -------------------------------------------------

    const totalUnits = await recalculateCurriculumUnits(
      connection,
      curriculumId,
    );

    // -------------------------------------------------
    // COMMIT
    // -------------------------------------------------

    await connection.commit();

    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    return res.json({
      success: true,

      message: "Subject removed from curriculum successfully.",

      removed: removedSubject,

      total_units: totalUnits,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("REMOVE CURRICULUM SUBJECT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove subject from curriculum.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;
