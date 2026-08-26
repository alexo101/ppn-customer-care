import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json({
    email: req.userEmail ?? "",
    role: req.memberRole ?? "viewer",
  });
});

export default router;
