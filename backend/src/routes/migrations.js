import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../errors.js';
import { getRackStates } from '../services/repository.js';
import { planMigrations } from '../services/planner.js';
import { rackSummary } from '../services/capacity.js';

const router = Router();

/**
 * Compute (but do not apply) a migration plan.
 * GET /api/migrations/plan?rack_id=12   -> resolve overloads of one rack only
 * GET /api/migrations/plan              -> resolve every overloaded rack
 * Call this after an overload appears or after a device goes offline (space freed).
 */
router.get(
  '/plan',
  asyncHandler(async (req, res) => {
    const rackId = req.query.rack_id != null ? Number(req.query.rack_id) : null;
    const rackStates = await getRackStates();
    const plan = planMigrations(rackStates, rackId);
    res.json(plan);
  })
);

/**
 * Apply a migration plan returned by /plan. Every move is executed in one transaction:
 * placements are rewritten with the destination rack / U position.
 * POST /api/migrations/execute  body: { moves: [...] }
 */
router.post(
  '/execute',
  asyncHandler(async (req, res) => {
    const moves = Array.isArray(req.body?.moves) ? req.body.moves : null;
    if (!moves) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'moves 必须是数组' } });
    }

    const applied = await withTransaction(async (client) => {
      const done = [];
      for (const move of moves) {
        const deviceId = Number(move.device_id);
        const toRackId = Number(move.to_rack_id);
        const toU = Number(move.to_u_start);
        if (![deviceId, toRackId, toU].every(Number.isInteger)) {
          const err = new Error('moves 中的 device_id / to_rack_id / to_u_start 必须是整数');
          err.status = 400;
          throw err;
        }

        const { rows: dRows } = await client.query(
          'SELECT u_size FROM devices WHERE id = $1',
          [deviceId]
        );
        if (!dRows.length) {
          const err = new Error(`设备 ${deviceId} 不存在`);
          err.status = 409;
          throw err;
        }

        const { rowCount } = await client.query(
          `UPDATE placements
             SET rack_id = $1, u_start = $2, u_end = $2 + $3 - 1, mounted_at = now()
           WHERE device_id = $4`,
          [toRackId, toU, dRows[0].u_size, deviceId]
        );
        if (!rowCount) {
          const err = new Error(`设备 ${deviceId} 未上架，无法迁移`);
          err.status = 409;
          throw err;
        }
        done.push(move);
      }
      return done;
    });

    res.json({ ok: true, applied_count: applied.length, moves: applied });
  })
);

/** Dashboard counters: totals, overloaded rack count and unmounted devices. */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const rackStates = await getRackStates();
    let overloadedRacks = 0;
    const totals = { u: 0, power: 0, cooling: 0, usedU: 0, usedPower: 0, usedCooling: 0 };
    for (const { rack, devices } of rackStates) {
      const s = rackSummary(rack, devices);
      if (s.overloads.space || s.overloads.power || s.overloads.cooling) overloadedRacks += 1;
      totals.u += s.u.capacity;
      totals.power += s.power.capacity;
      totals.cooling += s.cooling.capacity;
      totals.usedU += s.u.used;
      totals.usedPower += s.power.used;
      totals.usedCooling += s.cooling.used;
    }
    const { rows } = await query(
      "SELECT COUNT(*)::int AS n FROM devices WHERE status = 'unmounted'"
    );
    res.json({
      rack_count: rackStates.length,
      overloaded_racks: overloadedRacks,
      unmounted_devices: rows[0].n,
      totals,
    });
  })
);

export default router;
