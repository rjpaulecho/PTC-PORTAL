// routes/registrar/departments.js

import express from "express";
import db from "../../db.js";

const router = express.Router();

console.log("REGISTRAR DEPARTMENT ROUTER LOADED");

// =====================================================
// GET ALL DEPARTMENTS
//
// GET /api/registrar/departments
//
// Query:
// ?search=IT
// =====================================================

router.get("/", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const searchValue = String(search).trim();

    let sql = `
      SELECT
        department_id,
        department_code,
        department_name,
        created_at
      FROM departments
    `;

    const params = [];

    // -------------------------------------------------
    // SEARCH
    // -------------------------------------------------

    if (searchValue) {
      sql += `
        WHERE
          department_code LIKE ?
          OR department_name LIKE ?
      `;

      const value = `%${searchValue}%`;

      params.push(value, value);
    }

    sql += `
      ORDER BY
        department_code ASC,
        department_name ASC
    `;

    const [departments] = await db.execute(sql, params);

    return res.json({
      success: true,
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    console.error("GET REGISTRAR DEPARTMENTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch departments.",
    });
  }
});

// =====================================================
// GET DEPARTMENT BY ID
//
// GET /api/registrar/departments/:id
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID.",
      });
    }

    const [rows] = await db.execute(
      `
        SELECT
          department_id,
          department_code,
          department_name,
          created_at
        FROM departments
        WHERE department_id = ?
        LIMIT 1
      `,
      [departmentId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    return res.json({
      success: true,
      department: rows[0],
    });
  } catch (error) {
    console.error("GET DEPARTMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch department.",
    });
  }
});

// =====================================================
// CREATE DEPARTMENT
//
// POST /api/registrar/departments
//
// Body:
// {
//   "department_code": "IT",
//   "department_name": "Information Technology"
// }
// =====================================================

router.post("/", async (req, res) => {
  try {
    const { department_code, department_name } = req.body;

    // -------------------------------------------------
    // VALIDATE CODE
    // -------------------------------------------------

    if (
      !department_code ||
      typeof department_code !== "string" ||
      department_code.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Department code is required.",
      });
    }

    // -------------------------------------------------
    // VALIDATE NAME
    // -------------------------------------------------

    if (
      !department_name ||
      typeof department_name !== "string" ||
      department_name.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Department name is required.",
      });
    }

    const departmentCode = department_code.trim().toUpperCase();

    const departmentName = department_name.trim();

    if (departmentCode.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Department code cannot exceed 20 characters.",
      });
    }

    if (departmentName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Department name cannot exceed 150 characters.",
      });
    }

    // -------------------------------------------------
    // CHECK DUPLICATE CODE
    // -------------------------------------------------

    const [existingCode] = await db.execute(
      `
        SELECT
          department_id,
          department_code,
          department_name
        FROM departments
        WHERE department_code = ?
        LIMIT 1
      `,
      [departmentCode],
    );

    if (existingCode.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Department code already exists.",
        department_id: existingCode[0].department_id,
      });
    }

    // -------------------------------------------------
    // CHECK DUPLICATE NAME
    // -------------------------------------------------

    const [existingName] = await db.execute(
      `
        SELECT
          department_id,
          department_code,
          department_name
        FROM departments
        WHERE department_name = ?
        LIMIT 1
      `,
      [departmentName],
    );

    if (existingName.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Department name already exists.",
        department_id: existingName[0].department_id,
      });
    }

    // -------------------------------------------------
    // INSERT
    // -------------------------------------------------

    const [result] = await db.execute(
      `
        INSERT INTO departments (
          department_code,
          department_name
        )
        VALUES (?, ?)
      `,
      [departmentCode, departmentName],
    );

    // -------------------------------------------------
    // GET CREATED DEPARTMENT
    // -------------------------------------------------

    const [createdRows] = await db.execute(
      `
        SELECT
          department_id,
          department_code,
          department_name,
          created_at
        FROM departments
        WHERE department_id = ?
        LIMIT 1
      `,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Department created successfully.",
      department: createdRows[0],
    });
  } catch (error) {
    // -------------------------------------------------
    // MYSQL UNIQUE ERROR
    // -------------------------------------------------

    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Department code already exists.",
      });
    }

    console.error("CREATE DEPARTMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create department.",
    });
  }
});

// =====================================================
// UPDATE DEPARTMENT
//
// PUT /api/registrar/departments/:id
//
// Body:
// {
//   "department_code": "IT",
//   "department_name": "Information Technology"
// }
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID.",
      });
    }

    const { department_code, department_name } = req.body;

    const updates = [];
    const params = [];

    // -------------------------------------------------
    // CODE
    // -------------------------------------------------

    if (department_code !== undefined) {
      if (
        typeof department_code !== "string" ||
        department_code.trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Department code cannot be empty.",
        });
      }

      const departmentCode = department_code.trim().toUpperCase();

      if (departmentCode.length > 20) {
        return res.status(400).json({
          success: false,
          message: "Department code cannot exceed 20 characters.",
        });
      }

      // Check duplicate code
      const [duplicateCode] = await db.execute(
        `
          SELECT department_id
          FROM departments
          WHERE department_code = ?
            AND department_id <> ?
          LIMIT 1
        `,
        [departmentCode, departmentId],
      );

      if (duplicateCode.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Department code already exists.",
        });
      }

      updates.push("department_code = ?");
      params.push(departmentCode);
    }

    // -------------------------------------------------
    // NAME
    // -------------------------------------------------

    if (department_name !== undefined) {
      if (
        typeof department_name !== "string" ||
        department_name.trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Department name cannot be empty.",
        });
      }

      const departmentName = department_name.trim();

      if (departmentName.length > 150) {
        return res.status(400).json({
          success: false,
          message: "Department name cannot exceed 150 characters.",
        });
      }

      // Check duplicate name
      const [duplicateName] = await db.execute(
        `
          SELECT department_id
          FROM departments
          WHERE department_name = ?
            AND department_id <> ?
          LIMIT 1
        `,
        [departmentName, departmentId],
      );

      if (duplicateName.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Department name already exists.",
        });
      }

      updates.push("department_name = ?");
      params.push(departmentName);
    }

    // -------------------------------------------------
    // NOTHING TO UPDATE
    // -------------------------------------------------

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No department fields were provided for update.",
      });
    }

    // -------------------------------------------------
    // UPDATE
    // -------------------------------------------------

    params.push(departmentId);

    const [result] = await db.execute(
      `
        UPDATE departments
        SET ${updates.join(", ")}
        WHERE department_id = ?
      `,
      params,
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    // -------------------------------------------------
    // GET UPDATED DEPARTMENT
    // -------------------------------------------------

    const [updatedRows] = await db.execute(
      `
        SELECT
          department_id,
          department_code,
          department_name,
          created_at
        FROM departments
        WHERE department_id = ?
        LIMIT 1
      `,
      [departmentId],
    );

    return res.json({
      success: true,
      message: "Department updated successfully.",
      department: updatedRows[0],
    });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Department code already exists.",
      });
    }

    console.error("UPDATE DEPARTMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update department.",
    });
  }
});

// =====================================================
// DELETE DEPARTMENT
//
// DELETE /api/registrar/departments/:id
//
// IMPORTANT:
// A department should not be deleted if courses are
// already using it.
// =====================================================

router.delete("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID.",
      });
    }

    // -------------------------------------------------
    // VERIFY DEPARTMENT
    // -------------------------------------------------

    const [departmentRows] = await db.execute(
      `
        SELECT
          department_id,
          department_code,
          department_name
        FROM departments
        WHERE department_id = ?
        LIMIT 1
      `,
      [departmentId],
    );

    if (departmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    // -------------------------------------------------
    // CHECK COURSES
    // -------------------------------------------------

    const [courseRows] = await db.execute(
      `
        SELECT COUNT(*) AS total
        FROM courses
        WHERE department_id = ?
      `,
      [departmentId],
    );

    const courseCount = Number(courseRows[0]?.total || 0);

    if (courseCount > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This department cannot be deleted because courses are assigned to it.",
        course_count: courseCount,
      });
    }

    // -------------------------------------------------
    // DELETE
    // -------------------------------------------------

    await db.execute(
      `
        DELETE FROM departments
        WHERE department_id = ?
      `,
      [departmentId],
    );

    return res.json({
      success: true,
      message: "Department deleted successfully.",
      deleted: departmentRows[0],
    });
  } catch (error) {
    console.error("DELETE DEPARTMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete department.",
    });
  }
});

export default router;
