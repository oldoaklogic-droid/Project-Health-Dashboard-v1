import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import bqeRouter from "./bqe";
import pipelineEstimatingRouter from "./pipelineEstimating";
import managerRouter from "./manager";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(bqeRouter);
router.use(pipelineEstimatingRouter);
router.use(managerRouter);
router.use(searchRouter);

export default router;
