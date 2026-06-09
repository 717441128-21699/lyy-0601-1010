import { Request, Response } from "express";
import { AppDataSource, In } from "../db/Database";
import { ExceptionReport, ExceptionStatus, ExceptionType, TimeoutStatus } from "../entities/ExceptionReport";
import { Asset, AssetStatus } from "../entities/Asset";
import { ProcessFlow, FlowAction } from "../entities/ProcessFlow";
import { User } from "../entities/User";
import { InspectionTask } from "../entities/InspectionTask";
import { ExceptionOperationLog, OperationType } from "../entities/ExceptionOperationLog";
import { success, paginate, error } from "../utils/response";
import moment from "moment";

const reportRepository = AppDataSource.getRepository<ExceptionReport>("ExceptionReport");
const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const flowRepository = AppDataSource.getRepository<ProcessFlow>("ProcessFlow");
const userRepository = AppDataSource.getRepository<User>("User");
const taskRepository = AppDataSource.getRepository<InspectionTask>("InspectionTask");
const operationLogRepository = AppDataSource.getRepository<ExceptionOperationLog>("ExceptionOperationLog");

function generateReportNo(): string {
  const date = moment().format("YYYYMMDD");
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `ER${date}${random}`;
}

async function addProcessFlow(
  reportId: number,
  operatorId: number,
  action: FlowAction,
  remark?: string,
  fromUserId?: number,
  toUserId?: number,
  previousStatus?: string,
  newStatus?: string
) {
  const flow = flowRepository.create({
    exceptionReportId: reportId,
    operatorId,
    action,
    remark,
    fromUserId,
    toUserId,
    previousStatus,
    newStatus,
  });
  await flowRepository.save(flow);
  return flow;
}

function getAssetStatusFromException(exceptionType: ExceptionType): AssetStatus {
  const statusMap: Record<ExceptionType, AssetStatus> = {
    damage: "damaged",
    lost: "lost",
    malfunction: "abnormal",
    expired: "abnormal",
    missing: "lost",
    other: "abnormal",
  };
  return statusMap[exceptionType] || "abnormal";
}

function calculateTimeoutStatus(expectedDeadline?: Date): {
  timeoutStatus: TimeoutStatus;
  remainingDays: number;
  remainingHours: number;
  isOverdue: boolean;
  isWarning: boolean;
} {
  if (!expectedDeadline) {
    return {
      timeoutStatus: "normal",
      remainingDays: 0,
      remainingHours: 0,
      isOverdue: false,
      isWarning: false,
    };
  }

  const now = moment();
  const deadline = moment(expectedDeadline);
  const diffMs = deadline.diff(now);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

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
    remainingDays: diffDays,
    remainingHours: diffHours,
    isOverdue,
    isWarning,
  };
}

function addTimeoutInfo(report: any) {
  const timeoutInfo = calculateTimeoutStatus(report.expectedDeadline);
  return {
    ...report,
    ...timeoutInfo,
  };
}

async function addOperationLog(
  exceptionId: number,
  operatorId: number,
  operationType: OperationType,
  oldStatus: ExceptionStatus,
  newStatus: ExceptionStatus,
  oldHandlerId: number | null,
  newHandlerId: number | null,
  remark?: string
) {
  const log = operationLogRepository.create({
    exceptionId,
    operatorId,
    operationType,
    oldStatus,
    newStatus,
    oldHandlerId,
    newHandlerId,
    remark: remark || "",
    createdAt: new Date(),
  });
  await operationLogRepository.save(log);
  return log;
}

export async function reportException(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { assetCode, taskId, exceptionType, description, location, latitude, longitude } = req.body;
  const reporterId = req.user.userId;

  const asset = await assetRepository.findOne({ where: { assetCode } });
  if (!asset) {
    return error(res, "资产不存在", 404);
  }

  if (taskId) {
    const task = await taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      return error(res, "关联的巡检任务不存在", 404);
    }
  }

  const photos: string[] = [];
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files) {
      photos.push(file.path);
    }
  }

  const report = reportRepository.create({
    reportNo: generateReportNo(),
    assetId: asset.id,
    taskId,
    reporterId,
    exceptionType: exceptionType as ExceptionType,
    status: "pending" as ExceptionStatus,
    description,
    photos,
    location: location || asset.location,
    latitude,
    longitude,
  });

  await AppDataSource.transaction(async () => {
    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      reporterId,
      "create",
      `上报异常: ${description}`,
      undefined,
      undefined,
      undefined,
      "pending"
    );

    await addOperationLog(
      report.id,
      reporterId,
      "create",
      "pending" as ExceptionStatus,
      "pending" as ExceptionStatus,
      null,
      null,
      `上报异常: ${description}`
    );

    const newAssetStatus = getAssetStatusFromException(exceptionType as ExceptionType);
    if (asset.status !== newAssetStatus) {
      asset.status = newAssetStatus;
      const healthScore = newAssetStatus === "damaged" ? 30 : newAssetStatus === "lost" ? 0 : 60;
      asset.healthScore = healthScore;
      await assetRepository.save(asset);
    }

    if (taskId) {
      await taskRepository.update(taskId, { hasException: true });
    }
  });

  success(res, report, "异常上报成功");
}

export async function getExceptionList(req: Request, res: Response) {
  const { page = 1, pageSize = 10, status, exceptionType, department, startDate, endDate, assetCode, handlerId, handlerType } = req.query as any;

  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const where: any = {};
  if (status) {
    where.status = status;
  }
  if (exceptionType) {
    where.exceptionType = exceptionType;
  }
  if (handlerId) {
    where.handlerId = Number(handlerId);
  }

  const allReports = await reportRepository.find({
    where,
    order: { createdAt: "DESC" },
  });

  const assetIds = [...new Set(allReports.map((r) => r.assetId))];
  const userIds = [...new Set(allReports.map((r) => r.reporterId).concat(allReports.map((r) => r.handlerId)).filter(Boolean))];

  const assets = await assetRepository.find({ where: { id: In(assetIds) } });
  const users = await userRepository.find({ where: { id: In(userIds) } });

  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const isAdmin = req.user.role === "admin";
  const userId = req.user.userId;

  let filteredReports = allReports.filter((report) => {
    if (!isAdmin) {
      if (report.status === "pending") {
      } else if (report.handlerId !== userId) {
        return false;
      }
    }

    const asset = assetMap.get(report.assetId);
    if (department && asset?.department !== department) {
      return false;
    }
    if (assetCode && !asset?.assetCode.includes(assetCode)) {
      return false;
    }
    if (startDate || endDate) {
      const start = startDate ? moment(startDate).startOf("day") : moment(0);
      const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");
      if (!moment(report.createdAt).isBetween(start, end, null, "[]")) {
        return false;
      }
    }
    if (handlerType) {
      if (!report.handlerId) {
        return false;
      }
      const handler = userMap.get(report.handlerId);
      if (handlerType === "maintenance") {
        if (handler?.role !== "maintenance") return false;
      } else if (handlerType === "admin_staff") {
        if (handler?.role !== "admin_staff") return false;
      } else if (handlerType === "other") {
        if (handler?.role === "maintenance" || handler?.role === "admin_staff") return false;
      }
    }
    return true;
  });

  const listWithRelations = filteredReports.slice((page - 1) * pageSize, page * pageSize).map((report) => {
    const reportWithRelations: any = {
      ...report,
      asset: assetMap.get(report.assetId),
      reporter: userMap.get(report.reporterId),
      handler: report.handlerId ? userMap.get(report.handlerId) : undefined,
    };
    return addTimeoutInfo(reportWithRelations);
  });

  const total = filteredReports.length;

  paginate(res, listWithRelations, total, page, pageSize, "查询成功");
}

export async function getMyReportedExceptions(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { page = 1, pageSize = 10, status } = req.query as any;

  const where: any = { reporterId: req.user.userId };
  if (status) {
    where.status = status;
  }

  const [list, total] = await reportRepository.findAndCount({
    where,
    relations: ["asset", "handler"],
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: { createdAt: "DESC" },
  });

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getMyHandlingExceptions(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { page = 1, pageSize = 10, status } = req.query as any;

  const where: any = { handlerId: req.user.userId };
  if (status) {
    where.status = status;
  }

  const [list, total] = await reportRepository.findAndCount({
    where,
    relations: ["asset", "reporter"],
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: { createdAt: "DESC" },
  });

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getExceptionDetail(req: Request, res: Response) {
  const { id } = req.params;

  const report = await reportRepository.findOne({
    where: { id: Number(id) },
    relations: ["asset", "reporter", "handler", "processFlows", "processFlows.operator", "processFlows.fromUser", "processFlows.toUser"],
  });

  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  success(res, report, "查询成功");
}

export async function getTodoList(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { page = 1, pageSize = 10, status, department, startDate, endDate } = req.query as any;
  const userId = req.user.userId;
  const isAdmin = req.user.role === "admin";

  const activeStatuses = ["pending", "assigned", "processing"];

  const where: any = {};
  if (status) {
    if (!activeStatuses.includes(status)) {
      return paginate(res, [], 0, page, pageSize, "查询成功");
    }
    where.status = status;
  }

  const allReports = await reportRepository.find({
    where,
    order: { createdAt: "DESC" },
  });

  const assetIds = [...new Set(allReports.map((r) => r.assetId))];
  const userIds = [...new Set(allReports.map((r) => r.reporterId).concat(allReports.map((r) => r.handlerId)).filter(Boolean))];

  const assets = await assetRepository.find({ where: { id: In(assetIds) } });
  const users = await userRepository.find({ where: { id: In(userIds) } });

  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  let filteredReports = allReports.filter((report) => {
    if (!activeStatuses.includes(report.status)) {
      return false;
    }

    if (isAdmin) {
      if (department) {
        const asset = assetMap.get(report.assetId);
        if (asset?.department !== department) return false;
      }
    } else {
      if (report.status === "pending") {
        return false;
      }
      if ((report.status === "assigned" || report.status === "processing") && report.handlerId !== userId) {
        return false;
      }
    }

    if (startDate || endDate) {
      const start = startDate ? moment(startDate).startOf("day") : moment(0);
      const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");
      if (!moment(report.createdAt).isBetween(start, end, null, "[]")) {
        return false;
      }
    }
    return true;
  });

  const total = filteredReports.length;
  const list = filteredReports.slice((page - 1) * pageSize, page * pageSize).map((report) => {
    const reportWithRelations: any = {
      ...report,
      asset: assetMap.get(report.assetId),
      reporter: userMap.get(report.reporterId),
      handler: report.handlerId ? userMap.get(report.handlerId) : undefined,
    };
    return addTimeoutInfo(reportWithRelations);
  });

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getTodoStats(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const userId = req.user.userId;
  const isAdmin = req.user.role === "admin";
  const activeStatuses = ["pending", "assigned", "processing"] as ExceptionStatus[];

  const allReports = await reportRepository.find({ where: { status: In(activeStatuses) } });

  const myReports = allReports.filter((report) => {
    if (!activeStatuses.includes(report.status)) return false;
    if (isAdmin) return true;
    if (report.status === "pending") return false;
    return report.handlerId === userId;
  });

  let pending = 0;
  let assigned = 0;
  let processing = 0;
  let normal = 0;
  let warning = 0;
  let overdue = 0;

  for (const report of myReports) {
    if (report.status === "pending") pending++;
    if (report.status === "assigned") assigned++;
    if (report.status === "processing") processing++;

    const timeoutInfo = calculateTimeoutStatus(report.expectedDeadline);
    if (timeoutInfo.timeoutStatus === "normal") normal++;
    if (timeoutInfo.timeoutStatus === "warning") warning++;
    if (timeoutInfo.timeoutStatus === "overdue") overdue++;
  }

  success(res, {
    byStatus: {
      pending,
      assigned,
      processing,
      total: pending + assigned + processing,
    },
    byTimeout: {
      normal,
      warning,
      overdue,
      total: normal + warning + overdue,
    },
    total: myReports.length,
  });
}
