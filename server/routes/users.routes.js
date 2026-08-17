import express from "express";
import bcrypt from "bcrypt";
import db from "../db.js";

const router = express.Router();

//
// GET ALL USERS
//
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.role_id,
        r.role_name AS role,
        u.is_active,
        u.is_verified,
        u.created_at
      FROM users u
      INNER JOIN roles r
        ON u.role_id = r.role_id
      ORDER BY u.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to load users.",
    });
  }
});

//
// GET USER BY ID
//
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.role_id,
        r.role_name AS role,
        u.is_active,
        u.is_verified
      FROM users u
      INNER JOIN roles r
      ON u.role_id=r.role_id
      WHERE u.user_id=?
      `,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Server error.",
    });
  }
});

//
// CREATE USER
//
router.post("/", async (req, res) => {
  const { username, email, password, role_id } = req.body;

  if (!username || !email || !password || !role_id) {
    return res.status(400).json({
      error: "Please fill in all required fields.",
    });
  }

  try {
    const [existing] = await db.execute(
      `
      SELECT user_id
      FROM users
      WHERE username=? OR email=?
      `,
      [username, email],
    );

    if (existing.length > 0) {
      return res.status(409).json({
        error: "Username or email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      `
      INSERT INTO users
      (
        username,
        email,
        password_hash,
        role_id,
        is_verified,
        is_active
      )
      VALUES
      (?, ?, ?, ?, ?, ?)
      `,
      [username, email, passwordHash, role_id, true, true],
    );

    res.status(201).json({
      message: "User created successfully.",
      user_id: result.insertId,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to create user.",
    });
  }
});

//
// UPDATE USER
//
router.put("/:id", async (req, res) => {
  const { username, email, role_id } = req.body;

  try {
    await db.execute(
      `
      UPDATE users
      SET
        username=?,
        email=?,
        role_id=?
      WHERE user_id=?
      `,
      [username, email, role_id, req.params.id],
    );

    res.json({
      message: "User updated successfully.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to update user.",
    });
  }
});

//
// ACTIVATE / DEACTIVATE
//
router.patch("/:id/status", async (req, res) => {
  const { is_active } = req.body;

  try {
    await db.execute(
      `
      UPDATE users
      SET is_active=?
      WHERE user_id=?
      `,
      [is_active, req.params.id],
    );

    res.json({
      message: "Status updated.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to update status.",
    });
  }
});

//
// RESET PASSWORD
//
router.patch("/:id/reset-password", async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      error: "Password is required.",
    });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    await db.execute(
      `
      UPDATE users
      SET password_hash=?
      WHERE user_id=?
      `,
      [hash, req.params.id],
    );

    res.json({
      message: "Password reset successfully.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to reset password.",
    });
  }
});

export default router;
