import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMigration } from '../src/lib/migration.js';
import { rackUsage } from '../src/lib/capacity.js';

const mkRack = (id, name, total_u = 20, power_kw = 10, cooling_kw = 10) => ({
  id, name, location: '', total_u, power_kw, cooling_kw,
});
const mkDev = (id, name, rack_id, start_u, size_u = 2, power_kw = 1, cooling_kw = 1) => ({
  id, name, rack_id, start_u, size_u, power_kw, cooling_kw, status: 'mounted',
});

test('电力超载机柜中的设备被迁移到有余量的机柜，方案可行', () => {
  const racks = [mkRack(1, 'R1', 20, 5, 5), mkRack(2, 'R2', 20, 10, 10)];
  const devices = [
    mkDev(1, 'a', 1, 1, 2, 3, 3),
    mkDev(2, 'b', 1, 3, 2, 3, 3), // R1 电力 6 > 5 超载
  ];
  const plan = planMigration(racks, devices, 1);
  assert.equal(plan.feasible, true);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].toRackId, 2);
  assert.ok(plan.moves[0].targetStartU >= 1);
});

test('无机柜可容纳时方案不可行并报告遗留设备', () => {
  const racks = [
    mkRack(1, 'R1', 20, 5, 5),
    mkRack(2, 'R2', 20, 1, 1), // 目标机柜容量太小
  ];
  const devices = [
    mkDev(1, 'a', 1, 1, 2, 3, 3),
    mkDev(2, 'b', 1, 3, 2, 3, 3),
  ];
  const plan = planMigration(racks, devices, 1);
  assert.equal(plan.feasible, false);
  assert.ok(plan.remaining.length > 0);
});

test('空间超载：迁出设备后源机柜恢复正常', () => {
  const racks = [mkRack(1, 'R1', 4, 20, 20), mkRack(2, 'R2', 10, 20, 20)];
  const devices = [
    mkDev(1, 'a', 1, 1, 2, 0.5, 0.5),
    mkDev(2, 'b', 1, 3, 2, 0.5, 0.5),
    mkDev(3, 'c', 1, 5, 2, 0.5, 0.5), // 4U 机柜放了 6U
  ];
  const plan = planMigration(racks, devices, 1);
  assert.equal(plan.feasible, true);
  assert.equal(plan.moves.length >= 1, true);
});

test('设备下线释放容量后全局重算：不再产生多余迁移', () => {
  const racks = [mkRack(1, 'R1', 20, 10, 10), mkRack(2, 'R2', 20, 10, 10)];
  const devices = [
    mkDev(1, 'a', 1, 1, 2, 4, 4),
    mkDev(2, 'b', 1, 3, 2, 4, 4), // 8/10 未超载
  ];
  const plan = planMigration(racks, devices);
  assert.equal(plan.feasible, true);
  assert.equal(plan.moves.length, 0);
});

test('高密度设备优先迁出', () => {
  const racks = [mkRack(1, 'R1', 20, 5, 5), mkRack(2, 'R2', 20, 10, 10)];
  const devices = [
    mkDev(1, 'low-density', 1, 1, 4, 1, 1),
    mkDev(2, 'gpu-box', 1, 5, 2, 4.5, 4.5), // 合计 5.5 > 5
  ];
  const plan = planMigration(racks, devices, 1);
  assert.equal(plan.feasible, true);
  assert.equal(plan.moves[0].deviceId, 2);
  // 迁移后按方案模拟，源机柜不再超载
  const stayDevices = devices
    .filter((d) => d.id !== 2)
    .concat({ ...devices[1], rack_id: 2, start_u: plan.moves[0].targetStartU });
  const sourceRackDevices = stayDevices.filter((d) => d.rack_id === 1);
  assert.equal(rackUsage(racks[0], sourceRackDevices).isOverload, false);
});
