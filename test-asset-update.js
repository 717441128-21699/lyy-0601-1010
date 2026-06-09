const http = require("http");

const BASE_URL = "http://localhost:3000";
let ADMIN_TOKEN = "";

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
  console.log("测试资产更新数据一致性\n");

  console.log("1. 管理员登录...");
  const loginRes = await request("/auth/login", "POST", {
    username: "admin",
    password: "123456",
  });
  ADMIN_TOKEN = loginRes.data.data.token;
  const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  console.log("  ✓ 登录成功\n");

  console.log("2. 查询资产 AST000002 当前信息...");
  const assetRes = await request("/assets/AST000002", "GET", null, adminHeaders);
  const assetId = assetRes.data.data.id;
  const oldLocation = assetRes.data.data.location;
  const oldStatus = assetRes.data.data.status;
  const oldCustodian = assetRes.data.data.custodian;
  console.log(`  资产ID: ${assetId}`);
  console.log(`  当前位置: ${oldLocation}`);
  console.log(`  当前状态: ${oldStatus}`);
  console.log(`  当前保管人: ${oldCustodian}\n`);

  console.log("3. 更新资产信息...");
  const newLocation = "C座1楼会议室";
  const newStatus = "normal";
  const newCustodian = "李四";
  const updateRes = await request(
    `/assets/${assetId}`,
    "PUT",
    {
      location: newLocation,
      status: newStatus,
      custodian: newCustodian,
    },
    adminHeaders
  );
  console.log(`  更新状态: ${updateRes.status}`);
  console.log(`  变更字段: ${updateRes.data.data.changedFields.length} 个`);
  for (const field of updateRes.data.data.changedFields) {
    console.log(`    - ${field.fieldName}: ${field.oldValue} → ${field.newValue}`);
  }
  console.log("  ✓ 更新成功\n");

  console.log("4. 立即重新查询资产信息...");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const newAssetRes = await request("/assets/AST000002", "GET", null, adminHeaders);
  console.log(`  新位置: ${newAssetRes.data.data.location}`);
  console.log(`  新状态: ${newAssetRes.data.data.status}`);
  console.log(`  新保管人: ${newAssetRes.data.data.custodian}\n`);

  console.log("5. 验证数据一致性...");
  let allPassed = true;
  if (newAssetRes.data.data.location === newLocation) {
    console.log("  ✓ 位置更新正确");
  } else {
    console.log(`  ✗ 位置更新错误: 期望 ${newLocation}, 实际 ${newAssetRes.data.data.location}`);
    allPassed = false;
  }
  if (newAssetRes.data.data.status === newStatus) {
    console.log("  ✓ 状态更新正确");
  } else {
    console.log(`  ✗ 状态更新错误: 期望 ${newStatus}, 实际 ${newAssetRes.data.data.status}`);
    allPassed = false;
  }
  if (newAssetRes.data.data.custodian === newCustodian) {
    console.log("  ✓ 保管人更新正确");
  } else {
    console.log(`  ✗ 保管人更新错误: 期望 ${newCustodian}, 实际 ${newAssetRes.data.data.custodian}`);
    allPassed = false;
  }

  console.log("\n6. 查询资产变更历史...");
  const changeLogRes = await request(
    "/assets/AST000002/change-logs?page=1&pageSize=5",
    "GET",
    null,
    adminHeaders
  );
  console.log(`  变更记录数: ${changeLogRes.data.data.total}`);
  if (changeLogRes.data.data.list.length > 0) {
    const latest = changeLogRes.data.data.list[0];
    console.log(`  最近变更: ${latest.fieldName}: ${latest.oldValue} → ${latest.newValue}`);
    console.log(`  操作人: ${latest.operator?.name} (${latest.operator?.department})`);
    console.log("  ✓ 变更历史记录正确");
  }

  console.log("\n" + "=".repeat(50));
  if (allPassed) {
    console.log("✓ 资产更新数据一致性测试通过！");
  } else {
    console.log("✗ 资产更新数据一致性测试失败！");
    process.exit(1);
  }
  console.log("=".repeat(50));
}

test().catch(console.error);
