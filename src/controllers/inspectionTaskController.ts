import { Request, Response } from "express";
import { AppDataSource, In } from "../db/Database";
import { InspectionTask, TaskStatus, TaskCycle } from "../entities/InspectionTask";
import { Asset } from "../entities/Asset";
import { User } from "../entities/User";
import { ExceptionReport } from "../entities/ExceptionReport";
import { success, paginate, error } from "../utils/response";
import moment from "moment";

const taskRepository = AppDataSource.getRepository<InspectionTask>("InspectionTask");
const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const userRepository = AppDataSource.getRepository<User>("User");
const exceptionRepository = AppDataSource.getRepository<ExceptionReport>("ExceptionReport");

async function loadTaskRelations(tasks: InspectionTask[]): Promise<any[]> {
  const assetIds = [...new Set(tasks.map((t) => t.assetId))];
  const inspectorIds = [...new Set(tasks.map((t) => t.inspectorId))];
  const taskIds = tasks.map((t) => t.id);

  const assets = await assetRepository.find({ where: { id: In(assetIds) } });
  const inspectors = await userRepository.find({ where: { id: In(inspectorIds) } });
  const exceptions = await exceptionRepository.find({ where: { taskId: In(taskIds) } });

  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const inspectorMap = new Map(inspectors.map((u) => [u.id, u]));
  const exceptionMap = new Map<number, ExceptionReport[]>();
  for (const exp of exceptions) {
    if (!exceptionMap.has(exp.taskId)) {
      exceptionMap.set(exp.taskId, []);
    }
    exceptionMap.get(exp.taskId)!.push(exp);
  }

  return tasks.map((task) => ({
    ...task,
    asset: assetMap.get(task.assetId),
    inspector: inspectorMap.get(task.inspectorId),
    exceptions: exceptionMap.get(task.id) || [],
  }));
}

function generateTaskNo(): string {
  const date = moment().format("YYYYMMDD");
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `IT${date}${random}`;
}

function calculateNextDeadline(cycle: TaskCycle, currentDeadline: Date): Date {
  const next = moment(currentDeadline);
  switch (cycle) {
    case "daily":
      return next.add(1, "day").toDate();
    case "weekly":
      return next.add(1, "week").toDate();
    case "monthly":
      return next.add(1, "month").toDate();
    case "quarterly":
      return next.add(3, "months").toDate();
    case "yearly":
      return next.add(1, "year").toDate();
    default:
      return next.toDate();
  }
}

export async function createInspectionTask(req: Request, res: Response) {
  const { title, description, assetCodes, inspectorId, deadline, cycle } = req.body;
  const assetCodesArray: string[] = Array.isArray(assetCodes) ? assetCodes : [];

  const inspector = await userRepository.findOne({ where: { id: inspectorId } });
  if (!inspector) {
    return error(res, "检查人不存在", 404);
  }

  const assets = await assetRepository.find({ where: { assetCode: In(assetCodesArray) } });
  if (assets.length !== assetCodesArray.length) {
    const foundCodes = assets.map((a) => a.assetCode);
    const missingCodes = assetCodesArray.filter((c: string) => !foundCodes.includes(c));
    return error(res, `以下资产不存在: ${missingCodes.join(", ")}`, 404);
  }

  const tasks: InspectionTask[] = [];
  for (const asset of assets) {
    const task = taskRepository.create({
      taskNo: generateTaskNo(),
      title,
      description,
      assetId: asset.id,
      inspectorId,
      deadline: new Date(deadline),
      cycle: cycle as TaskCycle,
      status: "pending" as TaskStatus,
    });
    tasks.push(task);
  }

  for (const task of tasks) {
    await taskRepository.save(task);
  }

  success(res, tasks, "巡检任务创建成功");
}

export async function getInspectionTaskList(req: Request, res: Response) {
  const { page = 1, pageSize = 10, status, inspectorId, assetCode, startDate, endDate, hasException, exceptionStatus } = req.query as any;

  const where: any = {};
  if (status) {
    where.status = status;
  }
  if (inspectorId) {
    where.inspectorId = Number(inspectorId);
  }

  const allTasks = await taskRepository.find({
    where,
    order: { createdAt: "DESC" },
  });

  let filteredTasks = allTasks.filter((task) => {
    if (startDate || endDate) {
      const start = startDate ? moment(startDate).startOf("day") : moment(0);
      const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");
      if (!moment(task.createdAt).isBetween(start, end, null, "[]")) {
        return false;
      }
    }
    return true;
  });

  let tasksWithRelations = await loadTaskRelations(filteredTasks);

  tasksWithRelations = tasksWithRelations.filter((task) => {
    if (assetCode && !task.asset?.assetCode.includes(assetCode)) {
      return false;
    }
    if (hasException !== undefined) {
      const hasExp = task.exceptions && task.exceptions.length > 0;
      if (hasException === "true" && !hasExp) return false;
      if (hasException === "false" && hasExp) return false;
    }
    if (exceptionStatus) {
      if (!task.exceptions || task.exceptions.length === 0) return false;
      const hasMatchingStatus = task.exceptions.some((e: any) => e.status === exceptionStatus);
      if (!hasMatchingStatus) return false;
    }
    return true;
  });

  tasksWithRelations = tasksWithRelations.map((task) => ({
    ...task,
    hasException: !!(task.exceptions && task.exceptions.length > 0),
    exceptionCount: task.exceptions?.length || 0,
    exceptionStatuses: task.exceptions?.map((e: any) => e.status) || [],
  })) as any[];

  await updateOverdueTasks();

  const total = tasksWithRelations.length;
  const paginatedList = tasksWithRelations.slice((page - 1) * pageSize, page * pageSize);

  paginate(res, paginatedList, total, page, pageSize, "查询成功");
}

export async function getMyTasks(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { page = 1, pageSize = 10, status, hasException, startDate, endDate, exceptionStatus, assetCode } = req.query as any;

  const where: any = { inspectorId: req.user.userId };
  if (status) {
    where.status = status;
  }

  await updateOverdueTasks();

  const allTasks = await taskRepository.find({
    where,
    order: { deadline: "ASC" },
  });

  let filteredTasks = allTasks.filter((task) => {
    if (startDate || endDate) {
      const start = startDate ? moment(startDate).startOf("day") : moment(0);
      const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");
      if (!moment(task.createdAt).isBetween(start, end, null, "[]")) {
        return false;
      }
    }
    return true;
  });

  let tasksWithRelations = await loadTaskRelations(filteredTasks);

  tasksWithRelations = tasksWithRelations.filter((task) => {
    if (assetCode && !task.asset?.assetCode.includes(assetCode)) {
      return false;
    }
    if (hasException !== undefined) {
      const hasExp = task.exceptions && task.exceptions.length > 0;
      if (hasException === "true" && !hasExp) return false;
      if (hasException === "false" && hasExp) return false;
    }
    if (exceptionStatus) {
      if (!task.exceptions || task.exceptions.length === 0) return false;
      const hasMatchingStatus = task.exceptions.some((e: any) => e.status === exceptionStatus);
      if (!hasMatchingStatus) return false;
    }
    return true;
  });

  tasksWithRelations = tasksWithRelations.map((task) => ({
    ...task,
    hasException: !!(task.exceptions && task.exceptions.length > 0),
    exceptionCount: task.exceptions?.length || 0,
    exceptionStatuses: task.exceptions?.map((e: any) => e.status) || [],
  })) as any[];

  const total = tasksWithRelations.length;
  const paginatedList = tasksWithRelations.slice((page - 1) * pageSize, page * pageSize);

  paginate(res, paginatedList, total, page, pageSize, "查询成功");
}

export async function getInspectionTaskDetail(req: Request, res: Response) {
  const { id } = req.params;

  const task = await taskRepository.findOne({
    where: { id: Number(id) },
  });

  if (!task) {
    return error(res, "任务不存在", 404);
  }

  const [taskWithRelations] = await loadTaskRelations([task]);

  const exceptions = taskWithRelations.exceptions || [];

  success(res, {
    ...taskWithRelations,
    hasException: exceptions.length > 0,
    exceptionCount: exceptions.length,
    exceptions,
  }, "查询成功");
}

export async function updateInspectionTask(req: Request, res: Response) {
  const { id } = req.params;
  const { status, inspectionResult, hasException } = req.body;

  const task = await taskRepository.findOne({ where: { id: Number(id) } });
  if (!task) {
    return error(res, "任务不存在", 404);
  }

  const oldStatus = task.status;
  const newStatus = status as TaskStatus;

  if (newStatus === "in_progress" && oldStatus === "pending") {
    task.startAt = new Date();
  }

  if (newStatus === "completed" && oldStatus !== "completed") {
    task.completedAt = new Date();

    const asset = await assetRepository.findOne({ where: { id: task.assetId } });
    if (asset) {
      asset.lastInspectionDate = new Date();
      await assetRepository.save(asset);
    }

    if (task.cycle !== "once") {
      const nextDeadline = calculateNextDeadline(task.cycle, task.deadline);
      const nextTask = taskRepository.create({
        taskNo: generateTaskNo(),
        title: task.title,
        description: task.description,
        assetId: task.assetId,
        inspectorId: task.inspectorId,
        deadline: nextDeadline,
        cycle: task.cycle,
        status: "pending" as TaskStatus,
        parentTaskId: task.id,
      });
      await taskRepository.save(nextTask);
    }
  }

  task.status = newStatus;
  task.inspectionResult = inspectionResult || task.inspectionResult;
  task.hasException = hasException !== undefined ? hasException : task.hasException;

  await taskRepository.save(task);

  success(res, task, "任务更新成功");
}

export async function assignTask(req: Request, res: Response) {
  const { id } = req.params;
  const { inspectorId, deadline } = req.body;

  const task = await taskRepository.findOne({ where: { id: Number(id) } });
  if (!task) {
    return error(res, "任务不存在", 404);
  }

  const inspector = await userRepository.findOne({ where: { id: inspectorId } });
  if (!inspector) {
    return error(res, "检查人不存在", 404);
  }

  task.inspectorId = inspectorId;
  if (deadline) {
    task.deadline = new Date(deadline);
  }

  await taskRepository.save(task);

  success(res, task, "任务分配成功");
}

export async function deleteInspectionTask(req: Request, res: Response) {
  const { id } = req.params;

  const task = await taskRepository.findOne({ where: { id: Number(id) } });
  if (!task) {
    return error(res, "任务不存在", 404);
  }

  await taskRepository.remove(task);

  success(res, null, "任务删除成功");
}

async function updateOverdueTasks() {
  const now = new Date();
  const allTasks = await taskRepository.find();

  const overdueTasks = allTasks.filter((task) => {
    return task.status === "pending" || task.status === "in_progress";
  });

  for (const task of overdueTasks) {
    if (moment(task.deadline).isBefore(now) && task.status !== "overdue") {
      task.status = "overdue";
      await taskRepository.save(task);
    }
  }
}

export async function getTaskStatistics(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  await updateOverdueTasks();

  const userId = req.user.userId;
  const stats = {
    pending: await taskRepository.count({ where: { inspectorId: userId, status: "pending" } }),
    inProgress: await taskRepository.count({ where: { inspectorId: userId, status: "in_progress" } }),
    completed: await taskRepository.count({ where: { inspectorId: userId, status: "completed" } }),
    overdue: await taskRepository.count({ where: { inspectorId: userId, status: "overdue" } }),
  };

  success(res, stats);
}

export async function getAssetInspectionHistory(req: Request, res: Response) {
  const { assetCode } = req.params;

  const asset = await assetRepository.findOne({ where: { assetCode } });
  if (!asset) {
    return error(res, "资产不存在", 404);
  }

  const tasks = await taskRepository.find({
    where: { assetId: asset.id },
    order: { createdAt: "DESC" },
  });

  const exceptions = await exceptionRepository.find({
    where: { assetId: asset.id },
    order: { createdAt: "DESC" },
  });

  const tasksWithRelations = await loadTaskRelations(tasks);

  const inspectorIds = [...new Set(exceptions.map((e) => e.reporterId).concat(exceptions.map((e) => e.handlerId)).filter(Boolean))];
  const users = await userRepository.find({ where: { id: In(inspectorIds) } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const exceptionsWithRelations = exceptions.map((exp) => ({
    ...exp,
    reporter: userMap.get(exp.reporterId),
    handler: exp.handlerId ? userMap.get(exp.handlerId) : undefined,
  }));

  const history = [
    ...tasksWithRelations.map((t) => ({
      ...t,
      type: "inspection" as const,
    })),
    ...exceptionsWithRelations.map((e) => ({
      ...e,
      type: "exception" as const,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  success(res, {
    asset,
    totalInspections: tasks.length,
    totalExceptions: exceptions.length,
    history,
  }, "查询成功");
}
