import express from "express";
import db from "../../db.js";

const router = express.Router();

// ======================================================
// SHARED AUTHENTICATED ANNOUNCEMENT ROUTES
//
// Expected server mount:
//
// app.use(
//   "/api/announcements",
//   authenticate,
//   usersAnnouncementRoutes
// );
//
// req.user is created by authenticate middleware.
//
// NEVER trust role_id from:
// - req.query
// - req.body
// - req.params
//
// The current user's role comes from:
//
// req.user.role_id
// req.user.role_name
// ======================================================

// ======================================================
// GET ALL VISIBLE ANNOUNCEMENTS
//
// GET /api/announcements
// ======================================================

router.get("/", async (req, res) => {
  try {
    // ====================================================
    // AUTH CHECK
    // ====================================================

    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const roleId = Number(req.user.role_id);

    if (!Number.isInteger(roleId) || roleId <= 0) {
      return res.status(403).json({
        error: "Authenticated user does not have a valid role.",
      });
    }

    console.log("===== USER ANNOUNCEMENTS =====");
    console.log("USER ID:", req.user.user_id);
    console.log("ROLE:", req.user.role_name);
    console.log("ROLE ID:", roleId);

    // ====================================================
    // GET ANNOUNCEMENTS FOR AUTHENTICATED ROLE
    // ====================================================

    const [rows] = await db.execute(
      `
      SELECT DISTINCT

          a.announcement_id,
          a.title,
          a.content,

          u.username AS created_by,

          a.publish_date,
          a.expiry_date,
          a.is_active,
          a.created_at,

          GROUP_CONCAT(
              DISTINCT r.role_name
              ORDER BY r.role_name
              SEPARATOR ', '
          ) AS recipients,

          GROUP_CONCAT(
              DISTINCT f.original_name
              ORDER BY f.original_name
              SEPARATOR ', '
          ) AS attachments

      FROM announcements a

      INNER JOIN announcement_recipients ar
          ON ar.announcement_id = a.announcement_id

      LEFT JOIN users u
          ON u.user_id = a.created_by

      LEFT JOIN roles r
          ON r.role_id = ar.role_id

      LEFT JOIN announcement_attachments aa
          ON aa.announcement_id = a.announcement_id

      LEFT JOIN files f
          ON f.file_id = aa.file_id

      WHERE
          ar.role_id = ?

          AND a.is_active = 1

          AND a.publish_date <= NOW()

          AND (
              a.expiry_date IS NULL
              OR a.expiry_date >= NOW()
          )

      GROUP BY

          a.announcement_id,
          a.title,
          a.content,
          u.username,
          a.publish_date,
          a.expiry_date,
          a.is_active,
          a.created_at

      ORDER BY

          a.publish_date DESC,
          a.created_at DESC
      `,
      [roleId],
    );

    return res.json(rows);
  } catch (error) {
    console.error("GET USER ANNOUNCEMENTS ERROR:", error);

    return res.status(500).json({
      error: "Failed to load announcements.",
    });
  }
});

// ======================================================
// GET SINGLE VISIBLE ANNOUNCEMENT
//
// GET /api/announcements/:id
// ======================================================

router.get("/:id", async (req, res) => {
  try {
    // ====================================================
    // AUTH CHECK
    // ====================================================

    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const announcementId = Number(req.params.id);
    const roleId = Number(req.user.role_id);

    // ====================================================
    // VALIDATE ANNOUNCEMENT ID
    // ====================================================

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return res.status(400).json({
        error: "Invalid announcement id.",
      });
    }

    // ====================================================
    // VALIDATE ROLE
    // ====================================================

    if (!Number.isInteger(roleId) || roleId <= 0) {
      return res.status(403).json({
        error: "Authenticated user does not have a valid role.",
      });
    }

    console.log("===== USER ANNOUNCEMENT DETAILS =====");
    console.log("ANNOUNCEMENT ID:", announcementId);
    console.log("USER ID:", req.user.user_id);
    console.log("ROLE:", req.user.role_name);
    console.log("ROLE ID:", roleId);

    // ====================================================
    // GET ANNOUNCEMENT
    //
    // The authenticated user's role must be a recipient.
    // Only active, published, unexpired announcements
    // are visible through this shared route.
    // ====================================================

    const [rows] = await db.execute(
      `
      SELECT DISTINCT

          a.announcement_id,
          a.title,
          a.content,

          u.username AS created_by,

          a.publish_date,
          a.expiry_date,
          a.is_active,
          a.created_at

      FROM announcements a

      INNER JOIN announcement_recipients ar
          ON ar.announcement_id = a.announcement_id

      LEFT JOIN users u
          ON u.user_id = a.created_by

      WHERE
          a.announcement_id = ?

          AND ar.role_id = ?

          AND a.is_active = 1

          AND a.publish_date <= NOW()

          AND (
              a.expiry_date IS NULL
              OR a.expiry_date >= NOW()
          )

      LIMIT 1
      `,
      [announcementId, roleId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Announcement not found or you do not have access to it.",
      });
    }

    // ====================================================
    // RECIPIENTS
    // ====================================================

    const [recipientRows] = await db.execute(
      `
      SELECT

          r.role_id,
          r.role_name

      FROM announcement_recipients ar

      INNER JOIN roles r
          ON r.role_id = ar.role_id

      WHERE ar.announcement_id = ?

      ORDER BY r.role_name
      `,
      [announcementId],
    );

    // ====================================================
    // ATTACHMENTS
    // ====================================================

    const [attachmentRows] = await db.execute(
      `
      SELECT

          f.file_id,
          f.original_name,
          f.file_path,
          f.file_size,
          f.mime_type

      FROM announcement_attachments aa

      INNER JOIN files f
          ON f.file_id = aa.file_id

      WHERE aa.announcement_id = ?

      ORDER BY f.original_name
      `,
      [announcementId],
    );

    // ====================================================
    // RESPONSE
    // ====================================================

    return res.json({
      ...rows[0],

      recipients: recipientRows,

      attachments: attachmentRows,
    });
  } catch (error) {
    console.error("GET USER ANNOUNCEMENT DETAILS ERROR:", error);

    return res.status(500).json({
      error: "Failed to load announcement.",
    });
  }
});

export default router;
