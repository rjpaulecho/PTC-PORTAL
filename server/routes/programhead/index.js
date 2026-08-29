import express from "express";

import classesRouter from "./classes.js";
import gradesRouter from "./grades.js";

const router = express.Router();

router.use("/classes", classesRouter);
router.use("/grades", gradesRouter);

export default router;