import { Request, Response } from "express";
import { AppDataSource, In } from "../db/Database";
import { InspectionTaskBatch } from "../entities/InspectionTaskBatch";
import { InspectionTask, TaskStatus } from "../entities/InspectionTask";
import { Asset } from "../entities/Asset";
import { User } from "../entities/User";
import { ExceptionReport, TimeoutStatus } from "../entities/ExceptionReport";
import { success, paginate, error } from "../utils/response";
import moment from "moment";

const batchRepository = AppDataSource.getRepository<InspectionTaskBatch>("InspectionTaskBatch");
const taskRepository = AppDataSource.getRepository<InspectionTask>("InspectionTask");
const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const userRepository = AppDataSource.getRepository<User>("User");
const reportRepository = AppDataSource.getRepository<ExceptionReport>("ExceptionReport");

function generateBatchNo(): string {
  const date = moment().format("YYYYMMDD");
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `TB${date}${random}`;
}

function calculateTimeoutStatus(expectedDeadline?: Date): {
  timeoutStatus: TimeoutStatus;
  isOverdue: boolean;
  isWarning: boolean;
} {
  if (!expectedDeadline) {
    return {
      timeoutStatus: "normal",
      isOverdue: false,
      isWarning: false,
    };
  }

  const now = moment();
  const deadline = moment(expectedDeadline);
  const diffMs = deadline.diff(now);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let timeoutStatus: TimeoutStatus = "normal";
  let isOverdue = false;
  let isWarning = false;

  if (diffMs < 0) {
    timeoutStatus = "overdue";
    isOverdue = true;
  } else if (diffDays <= 1) {
    timeoutStatus = "warning";
    isWarning = true;
  }

  return {
    timeoutStatus,
    isOverdue,
    isWarning,
  };
}

async function calculateBatchProgress(batchId: number) {
  const tasks = await taskRepository.find({ where: { batchId } });
  const taskIds = tasks.map((t) => t.id);

  let total = tasks.length;
  let completed = 0;
  let pending = 0;
  let inProgress = 0;
  let hasException = 0;
  let overdue = 0;

  for (const task of tasks) {
    if (task.status === "completed") completed++;
    else if (task.status === "in_progress") inProgress++;
    else pending++;

    if (task.hasException) hasException++;

    const timeoutInfo = calculateTimeoutStatus(task.deadline);
    if (timeoutInfo.isOverdue && task.status !== "completed") {
      overdue++;
    }
  }

  const reports = await reportRepository.find({ where: { taskId: In(taskIds) } });
  let exceptionOverdue = 0;
  for (const report of reports) {
    const timeoutInfo = calculateTimeoutStatus(report.expectedDeadline);
    if (timeoutInfo.isOverdue && report.status !== "resolved" && report.status !== "closed") {
      exceptionOverdue++;
    }
  }

  return {
    total,
    completed,
    inProgress,
    pending,
    hasException,
    overdue,
    exceptionOverdue,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export async function createTaskBatch(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  if (req.user.role !== "admin") {
    return error(res, "只有管理员才能创建批次", 403);
  }

  const {
    title,
    description,
    assetCodes,
    inspectorId,
    deadline,
    cycle,
    startDate,
  } = req.body;
  const creatorId = req.user.userId;

  if (!Array.isArray(assetCodes) || assetCodes.length === 0) {
    return error(res, "请选择要创建任务的资产", 400);
  }

  const assets = await assetRepository.find({ where: { assetCode: In(assetCodes) } });
  if (assets.length !== assetCodes.length) {
    const foundCodes = assets.map((a) => a.assetCode);
    const missingCodes = assetCodes.filter((c: string) => !foundCodes.includes(c));
    return error(res, `以下资产不存在: ${missingCodes.join(", ")}`, 404);
  }

  const inspector = await userRepository.findOne({ where: { id: inspectorId } });
  if (!inspector) {
    return error(res, "检查人不存在", 404);
  }

  const batchNo = generateBatchNo();

  let result: any = {};

  await AppDataSource.transaction(async () => {
    const batch = batchRepository.create({
      batchNo,
      title,
      description: description || "",
      creatorId,
      assetCodes,
      inspectorId,
      deadline: deadline ? new Date(deadline) : new Date(),
      cycle: cycle || "once",
      taskCount: assetCodes.length,
      createdAt: new Date(),
    });
    await batchRepository.save(batch);

    for (const asset of assets) {
      const taskStartDate = startDate ? new Date(startDate) : new Date();
      const taskDeadline = deadline ? new Date(deadline) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const task = taskRepository.create({
        taskNo: `TK${moment().format("YYYYMMDD")}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
        assetId: asset.id,
        batchId: batch.id,
        inspectorId,
        status: "pending" as TaskStatus,
        startAt: taskStartDate,
        deadline: taskDeadline,
        cycle: cycle || "once",
        hasException: false,
      });
      await taskRepository.save(task);
    }

    const progress = await calculateBatchProgress(batch.id);

    result = {
      ...batch,
      progress,
      inspector: {
        id: inspector.id,
        name: inspector.name,
        role: inspector.role,
        department: inspector.department,
      },
      creator: {
        id: creatorId,
      },
    };
  });

  success(res, result, "批次创建成功");
}

export async function getTaskBatchList(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { page = 1, pageSize = 10, status, creatorId, inspectorId, startDate, endDate } = req.query as any;
  const userId = req.user.userId;
  const isAdmin = req.user.role === "admin";

  const where: any = {};
  if (!isAdmin) {
    where.inspectorId = userId;
  }
  if (creatorId) {
    where.creatorId = Number(creatorId);
  }
  if (inspectorId) {
    where.inspectorId = Number(inspectorId);
  }

  const allBatches = await batchRepository.find({
    where,
    order: { createdAt: "DESC" },
  });

  let filteredBatches = allBatches;

  if (startDate || endDate) {
    const start = startDate ? moment(startDate).startOf("day") : moment(0);
    const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");
    filteredBatches = filteredBatches.filter((b) =>
      moment(b.createdAt).isBetween(start, end, null, "[]")
    );
  }

  if (status) {
    const batchesWithProgress = [];
    for (const batch of filteredBatches) {
      const progress = await calculateBatchProgress(batch.id);
      let match = false;
      if (status === "completed" && progress.completed === progress.total) match = true;
      if (status === "in_progress" && progress.inProgress > 0) match = true;
      if (status === "pending" && progress.pending === progress.total) match = true;
      if (status === "overdue" && progress.overdue > 0) match = true;
      if (match) {
        batchesWithProgress.push({ batch, progress });
      }
    }

    const creatorIds = [...new Set(filteredBatches.map((b) => b.creatorId))];
    const inspectorIds = [...new Set(filteredBatches.map((b) => b.inspectorId))];
    const allUserIds = [...new Set([...creatorIds, ...inspectorIds])];
    const users = await userRepository.find({ where: { id: In(allUserIds) } });
    const userMap = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, role: u.role, department: u.department }]));

    const total = batchesWithProgress.length;
    const list = batchesWithProgress.slice((page - 1) * pageSize, page * pageSize).map(({ batch, progress }) => ({
      ...batch,
      progress,
      creator: userMap.get(batch.creatorId),
      inspector: userMap.get(batch.inspectorId),
    }));

    return paginate(res, list, total, page, pageSize, "查询成功");
  }

  const creatorIds = [...new Set(filteredBatches.map((b) => b.creatorId))];
  const inspectorIds = [...new Set(filteredBatches.map((b) => b.inspectorId))];
  const allUserIds = [...new Set([...creatorIds, ...inspectorIds])];
  const users = await userRepository.find({ where: { id: In(allUserIds) } });
  const userMap = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, role: u.role, department: u.department }]));

  const total = filteredBatches.length;
  const listData = filteredBatches.slice((page - 1) * pageSize, page * pageSize);

  const list = [];
  for (const batch of listData) {
    const progress = await calculateBatchProgress(batch.id);
    list.push({
      ...batch,
      progress,
      creator: userMap.get(batch.creatorId),
      inspector: userMap.get(batch.inspectorId),
    });
  }

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getTaskBatchDetail(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const userId = req.user.userId;
  const isAdmin = req.user.role === "admin";

  const batch = await batchRepository.findOne({ where: { id: Number(id) } });
  if (!batch) {
    return error(res, "批次不存在", 404);
  }

  if (!isAdmin && batch.inspectorId !== userId) {
    return error(res, "无权查看此批次", 403);
  }

  const progress = await calculateBatchProgress(batch.id);
  const creator = await userRepository.findOne({ where: { id: batch.creatorId } });
  const inspector = await userRepository.findOne({ where: { id: batch.inspectorId } });

  success(res, {
    ...batch,
    progress,
    creator: creator ? { id: creator.id, name: creator.name, role: creator.role, department: creator.department } : null,
    inspector: inspector ? { id: inspector.id, name: inspector.name, role: inspector.role, department: inspector.department } : null,
  }, "查询成功");
}

export async function getBatchTasks(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const { page = 1, pageSize = 10, status } = req.query as any;
  const userId = req.user.userId;
  const isAdmin = req.user.role === "admin";

  const batch = await batchRepository.findOne({ where: { id: Number(id) } });
  if (!batch) {
    return error(res, "批次不存在", 404);
  }

  if (!isAdmin && batch.inspectorId !== userId) {
    return error(res, "无权查看此批次", 403);
  }

  const where: any = { batchId: Number(id) };
  if (status) {
    where.status = status;
  }

  const allTasks = await taskRepository.find({
    where,
    order: { createdAt: "DESC" },
  });

  const assetIds = [...new Set(allTasks.map((t) => t.assetId))];
  const assets = await assetRepository.find({ where: { id: In(assetIds) } });
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const taskIds = allTasks.map((t) => t.id);
  const reports = await reportRepository.find({ where: { taskId: In(taskIds) } });
  const reportMap = new Map<number, any[]>();
  for (const report of reports) {
    if (!reportMap.has(report.taskId)) {
      reportMap.set(report.taskId, []);
    }
    reportMap.get(report.taskId)!.push(report);
  }

  const total = allTasks.length;
  const list = allTasks.slice((page - 1) * pageSize, page * pageSize).map((task) => {
    const timeoutInfo = calculateTimeoutStatus(task.deadline);
    return {
      ...task,
      asset: assetMap.get(task.assetId),
      exceptions: reportMap.get(task.id) || [],
      ...timeoutInfo,
    };
  });

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getBatchProgressSummary(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const userId = req.user.userId;
  const isAdmin = req.user.role === "admin";

  const where: any = {};
  if (!isAdmin) {
    where.inspectorId = userId;
  }

  const allBatches = await batchRepository.find({
    where,
    order: { createdAt: "DESC" },
  });

  let totalBatches = allBatches.length;
  let completedBatches = 0;
  let inProgressBatches = 0;
  let pendingBatches = 0;
  let overdueBatches = 0;

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let pendingTasks = 0;
  let overdueTasks = 0;
  let exceptionTasks = 0;

  for (const batch of allBatches) {
    const progress = await calculateBatchProgress(batch.id);

    totalTasks += progress.total;
    completedTasks += progress.completed;
    inProgressTasks += progress.inProgress;
    pendingTasks += progress.pending;
    overdueTasks += progress.overdue;
    exceptionTasks += progress.hasException;

    if (progress.completed === progress.total) completedBatches++;
    else if (progress.inProgress > 0) inProgressBatches++;
    else pendingBatches++;

    if (progress.overdue > 0) overdueBatches++;
  }

  success(res, {
    batches: {
      total: totalBatches,
      completed: completedBatches,
      inProgress: inProgressBatches,
      pending: pendingBatches,
      overdue: overdueBatches,
      completionRate: totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 0,
    },
    tasks: {
      total: totalTasks,
      completed: completedTasks,
      inProgress: inProgressTasks,
      pending: pendingTasks,
      overdue: overdueTasks,
      hasException: exceptionTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    },
  });
}
