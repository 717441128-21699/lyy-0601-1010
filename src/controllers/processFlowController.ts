import { Request, Response } from "express";
import { AppDataSource, In } from "../db/Database";
import { ExceptionReport, ExceptionStatus, HandlerType } from "../entities/ExceptionReport";
import { ProcessFlow, FlowAction } from "../entities/ProcessFlow";
import { Asset, AssetStatus } from "../entities/Asset";
import { User } from "../entities/User";
import { success, error, paginate } from "../utils/response";

const reportRepository = AppDataSource.getRepository<ExceptionReport>("ExceptionReport");
const flowRepository = AppDataSource.getRepository<ProcessFlow>("ProcessFlow");
const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const userRepository = AppDataSource.getRepository<User>("User");

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

export async function assignException(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const { id } = req.params;
  const { handlerId, handlerType, remark } = req.body;
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

  const previousStatus = report.status;
  const newStatus = "assigned" as ExceptionStatus;

  await AppDataSource.transaction(async () => {
    report.handlerId = handlerId;
    report.handlerType = handlerType as HandlerType;
    report.status = newStatus;
    await reportRepository.save(report);

    await addProcessFlow(
      report.id,
      operatorId,
      "assign",
      remark || `分配给 ${handler.name} 处理`,
      undefined,
      handlerId,
      previousStatus,
      newStatus
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

  const fromUserId = report.handlerId;
  const previousStatus = report.status;
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
      fromUserId,
      toUserId,
      previousStatus,
      newStatus
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

  const previousStatus = report.status;
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
      previousStatus,
      newStatus
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

  const previousStatus = report.status;
  let newStatus: ExceptionStatus = report.status;
  let action: FlowAction = "process";

  if (status === "resolved") {
    newStatus = "resolved";
    action = "resolve";
  } else if (status === "closed") {
    newStatus = "closed";
    action = "close";
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
      previousStatus,
      newStatus
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

  const previousStatus = report.status;
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
      previousStatus,
      newStatus
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

  const previousStatus = report.status;
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
      previousStatus,
      newStatus
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
    select: ["id", "name", "role", "department", "phone"],
    order: { name: "ASC" },
  });

  success(res, users);
}
