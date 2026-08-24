import express from "express";

import enrollmentRoutes from "./enrollments.js";

const router = express.Router();

router.use("/enrollments", enrollmentRoutes);

export default router;
