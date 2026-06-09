import { Request, Response, NextFunction } from "express";

export function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const user = req.user ? req.user.username : "anonymous";

    console.log(
      `[${new Date().toISOString()}] ${method} ${originalUrl} - ${statusCode} - ${duration}ms - ${user} - ${ip}`
    );
  });

  next();
}
