/**
 * 设备迁移方案规划（纯函数）
 *
 * 触发场景：
 *  1. 机柜发生资源超载（空间/电力/制冷）；
 *  2. 设备下线释放容量后，重新平衡。
 *
 * 策略：对每个过载机柜，按设备功率密度（kW/U，大的优先迁出，
 * 因为高密度设备对电力/制冷压力最大）逐个挑选目标机柜。
 * 目标机柜必须同时满足空间（自动分配 U 位）、电力、制冷三类约束。
 */
import { evaluateMount, findFirstSlot, rackUsage } from './capacity.js';

/** 候选迁移设备按“卸载价值”降序排列 */
function rankDevices(devices, reasons) {
  const byPower = reasons.includes('power') || reasons.includes('cooling');
  return [...devices].sort((a, b) => {
    if (byPower) {
      const da = (Number(a.power_kw) + Number(a.cooling_kw)) / Math.max(1, Number(a.size_u));
      const db = (Number(b.power_kw) + Number(b.cooling_kw)) / Math.max(1, Number(b.size_u));
      if (db !== da) return db - da;
    }
    return Number(b.size_u) - Number(a.size_u);
  });
}

/**
 * @param racks   机柜数组（含 id/name/total_u/power_kw/cooling_kw）
 * @param devices 全部设备数组，需带 rack_id 与 status
 * @param focusRackId 可选：仅规划指定机柜；不传则处理所有超载机柜
 * @returns {{feasible:boolean, moves:Array, remaining:Array, summary:object}}
 */
export function planMigration(racks, devices, focusRackId = null) {
  const rackMap = new Map(racks.map((r) => [r.id, { ...r }]));
  // 以工作副本模拟迁移动作：每台机柜维护“留在本机柜的设备”列表
  const stay = new Map();
  for (const r of racks) stay.set(r.id, []);
  for (const d of devices) {
    if (d.status === 'mounted' && stay.has(d.rack_id)) stay.get(d.rack_id).push({ ...d });
  }

  const moves = [];
  const remaining = [];

  const overloaded = racks.filter((r) => {
    if (focusRackId != null && r.id !== focusRackId) return false;
    return rackUsage(r, stay.get(r.id)).isOverload;
  });

  for (const source of overloaded) {
    let local = stay.get(source.id);
    let usage = rackUsage(source, local);
    let guard = 0;

    while (usage.isOverload && guard < 1000) {
      guard += 1;
      const reasons = [];
      if (usage.overload.space) reasons.push('space');
      if (usage.overload.power) reasons.push('power');
      if (usage.overload.cooling) reasons.push('cooling');

      const candidate = rankDevices(local, reasons)[0];
      if (!candidate) break;

      const target = chooseTarget(racks, stay, source.id, candidate);
      if (!target) {
        // 当前最该迁的设备无处可去，记录遗留并尝试其它设备
        remaining.push({
          rackId: source.id,
          rackName: source.name,
          deviceId: candidate.id,
          deviceName: candidate.name,
          reasons,
        });
        local = local.filter((d) => d.id !== candidate.id);
        stay.set(source.id, local);
        usage = rackUsage(source, local);
        continue;
      }

      moves.push({
        deviceId: candidate.id,
        deviceName: candidate.name,
        sizeU: Number(candidate.size_u),
        powerKw: Number(candidate.power_kw),
        coolingKw: Number(candidate.cooling_kw),
        fromRackId: source.id,
        fromRackName: source.name,
        toRackId: target.rack.id,
        toRackName: target.rack.name,
        targetStartU: target.startU,
      });

      local = local.filter((d) => d.id !== candidate.id);
      stay.set(source.id, local);
      stay.get(target.rack.id).push({ ...candidate, start_u: target.startU, rack_id: target.rack.id });
      usage = rackUsage(source, local);
    }

    if (usage.isOverload) {
      remaining.push({
        rackId: source.id,
        rackName: source.name,
        reasons: Object.entries(usage.overload)
          .filter(([, v]) => v)
          .map(([k]) => k),
      });
    }
  }

  // 全部参与规划的机柜在方案执行后均不过载，才算可行
  const checkedRacks = focusRackId != null ? racks.filter((r) => r.id === focusRackId) : racks;
  const feasible =
    remaining.length === 0 &&
    checkedRacks.every((r) => !rackUsage(r, stay.get(r.id)).isOverload);

  return {
    feasible,
    moves,
    remaining,
    summary: {
      movedDevices: moves.length,
      affectedRacks: new Set(moves.flatMap((m) => [m.fromRackId, m.toRackId])).size,
      releasedRacks: overloaded.length,
    },
  };
}

/** 为设备挑选可容纳的目标机柜；优先选择资源利用率最低的机柜（均衡放置） */
function chooseTarget(racks, stay, sourceRackId, device) {
  let best = null;
  for (const rack of racks) {
    if (rack.id === sourceRackId) continue;
    const localDevices = stay.get(rack.id);
    const startU = findFirstSlot(rack, localDevices, Number(device.size_u));
    if (startU == null) continue;
    const check = evaluateMount(rack, localDevices, { ...device, start_u: startU });
    if (!check.ok) continue;

    const usage = rackUsage(rack, localDevices);
    const score = Math.max(usage.spaceUtil, usage.powerUtil, usage.coolingUtil);
    if (best == null || score < best.score) {
      best = { rack, startU, score };
    }
  }
  return best;
}
