/** Read-only queries that build rack state including mounted devices and live usage. */

import { query } from '../db.js';
import { toNum } from '../services/capacity.js';

const RACK_SELECT = `
  SELECT
    r.id, r.name, r.location, r.u_capacity, r.power_capacity, r.cooling_capacity,
    r.created_at,
    COALESCE(agg.used_u, 0)::float       AS used_u,
    COALESCE(agg.used_power, 0)::float   AS used_power,
    COALESCE(agg.used_cooling, 0)::float AS used_cooling,
    COALESCE(agg.device_count, 0)::int  AS device_count
  FROM racks r
  LEFT JOIN (
    SELECT
      p.rack_id,
      SUM(d.u_size)      AS used_u,
      SUM(d.power_draw)  AS used_power,
      SUM(d.heat_output) AS used_cooling,
      COUNT(*)           AS device_count
    FROM placements p
    JOIN devices d ON d.id = p.device_id
    GROUP BY p.rack_id
  ) agg ON agg.rack_id = r.id
`;

function mapRack(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    u_capacity: Number(row.u_capacity),
    power_capacity: Number(row.power_capacity),
    cooling_capacity: Number(row.cooling_capacity),
    created_at: row.created_at,
    usage: {
      used_u: toNum(row.used_u),
      used_power: toNum(row.used_power),
      used_cooling: toNum(row.used_cooling),
      device_count: row.device_count,
      free_u: Number(row.u_capacity) - toNum(row.used_u),
      free_power: Number(row.power_capacity) - toNum(row.used_power),
      free_cooling: Number(row.cooling_capacity) - toNum(row.used_cooling),
    },
  };
}

export async function listRacks() {
  const { rows } = await query(`${RACK_SELECT} ORDER BY r.name`);
  return rows.map(mapRack);
}

export async function getRack(id) {
  const { rows } = await query(`${RACK_SELECT} WHERE r.id = $1`, [id]);
  return rows.length ? mapRack(rows[0]) : null;
}

const DEVICE_IN_RACK_SELECT = `
  SELECT
    d.id AS device_id, d.name, d.u_size, d.power_draw, d.heat_output,
    p.id AS placement_id, p.u_start, (p.u_start + d.u_size - 1) AS u_end, p.mounted_at
  FROM placements p
  JOIN devices d ON d.id = p.device_id
  WHERE p.rack_id = $1
  ORDER BY p.u_start
`;

export async function getRackDevices(rackId) {
  const { rows } = await query(DEVICE_IN_RACK_SELECT, [rackId]);
  return rows.map((row) => ({
    device_id: row.device_id,
    name: row.name,
    u_size: Number(row.u_size),
    power_draw: Number(row.power_draw),
    heat_output: Number(row.heat_output),
    placement_id: row.placement_id,
    u_start: Number(row.u_start),
    u_end: Number(row.u_end),
    mounted_at: row.mounted_at,
  }));
}

export async function getDevice(id) {
  const { rows } = await query(
    `SELECT id, name, u_size, power_draw, heat_output, status, created_at
     FROM devices WHERE id = $1`,
    [id]
  );
  return rows.length ? mapDevice(rows[0]) : null;
}

export async function listDevices() {
  const { rows } = await query(
    `SELECT
       d.id, d.name, d.u_size, d.power_draw, d.heat_output, d.status, d.created_at,
       p.rack_id, r.name AS rack_name, p.u_start
     FROM devices d
     LEFT JOIN placements p ON p.device_id = d.id
     LEFT JOIN racks r ON r.id = p.rack_id
     ORDER BY d.name`
  );
  return rows.map((row) => ({
    ...mapDevice(row),
    rack_id: row.rack_id,
    rack_name: row.rack_name,
    u_start: row.u_start != null ? Number(row.u_start) : null,
  }));
}

function mapDevice(row) {
  return {
    id: row.id,
    name: row.name,
    u_size: Number(row.u_size),
    power_draw: Number(row.power_draw),
    heat_output: Number(row.heat_output),
    status: row.status,
    created_at: row.created_at,
  };
}

/** Full state snapshot consumed by the migration planner. */
export async function getRackStates() {
  const racks = await listRacks();
  const result = [];
  for (const rack of racks) {
    result.push({ rack, devices: await getRackDevices(rack.id) });
  }
  return result;
}
