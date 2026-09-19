# 数据中心机柜容量管理平台

面向数据中心运维的机柜容量登记与设备上架冲突检测平台，统一管理三类机柜资源：

| 资源 | 字段 | 说明 |
| --- | --- | --- |
| 机柜空间 | `u_capacity` | 机柜可用 U 数（如 42U），设备按占用 U 数登记 |
| 电力负载 | `power_capacity` / `power_draw` | 机柜供电上限 (W) / 设备功耗 (W) |
| 制冷能力 | `cooling_capacity` / `heat_output` | 机柜可带走的热量 (W) / 设备发热量 (W) |

设备上架时在**单个数据库事务**内完成三类检查：

1. **空间边界**：设备 U 区间不得超出机柜容量、起始位必须 ≥ 1；
2. **U 位重叠**：与在架设备的 `[u_start, u_end]` 区间不得相交；
3. **容量超载**：上架后累计功耗 / 发热量不得超过机柜电力 / 制冷上限。

任意一项不满足即返回 `409` 并带明确原因码（`space` / `overlap` / `power` / `cooling`）。

当机柜超载，或设备下线释放资源后，可通过迁移算法**自动重算搬迁方案**：按负载从大到小挑选设备，迁移到剩余资源水位最高的机柜，并保证目标机柜不产生新超载；资源不足时明确返回无法解决的机柜。

技术栈：**Vue 3 + Vite** ｜ **Node.js (Express)** ｜ **PostgreSQL** ｜ Docker Compose 一键编排。

---

## 一键启动（推荐）

前置要求：Docker（含 docker compose）。

```bash
chmod +x start.sh stop.sh
./start.sh            # 单元测试 + 前端构建 + 构建镜像 + 启动 + 健康检查
./start.sh --test     # 额外对容器内 PostgreSQL 跑完整 API 集成测试
```

启动后：

- 前端：<http://localhost:8080>
- 后端 API：<http://localhost:3000/health>
- 已内置演示数据：**RACK-A 电力与制冷双超载**，进入「迁移方案」页即可一键计算并执行搬迁。

停止：

```bash
./stop.sh           # 停止，保留数据
./stop.sh --purge   # 停止并清空数据库卷
```

## 本地开发（不用 Docker）

需要自行准备一个 PostgreSQL 14+ 实例：

```bash
# 1. 建库建账号
createdb dc_capacity   # 或: CREATE DATABASE dc_capacity;

# 2. 后端
cd backend
npm install
cp .env.example .env          # 按需修改连接信息
npm run init-db               # 建表 + 写入演示数据
npm run dev                   # http://localhost:3000

# 3. 前端（另开终端）
cd frontend
npm install
npm run dev                   # http://localhost:5173 （已配置 /api 代理到 3000）
```

## 测试

```bash
cd backend
npm test               # 全部测试（无数据库时集成测试自动 skip）
npm run test:unit      # 仅单元测试：容量汇总 / 上架冲突 / 迁移算法
npm run test:integration  # 需要可连通的 PostgreSQL
```

- **单元测试**（`node:test`，零外部依赖）：覆盖容量聚合、U 区间计算、四类上架冲突、超载迁移、空间迁移、资源不足不可解、下线后重新可解等场景。
- **集成测试**（supertest + 真实 PostgreSQL）：机柜/设备登记、U 位冲突拒绝、电力超载拒绝、设备下线释放资源、迁移方案计算与事务执行、超载计数归零。

## API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET/POST | `/api/racks` | 机柜列表 / 登记（空间、电力、制冷） |
| GET/PATCH/DELETE | `/api/racks/:id` | 机柜详情（含 U 位设备）/ 调整容量（不得低于已用量）/ 删除 |
| GET | `/api/racks/:id/mount-check?device_id=&u_start=` | 上架前冲突预检 |
| GET/POST | `/api/devices` | 设备列表 / 登记（U 数、功耗、发热量） |
| POST | `/api/devices/:id/mount` | 设备上架（事务内三类冲突检查） |
| DELETE | `/api/devices/:id/mount` | 设备下架 |
| POST | `/api/devices/:id/offline` | 设备下线（释放资源，提示重算迁移） |
| GET | `/api/migrations/plan?rack_id=` | 计算迁移方案（可限定单个超载机柜） |
| POST | `/api/migrations/execute` | 在一个事务中执行整套搬迁步骤 |
| GET | `/api/migrations/stats` | 总览统计（机柜数、超载数、未上架设备） |

## 目录结构

```
.
├── backend
│   ├── src
│   │   ├── app.js                 # Express 应用（可被测试直接加载）
│   │   ├── index.js               # 启动入口：等库就绪→建表→可选演示数据→监听
│   │   ├── db.js                  # pg 连接池 / 事务封装 / 重试等待
│   │   ├── errors.js              # 统一错误（409 冲突码等）
│   │   ├── init
│   │   │   ├── schema.sql         # racks / devices / placements 三张表
│   │   │   └── seed.js            # 建表 + 演示数据（幂等）
│   │   ├── routes                 # racks / devices / mount / migrations
│   │   └── services
│   │       ├── capacity.js        # 纯函数：容量汇总、U 区间、上架检查
│   │       ├── planner.js         # 纯函数：超载迁移贪心算法
│   │       └── repository.js      # SQL 查询与状态快照
│   ├── test                       # 单元测试 + 集成测试
│   └── Dockerfile
├── frontend
│   ├── src
│   │   ├── views                  # 总览 / 机柜 / 机柜U位 / 设备 / 迁移方案
│   │   ├── components/UsageBar.vue
│   │   ├── api.js
│   │   └── styles.css
│   ├── Dockerfile                 # 多阶段构建 → nginx 托管 + API 反代
│   └── nginx.conf
├── docker-compose.yml             # db + backend + frontend
├── start.sh / stop.sh
└── README.md
```
