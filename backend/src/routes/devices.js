import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { asyncHandler, badRequest, conflict, notFound } from '../errors.js';
import { getDevice, listDevices } from '../services/repository.js';

const router = Router();

function validateDeviceBody(body) {
  const required = ['name', 'u_size', 'power_draw', 'heat_output'];
  for (const key of required) {
    if (body[key] === undefined) throw badRequest(`缺少字段 ${key}`);
  }
  if (typeof body.name !== 'string' || !body.name.trim()) throw badRequest('name 不能为空');
  for (const key of ['u_size', 'power_draw', 'heat_output']) {
    if (typeof body[key] !== 'number' || !Number.isFinite(body[key])) {
      throw badRequest(`${key} 必须是数字`);
    }
    if (key === 'u_size' ? body[key] < 1 : body[key] < 0) {
      throw badRequest(`${key} 取值非法`);
    }
  }
  return {
    name: body.name.trim(),
    u_size: Math.round(body.u_size),
    power_draw: body.power_draw,
    heat_output: body.heat_output,
  };
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listDevices());
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const device = await getDevice(req.params.id);
    if (!device) throw notFound('设备不存在');
    res.json(device);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const f = validateDeviceBody(req.body);
    const { rows } = await query(
      `INSERT INTO devices (name, u_size, power_draw, heat_output)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [f.name, f.u_size, f.power_draw, f.heat_output]
    );
    res.status(201).json(rows[0]);
  })
);

/** Unmount / take a device offline. Its placement is deleted inside a transaction. */
router.post(
  '/:id/offline',
  asyncHandler(async (req, res) => {
    const device = await getDevice(req.params.id);
    if (!device) throw notFound('设备不存在');

    const placement = await withTransaction(async (client) => {
      const { rows: pRows } = await client.query(
        'SELECT p.*, r.name AS rack_name FROM placements p JOIN racks r ON r.id = p.rack_id WHERE p.device_id = $1',
        [device.id]
      );
      await client.query('DELETE FROM placements WHERE device_id = $1', [device.id]);
      await client.query("UPDATE devices SET status = 'unmounted' WHERE id = $1", [device.id]);
      return pRows[0] ?? null;
    });

    res.json({
      ok: true,
      message: placement
        ? `设备 ${device.name} 已从 ${placement.rack_name} 下架，资源已释放，可重新计算迁移方案`
        : `设备 ${device.name} 当前未上架`,
      was_mounted: !!placement,
    });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const device = await getDevice(req.params.id);
    if (!device) throw notFound('设备不存在');
    if (device.status === 'mounted') throw conflict('mounted', '设备仍在架，请先下架');
    await query('DELETE FROM devices WHERE id = $1', [device.id]);
    res.status(204).end();
  })
);

export default router;
