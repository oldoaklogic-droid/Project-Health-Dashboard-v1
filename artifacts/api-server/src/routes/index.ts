import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import bqeRouter from "./bqe";
import pipelineEstimatingRouter from "./pipelineEstimating";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(bqeRouter);
router.use(pipelineEstimatingRouter);

export default router;
