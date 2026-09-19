import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/db/memoryStore.js';

let store;
let rackA;
let rackB;
let spareDevice;

before(async () => {
  store = createMemoryStore();
  rackA = await store.createRack({ name: 'RA', location: '', total_u: 10, power_kw: 5, cooling_kw: 5 });
  rackB = await store.createRack({ name: 'RB', location: '', total_u: 10, power_kw: 10, cooling_kw: 10 });
  const d1 = await store.createDevice({ name: 'srv-1', size_u: 2, power_kw: 1, cooling_kw: 1 });
  await store.mountDevice(d1.id, { rack_id: rackA.id, start_u: 1 });
  spareDevice = await store.createDevice({ name: 'srv-big', size_u: 4, power_kw: 6, cooling_kw: 6 });
});

function api() {
  return createApp(store);
}

test('GET /api/health 返回存储类型', async () => {
  const server = api().listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.storage, 'memory');
  } finally {
    server.close();
  }
});

test('GET /api/racks 返回机柜与实时用量', async () => {
  const server = api().listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/racks`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.length, 2);
    const a = body.find((r) => r.id === rackA.id);
    assert.equal(a.usage.usedU, 2);
    assert.equal(a.usage.powerKw, 1);
  } finally {
    server.close();
  }
});

test('POST 机柜参数校验', async () => {
  const server = api().listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/racks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', total_u: 0, power_kw: 1, cooling_kw: 1 }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('上架 U 位冲突返回 409 及冲突明细', async () => {
  const server = api().listen(0);
  const port = server.address().port;
  try {
    const d = await store.createDevice({ name: 'srv-x', size_u: 2, power_kw: 0.5, cooling_kw: 0.5 });
    const res = await fetch(`http://127.0.0.1:${port}/api/devices/${d.id}/mount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rack_id: rackA.id, start_u: 1 }), // 与 srv-1 重叠
    });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.ok(body.conflicts.some((c) => c.type === 'space'));
  } finally {
    server.close();
  }
});

test('上架电力超载返回 409', async () => {
  const server = api().listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/devices/${spareDevice.id}/mount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rack_id: rackA.id, start_u: 3 }), // 1+6 > 5kW
    });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.ok(body.conflicts.some((c) => c.type === 'power'));
    assert.ok(body.conflicts.some((c) => c.type === 'cooling'));
  } finally {
    server.close();
  }
});

test('省略 start_u 时自动分配 U 位并上架成功', async () => {
  const server = api().listen(0);
  const port = server.address().port;
  try {
    const d = await store.createDevice({ name: 'auto-slot', size_u: 2, power_kw: 1, cooling_kw: 1 });
    const res = await fetch(`http://127.0.0.1:${port}/api/devices/${d.id}/mount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rack_id: rackA.id }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.device.start_u, 3); // U1-2 已被占用
    assert.equal(body.device.status, 'mounted');
  } finally {
    server.close();
  }
});

test('超载后执行迁移方案，设备被迁往其他机柜且所有机柜恢复正常', async () => {
  const local = createMemoryStore();
  // 构造超载：RC 额定 5kW，放入 3+3=6kW
  const rc = await local.createRack({ name: 'RC', location: '', total_u: 10, power_kw: 5, cooling_kw: 5 });
  await local.createRack({ name: 'RD', location: '', total_u: 10, power_kw: 10, cooling_kw: 10 });
  const x = await local.createDevice({ name: 'x', size_u: 2, power_kw: 3, cooling_kw: 3 });
  const y = await local.createDevice({ name: 'y', size_u: 2, power_kw: 3, cooling_kw: 3 });
  await local.mountDevice(x.id, { rack_id: rc.id, start_u: 1 });
  await local.mountDevice(y.id, { rack_id: rc.id, start_u: 3 });

  const server = createApp(local).listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/migration/execute?rack_id=${rc.id}`, { method: 'POST' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.applied, true);
    assert.equal(body.feasible, true);
    assert.equal(body.moves.length, 1);
    for (const rack of body.racks) {
      assert.equal(rack.usage.isOverload, false, `机柜 ${rack.name} 不应再超载`);
    }
  } finally {
    server.close();
  }
});

test('设备下线后容量立即释放', async () => {
  const local = createMemoryStore();
  const rc = await local.createRack({ name: 'RE', location: '', total_u: 4, power_kw: 3, cooling_kw: 3 });
  const x = await local.createDevice({ name: 'z', size_u: 4, power_kw: 3, cooling_kw: 3 });
  await local.mountDevice(x.id, { rack_id: rc.id, start_u: 1 });

  const server = createApp(local).listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/devices/${x.id}/unmount`, { method: 'POST' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.device.status, 'unmounted');
    assert.equal(body.rack.usage.usedU, 0);
    assert.equal(body.rack.usage.powerKw, 0);
  } finally {
    server.close();
  }
});
