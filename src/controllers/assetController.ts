import { Request, Response } from "express";
import { AppDataSource, In, Like } from "../db/Database";
import { Asset, AssetStatus, AssetCategory } from "../entities/Asset";
import { AssetLocationLog } from "../entities/AssetLocationLog";
import { AssetChangeLog } from "../entities/AssetChangeLog";
import { User } from "../entities/User";
import { success, paginate, error } from "../utils/response";

const assetRepository = AppDataSource.getRepository<Asset>("Asset");
const locationLogRepository = AppDataSource.getRepository<AssetLocationLog>("AssetLocationLog");
const changeLogRepository = AppDataSource.getRepository<AssetChangeLog>("AssetChangeLog");
const userRepository = AppDataSource.getRepository<User>("User");

export async function getAssetByCode(req: Request, res: Response) {
  const { assetCode } = req.params;

  const asset = await assetRepository.findOne({
    where: { assetCode },
    relations: ["locationLogs"],
  });

  if (!asset) {
    return error(res, "资产不存在", 404);
  }

  success(res, asset, "查询成功");
}

export async function getAssetList(req: Request, res: Response) {
  const { page, pageSize, keyword, category, status, department } = req.query as any;

  const where: any = {};
  if (keyword) {
    where[`assetCode`] = Like(`%${keyword}%`);
  }
  if (category) {
    where.category = category;
  }
  if (status) {
    where.status = status;
  }
  if (department) {
    where.department = department;
  }

  const [list, total] = await assetRepository.findAndCount({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: { createdAt: "DESC" },
  });

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function getAssetStatusList(req: Request, res: Response) {
  const statusList = [
    { value: "normal", label: "正常" },
    { value: "abnormal", label: "异常" },
    { value: "damaged", label: "损坏" },
    { value: "lost", label: "遗失" },
    { value: "maintenance", label: "维修中" },
    { value: "scrapped", label: "已报废" },
  ];

  const categoryList = [
    { value: "electronic", label: "电子设备" },
    { value: "furniture", label: "办公家具" },
    { value: "vehicle", label: "车辆" },
    { value: "equipment", label: "设备" },
    { value: "office", label: "办公用品" },
    { value: "other", label: "其他" },
  ];

  success(res, { statusList, categoryList });
}

export async function updateAssetLocation(req: Request, res: Response) {
  const { assetCode, newLocation, remark } = req.body;
  const userId = req.user?.userId;

  const asset = await assetRepository.findOne({ where: { assetCode } });
  if (!asset) {
    return error(res, "资产不存在", 404);
  }

  const oldLocation = asset.location;

  const locationLog = locationLogRepository.create({
    assetId: asset.id,
    oldLocation,
    newLocation,
    operatorId: userId,
    remark,
  });

  await locationLogRepository.save(locationLog);

  asset.location = newLocation;
  await assetRepository.save(asset);

  success(res, { asset, locationLog }, "位置更新成功");
}

export async function getAssetLocationLogs(req: Request, res: Response) {
  const { assetCode } = req.params;
  const { page = 1, pageSize = 20 } = req.query as any;

  const asset = await assetRepository.findOne({ where: { assetCode } });
  if (!asset) {
    return error(res, "资产不存在", 404);
  }

  const [list, total] = await locationLogRepository.findAndCount({
    where: { assetId: asset.id },
    relations: ["operator"],
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: { createdAt: "DESC" },
  });

  paginate(res, list, total, page, pageSize, "查询成功");
}

export async function createAsset(req: Request, res: Response) {
  const assetData = req.body;

  const existing = await assetRepository.findOne({ where: { assetCode: assetData.assetCode } });
  if (existing) {
    return error(res, "资产编号已存在", 400);
  }

  const asset = assetRepository.create(assetData);
  asset.healthScore = calculateHealthScore(asset.status);
  await assetRepository.save(asset);

  success(res, asset, "创建成功");
}

export async function updateAsset(req: Request, res: Response) {
  const { id } = req.params;
  const assetData = req.body;
  const operatorId = req.user?.userId;

  const asset = await assetRepository.findOne({ where: { id: Number(id) } });
  if (!asset) {
    return error(res, "资产不存在", 404);
  }

  if (assetData.assetCode && assetData.assetCode !== asset.assetCode) {
    const existing = await assetRepository.findOne({ where: { assetCode: assetData.assetCode } });
    if (existing) {
      return error(res, "资产编号已存在", 400);
    }
  }

  if (assetData.status) {
    assetData.healthScore = calculateHealthScore(assetData.status);
  }

  const fieldLabels: Record<string, string> = {
    assetCode: "资产编号",
    name: "资产名称",
    category: "资产分类",
    brand: "品牌",
    model: "型号",
    serialNumber: "序列号",
    purchaseDate: "购买日期",
    purchasePrice: "购买价格",
    department: "所属部门",
    location: "存放位置",
    custodian: "保管人",
    status: "资产状态",
    description: "备注",
    healthScore: "健康评分",
  };

  const changedFields: { fieldName: string; oldValue: any; newValue: any }[] = [];
  const oldAsset = { ...asset };

  for (const key of Object.keys(assetData)) {
    if (key === "id" || key === "createdAt" || key === "updatedAt") continue;
    const oldValue = (oldAsset as any)[key];
    const newValue = (assetData as any)[key];
    if (oldValue !== newValue && oldValue !== undefined && newValue !== undefined) {
      changedFields.push({
        fieldName: fieldLabels[key] || key,
        oldValue,
        newValue,
      });
    }
  }

  const updatedAsset = assetRepository.merge(asset, assetData);

  await AppDataSource.transaction(async () => {
    await assetRepository.save(updatedAsset);

    if (operatorId && changedFields.length > 0) {
      for (const change of changedFields) {
        const log = changeLogRepository.create({
          assetId: updatedAsset.id,
          operatorId,
          fieldName: change.fieldName,
          oldValue: String(change.oldValue),
          newValue: String(change.newValue),
          remark: `更新${change.fieldName}`,
        });
        await changeLogRepository.save(log);
      }
    }
  });

  success(res, {
    asset: updatedAsset,
    changedFields,
  }, "更新成功");
}

function calculateHealthScore(status: AssetStatus): number {
  const scoreMap: Record<AssetStatus, number> = {
    normal: 100,
    abnormal: 60,
    maintenance: 50,
    damaged: 30,
    lost: 0,
    scrapped: 0,
  };
  return scoreMap[status] || 0;
}

export async function getAssetChangeLogs(req: Request, res: Response) {
  const { assetCode } = req.params;
  const { page = 1, pageSize = 20 } = req.query as any;

  const asset = await assetRepository.findOne({ where: { assetCode } });
  if (!asset) {
    return error(res, "资产不存在", 404);
  }

  const [logs, total] = await changeLogRepository.findAndCount({
    where: { assetId: asset.id },
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: { createdAt: "DESC" },
  });

  const operatorIds = [...new Set(logs.map((l) => l.operatorId))];
  const operators = await userRepository.find({ where: { id: In(operatorIds) } });
  const operatorMap = new Map(operators.map((u) => [u.id, u]));

  const logsWithOperator = logs.map((log) => ({
    ...log,
    operator: operatorMap.get(log.operatorId)
      ? {
          id: operatorMap.get(log.operatorId)!.id,
          name: operatorMap.get(log.operatorId)!.name,
          department: operatorMap.get(log.operatorId)!.department,
        }
      : undefined,
  }));

  paginate(res, logsWithOperator, total, page, pageSize, "查询成功");
}
