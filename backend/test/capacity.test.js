import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rackSummary,
  freeIntervals,
  intervalsOverlap,
  placementRange,
} from '../src/services/capacity.js';

const rack = { id: 1, name: 'R1', u_capacity: 10, power_capacity: 5000, cooling_capacity: 4000 };

test('rackSummary aggregates space, power and cooling usage', () => {
  const devices = [
    { u_size: 2, power_draw: 1000, heat_output: 800 },
    { u_size: 3, power_draw: 2000, heat_output: 1600 },
  ];
  const s = rackSummary(rack, devices);
  assert.equal(s.u.used, 5);
  assert.equal(s.u.free, 5);
  assert.equal(s.power.used, 3000);
  assert.equal(s.power.free, 2000);
  assert.equal(s.cooling.used, 2400);
  assert.equal(s.cooling.free, 1600);
  assert.deepEqual(s.overloads, { space: false, power: false, cooling: false });
});

test('rackSummary flags overloads independently per resource', () => {
  assert.equal(rackSummary(rack, [{ u_size: 10, power_draw: 100, heat_output: 10 }]).overloads.space, false);
  assert.equal(rackSummary(rack, [{ u_size: 11, power_draw: 100, heat_output: 10 }]).overloads.space, true);
  assert.equal(rackSummary(rack, [{ u_size: 1, power_draw: 5001, heat_output: 10 }]).overloads.power, true);
  assert.equal(rackSummary(rack, [{ u_size: 1, power_draw: 10, heat_output: 4001 }]).overloads.cooling, true);
});

test('freeIntervals computes gaps around mounted devices', () => {
  const devices = [
    { u_start: 1, u_size: 2 }, // U1-2
    { u_start: 5, u_size: 2 }, // U5-6
  ];
  assert.deepEqual(freeIntervals(rack, devices), [
    { start: 3, end: 4 },
    { start: 7, end: 10 },
  ]);
});

test('freeIntervals returns whole rack when empty and [] when full', () => {
  assert.deepEqual(freeIntervals(rack, []), [{ start: 1, end: 10 }]);
  const full = [{ u_start: 1, u_size: 10 }];
  assert.deepEqual(freeIntervals(rack, full), []);
});

test('intervalsOverlap and placementRange helpers', () => {
  assert.equal(intervalsOverlap({ start: 1, end: 2 }, { start: 2, end: 3 }), true);
  assert.equal(intervalsOverlap({ start: 1, end: 2 }, { start: 3, end: 4 }), false);
  assert.deepEqual(placementRange({ u_start: 7, u_size: 4 }), { start: 7, end: 10 });
  assert.deepEqual(placementRange({ u_start: 7, u_end: 10 }), { start: 7, end: 10 });
});
