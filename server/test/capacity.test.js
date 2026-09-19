import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceInterval,
  evaluateMount,
  findFirstSlot,
  intervalsOverlap,
  rackUsage,
} from '../src/lib/capacity.js';

const rack = { id: 1, name: 'R1', total_u: 10, power_kw: 5, cooling_kw: 6 };

const dev = (id, start_u, size_u, power_kw = 1, cooling_kw = 1, status = 'mounted') => ({
  id, start_u, size_u, power_kw, cooling_kw, status,
});

test('rackUsage 汇总空间/电力/制冷用量', () => {
  const devices = [dev(1, 1, 2, 1.5, 1.2), dev(2, 3, 3, 2.0, 2.0), dev(3, null, 1, 9, 9, 'unmounted')];
  const u = rackUsage(rack, devices);
  assert.equal(u.usedU, 5);
  assert.equal(u.freeU, 5);
  assert.equal(u.powerKw, 3.5); // 未上架设备不计入
  assert.equal(u.coolingKw, 3.2);
  assert.equal(u.isOverload, false);
  assert.equal(u.powerUtil, 70);
});

test('电力超载时 isOverload 为 true', () => {
  const u = rackUsage(rack, [dev(1, 1, 2, 3), dev(2, 3, 2, 2.5, 1)]);
  assert.equal(u.overload.power, true);
  assert.equal(u.overload.space, false);
  assert.equal(u.isOverload, true);
});

test('U 位区间重叠判断', () => {
  assert.equal(intervalsOverlap({ start: 1, end: 2 }, { start: 2, end: 3 }), true);
  assert.equal(intervalsOverlap({ start: 1, end: 2 }, { start: 3, end: 4 }), false);
  assert.deepEqual(deviceInterval(dev(7, 5, 4)), { start: 5, end: 8 });
});

test('evaluateMount 检测 U 位越界', () => {
  const result = evaluateMount(rack, [], { start_u: 9, size_u: 4, power_kw: 0.5, cooling_kw: 0.5 });
  assert.equal(result.ok, false);
  assert.ok(result.conflicts.some((c) => c.type === 'space'));
});

test('evaluateMount 检测 U 位冲突', () => {
  const result = evaluateMount(rack, [dev(1, 1, 4)], {
    start_u: 3, size_u: 2, power_kw: 0.5, cooling_kw: 0.5,
  });
  assert.equal(result.ok, false);
  assert.match(result.conflicts[0].message, /U 位冲突/);
});

test('evaluateMount 检测电力与制冷超载', () => {
  const result = evaluateMount(rack, [dev(1, 1, 2, 3, 4)], {
    start_u: 3, size_u: 2, power_kw: 2.5, cooling_kw: 3,
  });
  assert.equal(result.ok, false);
  assert.ok(result.conflicts.some((c) => c.type === 'power'));
  assert.ok(result.conflicts.some((c) => c.type === 'cooling'));
});

test('evaluateMount 合法上架无冲突', () => {
  const result = evaluateMount(rack, [dev(1, 1, 2, 1, 1)], {
    start_u: 3, size_u: 2, power_kw: 1, cooling_kw: 1,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.conflicts, []);
});

test('findFirstSlot 返回首个连续空位', () => {
  const devices = [dev(1, 1, 2), dev(2, 5, 2)];
  assert.equal(findFirstSlot(rack, devices, 2), 3);
  assert.equal(findFirstSlot(rack, devices, 3), 7);
  assert.equal(findFirstSlot(rack, devices, 10), null);
});
