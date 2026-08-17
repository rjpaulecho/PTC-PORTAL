import express from "express";

import studentRecordsRoutes from "./studentrecords.js";
import enrollmentRoutes from "./enrollments.js";
import curriculumRoutes from "./curriculums.js";
import subjectRoutes from "./subjects.js";

const router = express.Router();

router.use("/students", studentRecordsRoutes);
router.use("/enrollments", enrollmentRoutes);
router.use("/curriculums", curriculumRoutes);
router.use("/subjects", subjectRoutes);

export default router;
