import { Request, Response } from "express";
import { AppDataSource, Between } from "../db/Database";
import { Asset } from "../entities/Asset";
import { ExceptionReport, ExceptionType } from "../entities/ExceptionReport";
import { InspectionTask } from "../entities/InspectionTask";
import { success, error } from "../utils/response";
import moment from "moment";

const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const reportRepository = AppDataSource.getRepository<ExceptionReport>("ExceptionReport");
const taskRepository = AppDataSource.getRepository<InspectionTask>("InspectionTask");

async function getAssetById(id: number): Promise<Asset | undefined> {
  return assetRepository.findOne({ where: { id } });
}

async function getUserById(id: number): Promise<any | undefined> {
  const userRepo = AppDataSource.getRepository<any>("User");
  return userRepo.findOne({ where: { id } });
}

export async function getDashboardStats(req: Request, res: Response) {
  const { startDate, endDate, department } = req.query as any;

  const assetWhere: any = {};
  if (department) {
    assetWhere.department = department;
  }

  const reportWhere: any = {};
  const taskWhere: any = {};

  if (startDate) {
    reportWhere.createdAt = Between(new Date(startDate), new Date());
    taskWhere.createdAt = Between(new Date(startDate), new Date());
  }
  if (endDate) {
    reportWhere.createdAt = Between(
      startDate ? new Date(startDate) : new Date("2000-01-01"),
      new Date(endDate)
    );
    taskWhere.createdAt = Between(
      startDate ? new Date(startDate) : new Date("2000-01-01"),
      new Date(endDate)
    );
  }

  const allAssets = await assetRepository.find({ where: assetWhere });
  const filteredAssets = department
    ? allAssets.filter((a) => a.department === department)
    : allAssets;

  const allReports = await reportRepository.find({ where: reportWhere });
  const allTasks = await taskRepository.find({ where: taskWhere });

  const totalAssets = filteredAssets.length;
  const normalAssets = filteredAssets.filter((a) => a.status === "normal").length;
  const abnormalAssets = filteredAssets.filter((a) =>
    ["abnormal", "damaged", "lost", "maintenance"].includes(a.status)
  ).length;

  const totalReports = allReports.length;
  const pendingReports = allReports.filter((r) => r.status === "pending").length;
  const processingReports = allReports.filter((r) =>
    ["assigned", "processing"].includes(r.status)
  ).length;
  const resolvedReports = allReports.filter((r) =>
    ["resolved", "closed"].includes(r.status)
  ).length;

  const totalTasks = allTasks.length;
  const pendingTasks = allTasks.filter((t) =>
    ["pending", "in_progress"].includes(t.status)
  ).length;
  const completedTasks = allTasks.filter((t) => t.status === "completed").length;
  const overdueTasks = allTasks.filter((t) => t.status === "overdue").length;

  const avgHealthScore =
    filteredAssets.length > 0
      ? Math.round(filteredAssets.reduce((sum, a) => sum + a.healthScore, 0) / filteredAssets.length)
      : 0;

  const stats = {
    assets: {
      total: totalAssets,
      normal: normalAssets,
      abnormal: abnormalAssets,
      avgHealthScore,
    },
    exceptions: {
      total: totalReports,
      pending: pendingReports,
      processing: processingReports,
      resolved: resolvedReports,
      resolutionRate: totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 0,
    },
    tasks: {
      total: totalTasks,
      pending: pendingTasks,
      completed: completedTasks,
      overdue: overdueTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    },
  };

  success(res, stats);
}

export async function getExceptionStatsByDepartment(req: Request, res: Response) {
  const { startDate, endDate } = req.query as any;

  let reports = await reportRepository.find();
  const assets = await assetRepository.find();
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  if (startDate) {
    reports = reports.filter((r) => new Date(r.createdAt) >= new Date(startDate));
  }
  if (endDate) {
    reports = reports.filter((r) => new Date(r.createdAt) <= new Date(endDate));
  }

  const deptStats: Record<string, any> = {};

  for (const report of reports) {
    const asset = assetMap.get(report.assetId);
    const dept = asset?.department || "未知";

    if (!deptStats[dept]) {
      deptStats[dept] = {
        department: dept,
        total: 0,
        unresolved: 0,
        resolved: 0,
        damageCount: 0,
        lostCount: 0,
        malfunctionCount: 0,
        otherCount: 0,
      };
    }

    deptStats[dept].total++;

    if (["pending", "assigned", "processing"].includes(report.status)) {
      deptStats[dept].unresolved++;
    } else {
      deptStats[dept].resolved++;
    }

    switch (report.exceptionType) {
      case "damage":
        deptStats[dept].damageCount++;
        break;
      case "lost":
        deptStats[dept].lostCount++;
        break;
      case "malfunction":
        deptStats[dept].malfunctionCount++;
        break;
      default:
        deptStats[dept].otherCount++;
    }
  }

  const result = Object.values(deptStats).sort((a, b) => b.total - a.total);

  success(res, result);
}

export async function getExceptionStatsByType(req: Request, res: Response) {
  const { startDate, endDate, department } = req.query as any;

  let reports = await reportRepository.find();
  const assets = await assetRepository.find();
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  if (startDate) {
    reports = reports.filter((r) => new Date(r.createdAt) >= new Date(startDate));
  }
  if (endDate) {
    reports = reports.filter((r) => new Date(r.createdAt) <= new Date(endDate));
  }
  if (department) {
    reports = reports.filter((r) => {
      const asset = assetMap.get(r.assetId);
      return asset?.department === department;
    });
  }

  const typeStats: Record<string, any> = {};
  const types: ExceptionType[] = ["damage", "lost", "malfunction", "expired", "missing", "other"];

  for (const type of types) {
    typeStats[type] = {
      count: 0,
      resolved: 0,
      unresolved: 0,
    };
  }

  for (const report of reports) {
    const type = report.exceptionType;
    if (typeStats[type]) {
      typeStats[type].count++;
      if (report.status === "resolved" || report.status === "closed") {
        typeStats[type].resolved++;
      } else {
        typeStats[type].unresolved++;
      }
    }
  }

  const result = Object.entries(typeStats).map(([type, data]) => ({
    type,
    label: getExceptionTypeLabel(type as ExceptionType),
    ...data,
  }));

  success(res, result);
}

export async function getExceptionTrend(req: Request, res: Response) {
  const { startDate, endDate, department } = req.query as any;

  const start = startDate ? moment(startDate) : moment().subtract(30, "days");
  const end = endDate ? moment(endDate) : moment();
  const days = end.diff(start, "days") + 1;

  let allReports = await reportRepository.find();
  const assets = await assetRepository.find();
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  if (department) {
    allReports = allReports.filter((r) => {
      const asset = assetMap.get(r.assetId);
      return asset?.department === department;
    });
  }

  const dailyStats: any[] = [];

  for (let i = 0; i < days; i++) {
    const date = start.clone().add(i, "days").format("YYYY-MM-DD");
    const dayStart = start.clone().add(i, "days").startOf("day").toDate();
    const dayEnd = start.clone().add(i, "days").endOf("day").toDate();

    const reports = allReports.filter((r) => {
      const rDate = new Date(r.createdAt);
      return rDate >= dayStart && rDate <= dayEnd;
    });

    const resolved = reports.filter((r) => r.status === "resolved" || r.status === "closed").length;

    dailyStats.push({
      date,
      total: reports.length,
      resolved,
      unresolved: reports.length - resolved,
    });
  }

  success(res, dailyStats);
}

export async function getAssetHealthStats(req: Request, res: Response) {
  const { department } = req.query as any;

  let assets = await assetRepository.find();

  if (department) {
    assets = assets.filter((a) => a.department === department);
  }

  const scoreDistribution = [
    { range: "90-100", label: "优秀", count: 0, min: 90, max: 100 },
    { range: "70-89", label: "良好", count: 0, min: 70, max: 89 },
    { range: "50-69", label: "一般", count: 0, min: 50, max: 69 },
    { range: "30-49", label: "较差", count: 0, min: 30, max: 49 },
    { range: "0-29", label: "危险", count: 0, min: 0, max: 29 },
  ];

  for (const asset of assets) {
    for (const item of scoreDistribution) {
      if (asset.healthScore >= item.min && asset.healthScore <= item.max) {
        item.count++;
        break;
      }
    }
  }

  const avgHealthScore =
    assets.length > 0
      ? Math.round(assets.reduce((sum, a) => sum + a.healthScore, 0) / assets.length)
      : 0;

  const departmentScores: Record<string, number[]> = {};
  for (const asset of assets) {
    if (!departmentScores[asset.department]) {
      departmentScores[asset.department] = [];
    }
    departmentScores[asset.department].push(asset.healthScore);
  }

  const departmentAvgScores = Object.entries(departmentScores).map(([dept, scores]) => ({
    department: dept,
    avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    assetCount: scores.length,
  }));

  success(res, {
    avgHealthScore,
    scoreDistribution,
    departmentAvgScores,
    totalAssets: assets.length,
  });
}

export async function getOverdueReminders(req: Request, res: Response) {
  const { type } = req.query as any;

  const now = new Date();
  const result: any = {
    tasks: [],
    exceptions: [],
  };

  if (!type || type === "tasks") {
    const allTasksData = await taskRepository.find({
      order: { deadline: "ASC" as const },
    });

    const allTasks = allTasksData.filter((t) => {
      return t.status === "pending" || t.status === "in_progress";
    });

    const tasksWithRelations = await Promise.all(
      allTasks.map(async (t) => ({
        ...t,
        asset: await getAssetById(t.assetId),
        inspector: await getUserById(t.inspectorId),
      }))
    );

    result.tasks = tasksWithRelations
      .filter((t) => moment(t.deadline).isBefore(now))
      .map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        assetCode: t.asset?.assetCode,
        assetName: t.asset?.name,
        inspectorName: t.inspector?.name,
        deadline: t.deadline,
        overdueDays: moment(now).diff(t.deadline, "days"),
        type: "task",
      }));

    const soonDueTasks = tasksWithRelations
      .filter(
        (t) =>
          moment(t.deadline).isAfter(now) && moment(t.deadline).diff(now, "days") <= 3
      )
      .map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        assetCode: t.asset?.assetCode,
        assetName: t.asset?.name,
        inspectorName: t.inspector?.name,
        deadline: t.deadline,
        dueDays: moment(t.deadline).diff(now, "days"),
        type: "task_due_soon",
      }));

    result.tasks = [...result.tasks, ...soonDueTasks];
  }

  if (!type || type === "exceptions") {
    const allExceptionsData = await reportRepository.find({
      order: { createdAt: "ASC" as const },
    });

    const allExceptions = allExceptionsData.filter((e) => {
      return e.status === "pending" || e.status === "assigned" || e.status === "processing";
    });

    const exceptionsWithRelations = await Promise.all(
      allExceptions.map(async (e) => ({
        ...e,
        asset: await getAssetById(e.assetId),
        reporter: e.reporterId ? await getUserById(e.reporterId) : null,
        handler: e.handlerId ? await getUserById(e.handlerId) : null,
      }))
    );

    result.exceptions = exceptionsWithRelations
      .filter((e) => moment(e.createdAt).diff(now, "days") <= -3)
      .map((e) => ({
        id: e.id,
        reportNo: e.reportNo,
        exceptionType: e.exceptionType,
        assetCode: e.asset?.assetCode,
        assetName: e.asset?.name,
        reporterName: e.reporter?.name,
        handlerName: e.handler?.name,
        createdAt: e.createdAt,
        pendingDays: Math.abs(moment(e.createdAt).diff(now, "days")),
        type: "exception",
      }));
  }

  success(res, {
    ...result,
    totalOverdue: result.tasks.length + result.exceptions.length,
  });
}

export async function getRepairCostStats(req: Request, res: Response) {
  const { startDate, endDate, department } = req.query as any;

  let reportsData = await reportRepository.find();

  let reports = reportsData.filter((r) => {
    return r.status === "resolved" || r.status === "closed";
  });

  const assets = await assetRepository.find();
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  reports = reports.filter((r) => r.repairCost !== null && r.repairCost !== undefined);

  if (startDate) {
    reports = reports.filter((r) => new Date(r.createdAt) >= new Date(startDate));
  }
  if (endDate) {
    reports = reports.filter((r) => new Date(r.createdAt) <= new Date(endDate));
  }
  if (department) {
    reports = reports.filter((r) => {
      const asset = assetMap.get(r.assetId);
      return asset?.department === department;
    });
  }

  const deptStats: Record<string, any> = {};

  for (const report of reports) {
    const asset = assetMap.get(report.assetId);
    const dept = asset?.department || "未知";

    if (!deptStats[dept]) {
      deptStats[dept] = {
        department: dept,
        exceptionCount: 0,
        totalCost: 0,
        avgCost: 0,
        costs: [] as number[],
      };
    }

    deptStats[dept].exceptionCount++;
    deptStats[dept].totalCost += report.repairCost || 0;
    deptStats[dept].costs.push(report.repairCost || 0);
  }

  const result = Object.values(deptStats)
    .map((s) => ({
      ...s,
      avgCost: s.costs.length > 0 ? Math.round(s.totalCost / s.costs.length) : 0,
      costs: undefined,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  success(res, result);
}

function getExceptionTypeLabel(type: ExceptionType): string {
  const labels: Record<ExceptionType, string> = {
    damage: "损坏",
    lost: "遗失",
    malfunction: "故障",
    expired: "过期",
    missing: "缺失",
    other: "其他",
  };
  return labels[type] || type;
}

export async function getExceptionClosureBoard(req: Request, res: Response) {
  const { startDate, endDate, department } = req.query as any;

  const start = startDate ? moment(startDate).startOf("day") : moment().subtract(6, "months").startOf("day");
  const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");

  const allReports = await reportRepository.find();
  const assets = await assetRepository.find();
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  let reports = allReports.filter((r) => {
    const createdAt = moment(r.createdAt);
    return createdAt.isBetween(start, end, null, "[]");
  });

  if (department) {
    reports = reports.filter((r) => {
      const asset = assetMap.get(r.assetId);
      return asset?.department === department;
    });
  }

  const monthStats: Record<string, Record<string, any>> = {};
  const deptSet = new Set<string>();

  for (const report of reports) {
    const asset = assetMap.get(report.assetId);
    const dept = asset?.department || "未知";
    deptSet.add(dept);

    const createMonth = moment(report.createdAt).format("YYYY-MM");

    if (!monthStats[createMonth]) {
      monthStats[createMonth] = {};
    }
    if (!monthStats[createMonth][dept]) {
      monthStats[createMonth][dept] = {
        month: createMonth,
        department: dept,
        newCount: 0,
        resolvedCount: 0,
        processingDays: [] as number[],
        avgProcessingDays: 0,
      };
    }

    monthStats[createMonth][dept].newCount++;

    if ((report.status === "resolved" || report.status === "closed") && report.handledAt) {
      const resolvedMonth = moment(report.handledAt).format("YYYY-MM");
      const processingDays = moment(report.handledAt).diff(moment(report.createdAt), "days", true);

      if (!monthStats[resolvedMonth]) {
        monthStats[resolvedMonth] = {};
      }
      if (!monthStats[resolvedMonth][dept]) {
        monthStats[resolvedMonth][dept] = {
          month: resolvedMonth,
          department: dept,
          newCount: 0,
          resolvedCount: 0,
          processingDays: [] as number[],
          avgProcessingDays: 0,
        };
      }

      monthStats[resolvedMonth][dept].resolvedCount++;
      monthStats[resolvedMonth][dept].processingDays.push(Math.max(0, Math.round(processingDays)));
    }
  }

  const months: string[] = [];
  let current = start.clone().startOf("month");
  while (current.isBefore(end) || current.isSame(end, "month")) {
    months.push(current.format("YYYY-MM"));
    current = current.add(1, "month");
  }

  const result: any[] = [];
  for (const month of months) {
    const monthData = monthStats[month] || {};
    for (const dept of deptSet) {
      const data = monthData[dept] || {
        month,
        department: dept,
        newCount: 0,
        resolvedCount: 0,
        processingDays: [],
        avgProcessingDays: 0,
      };

      const avgProcessingDays =
        data.processingDays.length > 0
          ? Math.round(data.processingDays.reduce((a: number, b: number) => a + b, 0) / data.processingDays.length)
          : 0;

      result.push({
        month,
        monthLabel: moment(month).format("YYYY年MM月"),
        department: dept,
        newCount: data.newCount,
        resolvedCount: data.resolvedCount,
        avgProcessingDays,
        closureRate:
          data.newCount > 0
            ? Math.round((data.resolvedCount / data.newCount) * 100)
            : data.resolvedCount > 0
              ? 100
              : 0,
      });
    }
  }

  const summary: any = {};
  for (const dept of deptSet) {
    const deptData = result.filter((r) => r.department === dept);
    summary[dept] = {
      department: dept,
      totalNew: deptData.reduce((sum: number, r: any) => sum + r.newCount, 0),
      totalResolved: deptData.reduce((sum: number, r: any) => sum + r.resolvedCount, 0),
      avgProcessingDays:
        deptData.length > 0
          ? Math.round(
              deptData.reduce((sum: number, r: any) => sum + r.avgProcessingDays, 0) / deptData.length
            )
          : 0,
      avgClosureRate:
        deptData.length > 0
          ? Math.round(
              deptData.reduce((sum: number, r: any) => sum + r.closureRate, 0) / deptData.length
            )
          : 0,
    };
  }

  success(res, {
    period: {
      startDate: start.format("YYYY-MM-DD"),
      endDate: end.format("YYYY-MM-DD"),
    },
    months,
    departments: Array.from(deptSet),
    monthlyData: result,
    summary: Object.values(summary),
  });
}
