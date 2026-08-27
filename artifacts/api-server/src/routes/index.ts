import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import categoriesRouter from "./categories";
import rulesRouter from "./rules";
import sourcesRouter from "./sources";
import targetsRouter from "./targets";
import analyticsRouter from "./analytics";
import appearanceRouter from "./appearance";
import authRouter from "./auth";
import membersRouter from "./members";
import agentsRouter from "./agents";
import trainingQuestionsRouter from "./training-questions";
import escalationsRouter from "./escalations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(conversationsRouter);
router.use(trainingQuestionsRouter);
router.use(categoriesRouter);
router.use(rulesRouter);
router.use(sourcesRouter);
router.use(targetsRouter);
router.use(analyticsRouter);
router.use(appearanceRouter);
router.use(authRouter);
router.use(membersRouter);
router.use(escalationsRouter);

export default router;
