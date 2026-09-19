# 🏢 数据中心机柜容量管理平台

对数据中心机柜的 **空间（U 位）、电力负载（kW）、制冷能力（kW）** 进行统一登记与可视化管理：

- 📋 机柜 / 设备资源登记（容量、位置、尺寸、功耗、散热需求）
- ⚡ 设备上架时**自动检查资源冲突**：U 位越界、U 位重叠、电力超载、制冷超载
- 🤖 支持自动分配 U 位，或点击机柜视图中的空位从指定位置上架
- 🔀 机柜超载或设备下线后，一键**重新计算迁移方案**并执行
  （优先迁出高功率密度设备，自动选择仍有余量的目标机柜与 U 位）
- 📊 实时容量水位与 U 位布局可视化

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3（`<script setup>`）+ Vite |
| 后端 | Node.js 20 + Express（ESM） |
| 数据库 | PostgreSQL 16（`pg` 驱动，自动建表） |
| 部署 | Docker / Docker Compose（前端 Nginx 反代 API） |
| 测试 | Node 内置测试运行器 `node:test`（22 个用例，零额外测试框架） |

## 目录结构

```
.
├── docker-compose.yml       # postgres + server + client 一键编排
├── start.sh / start.bat     # 一键启动脚本
├── server/
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.js        # 入口（支持 DB_MODE=memory 无数据库演示）
│   │   ├── app.js           # Express 路由：机柜/设备/上架/下线/迁移
│   │   ├── seed.js          # 演示数据（R-A01 开箱即超载）
│   │   ├── lib/capacity.js  # 容量汇总 / 冲突检测 / U 位分配（纯函数）
│   │   ├── lib/migration.js # 迁移方案规划（纯函数）
│   │   └── db/              # schema.sql + pgStore / memoryStore（同接口）
│   └── test/                # 容量算法、迁移、API、服务启动测试
└── client/
    ├── Dockerfile + nginx.conf
    └── src/
        ├── App.vue                  # 主页面
        ├── api.js                   # API 封装
        └── components/
            ├── RackCard.vue         # 机柜卡片 + 三维容量水位
            ├── RackVisual.vue       # U 位布局可视化
            ├── CapacityBar.vue      # 容量条
            ├── MountDialog.vue      # 上架对话框
            └── MigrationPanel.vue   # 迁移方案面板
```

## 快速开始

### 方式一：Docker Compose（推荐，完整 PostgreSQL 栈）

```bash
./start.sh            # 构建并启动 postgres + api + web
# 或 Windows: start.bat docker
```

启动后：

- 前端：<http://localhost:8080>
- API 健康检查：<http://localhost:3000/api/health>
- PostgreSQL：`localhost:5432`，库 `dc_capacity`，用户 `dcadmin/dcpass`

服务首次启动会自动建表并写入演示数据（4 个机柜、7 台设备，其中 **R-A01 电力超载**，
可直接在右侧「迁移方案重算」面板点击 **生成方案 → 执行迁移**）。

其他命令：

```bash
./start.sh stop     # 停止
./start.sh clean    # 停止并清空数据库卷
./start.sh logs     # 查看日志
```

### 方式二：本机开发模式（无需 Docker / PostgreSQL）

后端内置**内存存储**实现（与 PostgreSQL 存储接口完全一致），便于快速体验：

```bash
./start.sh dev      # API(3000, 内存存储) + Vite(5173, 热更新)
# 打开 http://localhost:5173
```

### 方式三：本机生产预览

```bash
./start.sh local    # 构建前端 + API(3000) + vite preview(8080)
```

## 运行测试

```bash
./start.sh test
# 或 cd server && npm test
```

覆盖 22 个用例：

- `capacity.test.js` — 用量汇总、U 位重叠、越界、电力/制冷冲突、自动 U 位分配
- `migration.test.js` — 超载迁移可行性、无处可迁、空间超载、下线后重算、高密度优先
- `api.test.js` — 全部 HTTP 接口、409 冲突明细、参数校验、迁移执行、下线释放
- `server-startup.test.js` — **以子进程真实启动服务**，验证项目可正常启动、
  健康检查与种子数据就绪

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（含存储类型） |
| GET/POST | `/api/racks` | 机柜列表（含实时用量）/ 登记 |
| PATCH/DELETE | `/api/racks/:id` | 修改容量（调低后返回超载提示与迁移建议）/ 删除 |
| GET/POST | `/api/devices` | 设备台账 / 新建设备 |
| DELETE | `/api/devices/:id` | 删除设备 |
| POST | `/api/devices/:id/mount` | **上架并自动冲突检查**；body `{rack_id, start_u?}`，省略 `start_u` 自动分配 |
| POST | `/api/devices/:id/unmount` | 设备下线，立即释放资源 |
| GET | `/api/migration/plan?rack_id=` | 生成迁移方案（不落库） |
| POST | `/api/migration/execute?rack_id=` | 生成并执行迁移方案 |

上架冲突时返回 `409`：

```json
{
  "error": "上架被拒绝：存在资源冲突",
  "conflicts": [
    { "type": "space", "message": "U 位冲突：与设备「7」占用的 U1-U2 重叠" },
    { "type": "power", "message": "电力超载：已用 9.2kW + 本设备 2kW > 额定 10kW" }
  ]
}
```

## 容量与迁移规则

- **冲突检测**：`[start_u, start_u + size_u - 1]` 区间不得与在架设备重叠，且不得超出机柜总 U 数；
  在架设备功耗/散热之和（含新设备）不得超过机柜额定电力/制冷。
- **自动 U 位**：自 U1 起扫描首个满足尺寸的连续空位。
- **迁移策略**：对超载机柜，按 `(功耗+散热)/U` 功率密度降序选择迁出设备；
  目标机柜按当前最高资源利用率升序选择（均衡放置），且必须同时满足空间/电力/制冷；
  若所有机柜都无法接收，则方案标记为不可行并列出遗留资源。

## 环境变量

见 `.env.example`：`PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`、`PORT`、`DB_MODE`（`postgres|memory`）。
