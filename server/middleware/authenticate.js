import jwt from "jsonwebtoken";
import db from "../db.js";

/**
 * Authentication middleware
 *
 * Responsibilities:
 * 1. Read JWT from Authorization header
 * 2. Verify JWT
 * 3. Extract user_id
 * 4. Reload user and role from database
 * 5. Verify account is active and verified
 * 6. Attach authenticated identity to req.user
 */
export default async function authenticate(req, res, next) {
  try {
    // ==========================================
    // 1. Read Authorization header
    // ==========================================

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // Expected:
    // Authorization: Bearer eyJhbGciOi...
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format.",
      });
    }

    // ==========================================
    // 2. Extract token
    // ==========================================

    const token = authHeader.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
    }

    // ==========================================
    // 3. Verify JWT
    // ==========================================

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Authentication token has expired.",
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    // ==========================================
    // 4. Validate user_id from token
    // ==========================================

    const userId = Number(decoded.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    // ==========================================
    // 5. Reload user + current role
    // ==========================================

    const [rows] = await db.execute(
      `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.role_id,
        u.is_active,
        u.is_verified,
        r.role_name
      FROM users u
      INNER JOIN roles r
        ON r.role_id = u.role_id
      WHERE u.user_id = ?
      LIMIT 1
      `,
      [userId],
    );

    // ==========================================
    // 6. User no longer exists
    // ==========================================

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    const user = rows[0];

    // ==========================================
    // 7. Account must be active
    // ==========================================

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    // ==========================================
    // 8. Account must be verified
    // ==========================================

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: "Your account is not verified.",
      });
    }

    // ==========================================
    // 9. Attach trusted authenticated user
    // ==========================================

    req.user = {
      user_id: Number(user.user_id),
      username: user.username,
      email: user.email,
      role_id: Number(user.role_id),
      role_name: user.role_name,
    };

    // ==========================================
    // 10. Continue request
    // ==========================================

    next();
  } catch (error) {
    console.error("AUTHENTICATION MIDDLEWARE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication verification failed.",
    });
  }
}
