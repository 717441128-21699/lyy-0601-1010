$BASE_URL = "http://localhost:3000/api"
$TOKEN = ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  企业资产巡检后端服务 API 测试脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/8] 测试健康检查..." -ForegroundColor Yellow
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/health" -Method Get
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "[2/8] 测试登录接口..." -ForegroundColor Yellow
$loginBody = @{
  username = "admin"
  password = "123456"
} | ConvertTo-Json

try {
  $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
  $loginResponse | ConvertTo-Json -Depth 10
  $TOKEN = $loginResponse.data.token

  if (-not $TOKEN) {
    Write-Host "登录失败，请先启动服务并初始化种子数据" -ForegroundColor Red
    exit 1
  }
  Write-Host ""
  Write-Host "获取 Token 成功" -ForegroundColor Green
} catch {
  Write-Host "登录失败: $_" -ForegroundColor Red
  exit 1
}
Write-Host ""

$headers = @{
  Authorization = "Bearer $TOKEN"
}

Write-Host "[3/8] 测试资产查询接口..." -ForegroundColor Yellow
Write-Host "--- 获取资产列表 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/assets?page=1&pageSize=5" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "--- 获取资产状态列表 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/assets/status-list" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "[4/8] 测试巡检任务接口..." -ForegroundColor Yellow
Write-Host "--- 创建巡检任务 ---" -ForegroundColor Gray
$taskBody = @{
  title = "月度设备巡检"
  description = "对所有电子设备进行常规检查"
  assetCodes = @("AST000001", "AST000002")
  inspectorId = 2
  deadline = "2024-12-31T23:59:59"
  cycle = "monthly"
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/inspection-tasks" -Method Post -Body $taskBody -Headers $headers -ContentType "application/json"
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "--- 获取我的任务列表 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/inspection-tasks/my?page=1&pageSize=5" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "[5/8] 测试异常上报接口..." -ForegroundColor Yellow
Write-Host "--- 上报异常 ---" -ForegroundColor Gray
$exceptionBody = @{
  assetCode = "AST000001"
  exceptionType = "malfunction"
  description = "电脑开机蓝屏，无法正常启动"
  location = "A座3楼技术部"
  latitude = 39.9042
  longitude = 116.4074
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/exceptions" -Method Post -Body $exceptionBody -Headers $headers -ContentType "application/json"
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "--- 获取我的待办列表 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/exceptions/todo?page=1&pageSize=5" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "[6/8] 测试处理流转接口..." -ForegroundColor Yellow
Write-Host "--- 获取处理人列表 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/process/handlers?handlerType=maintenance" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "[7/8] 测试统计汇总接口..." -ForegroundColor Yellow
Write-Host "--- 首页统计概览 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/stats/dashboard" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "--- 按部门统计异常 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/stats/exceptions/department" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "--- 资产健康评分 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/stats/asset-health" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "--- 逾期提醒 ---" -ForegroundColor Gray
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/stats/overdue-reminders" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "[8/8] 测试获取当前用户信息..." -ForegroundColor Yellow
try {
  $response = Invoke-RestMethod -Uri "$BASE_URL/auth/me" -Method Get -Headers $headers
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "请求失败: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  API 测试完成" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
