import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import categoriesRouter from "./categories";
import rulesRouter from "./rules";
import sourcesRouter from "./sources";
import analyticsRouter from "./analytics";
import appearanceRouter from "./appearance";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(conversationsRouter);
router.use(categoriesRouter);
router.use(rulesRouter);
router.use(sourcesRouter);
router.use(analyticsRouter);
router.use(appearanceRouter);
router.use(authRouter);

// #region agent log
fetch('http://127.0.0.1:7743/ingest/fbcc6644-f5ef-42d5-8361-4b0eb31d88ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0657f2'},body:JSON.stringify({sessionId:'0657f2',hypothesisId:'A',location:'routes/index.ts:mount',message:'API routers mounted including authRouter',data:{hasAuthRouter:Boolean(authRouter)},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
// #endregion

export default router;
