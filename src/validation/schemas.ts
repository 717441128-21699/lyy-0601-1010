import * as Joi from "joi";

export const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

export const assetQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  keyword: Joi.string().allow(""),
  category: Joi.string().allow(""),
  status: Joi.string().allow(""),
  department: Joi.string().allow(""),
});

export const assetLocationUpdateSchema = Joi.object({
  assetCode: Joi.string().required(),
  newLocation: Joi.string().required(),
  remark: Joi.string().allow(""),
});

export const inspectionTaskCreateSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().allow(""),
  assetCodes: Joi.array().items(Joi.string()).min(1).required(),
  inspectorId: Joi.number().integer().required(),
  deadline: Joi.date().required(),
  cycle: Joi.string().valid("daily", "weekly", "monthly", "quarterly", "yearly", "once").default("once"),
});

export const inspectionTaskUpdateSchema = Joi.object({
  status: Joi.string().valid("pending", "in_progress", "completed", "cancelled").required(),
  inspectionResult: Joi.string().allow(""),
  hasException: Joi.boolean(),
});

export const exceptionReportSchema = Joi.object({
  assetCode: Joi.string().required(),
  taskId: Joi.number().integer(),
  exceptionType: Joi.string().valid("damage", "lost", "malfunction", "expired", "missing", "other").required(),
  description: Joi.string().required(),
  location: Joi.string(),
  latitude: Joi.number(),
  longitude: Joi.number(),
});

export const exceptionAssignSchema = Joi.object({
  handlerId: Joi.number().integer().required(),
  handlerType: Joi.string().valid("maintenance", "admin_staff", "other").required(),
  remark: Joi.string().allow(""),
});

export const exceptionProcessSchema = Joi.object({
  handleResult: Joi.string().required(),
  repairCost: Joi.number().min(0),
  status: Joi.string().valid("processing", "resolved", "closed"),
  closeRemark: Joi.string().allow(""),
});

export const exceptionTransferSchema = Joi.object({
  toUserId: Joi.number().integer().required(),
  handlerType: Joi.string().valid("maintenance", "admin_staff", "other"),
  remark: Joi.string().allow(""),
});

export const statsQuerySchema = Joi.object({
  startDate: Joi.date(),
  endDate: Joi.date(),
  department: Joi.string().allow(""),
});
