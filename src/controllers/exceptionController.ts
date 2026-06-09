import { Request, Response } from "express";
import { AppDataSource } from "../db/Database";
import { ExceptionReport, ExceptionStatus, ExceptionType } from "../entities/ExceptionReport";
import { Asset, AssetStatus } from "../entities/Asset";
import { ProcessFlow, FlowAction } from "../entities/ProcessFlow";
import { User } from "../entities/User";
import { InspectionTask } from "../entities/InspectionTask";
import { success, paginate, error } from "../utils/response";
import moment from "moment";

const reportRepository = AppDataSource.getRepository<ExceptionReport>("ExceptionReport");
const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const flowRepository = AppDataSource.getRepository<ProcessFlow>("ProcessFlow");
const userRepository = AppDataSource.getRepository<User>("User");
const taskRepository = AppDataSource.getRepository<InspectionTask>("InspectionTask");

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
  const { page = 1, pageSize = 10, status, exceptionType, department, startDate, endDate, assetCode } = req.query as any;

  const where: any = {};
  if (status) {
    where.status = status;
  }
  if (exceptionType) {
    where.exceptionType = exceptionType;
  }

  const allReports = await reportRepository.find({
    where,
    relations: ["asset", "reporter", "handler"],
    order: { createdAt: "DESC" },
  });

  const filteredReports = allReports.filter((report) => {
    if (department && report.asset?.department !== department) {
      return false;
    }
    if (assetCode && !report.asset?.assetCode.includes(assetCode)) {
      return false;
    }
    if (startDate && new Date(report.createdAt) < new Date(startDate)) {
      return false;
    }
    if (endDate && new Date(report.createdAt) > new Date(endDate)) {
      return false;
    }
    return true;
  });

  const total = filteredReports.length;
  const list = filteredReports.slice((page - 1) * pageSize, page * pageSize);

  paginate(res, list, total, page, pageSize, "查询成功");
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

  const { page = 1, pageSize = 10 } = req.query as any;
  const userId = req.user.userId;

  const allReports = await reportRepository.find({
    relations: ["asset", "reporter", "handler"],
    order: { createdAt: "DESC" },
  });

  const filteredReports = allReports.filter((report) => {
    if (report.status === "pending") {
      return true;
    }
    if ((report.status === "assigned" || report.status === "processing") && report.handlerId === userId) {
      return true;
    }
    return false;
  });

  const total = filteredReports.length;
  const list = filteredReports.slice((page - 1) * pageSize, page * pageSize);

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getTodoStats(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const userId = req.user.userId;

  const pending = await reportRepository.count({ where: { status: "pending" } });
  const assigned = await reportRepository.count({ where: { status: "assigned", handlerId: userId } });
  const processing = await reportRepository.count({ where: { status: "processing", handlerId: userId } });

  success(res, {
    pending,
    assigned,
    processing,
    total: pending + assigned + processing,
  });
}
