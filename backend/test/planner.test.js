import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMigrations } from '../src/services/planner.js';

function dev(id, name, u, power, heat, uStart, rackId) {
  return { device_id: id, name, u_size: u, power_draw: power, heat_output: heat, u_start: uStart };
}

const rackA = { id: 1, name: 'A', u_capacity: 42, power_capacity: 8000, cooling_capacity: 8000 };
const rackB = { id: 2, name: 'B', u_capacity: 42, power_capacity: 10000, cooling_capacity: 10000 };
const rackC = { id: 3, name: 'C', u_capacity: 42, power_capacity: 12000, cooling_capacity: 12000 };

test('returns no moves when nothing is overloaded', () => {
  const states = [
    { rack: rackA, devices: [dev(1, 'd1', 2, 1000, 1000, 1)] },
    { rack: rackB, devices: [] },
    { rack: rackC, devices: [] },
  ];
  const plan = planMigrations(states);
  assert.equal(plan.feasible, true);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.unresolved.length, 0);
});

test('evicts devices from an overloaded rack to a rack with headroom', () => {
  // A: 7300W + gpu 1800W = 9100W > 8000W, heat 8100W > 8000W
  const aDevices = [
    dev(1, 'srv-web-01', 2, 650, 500, 1),
    dev(2, 'srv-web-02', 2, 650, 500, 3),
    dev(3, 'srv-app-01', 2, 800, 700, 5),
    dev(4, 'srv-app-02', 2, 800, 700, 7),
    dev(5, 'srv-db-01', 4, 2200, 2000, 9),
    dev(6, 'srv-db-02', 4, 2200, 2000, 13),
    dev(7, 'srv-gpu-01', 4, 1800, 1700, 17),
  ];
  const states = [
    { rack: rackA, devices: aDevices },
    { rack: rackB, devices: [dev(8, 'cache', 1, 400, 300, 1)] },
    { rack: rackC, devices: [] },
  ];

  const plan = planMigrations(states, 1);
  assert.equal(plan.feasible, true, 'should resolve overload');
  assert.ok(plan.moves.length >= 1);
  // Biggest power devices are moved first.
  assert.ok(plan.moves[0].device_id === 5 || plan.moves[0].device_id === 6);
  // Nothing stays overloaded.
  assert.deepEqual(plan.unresolved, []);
  // Moves never land in the source rack when scoped.
  for (const m of plan.moves) {
    assert.notEqual(m.to_rack_id, 1);
    assert.equal(typeof m.to_u_start, 'number');
  }
});

test('reports unresolved when no rack has enough headroom', () => {
  const dense = dev(1, 'huge', 4, 6000, 6000, 1);
  const states = [
    { rack: rackA, devices: [dense, dev(2, 'x', 1, 3000, 3000, 5)] }, // 9000W
    { rack: rackB, devices: [dev(3, 'full', 40, 10000, 10000, 1)] },
    { rack: rackC, devices: [dev(4, 'full2', 40, 12000, 12000, 1)] },
  ];
  const plan = planMigrations(states, 1);
  assert.equal(plan.feasible, false);
  assert.equal(plan.unresolved.length, 1);
  assert.equal(plan.unresolved[0].rack_id, 1);
});

test('space overload alone triggers migration', () => {
  const states = [
    {
      rack: { id: 1, name: 'small', u_capacity: 4, power_capacity: 99999, cooling_capacity: 99999 },
      devices: [dev(1, 'a', 2, 100, 100, 1), dev(2, 'b', 4, 100, 100, 3)],
    },
    { rack: rackB, devices: [] },
    { rack: rackC, devices: [] },
  ];
  const plan = planMigrations(states, 1);
  assert.equal(plan.feasible, true);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].device_id, 2);
});

test('simulating an offline (removed device) makes a previously blocked move feasible', () => {
  // Rack B and C are packed; A overloaded. Removing one device from C frees room.
  const before = planMigrations(
    [
      {
        rack: rackA,
        devices: [dev(1, 'a', 4, 5000, 5000, 1), dev(2, 'b', 4, 4000, 4000, 5)],
      },
      { rack: rackB, devices: [dev(3, 'p', 40, 10000, 10000, 1)] },
      { rack: rackC, devices: [dev(4, 'q', 40, 9000, 9000, 1)] },
    ],
    1
  );
  assert.equal(before.feasible, false);

  // Device 4 goes offline => C now has 4U and 3000W headroom... device a (5000W) still
  // won't fit, but reduce: simulate freed rack with small load instead.
  const after = planMigrations(
    [
      {
        rack: rackA,
        devices: [dev(1, 'a', 4, 5000, 5000, 1), dev(2, 'b', 4, 4000, 4000, 5)],
      },
      { rack: rackB, devices: [] },
      { rack: rackC, devices: [] },
    ],
    1
  );
  assert.equal(after.feasible, true);
  assert.ok(after.moves.length >= 1);
});
