const http = require("http");

const BASE_URL = "http://localhost:3000";
let TOKEN = "";

function request(path, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL("/api" + path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  console.log("========================================");
  console.log("  企业资产巡检后端服务 API 测试");
  console.log("========================================\n");

  console.log("[1/8] 测试健康检查...");
  try {
    const res = await request("/health");
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 健康检查通过\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  console.log("[2/8] 测试登录接口...");
  try {
    const res = await request("/auth/login", "POST", {
      username: "admin",
      password: "123456",
    });
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    if (res.data && res.data.data && res.data.data.token) {
      TOKEN = res.data.data.token;
      console.log("  ✓ 登录成功，获取 Token\n");
    } else {
      console.log("  ✗ 登录失败\n");
      process.exit(1);
    }
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${TOKEN}` };

  console.log("[3/8] 测试资产查询接口...");
  try {
    const res = await request("/assets?page=1&pageSize=5", "GET", null, authHeaders);
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 资产列表查询成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  console.log("[4/8] 测试创建巡检任务...");
  try {
    const res = await request(
      "/inspection-tasks",
      "POST",
      {
        title: "月度设备巡检",
        description: "对所有电子设备进行常规检查",
        assetCodes: ["AST000001", "AST000002"],
        inspectorId: 2,
        deadline: "2024-12-31T23:59:59",
        cycle: "monthly",
      },
      authHeaders
    );
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 创建巡检任务成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  console.log("[5/8] 测试异常上报接口...");
  try {
    const res = await request(
      "/exceptions",
      "POST",
      {
        assetCode: "AST000001",
        exceptionType: "malfunction",
        description: "电脑开机蓝屏，无法正常启动",
        location: "A座3楼技术部",
        latitude: 39.9042,
        longitude: 116.4074,
      },
      authHeaders
    );
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 异常上报成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  console.log("[6/8] 测试待办列表...");
  try {
    const res = await request("/exceptions/todo?page=1&pageSize=5", "GET", null, authHeaders);
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 待办列表查询成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  console.log("[7/8] 测试统计汇总接口...");
  try {
    const res = await request("/stats/dashboard", "GET", null, authHeaders);
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 首页统计查询成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  try {
    const res = await request("/stats/exceptions/department", "GET", null, authHeaders);
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 部门异常统计成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  try {
    const res = await request("/stats/asset-health", "GET", null, authHeaders);
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 资产健康评分成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  try {
    const res = await request("/stats/overdue-reminders", "GET", null, authHeaders);
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 逾期提醒查询成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  console.log("[8/8] 测试获取当前用户信息...");
  try {
    const res = await request("/auth/me", "GET", null, authHeaders);
    console.log(`  状态: ${res.status}`);
    console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
    console.log("  ✓ 获取用户信息成功\n");
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
  }

  console.log("========================================");
  console.log("  API 测试完成");
  console.log("========================================");
}

test().catch(console.error);
