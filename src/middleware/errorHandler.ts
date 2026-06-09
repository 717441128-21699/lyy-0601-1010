import { Request, Response, NextFunction } from "express";
import { error } from "../utils/response";

export class AppError extends Error {
  code: number;
  constructor(message: string, code: number = 400) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  error(res, `路径 ${req.method} ${req.originalUrl} 不存在`, 404);
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);

  if (err instanceof AppError) {
    return error(res, err.message, err.code);
  }

  if (err.name === "ValidationError") {
    return error(res, err.message, 400);
  }

  if (err.message.includes("File too large")) {
    return error(res, "上传文件大小超过限制（最大10MB）", 413);
  }

  if (err.message.includes("只支持上传")) {
    return error(res, err.message, 400);
  }

  error(res, "服务器内部错误", 500);
}
