// routes/registrar/courses.js

import express from "express";
import db from "../../db.js";

const router = express.Router();

console.log("REGISTRAR COURSE ROUTER LOADED");

// =====================================================
// GET ALL COURSES
//
// GET /api/registrar/courses
//
// Query parameters:
// ?search=BSIT
// ?department=1
// =====================================================

router.get("/", async (req, res) => {
  try {
    const { search = "", department = "" } = req.query;

    const where = [];
    const params = [];

    // =================================================
    // SEARCH
    // =================================================

    if (String(search).trim()) {
      const searchValue = `%${String(search).trim()}%`;

      where.push(`
        (
          c.course_code LIKE ?
          OR c.course_name LIKE ?
          OR d.department_code LIKE ?
          OR d.department_name LIKE ?
        )
      `);

      params.push(searchValue, searchValue, searchValue, searchValue);
    }

    // =================================================
    // DEPARTMENT FILTER
    // =================================================

    if (String(department) !== "") {
      const departmentId = Number(department);

      if (Number.isInteger(departmentId) && departmentId > 0) {
        where.push("c.department_id = ?");
        params.push(departmentId);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // =================================================
    // GET COURSES
    // =================================================

    const [courses] = await db.execute(
      `
        SELECT
          c.course_id,
          c.department_id,

          c.course_code,
          c.course_name,

          c.total_years,

          d.department_code,
          d.department_name,

          c.created_at

        FROM courses c

        INNER JOIN departments d
          ON d.department_id = c.department_id

        ${whereClause}

        ORDER BY
          c.course_code ASC
      `,
      params,
    );

    return res.json({
      success: true,
      data: courses,
      courses,
    });
  } catch (error) {
    console.error("GET REGISTRAR COURSES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch courses.",
    });
  }
});

// =====================================================
// GET SINGLE COURSE
//
// GET /api/registrar/courses/:id
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID.",
      });
    }

    const [rows] = await db.execute(
      `
        SELECT
          c.course_id,
          c.department_id,

          c.course_code,
          c.course_name,

          c.total_years,

          d.department_code,
          d.department_name,

          c.created_at

        FROM courses c

        INNER JOIN departments d
          ON d.department_id = c.department_id

        WHERE c.course_id = ?

        LIMIT 1
      `,
      [courseId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    return res.json({
      success: true,
      course: rows[0],
    });
  } catch (error) {
    console.error("GET COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch course.",
    });
  }
});

// =====================================================
// GET ALL DEPARTMENTS
//
// GET /api/registrar/courses/departments
//
// Used by Add Course modal
// =====================================================

router.get("/departments/list", async (req, res) => {
  try {
    const [departments] = await db.execute(
      `
        SELECT
          department_id,
          department_code,
          department_name

        FROM departments

        ORDER BY
          department_name ASC
      `,
    );

    return res.json({
      success: true,
      data: departments,
      departments,
    });
  } catch (error) {
    console.error("GET DEPARTMENTS FOR COURSES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch departments.",
    });
  }
});

// =====================================================
// CREATE COURSE
//
// POST /api/registrar/courses
//
// Body:
//
// {
//   "department_id": 1,
//   "course_code": "BSIT",
//   "course_name": "Bachelor of Science in Information Technology",
//   "total_years": 4
// }
// =====================================================

router.post("/", async (req, res) => {
  let connection;

  try {
    const {
      department_id,
      course_code,
      course_name,
      total_years = 4,
    } = req.body;

    const departmentId = Number(department_id);
    const totalYears = Number(total_years);

    // =================================================
    // VALIDATE DEPARTMENT
    // =================================================

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid department ID is required.",
      });
    }

    // =================================================
    // VALIDATE COURSE CODE
    // =================================================

    if (
      !course_code ||
      typeof course_code !== "string" ||
      course_code.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Course code is required.",
      });
    }

    const normalizedCourseCode = course_code.trim().toUpperCase();

    if (normalizedCourseCode.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Course code must not exceed 20 characters.",
      });
    }

    // =================================================
    // VALIDATE COURSE NAME
    // =================================================

    if (
      !course_name ||
      typeof course_name !== "string" ||
      course_name.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Course name is required.",
      });
    }

    const normalizedCourseName = course_name.trim();

    if (normalizedCourseName.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Course name must not exceed 200 characters.",
      });
    }

    // =================================================
    // VALIDATE TOTAL YEARS
    // =================================================

    if (!Number.isInteger(totalYears) || totalYears < 1 || totalYears > 10) {
      return res.status(400).json({
        success: false,
        message: "Total years must be between 1 and 10.",
      });
    }

    // =================================================
    // CONNECTION
    // =================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // VERIFY DEPARTMENT
    // =================================================

    const [departmentRows] = await connection.execute(
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
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Department not found.",
      });
    }

    // =================================================
    // CHECK DUPLICATE COURSE CODE
    // =================================================

    const [existingCodeRows] = await connection.execute(
      `
          SELECT
            course_id,
            course_code,
            course_name

          FROM courses

          WHERE course_code = ?

          LIMIT 1
        `,
      [normalizedCourseCode],
    );

    if (existingCodeRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Course code already exists.",
        course_id: existingCodeRows[0].course_id,
      });
    }

    // =================================================
    // CHECK DUPLICATE COURSE NAME
    // =================================================

    const [existingNameRows] = await connection.execute(
      `
          SELECT
            course_id,
            course_code,
            course_name

          FROM courses

          WHERE course_name = ?

          LIMIT 1
        `,
      [normalizedCourseName],
    );

    if (existingNameRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Course name already exists.",
        course_id: existingNameRows[0].course_id,
      });
    }

    // =================================================
    // INSERT COURSE
    // =================================================

    const [result] = await connection.execute(
      `
        INSERT INTO courses (
          department_id,
          course_code,
          course_name,
          total_years
        )

        VALUES (?, ?, ?, ?)
      `,
      [departmentId, normalizedCourseCode, normalizedCourseName, totalYears],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,

      message: "Course created successfully.",

      course_id: result.insertId,

      course: {
        course_id: result.insertId,
        department_id: departmentId,
        course_code: normalizedCourseCode,
        course_name: normalizedCourseName,
        total_years: totalYears,

        department: departmentRows[0],
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    // =================================================
    // DUPLICATE DATABASE ERROR
    // =================================================

    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Course code already exists.",
      });
    }

    console.error("CREATE COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create course.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =====================================================
// UPDATE COURSE
//
// PUT /api/registrar/courses/:id
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID.",
      });
    }

    const { department_id, course_code, course_name, total_years } = req.body;

    const updates = [];
    const params = [];

    // =================================================
    // DEPARTMENT
    // =================================================

    if (department_id !== undefined) {
      const departmentId = Number(department_id);

      if (!Number.isInteger(departmentId) || departmentId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid department ID.",
        });
      }

      const [departmentRows] = await db.execute(
        `
            SELECT department_id
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

      updates.push("department_id = ?");
      params.push(departmentId);
    }

    // =================================================
    // COURSE CODE
    // =================================================

    if (course_code !== undefined) {
      if (typeof course_code !== "string" || course_code.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Course code cannot be empty.",
        });
      }

      const normalizedCourseCode = course_code.trim().toUpperCase();

      const [duplicateRows] = await db.execute(
        `
            SELECT course_id
            FROM courses
            WHERE course_code = ?
              AND course_id != ?
            LIMIT 1
          `,
        [normalizedCourseCode, courseId],
      );

      if (duplicateRows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Course code already exists.",
        });
      }

      updates.push("course_code = ?");
      params.push(normalizedCourseCode);
    }

    // =================================================
    // COURSE NAME
    // =================================================

    if (course_name !== undefined) {
      if (typeof course_name !== "string" || course_name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Course name cannot be empty.",
        });
      }

      updates.push("course_name = ?");
      params.push(course_name.trim());
    }

    // =================================================
    // TOTAL YEARS
    // =================================================

    if (total_years !== undefined) {
      const totalYears = Number(total_years);

      if (!Number.isInteger(totalYears) || totalYears < 1 || totalYears > 10) {
        return res.status(400).json({
          success: false,
          message: "Total years must be between 1 and 10.",
        });
      }

      updates.push("total_years = ?");
      params.push(totalYears);
    }

    // =================================================
    // NO UPDATE
    // =================================================

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No course fields were provided for update.",
      });
    }

    // =================================================
    // CHECK COURSE
    // =================================================

    const [existingRows] = await db.execute(
      `
          SELECT course_id
          FROM courses
          WHERE course_id = ?
          LIMIT 1
        `,
      [courseId],
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    // =================================================
    // UPDATE
    // =================================================

    params.push(courseId);

    await db.execute(
      `
        UPDATE courses

        SET ${updates.join(", ")}

        WHERE course_id = ?
      `,
      params,
    );

    return res.json({
      success: true,
      message: "Course updated successfully.",
    });
  } catch (error) {
    console.error("UPDATE COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update course.",
    });
  }
});

// =====================================================
// DELETE COURSE
//
// DELETE /api/registrar/courses/:id
//
// We should NOT allow deletion when the course is already
// being referenced by curriculum/student records.
// =====================================================

router.delete("/:id", async (req, res) => {
  let connection;

  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID.",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // CHECK COURSE
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
        message: "Course not found.",
      });
    }

    // =================================================
    // CHECK CURRICULUM REFERENCES
    // =================================================

    const [curriculumRows] = await connection.execute(
      `
          SELECT
            curriculum_id

          FROM curriculum

          WHERE course_id = ?

          LIMIT 1
        `,
      [courseId],
    );

    if (curriculumRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "This course cannot be deleted because it is already used by a curriculum.",
      });
    }

    // =================================================
    // DELETE
    // =================================================

    await connection.execute(
      `
        DELETE FROM courses

        WHERE course_id = ?
      `,
      [courseId],
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Course deleted successfully.",
      deleted: courseRows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("DELETE COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete course.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;
