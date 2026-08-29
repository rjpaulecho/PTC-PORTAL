import express from "express";

import enrollmentRoutes from "./enrollments.js";
import academicRoutes from "./academicRecords.js";

console.log("✅ STUDENT INDEX ROUTER LOADED");
console.log("✅ STUDENT ACADEMIC RECORD ROUTER REGISTERED");

const router = express.Router();

router.use("/enrollments", enrollmentRoutes);
router.use("/academic-records", academicRoutes);

export default router;
