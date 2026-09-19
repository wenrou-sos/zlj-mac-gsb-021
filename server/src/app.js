import express from 'express';
import cors from 'cors';
import { evaluateMount, findFirstSlot, rackUsage } from './lib/capacity.js';
import { planMigration } from './lib/migration.js';

export function createApp(store) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

  function validateRackBody(body) {
    const totalU = Number(body.total_u);
    const power = Number(body.power_kw);
    const cooling = Number(body.cooling_kw);
    if (!body.name || !String(body.name).trim()) throw badRequest('机柜名称不能为空');
    if (!Number.isInteger(totalU) || totalU <= 0 || totalU > 52) throw badRequest('total_u 需为 1-52 的整数');
    if (!Number.isFinite(power) || power < 0) throw badRequest('power_kw 需为非负数字');
    if (!Number.isFinite(cooling) || cooling < 0) throw badRequest('cooling_kw 需为非负数字');
    return { name: String(body.name).trim(), location: String(body.location || ''), total_u: totalU, power_kw: power, cooling_kw: cooling };
  }

  function validateRackPatch(body) {
    const patch = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) throw badRequest('机柜名称不能为空');
      patch.name = String(body.name).trim();
    }
    if (body.location !== undefined) patch.location = String(body.location);
    const numField = (key, label, int = false) => {
      if (body[key] === undefined) return;
      const v = Number(body[key]);
      if (!Number.isFinite(v) || v < 0 || (int && (!Number.isInteger(v) || v <= 0 || v > 52))) {
        throw badRequest(`${label} 参数非法`);
      }
      patch[key] = v;
    };
    numField('total_u', 'total_u', true);
    numField('power_kw', 'power_kw');
    numField('cooling_kw', 'cooling_kw');
    return patch;
  }

  function validateDeviceBody(body) {
    const sizeU = Number(body.size_u);
    const power = Number(body.power_kw || 0);
    const cooling = Number(body.cooling_kw || 0);
    if (!body.name || !String(body.name).trim()) throw badRequest('设备名称不能为空');
    if (!Number.isInteger(sizeU) || sizeU <= 0) throw badRequest('size_u 需为正整数');
    if (!Number.isFinite(power) || power < 0) throw badRequest('power_kw 需为非负数字');
    if (!Number.isFinite(cooling) || cooling < 0) throw badRequest('cooling_kw 需为非负数字');
    return { name: String(body.name).trim(), size_u: sizeU, power_kw: power, cooling_kw: cooling };
  }

  async function withUsage(rack) {
    const devices = await store.listDevices(rack.id);
    return { ...rack, devices, usage: rackUsage(rack, devices) };
  }

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', storage: store.kind, time: new Date().toISOString() });
  });

  // ---------- 机柜 ----------
  app.get(
    '/api/racks',
    asyncH(async (req, res) => {
      const racks = await store.listRacks();
      res.json(await Promise.all(racks.map(withUsage)));
    }),
  );

  app.get(
    '/api/racks/:id',
    asyncH(async (req, res) => {
      const rack = await store.getRack(req.params.id);
      if (!rack) return res.status(404).json({ error: '机柜不存在' });
      res.json(await withUsage(rack));
    }),
  );

  app.post(
    '/api/racks',
    asyncH(async (req, res) => {
      const rack = await store.createRack(validateRackBody(req.body || {}));
      res.status(201).json(await withUsage(rack));
    }),
  );

  app.patch(
    '/api/racks/:id',
    asyncH(async (req, res) => {
      const rack = await store.getRack(req.params.id);
      if (!rack) return res.status(404).json({ error: '机柜不存在' });
      const updated = await store.updateRack(rack.id, validateRackPatch(req.body || {}));
      // 调低容量后机柜可能超载，随响应返回最新用量与建议
      const withDev = await withUsage(updated);
      if (withDev.usage.isOverload) {
        const plan = planMigration(await store.listRacks(), await store.listDevices(), updated.id);
        return res.json({ ...withDev, overload: true, migration: { feasible: plan.feasible, moves: plan.moves.length } });
      }
      res.json(withDev);
    }),
  );

  app.delete(
    '/api/racks/:id',
    asyncH(async (req, res) => {
      const ok = await store.deleteRack(req.params.id);
      if (!ok) return res.status(404).json({ error: '机柜不存在' });
      res.status(204).end();
    }),
  );

  // ---------- 设备 ----------
  app.get(
    '/api/devices',
    asyncH(async (req, res) => {
      res.json(await store.listDevices(req.query.rack_id ?? null));
    }),
  );

  app.post(
    '/api/devices',
    asyncH(async (req, res) => {
      const device = await store.createDevice(validateDeviceBody(req.body || {}));
      res.status(201).json(device);
    }),
  );

  app.get(
    '/api/devices/:id',
    asyncH(async (req, res) => {
      const device = await store.getDevice(req.params.id);
      if (!device) return res.status(404).json({ error: '设备不存在' });
      res.json(device);
    }),
  );

  app.delete(
    '/api/devices/:id',
    asyncH(async (req, res) => {
      const ok = await store.deleteDevice(req.params.id);
      if (!ok) return res.status(404).json({ error: '设备不存在' });
      res.status(204).end();
    }),
  );

  /**
   * 设备上架：自动检查 U 位/电力/制冷三类冲突
   * body: {rack_id, start_u?}；start_u 省略时自动分配首个可用 U 位
   */
  app.post(
    '/api/devices/:id/mount',
    asyncH(async (req, res) => {
      const device = await store.getDevice(req.params.id);
      if (!device) return res.status(404).json({ error: '设备不存在' });
      const rackId = Number(req.body?.rack_id);
      const rack = await store.getRack(rackId);
      if (!rack) return res.status(404).json({ error: '目标机柜不存在' });

      const rackDevices = await store.listDevices(rackId);
      let startU = req.body?.start_u == null ? null : Number(req.body.start_u);

      if (startU == null) {
        // 自动分配 U 位
        startU = findFirstSlot(rack, rackDevices, device.size_u);
        if (startU == null) {
          return res.status(409).json({
            error: '上架被拒绝：机柜空间不足，无连续可用 U 位',
            conflicts: [{ type: 'space', message: `机柜剩余空间不足 ${device.size_u}U` }],
          });
        }
      } else if (!Number.isInteger(startU) || startU < 1) {
        throw badRequest('start_u 需为不小于 1 的整数');
      }

      const check = evaluateMount(rack, rackDevices, { ...device, start_u: startU });
      if (!check.ok) {
        return res.status(409).json({ error: '上架被拒绝：存在资源冲突', conflicts: check.conflicts });
      }

      const mounted = await store.mountDevice(device.id, { rack_id: rackId, start_u: startU });
      res.status(200).json({ device: mounted, rack: await withUsage(rack) });
    }),
  );

  /** 设备下线：释放机柜资源 */
  app.post(
    '/api/devices/:id/unmount',
    asyncH(async (req, res) => {
      const device = await store.getDevice(req.params.id);
      if (!device) return res.status(404).json({ error: '设备不存在' });
      if (device.status !== 'mounted') return res.status(409).json({ error: '设备当前未上架' });
      const rackId = device.rack_id;
      const unmounted = await store.unmountDevice(device.id);
      const rack = rackId != null ? await store.getRack(rackId) : null;
      res.json({ device: unmounted, rack: rack ? await withUsage(rack) : null });
    }),
  );

  // ---------- 迁移方案 ----------
  async function buildPlan(rackId) {
    const racks = await store.listRacks();
    const devices = await store.listDevices();
    const focus = rackId == null ? null : Number(rackId);
    if (focus != null && !racks.some((r) => r.id === focus)) throw Object.assign(new Error('机柜不存在'), { status: 404 });
    return planMigration(racks, devices, focus);
  }

  // 仅生成方案，不落库
  app.get(
    '/api/migration/plan',
    asyncH(async (req, res) => {
      res.json(await buildPlan(req.query.rack_id ?? null));
    }),
  );

  // 生成并执行迁移：逐个更新设备位置
  app.post(
    '/api/migration/execute',
    asyncH(async (req, res) => {
      const rackId = (req.body?.rack_id ?? req.query.rack_id) ?? null;
      const plan = await buildPlan(rackId);
      if (plan.feasible) {
        for (const move of plan.moves) {
          await store.mountDevice(move.deviceId, { rack_id: move.toRackId, start_u: move.targetStartU });
        }
      }
      const racks = await store.listRacks();
      res.json({ ...plan, applied: plan.feasible, racks: await Promise.all(racks.map(withUsage)) });
    }),
  );

  app.use((req, res) => res.status(404).json({ error: '接口不存在' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || '服务器内部错误' });
  });

  return app;
}
