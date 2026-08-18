import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import categoriesRouter from "./categories";
import rulesRouter from "./rules";
import sourcesRouter from "./sources";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(conversationsRouter);
router.use(categoriesRouter);
router.use(rulesRouter);
router.use(sourcesRouter);
router.use(analyticsRouter);

export default router;
