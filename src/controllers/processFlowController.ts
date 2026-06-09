import { Request, Response } from "express";
import { AppDataSource, In } from "../db/Database";
import { ExceptionReport, ExceptionStatus, HandlerType } from "../entities/ExceptionReport";
import { ProcessFlow, FlowAction } from "../entities/ProcessFlow";
import { Asset, AssetStatus } from "../entities/Asset";
import { User } from "../entities/User";
import { ExceptionOperationLog, OperationType } from "../entities/ExceptionOperationLog";
import { success, error, paginate } from "../utils/response";
import moment from "moment";

const reportRepository = AppDataSource.getRepository<ExceptionReport>("ExceptionReport");
const flowRepository = AppDataSource.getRepository<ProcessFlow>("ProcessFlow");
const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const userRepository = AppDataSource.getRepository<User>("User");
const operationLogRepository = AppDataSource.getRepository<ExceptionOperationLog>("ExceptionOperationLog");

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

export async function assignException(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const { handlerId, handlerType, remark, expectedDeadline } = req.body;
  const operatorId = req.user.userId;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  if (report.status === "resolved" || report.status === "closed") {
    return error(res, "该异常已处理完成，无法分配", 400);
  }

  const handler = await userRepository.findOne({ where: { id: handlerId } });
  if (!handler) {
    return error(res, "处理人不存在", 404);
  }

  const oldStatus = report.status;
  const oldHandlerId = report.handlerId || null;
  const newStatus = "assigned" as ExceptionStatus;
  const operationType = report.handlerId ? "reassign" : "assign";

  await AppDataSource.transaction(async () => {
    report.handlerId = handlerId;
    report.handlerType = handlerType as HandlerType;
    report.status = newStatus;
    if (expectedDeadline) {
      report.expectedDeadline = new Date(expectedDeadline);
    }
    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      operatorId,
      "assign",
      remark || `分配给 ${handler.name} 处理`,
      undefined,
      handlerId,
      oldStatus,
      newStatus
    );

    await addOperationLog(
      report.id,
      operatorId,
      operationType,
      oldStatus,
      newStatus,
      oldHandlerId,
      handlerId,
      remark || `分配给 ${handler.name} 处理`
    );
  });

  success(res, report, "分配成功");
}

export async function transferException(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const { toUserId, handlerType, remark } = req.body;
  const operatorId = req.user.userId;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  if (report.status === "resolved" || report.status === "closed") {
    return error(res, "该异常已处理完成，无法流转", 400);
  }

  if (report.handlerId !== operatorId && req.user.role !== "admin") {
    return error(res, "只有当前处理人或管理员才能流转", 403);
  }

  const toUser = await userRepository.findOne({ where: { id: toUserId } });
  if (!toUser) {
    return error(res, "目标处理人不存在", 404);
  }

  const oldHandlerId = report.handlerId;
  const oldStatus = report.status;
  const newStatus = "assigned" as ExceptionStatus;

  await AppDataSource.transaction(async () => {
    report.handlerId = toUserId;
    if (handlerType) {
      report.handlerType = handlerType as HandlerType;
    }
    report.status = newStatus;
    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      operatorId,
      "transfer",
      remark || `流转给 ${toUser.name} 处理`,
      oldHandlerId,
      toUserId,
      oldStatus,
      newStatus
    );

    await addOperationLog(
      report.id,
      operatorId,
      "reassign",
      oldStatus,
      newStatus,
      oldHandlerId,
      toUserId,
      remark || `流转给 ${toUser.name} 处理`
    );
  });

  success(res, report, "流转成功");
}

export async function startProcessing(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const operatorId = req.user.userId;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  if (report.handlerId !== operatorId && req.user.role !== "admin") {
    return error(res, "只有分配的处理人才能开始处理", 403);
  }

  if (report.status !== "assigned") {
    return error(res, "只有已分配的异常才能开始处理", 400);
  }

  const oldStatus = report.status;
  const oldHandlerId = report.handlerId;
  const newStatus = "processing" as ExceptionStatus;

  await AppDataSource.transaction(async () => {
    report.status = newStatus;
    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      operatorId,
      "process",
      "开始处理",
      undefined,
      undefined,
      oldStatus,
      newStatus
    );

    await addOperationLog(
      report.id,
      operatorId,
      "start_process",
      oldStatus,
      newStatus,
      oldHandlerId,
      oldHandlerId,
      "开始处理"
    );
  });

  success(res, report, "开始处理");
}

export async function updateProcessResult(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const { handleResult, repairCost, status, closeRemark } = req.body;
  const operatorId = req.user.userId;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  if (report.handlerId !== operatorId && req.user.role !== "admin") {
    return error(res, "只有分配的处理人才能更新处理结果", 403);
  }

  if (report.status === "resolved" || report.status === "closed") {
    return error(res, "该异常已处理完成，无法更新", 400);
  }

  const oldStatus = report.status;
  const oldHandlerId = report.handlerId;
  let newStatus: ExceptionStatus = report.status;
  let action: FlowAction = "process";
  let operationType: OperationType = "update";

  if (status === "resolved") {
    newStatus = "resolved";
    action = "resolve";
    operationType = "resolve";
  } else if (status === "closed") {
    newStatus = "closed";
    action = "close";
    operationType = "close";
  }

  await AppDataSource.transaction(async () => {
    report.handleResult = handleResult;
    report.repairCost = repairCost !== undefined ? repairCost : report.repairCost;
    report.closeRemark = closeRemark;
    report.status = newStatus;

    if (newStatus === "resolved" || newStatus === "closed") {
      report.handledAt = new Date();
    }

    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      operatorId,
      action,
      handleResult,
      undefined,
      undefined,
      oldStatus,
      newStatus
    );

    await addOperationLog(
      report.id,
      operatorId,
      operationType,
      oldStatus,
      newStatus,
      oldHandlerId,
      oldHandlerId,
      handleResult || ""
    );

    if (newStatus === "closed") {
      const asset = await assetRepository.findOne({ where: { id: report.assetId } });
      if (asset && asset.status !== "lost" && asset.status !== "scrapped") {
        asset.status = "normal";
        asset.healthScore = 100;
        await assetRepository.save(asset);
      }
    }
  });

  success(res, report, "处理结果更新成功");
}

export async function closeException(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const { closeRemark } = req.body;
  const operatorId = req.user.userId;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  if (report.status === "closed") {
    return error(res, "该异常已关闭", 400);
  }

  if (req.user.role !== "admin") {
    return error(res, "只有管理员才能关闭异常", 403);
  }

  const oldStatus = report.status;
  const oldHandlerId = report.handlerId;
  const newStatus = "closed" as ExceptionStatus;

  await AppDataSource.transaction(async () => {
    report.status = newStatus;
    report.closeRemark = closeRemark;
    report.handledAt = new Date();
    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      operatorId,
      "close",
      closeRemark || "管理员关闭",
      undefined,
      undefined,
      oldStatus,
      newStatus
    );

    await addOperationLog(
      report.id,
      operatorId,
      "close",
      oldStatus,
      newStatus,
      oldHandlerId,
      oldHandlerId,
      closeRemark || "管理员关闭"
    );

    const asset = await assetRepository.findOne({ where: { id: report.assetId } });
    if (asset && asset.status !== "lost" && asset.status !== "scrapped") {
      asset.status = "normal";
      asset.healthScore = 100;
      await assetRepository.save(asset);
    }
  });

  success(res, report, "关闭成功");
}

export async function reopenException(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const { remark } = req.body;
  const operatorId = req.user.userId;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  if (report.status !== "resolved" && report.status !== "closed") {
    return error(res, "只有已解决或已关闭的异常才能重新打开", 400);
  }

  if (req.user.role !== "admin") {
    return error(res, "只有管理员才能重新打开异常", 403);
  }

  const oldStatus = report.status;
  const oldHandlerId = report.handlerId;
  const newStatus = "pending" as ExceptionStatus;

  await AppDataSource.transaction(async () => {
    report.status = newStatus;
    report.handlerId = undefined as any;
    report.handledAt = undefined as any;
    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      operatorId,
      "reopen",
      remark || "管理员重新打开",
      undefined,
      undefined,
      oldStatus,
      newStatus
    );

    await addOperationLog(
      report.id,
      operatorId,
      "reopen",
      oldStatus,
      newStatus,
      oldHandlerId,
      null,
      remark || "管理员重新打开"
    );

    const asset = await assetRepository.findOne({ where: { id: report.assetId } });
    if (asset) {
      asset.status = "abnormal";
      asset.healthScore = 60;
      await assetRepository.save(asset);
    }
  });

  success(res, report, "重新打开成功");
}

export async function getProcessHistory(req: Request, res: Response) {
  const { id } = req.params;
  const { page = 1, pageSize = 20 } = req.query as any;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  const [list, total] = await flowRepository.findAndCount({
    where: { exceptionReportId: Number(id) },
    relations: ["operator", "fromUser", "toUser"],
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: { createdAt: "DESC" },
  });

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getHandlerList(req: Request, res: Response) {
  const { handlerType } = req.query;

  const where: any = { isActive: true };

  if (handlerType === "maintenance") {
    where.role = "maintenance";
  } else if (handlerType === "admin_staff") {
    where.role = "admin_staff";
  }

  const users = await userRepository.find({
    where,
    order: { name: "ASC" },
  });

  const safeUsers = users.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    department: user.department,
    phone: user.phone,
  }));

  success(res, safeUsers);
}

export async function batchAssignExceptions(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  if (req.user.role !== "admin") {
    return error(res, "只有管理员才能批量分配", 403);
  }

  const { exceptionIds, handlerId, handlerType, remark, expectedDeadline } = req.body;
  const operatorId = req.user.userId;

  if (!Array.isArray(exceptionIds) || exceptionIds.length === 0) {
    return error(res, "请选择要分配的异常", 400);
  }

  const handler = await userRepository.findOne({ where: { id: handlerId } });
  if (!handler) {
    return error(res, "处理人不存在", 404);
  }

  const reports = await reportRepository.find({
    where: { id: In(exceptionIds) },
  });

  if (reports.length !== exceptionIds.length) {
    const foundIds = reports.map((r) => r.id);
    const missingIds = exceptionIds.filter((id: number) => !foundIds.includes(id));
    return error(res, `以下异常不存在: ${missingIds.join(", ")}`, 404);
  }

  const invalidReports = reports.filter((r) => r.status === "resolved" || r.status === "closed");
  if (invalidReports.length > 0) {
    const invalidNos = invalidReports.map((r) => r.reportNo);
    return error(res, `以下异常已处理完成，无法分配: ${invalidNos.join(", ")}`, 400);
  }

  await AppDataSource.transaction(async () => {
    for (const report of reports) {
      const oldStatus = report.status;
      const oldHandlerId = report.handlerId || null;
      const newStatus = "assigned" as ExceptionStatus;
      const operationType = report.handlerId ? "reassign" : "assign";

      report.handlerId = handlerId;
      report.handlerType = handlerType as HandlerType;
      report.status = newStatus;
      if (expectedDeadline) {
        report.expectedDeadline = new Date(expectedDeadline);
      }
      await reportRepository.save(report);

      await addProcessFlow(
        report.id,
        operatorId,
        "assign",
        remark || `批量分配给 ${handler.name} 处理`,
        undefined,
        handlerId,
        oldStatus,
        newStatus
      );

      await addOperationLog(
        report.id,
        operatorId,
        operationType,
        oldStatus,
        newStatus,
        oldHandlerId,
        handlerId,
        remark || `批量分配给 ${handler.name} 处理`
      );
    }
  });

  success(res, {
    count: reports.length,
    handler: {
      id: handler.id,
      name: handler.name,
    },
  }, `批量分配成功，共 ${reports.length} 条异常`);
}

export async function getExceptionOperationLogs(req: Request, res: Response) {
  const { id } = req.params;
  const { page = 1, pageSize = 20 } = req.query as any;

  const report = await reportRepository.findOne({ where: { id: Number(id) } });
  if (!report) {
    return error(res, "异常报告不存在", 404);
  }

  const allLogs = await operationLogRepository.find({
    where: { exceptionId: Number(id) },
    order: { createdAt: "DESC" },
  });

  const operatorIds = [...new Set(allLogs.map((l) => l.operatorId))];
  const oldHandlerIds = [...new Set(allLogs.map((l) => l.oldHandlerId).filter((id): id is number => id !== null))];
  const newHandlerIds = [...new Set(allLogs.map((l) => l.newHandlerId).filter((id): id is number => id !== null))];
  const allUserIds = [...new Set([...operatorIds, ...oldHandlerIds, ...newHandlerIds])];

  const users = await userRepository.find({ where: { id: In(allUserIds) } });
  const userMap = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, role: u.role, department: u.department }]));

  const logsWithDetails = allLogs.map((log) => ({
    ...log,
    operator: userMap.get(log.operatorId),
    oldHandler: log.oldHandlerId ? userMap.get(log.oldHandlerId) : null,
    newHandler: log.newHandlerId ? userMap.get(log.newHandlerId) : null,
  }));

  const total = logsWithDetails.length;
  const list = logsWithDetails.slice((page - 1) * pageSize, page * pageSize);

  paginate(res, list, total, page, pageSize, "查询成功");
}
