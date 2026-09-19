import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlaceDevice } from '../src/services/capacity.js';

const rack = { id: 1, name: 'R1', u_capacity: 10, power_capacity: 5000, cooling_capacity: 4000 };
const bigDevice = { id: 9, name: 'gpu', u_size: 4, power_draw: 3000, heat_output: 2500 };

test('accepts a fitting device into free space with enough power/cooling', () => {
  const result = canPlaceDevice({ rack, device: bigDevice, uStart: 1, existingDevices: [] });
  assert.equal(result.ok, true);
});

test('rejects device beyond rack U boundary', () => {
  const result = canPlaceDevice({ rack, device: bigDevice, uStart: 8, existingDevices: [] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'space');
});

test('rejects overlapping U position', () => {
  const existing = [{ device_id: 1, name: 'a', u_start: 3, u_size: 4, power_draw: 100, heat_output: 10 }];
  const result = canPlaceDevice({ rack, device: bigDevice, uStart: 5, existingDevices: existing });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'overlap');
});

test('rejects power overload after mounting', () => {
  const existing = [{ device_id: 1, u_start: 1, u_size: 2, power_draw: 3000, heat_output: 0 }];
  const result = canPlaceDevice({ rack, device: bigDevice, uStart: 5, existingDevices: existing });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'power');
});

test('rejects cooling overload after mounting', () => {
  const existing = [{ device_id: 1, u_start: 1, u_size: 2, power_draw: 0, heat_output: 2000 }];
  const result = canPlaceDevice({ rack, device: bigDevice, uStart: 5, existingDevices: existing });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'cooling');
});

test('missing rack or device reports not_found', () => {
  assert.equal(canPlaceDevice({ rack: null, device: bigDevice, uStart: 1 }).code, 'not_found');
  assert.equal(canPlaceDevice({ rack, device: null, uStart: 1 }).code, 'not_found');
});
