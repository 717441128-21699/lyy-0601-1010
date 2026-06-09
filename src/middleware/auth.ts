import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../utils/jwt";
import { error } from "../utils/response";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return error(res, "未提供认证令牌", 401);
  }

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const payload = verifyToken(token);

  if (!payload) {
    return error(res, "认证令牌无效或已过期", 401);
  }

  req.user = payload;
  next();
}

export function roleMiddleware(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return error(res, "未登录", 401);
    }

    if (!roles.includes(req.user.role) && req.user.role !== "admin") {
      return error(res, "权限不足", 403);
    }

    next();
  };
}
