# 企业资产巡检后端服务 API 文档

## 基础信息

- 服务地址: `http://localhost:3000`
- API 前缀: `/api`
- 认证方式: Bearer Token (JWT)
- 数据格式: JSON

## 通用响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "timestamp": 1700000000000
}
```

## 1. 认证接口

### 1.1 登录

- **POST** `/api/auth/login`
- **无需认证**

请求体:
```json
{
  "username": "admin",
  "password": "123456"
}
```

响应:
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "username": "admin",
      "name": "系统管理员",
      "role": "admin",
      "department": "信息中心",
      "phone": "13800138000",
      "email": "admin@company.com"
    }
  },
  "timestamp": 1700000000000
}
```

### 1.2 获取当前用户信息

- **GET** `/api/auth/me`
- **需要认证**

## 2. 资产查询接口

### 2.1 获取资产状态和分类列表

- **GET** `/api/assets/status-list`
- **需要认证**

### 2.2 按资产编号查询资产详情

- **GET** `/api/assets/:assetCode`
- **需要认证**

### 2.3 资产列表查询（支持分页和筛选）

- **GET** `/api/assets`
- **需要认证**

查询参数:
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码，默认1 |
| pageSize | number | 每页条数，默认10 |
| keyword | string | 资产编号模糊搜索 |
| category | string | 资产分类 |
| status | string | 资产状态 |
| department | string | 所属部门 |

### 2.4 创建资产

- **POST** `/api/assets`
- **需要认证** - 管理员角色

### 2.5 更新资产信息

- **PUT** `/api/assets/:id`
- **需要认证** - 管理员角色

### 2.6 更新资产位置

- **POST** `/api/assets/location`
- **需要认证**

请求体:
```json
{
  "assetCode": "AST000001",
  "newLocation": "A座2楼",
  "remark": "搬迁到新办公室"
}
```

### 2.7 查询资产位置变更历史

- **GET** `/api/assets/:assetCode/location-logs`
- **需要认证**

## 3. 巡检任务接口

### 3.1 创建巡检任务

- **POST** `/api/inspection-tasks`
- **需要认证** - 管理员/巡检员角色

请求体:
```json
{
  "title": "季度设备巡检",
  "description": "对技术部所有电子设备进行常规检查",
  "assetCodes": ["AST000001", "AST000002", "AST000003"],
  "inspectorId": 2,
  "deadline": "2024-12-31T23:59:59",
  "cycle": "quarterly"
}
```

周期类型: `daily` `weekly` `monthly` `quarterly` `yearly` `once`

### 3.2 查询巡检任务列表

- **GET** `/api/inspection-tasks`
- **需要认证**

查询参数:
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| status | string | 任务状态 |
| inspectorId | number | 检查人ID |
| assetCode | string | 资产编号 |

### 3.3 查询我的巡检任务

- **GET** `/api/inspection-tasks/my`
- **需要认证**

### 3.4 获取我的任务统计

- **GET** `/api/inspection-tasks/stats`
- **需要认证**

### 3.5 获取任务详情

- **GET** `/api/inspection-tasks/:id`
- **需要认证**

### 3.6 更新任务状态

- **PUT** `/api/inspection-tasks/:id`
- **需要认证**

请求体:
```json
{
  "status": "completed",
  "inspectionResult": "设备运行正常，外观完好",
  "hasException": false
}
```

状态: `pending` `in_progress` `completed` `cancelled`

### 3.7 重新分配任务

- **POST** `/api/inspection-tasks/:id/assign`
- **需要认证** - 管理员角色

请求体:
```json
{
  "inspectorId": 3,
  "deadline": "2024-12-25T23:59:59"
}
```

### 3.8 删除任务

- **DELETE** `/api/inspection-tasks/:id`
- **需要认证** - 管理员角色

## 4. 异常上报接口

### 4.1 上报异常

- **POST** `/api/exceptions`
- **需要认证**
- **支持文件上传** (multipart/form-data)

请求参数:
| 参数 | 类型 | 说明 |
|------|------|------|
| assetCode | string | 资产编号 (必填) |
| taskId | number | 关联巡检任务ID |
| exceptionType | string | 异常类型 (必填) |
| description | string | 异常描述 (必填) |
| photos | file[] | 现场照片 (最多9张) |
| location | string | 发现位置 |
| latitude | number | 纬度 |
| longitude | number | 经度 |

异常类型: `damage`(损坏) `lost`(遗失) `malfunction`(故障) `expired`(过期) `missing`(缺失) `other`(其他)

### 4.2 查询异常列表

- **GET** `/api/exceptions`
- **需要认证**

### 4.3 查询我上报的异常

- **GET** `/api/exceptions/my-reported`
- **需要认证**

### 4.4 查询我处理的异常

- **GET** `/api/exceptions/my-handling`
- **需要认证**

### 4.5 获取我的待办列表

- **GET** `/api/exceptions/todo`
- **需要认证**

### 4.6 获取我的待办统计

- **GET** `/api/exceptions/todo-stats`
- **需要认证**

### 4.7 获取异常详情

- **GET** `/api/exceptions/:id`
- **需要认证**

## 5. 处理流转接口

### 5.1 获取处理人列表

- **GET** `/api/process/handlers`
- **需要认证**

查询参数:
| 参数 | 类型 | 说明 |
|------|------|------|
| handlerType | string | 处理人类型: maintenance / admin_staff |

### 5.2 分配异常给处理人

- **POST** `/api/exceptions/:id/assign`
- **需要认证** - 管理员角色

请求体:
```json
{
  "handlerId": 4,
  "handlerType": "maintenance",
  "remark": "请尽快安排维修"
}
```

### 5.3 流转异常（转派）

- **POST** `/api/exceptions/:id/transfer`
- **需要认证**

请求体:
```json
{
  "toUserId": 5,
  "handlerType": "maintenance",
  "remark": "这个问题需要刘工处理"
}
```

### 5.4 开始处理

- **POST** `/api/exceptions/:id/start`
- **需要认证** - 当前处理人或管理员

### 5.5 更新处理结果

- **POST** `/api/exceptions/:id/process`
- **需要认证** - 当前处理人或管理员

请求体:
```json
{
  "handleResult": "已更换损坏的内存条，设备恢复正常运行",
  "repairCost": 850,
  "status": "closed",
  "closeRemark": "已完成维修，测试通过"
}
```

### 5.6 关闭异常

- **POST** `/api/exceptions/:id/close`
- **需要认证** - 管理员角色

### 5.7 重新打开异常

- **POST** `/api/exceptions/:id/reopen`
- **需要认证** - 管理员角色

### 5.8 查询处理历史

- **GET** `/api/exceptions/:id/history`
- **需要认证**

## 6. 统计汇总接口

### 6.1 首页统计概览

- **GET** `/api/stats/dashboard`
- **需要认证**

查询参数:
| 参数 | 类型 | 说明 |
|------|------|------|
| startDate | date | 开始日期 |
| endDate | date | 结束日期 |
| department | string | 部门 |

### 6.2 按部门统计异常数量

- **GET** `/api/stats/exceptions/department`
- **需要认证**

### 6.3 按类型统计异常

- **GET** `/api/stats/exceptions/type`
- **需要认证**

### 6.4 异常趋势统计

- **GET** `/api/stats/exceptions/trend`
- **需要认证**

### 6.5 资产健康评分统计

- **GET** `/api/stats/asset-health`
- **需要认证**

### 6.6 逾期提醒

- **GET** `/api/stats/overdue-reminders`
- **需要认证**

查询参数:
| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | 类型: tasks / exceptions |

### 6.7 维修费用统计

- **GET** `/api/stats/repair-cost`
- **需要认证**

## 数据字典

### 用户角色 (UserRole)
| 值 | 说明 |
|----|------|
| admin | 系统管理员 |
| inspector | 巡检员 |
| maintenance | 维修人员 |
| admin_staff | 行政人员 |
| user | 普通用户 |

### 资产状态 (AssetStatus)
| 值 | 说明 | 健康评分 |
|----|------|----------|
| normal | 正常 | 100 |
| abnormal | 异常 | 60 |
| damaged | 损坏 | 30 |
| lost | 遗失 | 0 |
| maintenance | 维修中 | 50 |
| scrapped | 已报废 | 0 |

### 资产分类 (AssetCategory)
| 值 | 说明 |
|----|------|
| electronic | 电子设备 |
| furniture | 办公家具 |
| vehicle | 车辆 |
| equipment | 设备 |
| office | 办公用品 |
| other | 其他 |

### 任务状态 (TaskStatus)
| 值 | 说明 |
|----|------|
| pending | 待处理 |
| in_progress | 进行中 |
| completed | 已完成 |
| cancelled | 已取消 |
| overdue | 已逾期 |

### 异常状态 (ExceptionStatus)
| 值 | 说明 |
|----|------|
| pending | 待分配 |
| assigned | 已分配 |
| processing | 处理中 |
| resolved | 已解决 |
| closed | 已关闭 |

### 流转动作 (FlowAction)
| 值 | 说明 |
|----|------|
| create | 创建 |
| assign | 分配 |
| transfer | 流转 |
| process | 处理中 |
| resolve | 解决 |
| close | 关闭 |
| reopen | 重新打开 |
