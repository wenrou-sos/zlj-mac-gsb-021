import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, waitForDatabase } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Create tables. Safe to run repeatedly (IF NOT EXISTS). */
export async function initSchema() {
  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  await query(sql);
}

/**
 * Insert demo data when the racks table is empty.
 * RACK-C is deliberately under-utilized so the planner has a migration target.
 */
export async function seedDemoData() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM racks');
  if (rows[0].n > 0) return false;

  //                          name        location    U    power(W) cooling(W)
  const racks = [
    ['RACK-A', 'DC1 / 第1列', 42, 8000, 8000],
    ['RACK-B', 'DC1 / 第1列', 42, 10000, 10000],
    ['RACK-C', 'DC1 / 第2列', 42, 12000, 12000],
  ];
  for (const [name, location, u, power, cooling] of racks) {
    await query(
      'INSERT INTO racks (name, location, u_capacity, power_capacity, cooling_capacity) VALUES ($1,$2,$3,$4,$5)',
      [name, location, u, power, cooling]
    );
  }

  //                       name          U  power heat
  const devices = [
    ['srv-web-01', 2, 650, 500],
    ['srv-web-02', 2, 650, 500],
    ['srv-app-01', 2, 800, 700],
    ['srv-app-02', 2, 800, 700],
    ['srv-db-01', 4, 2200, 2000],
    ['srv-db-02', 4, 2200, 2000],
    ['srv-cache-01', 1, 400, 300],
    ['srv-backup-01', 2, 500, 400],
  ];
  for (const [name, u, power, heat] of devices) {
    await query(
      'INSERT INTO devices (name, u_size, power_draw, heat_output, status) VALUES ($1,$2,$3,$4,$5)',
      [name, u, power, heat, 'unmounted']
    );
  }

  const mount = async (deviceName, rackName, uStart) => {
    await query(
      `INSERT INTO placements (rack_id, device_id, u_start, u_end)
       SELECT r.id, d.id, $3, $3 + d.u_size - 1
       FROM racks r, devices d
       WHERE r.name = $2 AND d.name = $1`,
      [deviceName, rackName, uStart]
    );
    await query("UPDATE devices SET status = 'mounted' WHERE name = $1", [deviceName]);
  };

  // RACK-A: 650+650+800+800+2200+2200 = 7300W, heat 6400W — fine.
  await mount('srv-web-01', 'RACK-A', 1);
  await mount('srv-web-02', 'RACK-A', 3);
  await mount('srv-app-01', 'RACK-A', 5);
  await mount('srv-app-02', 'RACK-A', 7);
  await mount('srv-db-01', 'RACK-A', 9);
  await mount('srv-db-02', 'RACK-A', 13); // 7300/8000, 6400/8000

  // RACK-B: 400W + the backup server.
  await mount('srv-cache-01', 'RACK-B', 1);
  await mount('srv-backup-01', 'RACK-B', 3);

  // srv-cache-01 etc. leave RACK-C empty as a migration target... but to demonstrate an
  // overload out of the box, push RACK-A over its power limit by shrinking the scenario:
  // the two DB servers alone exceed the rack once an extra dense device exists.
  await query(
    'INSERT INTO devices (name, u_size, power_draw, heat_output, status) VALUES ($1,$2,$3,$4,$5)',
    ['srv-gpu-01', 4, 1800, 1700, 'unmounted']
  );
  await mount('srv-gpu-01', 'RACK-A', 17); // 7300+1800 = 9100W > 8000W => overloaded

  return true;
}

async function main() {
  await waitForDatabase();
  await initSchema();
  const inserted = await seedDemoData();
  console.log(inserted ? '✅ 演示数据已写入' : 'ℹ️  racks 表非空，跳过演示数据');
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('❌ 数据库初始化失败:', err.message);
    process.exit(1);
  });
}
