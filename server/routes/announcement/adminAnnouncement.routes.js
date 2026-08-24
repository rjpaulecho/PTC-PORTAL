import express from "express";
import db from "../../db.js";
import { logActivity } from "../../utils/activityLogger.js";

const router = express.Router();

// ======================================================
// ANNOUNCEMENT MANAGEMENT
//
// Expected server mount:
//
// app.use(
//   "/api/announcement-management",
//   authenticate,
//   requireRole("Admin", "Registrar"),
//   announcementManagementRouter
// );
//
// SECURITY:
//
// Do NOT accept actor identity from frontend:
//
// created_by
// updated_by
// deleted_by
// role_id
//
// Actor identity must always come from:
//
// req.user.user_id
// req.user.role_name
// req.user.role_id
// ======================================================

// ======================================================
// HELPERS
// ======================================================

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function normalizeRecipientIds(recipients) {
  if (!Array.isArray(recipients)) {
    return [];
  }

  return [
    ...new Set(
      recipients
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
}

function normalizeAttachmentIds(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return [
    ...new Set(
      attachments
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
}

// ======================================================
// GET ALL ANNOUNCEMENTS FOR MANAGEMENT
//
// GET /api/announcement-management
//
// Admin + Registrar only via server middleware.
// Includes inactive / future / expired announcements
// because this is a management endpoint.
// ======================================================

router.get("/", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    console.log("===== MANAGE ANNOUNCEMENTS =====");

    console.log("ACTOR:", req.user.user_id, req.user.role_name);

    const [rows] = await db.execute(
      `
      SELECT

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

      LEFT JOIN users u
          ON u.user_id = a.created_by

      LEFT JOIN announcement_recipients ar
          ON ar.announcement_id = a.announcement_id

      LEFT JOIN roles r
          ON r.role_id = ar.role_id

      LEFT JOIN announcement_attachments aa
          ON aa.announcement_id = a.announcement_id

      LEFT JOIN files f
          ON f.file_id = aa.file_id

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
          a.created_at DESC
      `,
    );

    return res.json(rows);
  } catch (error) {
    console.error("GET MANAGE ANNOUNCEMENTS ERROR:", error);

    return res.status(500).json({
      error: "Failed to load announcements.",
    });
  }
});

// ======================================================
// GET SINGLE ANNOUNCEMENT FOR MANAGEMENT
//
// GET /api/announcement-management/:id
// ======================================================

router.get("/:id", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const announcementId = Number(req.params.id);

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return res.status(400).json({
        error: "Invalid announcement ID.",
      });
    }

    // ====================================================
    // ANNOUNCEMENT
    // ====================================================

    const [rows] = await db.execute(
      `
      SELECT

          a.announcement_id,
          a.title,
          a.content,

          a.created_by,

          u.username AS created_by_username,

          a.publish_date,
          a.expiry_date,
          a.is_active,
          a.created_at

      FROM announcements a

      LEFT JOIN users u
          ON u.user_id = a.created_by

      WHERE a.announcement_id = ?

      LIMIT 1
      `,
      [announcementId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Announcement not found.",
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

    return res.json({
      announcement_id: rows[0].announcement_id,

      title: rows[0].title,

      content: rows[0].content,

      created_by: rows[0].created_by_username,

      created_by_user_id: rows[0].created_by,

      publish_date: rows[0].publish_date,

      expiry_date: rows[0].expiry_date,

      is_active: rows[0].is_active,

      created_at: rows[0].created_at,

      recipients: recipientRows,

      attachments: attachmentRows,
    });
  } catch (error) {
    console.error("GET SINGLE MANAGE ANNOUNCEMENT ERROR:", error);

    return res.status(500).json({
      error: "Failed to load announcement.",
    });
  }
});

// ======================================================
// CREATE ANNOUNCEMENT
//
// POST /api/announcement-management
//
// BODY:
// {
//   title,
//   content,
//   publish_date,
//   expiry_date,
//   is_active,
//   recipients: [role_id, ...],
//   attachments: [file_id, ...]
// }
//
// DO NOT SEND:
// created_by
// role_id
//
// created_by = req.user.user_id
// ======================================================

router.post("/", async (req, res) => {
  const connection = await db.getConnection();

  try {
    if (!req.user) {
      connection.release();

      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const actorUserId = Number(req.user.user_id);

    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      connection.release();

      return res.status(401).json({
        error: "Invalid authenticated user.",
      });
    }

    const {
      title,
      content,
      publish_date,
      expiry_date,
      is_active,
      recipients,
      attachments,
    } = req.body;

    // ====================================================
    // VALIDATION
    // ====================================================

    const cleanTitle = String(title ?? "").trim();

    const cleanContent = String(content ?? "").trim();

    if (!cleanTitle) {
      connection.release();

      return res.status(400).json({
        error: "Announcement title is required.",
      });
    }

    if (!cleanContent) {
      connection.release();

      return res.status(400).json({
        error: "Announcement content is required.",
      });
    }

    if (!publish_date) {
      connection.release();

      return res.status(400).json({
        error: "Publish date is required.",
      });
    }

    const recipientIds = normalizeRecipientIds(recipients);

    if (recipientIds.length === 0) {
      connection.release();

      return res.status(400).json({
        error: "At least one recipient role is required.",
      });
    }

    const attachmentIds = normalizeAttachmentIds(attachments);

    const activeValue = Number(is_active) === 1 ? 1 : 0;

    // ====================================================
    // START TRANSACTION
    // ====================================================

    await connection.beginTransaction();

    // ====================================================
    // CREATE ANNOUNCEMENT
    // ====================================================

    const [result] = await connection.execute(
      `
        INSERT INTO announcements
        (
            title,
            content,
            created_by,
            publish_date,
            expiry_date,
            is_active
        )

        VALUES (?, ?, ?, ?, ?, ?)
        `,
      [
        cleanTitle,
        cleanContent,
        actorUserId,
        publish_date,
        expiry_date || null,
        activeValue,
      ],
    );

    const announcementId = Number(result.insertId);

    // ====================================================
    // RECIPIENTS
    // ====================================================

    for (const recipientId of recipientIds) {
      await connection.execute(
        `
        INSERT INTO announcement_recipients
        (
            announcement_id,
            role_id
        )

        VALUES (?, ?)
        `,
        [announcementId, recipientId],
      );
    }

    // ====================================================
    // ATTACHMENTS
    // ====================================================

    for (const fileId of attachmentIds) {
      await connection.execute(
        `
        INSERT INTO announcement_attachments
        (
            announcement_id,
            file_id
        )

        VALUES (?, ?)
        `,
        [announcementId, fileId],
      );
    }

    // ====================================================
    // COMMIT
    // ====================================================

    await connection.commit();

    // ====================================================
    // AUDIT
    // ====================================================

    try {
      await logActivity(
        actorUserId,
        "Create",
        "Announcements",
        `Created announcement "${cleanTitle}".`,
      );
    } catch (logError) {
      console.error("ANNOUNCEMENT CREATE ACTIVITY LOG ERROR:", logError);
    }

    return res.status(201).json({
      success: true,

      message: "Announcement created successfully.",

      announcement_id: announcementId,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("CREATE ANNOUNCEMENT ROLLBACK ERROR:", rollbackError);
    }

    console.error("CREATE ANNOUNCEMENT ERROR:", error);

    return res.status(500).json({
      error: "Failed to create announcement.",
    });
  } finally {
    try {
      connection.release();
    } catch {
      // Connection may already have been released
      // during an early validation return.
    }
  }
});

// ======================================================
// UPDATE ANNOUNCEMENT
//
// PUT /api/announcement-management/:id
//
// DO NOT SEND:
// updated_by
// role_id
//
// updated_by = req.user.user_id
// ======================================================

router.put("/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    if (!req.user) {
      connection.release();

      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const actorUserId = Number(req.user.user_id);

    const announcementId = Number(req.params.id);

    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      connection.release();

      return res.status(401).json({
        error: "Invalid authenticated user.",
      });
    }

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      connection.release();

      return res.status(400).json({
        error: "Invalid announcement ID.",
      });
    }

    const {
      title,
      content,
      publish_date,
      expiry_date,
      is_active,
      recipients,
      attachments,
    } = req.body;

    // ====================================================
    // VALIDATION
    // ====================================================

    const cleanTitle = String(title ?? "").trim();

    const cleanContent = String(content ?? "").trim();

    if (!cleanTitle) {
      connection.release();

      return res.status(400).json({
        error: "Announcement title is required.",
      });
    }

    if (!cleanContent) {
      connection.release();

      return res.status(400).json({
        error: "Announcement content is required.",
      });
    }

    if (!publish_date) {
      connection.release();

      return res.status(400).json({
        error: "Publish date is required.",
      });
    }

    const recipientIds = normalizeRecipientIds(recipients);

    if (recipientIds.length === 0) {
      connection.release();

      return res.status(400).json({
        error: "At least one recipient role is required.",
      });
    }

    const attachmentIds = normalizeAttachmentIds(attachments);

    const activeValue = Number(is_active) === 1 ? 1 : 0;

    // ====================================================
    // CHECK ANNOUNCEMENT
    // ====================================================

    const [existingRows] = await connection.execute(
      `
        SELECT announcement_id
        FROM announcements
        WHERE announcement_id = ?
        LIMIT 1
        `,
      [announcementId],
    );

    if (existingRows.length === 0) {
      connection.release();

      return res.status(404).json({
        error: "Announcement not found.",
      });
    }

    // ====================================================
    // START TRANSACTION
    // ====================================================

    await connection.beginTransaction();

    // ====================================================
    // UPDATE ANNOUNCEMENT
    // ====================================================

    await connection.execute(
      `
      UPDATE announcements

      SET
          title = ?,
          content = ?,
          publish_date = ?,
          expiry_date = ?,
          is_active = ?

      WHERE announcement_id = ?
      `,
      [
        cleanTitle,
        cleanContent,
        publish_date,
        expiry_date || null,
        activeValue,
        announcementId,
      ],
    );

    // ====================================================
    // REMOVE OLD RECIPIENTS
    // ====================================================

    await connection.execute(
      `
      DELETE FROM announcement_recipients

      WHERE announcement_id = ?
      `,
      [announcementId],
    );

    // ====================================================
    // INSERT NEW RECIPIENTS
    // ====================================================

    for (const recipientId of recipientIds) {
      await connection.execute(
        `
        INSERT INTO announcement_recipients
        (
            announcement_id,
            role_id
        )

        VALUES (?, ?)
        `,
        [announcementId, recipientId],
      );
    }

    // ====================================================
    // REMOVE OLD ATTACHMENTS
    // ====================================================

    await connection.execute(
      `
      DELETE FROM announcement_attachments

      WHERE announcement_id = ?
      `,
      [announcementId],
    );

    // ====================================================
    // INSERT NEW ATTACHMENTS
    // ====================================================

    for (const fileId of attachmentIds) {
      await connection.execute(
        `
        INSERT INTO announcement_attachments
        (
            announcement_id,
            file_id
        )

        VALUES (?, ?)
        `,
        [announcementId, fileId],
      );
    }

    // ====================================================
    // COMMIT
    // ====================================================

    await connection.commit();

    // ====================================================
    // AUDIT
    // ====================================================

    try {
      await logActivity(
        actorUserId,
        "Update",
        "Announcements",
        `Updated announcement "${cleanTitle}".`,
      );
    } catch (logError) {
      console.error("ANNOUNCEMENT UPDATE ACTIVITY LOG ERROR:", logError);
    }

    return res.json({
      success: true,

      message: "Announcement updated successfully.",
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("UPDATE ANNOUNCEMENT ROLLBACK ERROR:", rollbackError);
    }

    console.error("UPDATE ANNOUNCEMENT ERROR:", error);

    return res.status(500).json({
      error: "Failed to update announcement.",
    });
  } finally {
    try {
      connection.release();
    } catch {
      // Ignore already released connection.
    }
  }
});

// ======================================================
// DELETE ANNOUNCEMENT
//
// DELETE /api/announcement-management/:id
//
// No actor body required.
// Actor comes from req.user.user_id
// ======================================================

router.delete("/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    if (!req.user) {
      connection.release();

      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const actorUserId = Number(req.user.user_id);

    const announcementId = Number(req.params.id);

    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      connection.release();

      return res.status(401).json({
        error: "Invalid authenticated user.",
      });
    }

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      connection.release();

      return res.status(400).json({
        error: "Invalid announcement ID.",
      });
    }

    // ====================================================
    // GET ANNOUNCEMENT
    // ====================================================

    const [rows] = await connection.execute(
      `
        SELECT title

        FROM announcements

        WHERE announcement_id = ?

        LIMIT 1
        `,
      [announcementId],
    );

    if (rows.length === 0) {
      connection.release();

      return res.status(404).json({
        error: "Announcement not found.",
      });
    }

    const title = rows[0].title;

    // ====================================================
    // START TRANSACTION
    // ====================================================

    await connection.beginTransaction();

    // ====================================================
    // REMOVE ATTACHMENT MAPPINGS
    // ====================================================

    await connection.execute(
      `
      DELETE FROM announcement_attachments

      WHERE announcement_id = ?
      `,
      [announcementId],
    );

    // ====================================================
    // REMOVE RECIPIENT MAPPINGS
    // ====================================================

    await connection.execute(
      `
      DELETE FROM announcement_recipients

      WHERE announcement_id = ?
      `,
      [announcementId],
    );

    // ====================================================
    // DELETE ANNOUNCEMENT
    // ====================================================

    await connection.execute(
      `
      DELETE FROM announcements

      WHERE announcement_id = ?
      `,
      [announcementId],
    );

    // ====================================================
    // COMMIT
    // ====================================================

    await connection.commit();

    // ====================================================
    // AUDIT
    // ====================================================

    try {
      await logActivity(
        actorUserId,
        "Delete",
        "Announcements",
        `Deleted announcement "${title}".`,
      );
    } catch (logError) {
      console.error("ANNOUNCEMENT DELETE ACTIVITY LOG ERROR:", logError);
    }

    return res.json({
      success: true,

      message: "Announcement deleted successfully.",
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("DELETE ANNOUNCEMENT ROLLBACK ERROR:", rollbackError);
    }

    console.error("DELETE ANNOUNCEMENT ERROR:", error);

    return res.status(500).json({
      error: "Failed to delete announcement.",
    });
  } finally {
    try {
      connection.release();
    } catch {
      // Ignore already released connection.
    }
  }
});

// ======================================================
// CHANGE ANNOUNCEMENT STATUS
//
// PATCH /api/announcement-management/:id/status
//
// BODY:
// {
//   is_active: 0 | 1
// }
//
// No updated_by or role_id from frontend.
// ======================================================

router.patch("/:id/status", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const actorUserId = Number(req.user.user_id);

    const announcementId = Number(req.params.id);

    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      return res.status(401).json({
        error: "Invalid authenticated user.",
      });
    }

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return res.status(400).json({
        error: "Invalid announcement ID.",
      });
    }

    const { is_active } = req.body;

    const activeValue = Number(is_active);

    if (activeValue !== 0 && activeValue !== 1) {
      return res.status(400).json({
        error: "is_active must be either 0 or 1.",
      });
    }

    // ====================================================
    // CHECK ANNOUNCEMENT
    // ====================================================

    const [rows] = await db.execute(
      `
        SELECT
            announcement_id,
            title

        FROM announcements

        WHERE announcement_id = ?

        LIMIT 1
        `,
      [announcementId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Announcement not found.",
      });
    }

    // ====================================================
    // UPDATE
    // ====================================================

    await db.execute(
      `
      UPDATE announcements

      SET is_active = ?

      WHERE announcement_id = ?
      `,
      [activeValue, announcementId],
    );

    // ====================================================
    // AUDIT
    // ====================================================

    try {
      await logActivity(
        actorUserId,
        "Update",
        "Announcements",
        `Changed announcement "${rows[0].title}" status to ${
          activeValue === 1 ? "Active" : "Inactive"
        }.`,
      );
    } catch (logError) {
      console.error("ANNOUNCEMENT STATUS ACTIVITY LOG ERROR:", logError);
    }

    return res.json({
      success: true,

      message: "Announcement status updated successfully.",

      is_active: activeValue,
    });
  } catch (error) {
    console.error("STATUS UPDATE ERROR:", error);

    return res.status(500).json({
      error: "Failed to update status.",
    });
  }
});

export default router;
