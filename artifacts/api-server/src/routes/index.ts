import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import activityRouter from "./activity";
import onboardingsRouter from "./onboardings";
import ordersRouter from "./orders";
import complianceRouter from "./compliance";
import settlementsRouter from "./settlements";
import payoutsRouter from "./payouts";
import commissionMasterRouter from "./commission-master";
import brandsRouter from "./brands";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(activityRouter);
router.use(onboardingsRouter);
router.use(ordersRouter);
router.use(complianceRouter);
router.use(settlementsRouter);
router.use(payoutsRouter);
router.use(commissionMasterRouter);
router.use(brandsRouter);

export default router;
