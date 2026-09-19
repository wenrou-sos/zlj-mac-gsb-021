/**
 * Pure capacity / placement logic. No database access here so it is trivial to unit test.
 *
 * U numbering: 1 is the bottom U of the rack, u_capacity is the top U.
 * A device of u_size mounted at u_start occupies [u_start, u_start + u_size - 1].
 */

export const EPS = 1e-6;

export function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function placementRange(p) {
  const start = Math.round(toNum(p.u_start));
  const size = p.u_size != null ? Math.round(toNum(p.u_size)) : Math.round(toNum(p.u_end)) - start + 1;
  return { start, end: start + size - 1 };
}

export function intervalsOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

/** Total and remaining resources of a rack given the devices currently in it. */
export function rackSummary(rack, devices = []) {
  const usedU = devices.reduce((sum, d) => sum + Math.round(toNum(d.u_size)), 0);
  const usedPower = devices.reduce((sum, d) => sum + toNum(d.power_draw), 0);
  const usedCooling = devices.reduce((sum, d) => sum + toNum(d.heat_output), 0);

  const uCapacity = Math.round(toNum(rack.u_capacity));
  const powerCapacity = toNum(rack.power_capacity);
  const coolingCapacity = toNum(rack.cooling_capacity);

  return {
    u: { used: usedU, capacity: uCapacity, free: uCapacity - usedU },
    power: { used: usedPower, capacity: powerCapacity, free: powerCapacity - usedPower },
    cooling: { used: usedCooling, capacity: coolingCapacity, free: coolingCapacity - usedCooling },
    overloads: {
      space: usedU > uCapacity + EPS,
      power: usedPower > powerCapacity + EPS,
      cooling: usedCooling > coolingCapacity + EPS,
    },
  };
}

/** Free [start,end] intervals inside a rack after accounting for its devices. */
export function freeIntervals(rack, devices = []) {
  const capacity = Math.round(toNum(rack.u_capacity));
  const occupied = devices
    .map((d) => placementRange(d))
    .sort((a, b) => a.start - b.start);

  const free = [];
  let cursor = 1;
  for (const { start, end } of occupied) {
    if (start > cursor) free.push({ start: cursor, end: start - 1 });
    cursor = Math.max(cursor, end + 1);
  }
  if (cursor <= capacity) free.push({ start: cursor, end: capacity });
  return free;
}

/**
 * Validate mounting a device into a rack at u_start.
 * Returns { ok: true } or { ok: false, code, message }.
 * code is 'not_found' | 'space' | 'overlap' | 'power' | 'cooling'
 */
export function canPlaceDevice({ rack, device, uStart, existingDevices = [] }) {
  if (!rack) return { ok: false, code: 'not_found', message: '机柜不存在' };
  if (!device) return { ok: false, code: 'not_found', message: '设备不存在' };

  const size = Math.round(toNum(device.u_size));
  const start = Math.round(toNum(uStart));
  const end = start + size - 1;
  const range = { start, end };
  const capacity = Math.round(toNum(rack.u_capacity));

  if (!Number.isInteger(start) || start < 1) {
    return { ok: false, code: 'space', message: '起始 U 位必须为不小于 1 的整数' };
  }
  if (end > capacity) {
    return {
      ok: false,
      code: 'space',
      message: `空间不足：设备占用 U${start}-U${end}，超出机柜 ${capacity}U 上限`,
    };
  }

  for (const d of existingDevices) {
    if (intervalsOverlap(range, placementRange(d))) {
      const other = placementRange(d);
      return {
        ok: false,
        code: 'overlap',
        message: `U 位冲突：与已上架设备 U${other.start}-U${other.end} 重叠`,
      };
    }
  }

  const summary = rackSummary(rack, [...existingDevices, { ...device, u_start: start }]);
  if (summary.overloads.power) {
    return {
      ok: false,
      code: 'power',
      message: `电力超载：上架后 ${Math.round(summary.power.used)}W > 上限 ${Math.round(summary.power.capacity)}W`,
    };
  }
  if (summary.overloads.cooling) {
    return {
      ok: false,
      code: 'cooling',
      message: `制冷超载：上架后 ${Math.round(summary.cooling.used)}W > 制冷能力 ${Math.round(summary.cooling.capacity)}W`,
    };
  }

  return { ok: true };
}
