import { Router } from "express";
import { authMiddleware, roleMiddleware } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import * as authController from "../controllers/authController";
import * as assetController from "../controllers/assetController";
import * as inspectionController from "../controllers/inspectionTaskController";
import * as inspectionBatchController from "../controllers/inspectionBatchController";
import * as exceptionController from "../controllers/exceptionController";
import * as processController from "../controllers/processFlowController";
import * as statsController from "../controllers/statsController";
import { upload } from "../utils/upload";
import {
  loginSchema,
  assetQuerySchema,
  assetLocationUpdateSchema,
  inspectionTaskCreateSchema,
  inspectionTaskUpdateSchema,
  exceptionReportSchema,
  exceptionAssignSchema,
  exceptionProcessSchema,
  exceptionTransferSchema,
  statsQuerySchema,
} from "../validation/schemas";

const router = Router();

router.post("/auth/login", validateBody(loginSchema), authController.login);
router.get("/auth/me", authMiddleware, authController.getCurrentUser);

router.get("/assets/status-list", authMiddleware, assetController.getAssetStatusList);
router.get("/assets/:assetCode", authMiddleware, assetController.getAssetByCode);
router.get("/assets", authMiddleware, validateQuery(assetQuerySchema), assetController.getAssetList);
router.post("/assets", authMiddleware, roleMiddleware("admin"), assetController.createAsset);
router.put("/assets/:id", authMiddleware, roleMiddleware("admin"), assetController.updateAsset);
router.post(
  "/assets/location",
  authMiddleware,
  validateBody(assetLocationUpdateSchema),
  assetController.updateAssetLocation
);
router.get("/assets/:assetCode/location-logs", authMiddleware, assetController.getAssetLocationLogs);
router.get("/assets/:assetCode/change-logs", authMiddleware, assetController.getAssetChangeLogs);

router.post(
  "/inspection-tasks",
  authMiddleware,
  roleMiddleware("admin", "inspector"),
  validateBody(inspectionTaskCreateSchema),
  inspectionController.createInspectionTask
);
router.get("/inspection-tasks", authMiddleware, inspectionController.getInspectionTaskList);
router.get("/inspection-tasks/my", authMiddleware, inspectionController.getMyTasks);
router.get("/inspection-tasks/stats", authMiddleware, inspectionController.getTaskStatistics);
router.get("/inspection-tasks/asset/:assetCode/history", authMiddleware, inspectionController.getAssetInspectionHistory);
router.get("/inspection-tasks/:id", authMiddleware, inspectionController.getInspectionTaskDetail);
router.put(
  "/inspection-tasks/:id",
  authMiddleware,
  validateBody(inspectionTaskUpdateSchema),
  inspectionController.updateInspectionTask
);
router.post("/inspection-tasks/:id/assign", authMiddleware, roleMiddleware("admin"), inspectionController.assignTask);
router.delete(
  "/inspection-tasks/:id",
  authMiddleware,
  roleMiddleware("admin"),
  inspectionController.deleteInspectionTask
);

router.post(
  "/exceptions",
  authMiddleware,
  upload.array("photos", 9),
  validateBody(exceptionReportSchema),
  exceptionController.reportException
);
router.get("/exceptions", authMiddleware, exceptionController.getExceptionList);
router.get("/exceptions/my-reported", authMiddleware, exceptionController.getMyReportedExceptions);
router.get("/exceptions/my-handling", authMiddleware, exceptionController.getMyHandlingExceptions);
router.get("/exceptions/todo", authMiddleware, exceptionController.getTodoList);
router.get("/exceptions/todo-stats", authMiddleware, exceptionController.getTodoStats);
router.get("/exceptions/:id", authMiddleware, exceptionController.getExceptionDetail);

router.get("/process/handlers", authMiddleware, processController.getHandlerList);
router.post(
  "/exceptions/batch-assign",
  authMiddleware,
  roleMiddleware("admin"),
  processController.batchAssignExceptions
);
router.post(
  "/exceptions/:id/assign",
  authMiddleware,
  roleMiddleware("admin"),
  validateBody(exceptionAssignSchema),
  processController.assignException
);
router.post(
  "/exceptions/:id/transfer",
  authMiddleware,
  validateBody(exceptionTransferSchema),
  processController.transferException
);
router.post("/exceptions/:id/start", authMiddleware, processController.startProcessing);
router.post(
  "/exceptions/:id/process",
  authMiddleware,
  validateBody(exceptionProcessSchema),
  processController.updateProcessResult
);
router.post("/exceptions/:id/close", authMiddleware, roleMiddleware("admin"), processController.closeException);
router.post("/exceptions/:id/reopen", authMiddleware, roleMiddleware("admin"), processController.reopenException);
router.get("/exceptions/:id/history", authMiddleware, processController.getProcessHistory);
router.get("/exceptions/:id/operation-logs", authMiddleware, processController.getExceptionOperationLogs);

router.post(
  "/inspection-batches",
  authMiddleware,
  roleMiddleware("admin"),
  inspectionBatchController.createTaskBatch
);
router.get("/inspection-batches", authMiddleware, inspectionBatchController.getTaskBatchList);
router.get("/inspection-batches/summary", authMiddleware, inspectionBatchController.getBatchProgressSummary);
router.get("/inspection-batches/:id", authMiddleware, inspectionBatchController.getTaskBatchDetail);
router.get("/inspection-batches/:id/tasks", authMiddleware, inspectionBatchController.getBatchTasks);

router.get("/stats/dashboard", authMiddleware, validateQuery(statsQuerySchema), statsController.getDashboardStats);
router.get(
  "/stats/exceptions/department",
  authMiddleware,
  validateQuery(statsQuerySchema),
  statsController.getExceptionStatsByDepartment
);
router.get(
  "/stats/exceptions/type",
  authMiddleware,
  validateQuery(statsQuerySchema),
  statsController.getExceptionStatsByType
);
router.get(
  "/stats/exceptions/trend",
  authMiddleware,
  validateQuery(statsQuerySchema),
  statsController.getExceptionTrend
);
router.get("/stats/asset-health", authMiddleware, statsController.getAssetHealthStats);
router.get("/stats/overdue-reminders", authMiddleware, statsController.getOverdueReminders);
router.get(
  "/stats/repair-cost",
  authMiddleware,
  validateQuery(statsQuerySchema),
  statsController.getRepairCostStats
);
router.get(
  "/stats/exception-closure-board",
  authMiddleware,
  validateQuery(statsQuerySchema),
  statsController.getExceptionClosureBoard
);
router.get(
  "/stats/exceptions/combined",
  authMiddleware,
  validateQuery(statsQuerySchema),
  statsController.getExceptionCombinedStats
);
router.get(
  "/stats/exceptions/filter-options",
  authMiddleware,
  statsController.getExceptionFilterOptions
);

export default router;
