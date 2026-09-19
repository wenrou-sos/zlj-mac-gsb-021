/**
 * 机柜容量核心算法（纯函数，无 IO 依赖，便于单元测试）
 *
 * U 位坐标约定：start_u 为设备顶部占用的起始 U 位（从 1 开始），
 * 设备占用区间 [start_u, start_u + size_u - 1]。
 */

export const EPS = 1e-9;

/** 资源超限比较：允许微小浮点误差 */
export function exceeds(used, capacity) {
  return used - capacity > EPS;
}

export function round3(n) {
  return Math.round((Number(n) + EPS) * 1000) / 1000;
}

export function round1(n) {
  return Math.round((Number(n) + EPS) * 10) / 10;
}

/** 计算设备占用的 U 位区间 */
export function deviceInterval(device) {
  const start = Math.max(1, Math.trunc(Number(device.start_u)));
  const end = start + Math.trunc(Number(device.size_u)) - 1;
  return { start, end };
}

/** 取机柜内所有已上架设备的 U 位区间 */
export function occupiedIntervals(devices) {
  return devices
    .filter((d) => d.status === 'mounted' && Number.isInteger(Number(d.start_u)))
    .map((d) => ({ ...deviceInterval(d), deviceId: d.id }));
}

export function intervalsOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * 计算机柜当前资源用量
 * @returns {{usedU:number, freeU:number, spaceUtil:number,
 *   powerKw:number, powerFree:number, powerUtil:number,
 *   coolingKw:number, coolingFree:number, coolingUtil:number,
 *   overload:{space:boolean,power:boolean,cooling:boolean}, isOverload:boolean}}
 */
export function rackUsage(rack, devices) {
  const mounted = devices.filter((d) => d.status === 'mounted');
  const usedU = mounted.reduce((s, d) => s + Number(d.size_u || 0), 0);
  const powerKw = mounted.reduce((s, d) => s + Number(d.power_kw || 0), 0);
  const coolingKw = mounted.reduce((s, d) => s + Number(d.cooling_kw || 0), 0);

  const totalU = Number(rack.total_u);
  const powerCap = Number(rack.power_kw);
  const coolingCap = Number(rack.cooling_kw);

  const space = exceeds(usedU, totalU);
  const power = exceeds(powerKw, powerCap);
  const cooling = exceeds(coolingKw, coolingCap);
  const overload = { space, power, cooling };

  return {
    usedU,
    freeU: Math.max(0, totalU - usedU),
    spaceUtil: totalU > 0 ? round1((usedU / totalU) * 100) : 0,
    powerKw: round3(powerKw),
    powerFree: round3(Math.max(0, powerCap - powerKw)),
    powerUtil: powerCap > 0 ? round1((powerKw / powerCap) * 100) : 0,
    coolingKw: round3(coolingKw),
    coolingFree: round3(Math.max(0, coolingCap - coolingKw)),
    coolingUtil: coolingCap > 0 ? round1((coolingKw / coolingCap) * 100) : 0,
    overload,
    isOverload: space || power || cooling,
  };
}

/**
 * 上架前冲突检查
 * @param candidate 待上架设备 {id?, start_u, size_u, power_kw, cooling_kw}
 * @param devices   机柜内全部设备（含候选自身时按 id 排除）
 */
export function evaluateMount(rack, devices, candidate) {
  const conflicts = [];
  const totalU = Number(rack.total_u);
  const sizeU = Math.trunc(Number(candidate.size_u));
  const startU = Math.trunc(Number(candidate.start_u));

  if (!Number.isInteger(startU) || startU < 1) {
    conflicts.push({ type: 'space', message: '起始 U 位必须为不小于 1 的整数' });
  } else if (startU + sizeU - 1 > totalU) {
    conflicts.push({
      type: 'space',
      message: `U 位越界：设备占用 U${startU}-U${startU + sizeU - 1}，机柜共 ${totalU}U`,
    });
  } else {
    const candInterval = { start: startU, end: startU + sizeU - 1 };
    for (const d of occupiedIntervals(devices)) {
      if (candidate.id != null && d.deviceId === candidate.id) continue;
      if (intervalsOverlap(candInterval, d)) {
        conflicts.push({
          type: 'space',
          message: `U 位冲突：与设备「${d.deviceId}」占用的 U${d.start}-U${d.end} 重叠`,
          deviceId: d.deviceId,
        });
      }
    }
  }

  const mounted = devices.filter(
    (d) => d.status === 'mounted' && (candidate.id == null || d.id !== candidate.id),
  );
  const usedPower = mounted.reduce((s, d) => s + Number(d.power_kw || 0), 0);
  const usedCooling = mounted.reduce((s, d) => s + Number(d.cooling_kw || 0), 0);

  if (exceeds(usedPower + Number(candidate.power_kw || 0), Number(rack.power_kw))) {
    conflicts.push({
      type: 'power',
      message: `电力超载：已用 ${round3(usedPower)}kW + 本设备 ${round3(
        candidate.power_kw,
      )}kW > 额定 ${rack.power_kw}kW`,
    });
  }
  if (exceeds(usedCooling + Number(candidate.cooling_kw || 0), Number(rack.cooling_kw))) {
    conflicts.push({
      type: 'cooling',
      message: `制冷超载：已用 ${round3(usedCooling)}kW + 本设备 ${round3(
        candidate.cooling_kw,
      )}kW > 制冷能力 ${rack.cooling_kw}kW`,
    });
  }

  return { ok: conflicts.length === 0, conflicts };
}

/**
 * 自动分配起始 U 位：从 U1 起首个不与现有设备冲突、且满足尺寸的位置。
 * 调用方需先保证电力/制冷总量可行。
 * @returns {number|null}
 */
export function findFirstSlot(rack, devices, sizeU) {
  const intervals = occupiedIntervals(devices).sort((a, b) => a.start - b.start);
  const totalU = Number(rack.total_u);
  for (let s = 1; s + sizeU - 1 <= totalU; s += 1) {
    const cand = { start: s, end: s + sizeU - 1 };
    if (!intervals.some((iv) => intervalsOverlap(cand, iv))) return s;
  }
  return null;
}

/** 过载原因中文描述 */
export function overloadReasons(usage) {
  const reasons = [];
  if (usage.overload.space) reasons.push('空间不足');
  if (usage.overload.power) reasons.push('电力超载');
  if (usage.overload.cooling) reasons.push('制冷超载');
  return reasons;
}
