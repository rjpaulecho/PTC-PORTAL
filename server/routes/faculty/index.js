// routes/faculty/index.js
//
// =====================================================
// FACULTY ROUTER
// =====================================================
//
// Central route entry point for all Faculty APIs.
//
// server.js
//    ↓
// /api/faculty
//    ↓
// faculty/index.js
//    ↓
// classes.js
// grades.js
// etc.
//
// Authentication + Faculty RBAC are applied in
// server.js to the entire /api/faculty route group.
// =====================================================

import express from "express";

import classesRouter from "./classes.js";

const router = express.Router();

// =====================================================
// FACULTY CLASSES
// =====================================================
//
// Final routes:
//
// GET /api/faculty/classes
//
// Later:
//
// GET /api/faculty/classes/:offeringId/students
// =====================================================

router.use("/classes", classesRouter);

// =====================================================
// FUTURE FACULTY ROUTES
// =====================================================
//
// Later we can add:
//
// import gradesRouter from "./grades.js";
//
// router.use("/grades", gradesRouter);
//
// Example:
//
// /api/faculty/grades/...
//
// =====================================================

// =====================================================
// EXPORT
// =====================================================

export default router;