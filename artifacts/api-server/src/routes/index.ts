import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workspaceRouter from "./workspace";
import featuresRouter from "./features";
import commentsRouter from "./comments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workspaceRouter);
router.use(featuresRouter);
router.use(commentsRouter);

export default router;
