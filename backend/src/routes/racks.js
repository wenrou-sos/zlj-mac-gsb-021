import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../errors.js';
import { listRacks, getRack, getRackDevices } from '../services/repository.js';
import { rackSummary } from '../services/capacity.js';

const router = Router();

function validateRackBody(body, partial = false) {
  const fields = {};
  const requirePresent = (key) => {
    if (!partial || body[key] !== undefined) {
      if (typeof body[key] !== 'number' || !Number.isFinite(body[key])) {
        throw badRequest(`${key} 必须是数字`);
      }
    }
  };
  if (partial ? body.name !== undefined : true) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw badRequest('name 不能为空');
    fields.name = body.name.trim();
  }
  if (!partial || body.location !== undefined) fields.location = String(body.location ?? '');
  requirePresent('u_capacity');
  requirePresent('power_capacity');
  requirePresent('cooling_capacity');
  for (const key of ['u_capacity', 'power_capacity', 'cooling_capacity']) {
    if (body[key] !== undefined) {
      if (body[key] <= 0) throw badRequest(`${key} 必须大于 0`);
      fields[key] = body[key];
    }
  }
  return fields;
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listRacks());
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rack = await getRack(req.params.id);
    if (!rack) throw notFound('机柜不存在');
    const devices = await getRackDevices(rack.id);
    res.json({ ...rack, devices, capacity: rackSummary(rack, devices) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const f = validateRackBody(req.body);
    const { rows } = await query(
      `INSERT INTO racks (name, location, u_capacity, power_capacity, cooling_capacity)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [f.name, f.location, f.u_capacity, f.power_capacity, f.cooling_capacity]
    );
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const rack = await getRack(req.params.id);
    if (!rack) throw notFound('机柜不存在');

    // Prevent shrinking below current allocation.
    const devices = await getRackDevices(rack.id);
    const current = rackSummary(rack, devices);
    const next = {
      u_capacity: req.body.u_capacity ?? rack.u_capacity,
      power_capacity: req.body.power_capacity ?? rack.power_capacity,
      cooling_capacity: req.body.cooling_capacity ?? rack.cooling_capacity,
    };
    if (next.u_capacity < current.u.used) throw badRequest('新空间容量小于已占用 U 数');
    if (next.power_capacity < current.power.used) throw badRequest('新电力容量小于当前负载');
    if (next.cooling_capacity < current.cooling.used) throw badRequest('新制冷容量小于当前热负载');

    const f = validateRackBody(req.body, true);
    const { rows } = await query(
      `UPDATE racks SET
         name = COALESCE($1, name),
         location = COALESCE($2, location),
         u_capacity = COALESCE($3, u_capacity),
         power_capacity = COALESCE($4, power_capacity),
         cooling_capacity = COALESCE($5, cooling_capacity)
       WHERE id = $6 RETURNING *`,
      [f.name ?? null, f.location ?? null, f.u_capacity ?? null, f.power_capacity ?? null, f.cooling_capacity ?? null, rack.id]
    );
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const devices = await getRackDevices(req.params.id);
    if (devices.length > 0) throw badRequest('机柜中仍有设备，请先下架或迁移');
    const { rowCount } = await query('DELETE FROM racks WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('机柜不存在');
    res.status(204).end();
  })
);

export default router;
