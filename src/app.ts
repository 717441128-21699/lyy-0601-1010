import * as dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import * as path from "path";
import * as fs from "fs";
import { AppDataSource } from "./db/Database";
import { loggerMiddleware } from "./middleware/logger";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import routes from "./routes";
import { success } from "./utils/response";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const DB_DIR = "./database";

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(loggerMiddleware);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/api/health", (req: Request, res: Response) => {
  success(res, {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    console.log("数据库初始化成功");

    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  企业资产巡检后端服务已启动`);
      console.log(`  服务地址: http://localhost:${PORT}`);
      console.log(`  API 前缀: http://localhost:${PORT}/api`);
      console.log(`  健康检查: http://localhost:${PORT}/api/health`);
      console.log(`========================================\n`);
      console.log(`快速开始:`);
      console.log(`1. 安装依赖: npm install`);
      console.log(`2. 初始化种子数据: npm run seed`);
      console.log(`3. 启动服务: npm run dev`);
      console.log(`\n默认账号:`);
      console.log(`  管理员: admin / 123456`);
      console.log(`  巡检员: inspector1 / 123456`);
      console.log(`  维修员: maintenance1 / 123456`);
      console.log(`\n`);
    });
  } catch (error) {
    console.error("启动失败:", error);
    process.exit(1);
  }
}

startServer();
