import { Router } from 'express';
import { withTransaction } from '../db.js';
import { asyncHandler, badRequest, conflict, notFound } from '../errors.js';
import { getDevice, getRack, getRackDevices } from '../services/repository.js';
import { canPlaceDevice } from '../services/capacity.js';

const router = Router();

async function loadMountContext(client, deviceId, rackId) {
  const { rows: dRows } = await client.query(
    'SELECT * FROM devices WHERE id = $1',
    [deviceId]
  );
  if (!dRows.length) throw notFound('设备不存在');
  const { rows: rRows } = await client.query('SELECT * FROM racks WHERE id = $1', [rackId]);
  if (!rRows.length) throw notFound('机柜不存在');
  const { rows: pRows } = await client.query(
    `SELECT d.id AS device_id, d.name, d.u_size, d.power_draw, d.heat_output, p.u_start
     FROM placements p JOIN devices d ON d.id = p.device_id
     WHERE p.rack_id = $1 ORDER BY p.u_start`,
    [rackId]
  );
  return { device: dRows[0], rack: rRows[0], existing: pRows };
}

/**
 * Dry-run conflict check: GET /api/racks/:rackId/mount-check?device_id=&u_start=
 * Returns whether mounting is allowed and the resulting usage.
 */
router.get(
  '/racks/:rackId/mount-check',
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.query.device_id);
    const uStart = Number(req.query.u_start);
    if (!Number.isInteger(deviceId) || !Number.isInteger(uStart)) {
      throw badRequest('device_id 与 u_start 必须是整数');
    }
    const device = await getDevice(deviceId);
    const rack = await getRack(req.params.rackId);
    if (!device) throw notFound('设备不存在');
    if (!rack) throw notFound('机柜不存在');
    const existing = await getRackDevices(rack.id);

    const check = canPlaceDevice({ rack, device, uStart, existingDevices: existing });
    const projected = existing
      .filter((d) => d.device_id !== device.id)
      .concat({ ...device, u_start: uStart });
    res.json({ allowed: check.ok, reason: check.ok ? null : check.code, message: check.message });
  })
);

/**
 * Mount a device: POST /api/devices/:deviceId/mount { rack_id, u_start }
 * Performs space overlap + power + cooling checks atomically.
 */
router.post(
  '/devices/:deviceId/mount',
  asyncHandler(async (req, res) => {
    const rackId = Number(req.body.rack_id);
    const uStart = Number(req.body.u_start);
    if (!Number.isInteger(rackId) || !Number.isInteger(uStart)) {
      throw badRequest('rack_id 与 u_start 必须是整数');
    }

    const result = await withTransaction(async (client) => {
      const { device, rack, existing } = await loadMountContext(client, req.params.deviceId, rackId);

      const { rows: already } = await client.query(
        'SELECT id FROM placements WHERE device_id = $1',
        [device.id]
      );
      if (already.length) throw conflict('already_mounted', '设备已在某个机柜中，请先下架');

      const check = canPlaceDevice({ rack, device, uStart, existingDevices: existing });
      if (!check.ok) throw conflict(check.code, check.message);

      const { rows } = await client.query(
        `INSERT INTO placements (rack_id, device_id, u_start, u_end)
         VALUES ($1,$2,$3,$3 + $4 - 1)
         RETURNING *`,
        [rack.id, device.id, uStart, device.u_size]
      );
      await client.query("UPDATE devices SET status = 'mounted' WHERE id = $1", [device.id]);
      return { placement: rows[0], device, rack };
    });

    res.status(201).json({
      ok: true,
      message: `设备 ${result.device.name} 已上架至 ${result.rack.name} U${uStart}`,
      placement: result.placement,
    });
  })
);

/** Unmount: DELETE /api/placements/device/:deviceId */
router.delete(
  '/devices/:deviceId/mount',
  asyncHandler(async (req, res) => {
    await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        'DELETE FROM placements WHERE device_id = $1',
        [req.params.deviceId]
      );
      if (!rowCount) throw notFound('该设备当前未上架');
      await client.query("UPDATE devices SET status = 'unmounted' WHERE id = $1", [
        req.params.deviceId,
      ]);
    });
    res.json({ ok: true, message: '设备已下架' });
  })
);

export default router;
