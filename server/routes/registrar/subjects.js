// routes/registrar/subjects.js

import express from "express";
import db from "../../db.js";

const router = express.Router();

// =====================================================
// GET SUBJECTS
//
// GET /api/registrar/subjects
//
// Query:
// ?page=1
// &limit=10
// &search=IT
// =====================================================

router.get("/", async (req, res) => {
  try {
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    // -------------------------------------------------
    // PAGINATION VALIDATION
    // -------------------------------------------------

    if (!Number.isInteger(page) || page < 1) {
      page = 1;
    }

    if (!Number.isInteger(limit) || limit < 1) {
      limit = 10;
    }

    // Prevent excessively large requests
    if (limit > 100) {
      limit = 100;
    }

    const offset = (page - 1) * limit;

    // -------------------------------------------------
    // SEARCH CONDITIONS
    // -------------------------------------------------

    const whereConditions = [];
    const whereParams = [];

    if (search) {
      whereConditions.push(`
        (
          s.subject_code LIKE ?
          OR s.subject_name LIKE ?
          OR s.description LIKE ?
        )
      `);

      const searchValue = `%${search}%`;

      whereParams.push(searchValue, searchValue, searchValue);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // -------------------------------------------------
    // COUNT
    // -------------------------------------------------

    const [countRows] = await db.execute(
      `
        SELECT COUNT(*) AS total
        FROM subjects s
        ${whereClause}
      `,
      whereParams,
    );

    const total = Number(countRows[0]?.total || 0);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

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
          s.laboratory_hours,
          s.description,
          s.created_at

        FROM subjects s

        ${whereClause}

        ORDER BY
          s.subject_code ASC

        LIMIT ? OFFSET ?
      `,
      [...whereParams, limit, offset],
    );

    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    return res.json({
      success: true,

      subjects,

      total,

      page,

      limit,

      totalPages,
    });
  } catch (error) {
    console.error("GET SUBJECTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load subjects.",
    });
  }
});

// =====================================================
// GET SINGLE SUBJECT
//
// GET /api/registrar/subjects/:id
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const subjectId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject ID.",
      });
    }

    const [rows] = await db.execute(
      `
        SELECT
          subject_id,
          subject_code,
          subject_name,
          units,
          lecture_hours,
          laboratory_hours,
          description,
          created_at

        FROM subjects

        WHERE subject_id = ?

        LIMIT 1
      `,
      [subjectId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    return res.json({
      success: true,
      subject: rows[0],
    });
  } catch (error) {
    console.error("GET SUBJECT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load subject.",
    });
  }
});

// =====================================================
// CREATE SUBJECT
//
// POST /api/registrar/subjects
//
// Body:
// {
//   subject_code: "IT101",
//   subject_name: "Introduction to IT",
//   units: 3,
//   lecture_hours: 3,
//   laboratory_hours: 0,
//   description: "..."
//
// }
// =====================================================

router.post("/", async (req, res) => {
  try {
    const {
      subject_code,
      subject_name,
      units,
      lecture_hours,
      laboratory_hours,
      description,
    } = req.body;

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

    if (typeof subject_code !== "string" || !subject_code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject code is required.",
      });
    }

    if (typeof subject_name !== "string" || !subject_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject name is required.",
      });
    }

    const parsedUnits = Number(units);

    const parsedLectureHours =
      lecture_hours === undefined ||
      lecture_hours === null ||
      lecture_hours === ""
        ? 3
        : Number(lecture_hours);

    const parsedLaboratoryHours =
      laboratory_hours === undefined ||
      laboratory_hours === null ||
      laboratory_hours === ""
        ? 0
        : Number(laboratory_hours);

    if (!Number.isFinite(parsedUnits) || parsedUnits < 0) {
      return res.status(400).json({
        success: false,
        message: "Units must be a valid non-negative number.",
      });
    }

    if (!Number.isFinite(parsedLectureHours) || parsedLectureHours < 0) {
      return res.status(400).json({
        success: false,
        message: "Lecture hours must be a valid non-negative number.",
      });
    }

    if (!Number.isFinite(parsedLaboratoryHours) || parsedLaboratoryHours < 0) {
      return res.status(400).json({
        success: false,
        message: "Laboratory hours must be a valid non-negative number.",
      });
    }

    const cleanCode = subject_code.trim().toUpperCase();
    const cleanName = subject_name.trim();

    const cleanDescription =
      typeof description === "string" && description.trim()
        ? description.trim()
        : null;

    // -------------------------------------------------
    // CHECK DUPLICATE CODE
    // -------------------------------------------------

    const [existing] = await db.execute(
      `
        SELECT subject_id
        FROM subjects
        WHERE subject_code = ?
        LIMIT 1
      `,
      [cleanCode],
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Subject code "${cleanCode}" already exists.`,
      });
    }

    // -------------------------------------------------
    // INSERT
    // -------------------------------------------------

    const [result] = await db.execute(
      `
        INSERT INTO subjects (
          subject_code,
          subject_name,
          units,
          lecture_hours,
          laboratory_hours,
          description
        )

        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        cleanCode,
        cleanName,
        parsedUnits,
        parsedLectureHours,
        parsedLaboratoryHours,
        cleanDescription,
      ],
    );

    // -------------------------------------------------
    // GET CREATED SUBJECT
    // -------------------------------------------------

    const [createdRows] = await db.execute(
      `
        SELECT
          subject_id,
          subject_code,
          subject_name,
          units,
          lecture_hours,
          laboratory_hours,
          description,
          created_at

        FROM subjects

        WHERE subject_id = ?

        LIMIT 1
      `,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Subject created successfully.",
      subject: createdRows[0],
    });
  } catch (error) {
    console.error("CREATE SUBJECT ERROR:", error);

    // MySQL duplicate unique key
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Subject code already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create subject.",
    });
  }
});

// =====================================================
// UPDATE SUBJECT
//
// PUT /api/registrar/subjects/:id
//
// Body:
// {
//   subject_code: "IT101",
//   subject_name: "Introduction to IT",
//   units: 3,
//   lecture_hours: 3,
//   laboratory_hours: 0,
//   description: "..."
//
// }
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const subjectId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject ID.",
      });
    }

    const {
      subject_code,
      subject_name,
      units,
      lecture_hours,
      laboratory_hours,
      description,
    } = req.body;

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

    if (typeof subject_code !== "string" || !subject_code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject code is required.",
      });
    }

    if (typeof subject_name !== "string" || !subject_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject name is required.",
      });
    }

    const parsedUnits = Number(units);

    const parsedLectureHours = Number(lecture_hours);

    const parsedLaboratoryHours = Number(laboratory_hours);

    if (!Number.isFinite(parsedUnits) || parsedUnits < 0) {
      return res.status(400).json({
        success: false,
        message: "Units must be a valid non-negative number.",
      });
    }

    if (!Number.isFinite(parsedLectureHours) || parsedLectureHours < 0) {
      return res.status(400).json({
        success: false,
        message: "Lecture hours must be a valid non-negative number.",
      });
    }

    if (!Number.isFinite(parsedLaboratoryHours) || parsedLaboratoryHours < 0) {
      return res.status(400).json({
        success: false,
        message: "Laboratory hours must be a valid non-negative number.",
      });
    }

    const cleanCode = subject_code.trim().toUpperCase();

    const cleanName = subject_name.trim();

    const cleanDescription =
      typeof description === "string" && description.trim()
        ? description.trim()
        : null;

    // -------------------------------------------------
    // CHECK SUBJECT EXISTS
    // -------------------------------------------------

    const [existingSubject] = await db.execute(
      `
        SELECT subject_id
        FROM subjects
        WHERE subject_id = ?
        LIMIT 1
      `,
      [subjectId],
    );

    if (existingSubject.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    // -------------------------------------------------
    // CHECK DUPLICATE SUBJECT CODE
    // -------------------------------------------------

    const [duplicate] = await db.execute(
      `
        SELECT subject_id
        FROM subjects
        WHERE subject_code = ?
          AND subject_id <> ?
        LIMIT 1
      `,
      [cleanCode, subjectId],
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Subject code "${cleanCode}" is already used by another subject.`,
      });
    }

    // -------------------------------------------------
    // UPDATE
    // -------------------------------------------------

    await db.execute(
      `
        UPDATE subjects

        SET
          subject_code = ?,
          subject_name = ?,
          units = ?,
          lecture_hours = ?,
          laboratory_hours = ?,
          description = ?

        WHERE subject_id = ?
      `,
      [
        cleanCode,
        cleanName,
        parsedUnits,
        parsedLectureHours,
        parsedLaboratoryHours,
        cleanDescription,
        subjectId,
      ],
    );

    // -------------------------------------------------
    // GET UPDATED SUBJECT
    // -------------------------------------------------

    const [updatedRows] = await db.execute(
      `
        SELECT
          subject_id,
          subject_code,
          subject_name,
          units,
          lecture_hours,
          laboratory_hours,
          description,
          created_at

        FROM subjects

        WHERE subject_id = ?

        LIMIT 1
      `,
      [subjectId],
    );

    return res.json({
      success: true,
      message: "Subject updated successfully.",
      subject: updatedRows[0],
    });
  } catch (error) {
    console.error("UPDATE SUBJECT ERROR:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Subject code already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update subject.",
    });
  }
});

// =====================================================
// DELETE SUBJECT
//
// DELETE /api/registrar/subjects/:id
// =====================================================

router.delete("/:id", async (req, res) => {
  try {
    const subjectId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject ID.",
      });
    }

    // -------------------------------------------------
    // CHECK SUBJECT
    // -------------------------------------------------

    const [subjectRows] = await db.execute(
      `
        SELECT
          subject_id,
          subject_code,
          subject_name

        FROM subjects

        WHERE subject_id = ?

        LIMIT 1
      `,
      [subjectId],
    );

    if (subjectRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    const subject = subjectRows[0];

    // -------------------------------------------------
    // DELETE
    // -------------------------------------------------

    await db.execute(
      `
        DELETE FROM subjects
        WHERE subject_id = ?
      `,
      [subjectId],
    );

    return res.json({
      success: true,

      message: "Subject deleted successfully.",

      deleted: {
        subject_id: subject.subject_id,
        subject_code: subject.subject_code,
        subject_name: subject.subject_name,
      },
    });
  } catch (error) {
    console.error("DELETE SUBJECT ERROR:", error);

    // -------------------------------------------------
    // FOREIGN KEY PROTECTION
    // -------------------------------------------------

    if (
      error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_ROW_IS_REFERENCED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This subject cannot be deleted because it is already being used by another academic record or curriculum.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete subject.",
    });
  }
});

export default router;
