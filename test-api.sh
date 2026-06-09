#!/bin/bash

BASE_URL="http://localhost:3000/api"
TOKEN=""

echo "========================================"
echo "  企业资产巡检后端服务 API 测试脚本"
echo "========================================"
echo ""

echo "[1/8] 测试健康检查..."
curl -s "$BASE_URL/health" | python3 -m json.tool 2>/dev/null || echo "跳过 JSON 格式化"
echo ""

echo "[2/8] 测试登录接口..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}')

echo "$LOGIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESPONSE"

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "登录失败，请先启动服务并初始化种子数据"
  exit 1
fi

echo ""
echo "获取 Token 成功"
echo ""

echo "[3/8] 测试资产查询接口..."
echo "--- 获取资产列表 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/assets?page=1&pageSize=5" | python3 -m json.tool 2>/dev/null
echo ""

echo "--- 获取资产状态列表 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/assets/status-list" | python3 -m json.tool 2>/dev/null
echo ""

echo "[4/8] 测试巡检任务接口..."
echo "--- 创建巡检任务 ---"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "月度设备巡检",
    "description": "对所有电子设备进行常规检查",
    "assetCodes": ["AST000001", "AST000002"],
    "inspectorId": 2,
    "deadline": "2024-12-31T23:59:59",
    "cycle": "monthly"
  }' "$BASE_URL/inspection-tasks" | python3 -m json.tool 2>/dev/null
echo ""

echo "--- 获取我的任务列表 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/inspection-tasks/my?page=1&pageSize=5" | python3 -m json.tool 2>/dev/null
echo ""

echo "[5/8] 测试异常上报接口..."
echo "--- 上报异常 ---"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assetCode": "AST000001",
    "exceptionType": "malfunction",
    "description": "电脑开机蓝屏，无法正常启动",
    "location": "A座3楼技术部",
    "latitude": 39.9042,
    "longitude": 116.4074
  }' "$BASE_URL/exceptions" | python3 -m json.tool 2>/dev/null
echo ""

echo "--- 获取我的待办列表 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/exceptions/todo?page=1&pageSize=5" | python3 -m json.tool 2>/dev/null
echo ""

echo "[6/8] 测试处理流转接口..."
echo "--- 获取处理人列表 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/process/handlers?handlerType=maintenance" | python3 -m json.tool 2>/dev/null
echo ""

echo "[7/8] 测试统计汇总接口..."
echo "--- 首页统计概览 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/stats/dashboard" | python3 -m json.tool 2>/dev/null
echo ""

echo "--- 按部门统计异常 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/stats/exceptions/department" | python3 -m json.tool 2>/dev/null
echo ""

echo "--- 资产健康评分 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/stats/asset-health" | python3 -m json.tool 2>/dev/null
echo ""

echo "--- 逾期提醒 ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/stats/overdue-reminders" | python3 -m json.tool 2>/dev/null
echo ""

echo "[8/8] 测试获取当前用户信息..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/auth/me" | python3 -m json.tool 2>/dev/null
echo ""

echo "========================================"
echo "  API 测试完成"
echo "========================================"
