import { Response } from "express";

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
  timestamp: number;
}

export function success<T>(res: Response, data?: T, message: string = "success"): Response {
  return res.json({
    code: 200,
    message,
    data,
    timestamp: Date.now(),
  });
}

export function error(res: Response, message: string, code: number = 400): Response {
  return res.status(code).json({
    code,
    message,
    timestamp: Date.now(),
  });
}

export function paginate<T>(
  res: Response,
  list: T[],
  total: number,
  page: number,
  pageSize: number,
  message: string = "success"
): Response {
  return res.json({
    code: 200,
    message,
    data: {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    timestamp: Date.now(),
  });
}
