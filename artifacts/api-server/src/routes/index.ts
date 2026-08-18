import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import categoriesRouter from "./categories";
import rulesRouter from "./rules";
import sourcesRouter from "./sources";
import analyticsRouter from "./analytics";
import appearanceRouter from "./appearance";
import authRouter from "./auth";
import agentsRouter from "./agents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(conversationsRouter);
router.use(categoriesRouter);
router.use(rulesRouter);
router.use(sourcesRouter);
router.use(analyticsRouter);
router.use(appearanceRouter);
router.use(authRouter);

export default router;
