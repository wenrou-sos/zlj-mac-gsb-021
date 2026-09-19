/** 演示数据：4 个机柜 + 若干设备，其中 R-A01 接近电力上限用于演示超载迁移 */
export async function seedIfEmpty(store) {
  const racks = await store.listRacks();
  if (racks.length > 0) return false;

  const r1 = await store.createRack({ name: 'R-A01', location: 'A 排', total_u: 42, power_kw: 10, cooling_kw: 10 });
  const r2 = await store.createRack({ name: 'R-A02', location: 'A 排', total_u: 42, power_kw: 12, cooling_kw: 12 });
  const r3 = await store.createRack({ name: 'R-B01', location: 'B 排', total_u: 42, power_kw: 8, cooling_kw: 8 });
  const r4 = await store.createRack({ name: 'R-B02', location: 'B 排', total_u: 42, power_kw: 15, cooling_kw: 15 });

  const d1 = await store.createDevice({ name: 'web-node-01', size_u: 2, power_kw: 0.6, cooling_kw: 0.6 });
  const d2 = await store.createDevice({ name: 'db-node-01', size_u: 4, power_kw: 3.2, cooling_kw: 3.0 });
  const d3 = await store.createDevice({ name: 'gpu-node-01', size_u: 4, power_kw: 4.5, cooling_kw: 4.2 });
  const d4 = await store.createDevice({ name: 'cache-node-01', size_u: 1, power_kw: 0.4, cooling_kw: 0.4 });
  const d5 = await store.createDevice({ name: 'web-node-02', size_u: 2, power_kw: 0.6, cooling_kw: 0.6 });
  const d6 = await store.createDevice({ name: 'compute-node-01', size_u: 2, power_kw: 2.2, cooling_kw: 2.0 });
  const d7 = await store.createDevice({ name: 'spare-server', size_u: 2, power_kw: 0.8, cooling_kw: 0.8 });

  await store.mountDevice(d1.id, { rack_id: r1.id, start_u: 1 });
  await store.mountDevice(d2.id, { rack_id: r1.id, start_u: 3 });
  await store.mountDevice(d3.id, { rack_id: r1.id, start_u: 7 });
  await store.mountDevice(d6.id, { rack_id: r1.id, start_u: 11 });
  // R-A01 电力 0.6+3.2+4.5+2.2 = 10.5kW > 额定 10kW，开箱即超载，可直接演示迁移
  await store.mountDevice(d4.id, { rack_id: r2.id, start_u: 1 });
  await store.mountDevice(d5.id, { rack_id: r3.id, start_u: 1 });
  // d7 未上架，可用于上架冲突测试
  void d7;

  console.log('[seed] 已写入演示数据：4 个机柜、7 台设备（R-A01 电力超载，用于迁移演示）');
  return true;
}

// 允许 `node src/seed.js --run` 独立执行
if (process.argv.includes('--run') && !process.env.SEED_SKIP_RUN) {
  const { createPool, runMigrations, waitForDatabase } = await import('./db/pg.js');
  const { createPgStore } = await import('./db/pgStore.js');
  const useMemory = (process.env.DB_MODE || '').toLowerCase() === 'memory';
  const store = useMemory
    ? (await import('./db/memoryStore.js')).createMemoryStore()
    : (await (async () => {
        const pool = createPool();
        await waitForDatabase(pool);
        await runMigrations(pool);
        return createPgStore(pool);
      })());
  await seedIfEmpty(store);
  console.log('种子数据执行完成');
  process.exit(0);
}
