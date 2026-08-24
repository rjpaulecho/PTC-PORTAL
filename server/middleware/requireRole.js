/**
 * Role-Based Access Control middleware
 *
 * Usage:
 *
 * requireRole("Admin")
 *
 * requireRole("Faculty", "Program Head")
 */
export default function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // ==========================================
    // 1. User must already be authenticated
    // ==========================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // ==========================================
    // 2. Validate authenticated role
    // ==========================================

    const currentRole = req.user.role_name;

    if (!currentRole) {
      return res.status(403).json({
        success: false,
        message: "User role could not be determined.",
      });
    }

    // ==========================================
    // 3. Check allowed roles
    // ==========================================

    if (!allowedRoles.includes(currentRole)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    // ==========================================
    // 4. Authorized
    // ==========================================

    next();
  };
}
