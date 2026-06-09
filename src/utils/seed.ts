import { AppDataSource } from "../db/Database";
import { User, UserRole } from "../entities/User";
import { Asset, AssetStatus, AssetCategory } from "../entities/Asset";
import { hashPassword } from "./jwt";
import moment from "moment";

const userRepository = AppDataSource.getRepository<User>("User");
const assetRepository = AppDataSource.getRepository<Asset>("Asset");

async function seed() {
  console.log("开始初始化种子数据...");

  const usersData = [
    { username: "admin", password: "123456", name: "系统管理员", role: "admin" as UserRole, department: "信息中心", phone: "13800138000", email: "admin@company.com" },
    { username: "inspector1", password: "123456", name: "张巡检", role: "inspector" as UserRole, department: "行政部", phone: "13800138001", email: "inspector1@company.com" },
    { username: "inspector2", password: "123456", name: "李巡检", role: "inspector" as UserRole, department: "技术部", phone: "13800138002", email: "inspector2@company.com" },
    { username: "maintenance1", password: "123456", name: "王维修", role: "maintenance" as UserRole, department: "维修部", phone: "13800138003", email: "maintenance1@company.com" },
    { username: "maintenance2", password: "123456", name: "刘维修", role: "maintenance" as UserRole, department: "维修部", phone: "13800138004", email: "maintenance2@company.com" },
    { username: "admin_staff1", password: "123456", name: "陈行政", role: "admin_staff" as UserRole, department: "行政部", phone: "13800138005", email: "admin_staff1@company.com" },
    { username: "user1", password: "123456", name: "赵员工", role: "user" as UserRole, department: "市场部", phone: "13800138006", email: "user1@company.com" },
    { username: "user2", password: "123456", name: "孙员工", role: "user" as UserRole, department: "财务部", phone: "13800138007", email: "user2@company.com" },
  ];

  for (const userData of usersData) {
    const existing = await userRepository.findOne({ where: { username: userData.username } });
    if (!existing) {
      const user = userRepository.create({
        ...userData,
        password: await hashPassword(userData.password),
        isActive: true,
      });
      await userRepository.save(user);
      console.log(`创建用户: ${user.username} - ${user.name}`);
    }
  }

  const departments = ["行政部", "技术部", "市场部", "财务部", "人力资源部", "维修部", "信息中心"];
  const locations = ["A座1楼", "A座2楼", "A座3楼", "B座1楼", "B座2楼", "C座办公楼", "地下车库", "会议室"];
  const categories: AssetCategory[] = ["electronic", "furniture", "vehicle", "equipment", "office", "other"];
  const statuses: AssetStatus[] = ["normal", "normal", "normal", "normal", "abnormal", "maintenance", "damaged"];

  const assetNames = [
    { name: "ThinkPad X1 Carbon", category: "electronic" as AssetCategory, brand: "联想", model: "X1 Carbon Gen 10" },
    { name: "MacBook Pro 14", category: "electronic" as AssetCategory, brand: "Apple", model: "MacBook Pro 14 M3" },
    { name: "Dell 显示器 27寸", category: "electronic" as AssetCategory, brand: "Dell", model: "U2723QE" },
    { name: "HP 打印机", category: "equipment" as AssetCategory, brand: "HP", model: "LaserJet Pro MFP M428fdw" },
    { name: "办公桌椅套装", category: "furniture" as AssetCategory, brand: "震旦", model: "Aurora-Ergo" },
    { name: "文件柜", category: "furniture" as AssetCategory, brand: "洛克菲勒", model: "LUO-001" },
    { name: "别克商务车", category: "vehicle" as AssetCategory, brand: "别克", model: "GL8 商务车" },
    { name: "投影仪", category: "equipment" as AssetCategory, brand: "爱普生", model: "CB-FH52" },
    { name: "空调", category: "equipment" as AssetCategory, brand: "格力", model: "KFR-72LW" },
    { name: "碎纸机", category: "office" as AssetCategory, brand: "科密", model: "C-838T" },
    { name: "保险柜", category: "office" as AssetCategory, brand: "虎牌", model: "BGX-M/D-50" },
    { name: "服务器机柜", category: "equipment" as AssetCategory, brand: "图腾", model: "G26642" },
  ];

  for (let i = 1; i <= 50; i++) {
    const assetCode = `AST${String(i).padStart(6, "0")}`;
    const existing = await assetRepository.findOne({ where: { assetCode } });
    if (!existing) {
      const assetTemplate = assetNames[Math.floor(Math.random() * assetNames.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const healthScore = status === "normal" ? 100 : status === "abnormal" ? 60 : status === "maintenance" ? 50 : status === "damaged" ? 30 : 100;

      const asset = assetRepository.create({
        assetCode,
        name: assetTemplate.name,
        category: assetTemplate.category,
        brand: assetTemplate.brand,
        model: assetTemplate.model,
        serialNumber: `SN${Date.now()}${Math.floor(Math.random() * 10000)}`,
        purchaseDate: moment().subtract(Math.random() * 365 * 3, "days").toDate(),
        purchasePrice: Math.floor(Math.random() * 50000) + 1000,
        department: departments[Math.floor(Math.random() * departments.length)],
        location: locations[Math.floor(Math.random() * locations.length)],
        custodian: ["赵员工", "孙员工", "张巡检", "李巡检", "陈行政"][Math.floor(Math.random() * 5)],
        status,
        description: `${assetTemplate.brand} ${assetTemplate.model}，编号${assetCode}`,
        lastInspectionDate: moment().subtract(Math.random() * 30, "days").toDate(),
        healthScore,
      });
      await assetRepository.save(asset);
      console.log(`创建资产: ${assetCode} - ${asset.name}`);
    }
  }

  console.log("种子数据初始化完成!");
  console.log("\n默认账号:");
  console.log("管理员: admin / 123456");
  console.log("巡检员: inspector1 / 123456");
  console.log("维修员: maintenance1 / 123456");
  console.log("行政人员: admin_staff1 / 123456");
  console.log("普通用户: user1 / 123456");

  process.exit(0);
}

seed().catch((error) => {
  console.error("种子数据初始化失败:", error);
  process.exit(1);
});
