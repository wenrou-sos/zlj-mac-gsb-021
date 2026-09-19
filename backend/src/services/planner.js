/**
 * Migration / rebalancing planner.
 *
 * Given the current state of every rack and its mounted devices, produce a sequence of
 * moves that removes all power / cooling / space overloads. Used for:
 *   1. A rack that became overloaded (evict devices to other racks).
 *   2. After a device goes offline (free space may enable reshuffling; same algorithm
 *      simply finds the now-feasible solution).
 *
 * The planner is greedy with deterministic tie-breaking. It never migrates a device to
 * a rack where it would create an overload.
 */

import { EPS, placementRange, rackSummary, freeIntervals, toNum } from './capacity.js';

function overloaded(rack, devices) {
  const s = rackSummary(rack, devices);
  return s.overloads.space || s.overloads.power || s.overloads.cooling;
}

function violationAmount(rack, devices) {
  const s = rackSummary(rack, devices);
  return (
    Math.max(0, s.power.used - s.power.capacity) +
    Math.max(0, s.cooling.used - s.cooling.capacity) +
    Math.max(0, s.u.used - s.u.capacity) * 1000 // treat 1U shortfall like 1000W so space dominates
  );
}

/** Devices of a rack in a working state map, cloned so moves don't mutate callers. */
function cloneState(stateMap) {
  return new Map(
    [...stateMap.entries()].map(([rack, devices]) => [rack, devices.map((d) => ({ ...d }))])
  );
}

function fits(rack, devices, device, start) {
  const size = Math.round(toNum(device.u_size));
  if (!Number.isFinite(start) || start < 1 || start + size - 1 > Math.round(toNum(rack.u_capacity))) {
    return false;
  }
  const range = { start, end: start + size - 1 };
  if (devices.some((d) => !(d.device_id === device.device_id) && rangesOverlap(placementRange(d), range))) {
    return false;
  }
  const others = devices.filter((d) => d.device_id !== device.device_id);
  const s = rackSummary(rack, [...others, { ...device, u_start: start }]);
  return !s.overloads.space && !s.overloads.power && !s.overloads.cooling;
}

function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * @param {Array<{rack: object, devices: Array<object>}>} rackStates
 *        each device needs device_id, name, u_size, power_draw, heat_output, u_start
 * @param {number|null} onlyRackId when set, only overloads on this rack are resolved
 * @returns {{ feasible: boolean, moves: Array, unresolved: Array, rackSummaries: object }}
 */
export function planMigrations(rackStates, onlyRackId = null) {
  const state = cloneState(new Map(rackStates.map(({ rack, devices }) => [rack, devices])));
  const moves = [];

  const targets = () =>
    [...state.keys()]
      .filter((r) => onlyRackId == null || toNum(r.id) !== toNum(onlyRackId))
      .sort((a, b) => toNum(a.id) - toNum(b.id));

  const overloadedRacks = () =>
    [...state.entries()]
      .map(([rack, devices]) => ({ rack, devices, violation: violationAmount(rack, devices) }))
      .filter((x) => x.violation > EPS)
      .filter((x) => onlyRackId == null || toNum(x.rack.id) === toNum(onlyRackId));

  let guard = 0;
  const maxIterations = rackStates.reduce((n, { devices }) => n + devices.length, 0) + 1;

  while (overloadedRacks().length > 0) {
    if (++guard > maxIterations) break;

    // Worst rack first.
    const worst = overloadedRacks().sort((a, b) => b.violation - a.violation)[0];
    const { rack: sourceRack, devices: sourceDevices } = worst;

    // Evict the largest power draw first (biggest bang per move), ties: higher u_start then id.
    const candidates = [...sourceDevices].sort((a, b) => {
      const pa = toNum(a.power_draw) + toNum(a.heat_output);
      const pb = toNum(b.power_draw) + toNum(b.heat_output);
      if (pb !== pa) return pb - pa;
      if (toNum(b.u_start) !== toNum(a.u_start)) return toNum(b.u_start) - toNum(a.u_start);
      return toNum(a.device_id) - toNum(b.device_id);
    });

    let moved = false;
    for (const device of candidates) {
      const options = [];
      for (const destRack of targets()) {
        if (toNum(destRack.id) === toNum(sourceRack.id)) continue;
        const destDevices = state.get(destRack);
        for (const interval of freeIntervals(destRack, destDevices)) {
          // Try the bottom of each free interval first; also scan within long intervals.
          for (let start = interval.start; start + toNum(device.u_size) - 1 <= interval.end; start++) {
            if (fits(destRack, destDevices, device, start)) {
              const after = rackSummary(destRack, [
                ...destDevices,
                { ...device, u_start: start },
              ]);
              // Score: headroom remaining after move (more is better), then lowest rack id.
              const headroom =
                after.power.free / Math.max(1, after.power.capacity) +
                after.cooling.free / Math.max(1, after.cooling.capacity) +
                after.u.free / Math.max(1, after.u.capacity);
              options.push({ destRack, start, headroom });
              break; // one feasible position per interval is enough
            }
          }
        }
      }

      if (options.length > 0) {
        // Prefer the destination that leaves the most relative headroom.
        options.sort((a, b) => b.headroom - a.headroom || toNum(a.destRack.id) - toNum(b.destRack.id));
        const choice = options[0];

        // Mutate working state.
        state.set(
          sourceRack,
          state
            .get(sourceRack)
            .filter((d) => toNum(d.device_id) !== toNum(device.device_id))
        );
        state.set(choice.destRack, [
          ...state.get(choice.destRack),
          { ...device, u_start: choice.start },
        ]);

        moves.push({
          device_id: toNum(device.device_id),
          device_name: device.name,
          from_rack_id: toNum(sourceRack.id),
          from_rack_name: sourceRack.name,
          from_u_start: toNum(device.u_start),
          to_rack_id: toNum(choice.destRack.id),
          to_rack_name: choice.destRack.name,
          to_u_start: choice.start,
        });
        moved = true;
        break;
      }
    }

    if (!moved) break; // no device could be relocated; overload is unresolvable
  }

  const unresolved = overloadedRacks().map(({ rack, devices }) => ({
    rack_id: toNum(rack.id),
    rack_name: rack.name,
    summary: rackSummary(rack, devices),
  }));

  const rackSummaries = [...state.entries()].map(([rack, devices]) => ({
    rack_id: toNum(rack.id),
    rack_name: rack.name,
    summary: rackSummary(rack, devices),
  }));

  return { feasible: unresolved.length === 0, moves, unresolved, rackSummaries };
}
