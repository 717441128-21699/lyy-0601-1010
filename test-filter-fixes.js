const http = require("http");
const moment = require("moment");

const BASE_URL = "http://localhost:3000";

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
  console.log("=== 测试筛选和数据一致性修复 ===\n");

  try {
    console.log("【准备工作】登录获取 token");
    const adminRes = await request("/auth/login", "POST", { username: "admin", password: "123456" });
    const adminToken = adminRes.data.data.token;
    console.log("  ✓ 登录成功\n");

    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    console.log("调试：创建一个异常看看返回格式...");
    const testExcRes = await request("/exceptions", "POST", {
      assetCode: "AST000001",
      exceptionType: "damage",
      description: "测试异常",
      location: "测试",
    }, adminHeaders);
    console.log("创建异常返回状态:", testExcRes.status);
    console.log("创建异常返回完整数据:", JSON.stringify(testExcRes.data, null, 2));
    if (testExcRes.data.data) {
      console.log("data.data:", JSON.stringify(testExcRes.data.data, null, 2));
    }
    return;

  } catch (error) {
    console.error("\n✗ 测试失败:", error.message);
    console.error(error.stack);
  }
}

test();
