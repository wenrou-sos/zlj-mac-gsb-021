import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export function createPool(config = {}) {
  return new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'dcadmin',
    password: process.env.PGPASSWORD || 'dcpass',
    database: process.env.PGDATABASE || 'dc_capacity',
    max: 10,
    ...config,
  });
}

/** 等待数据库可连（Docker compose 启动时 Postgres 可能尚未就绪） */
export async function waitForDatabase(pool, retries = 30, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i < retries; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function runMigrations(pool) {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

/** pg 返回的 NUMERIC 是字符串，统一转成数字 */
export function normalizeRack(r) {
  if (!r) return r;
  return { ...r, total_u: Number(r.total_u), power_kw: Number(r.power_kw), cooling_kw: Number(r.cooling_kw) };
}

export function normalizeDevice(d) {
  if (!d) return d;
  return {
    ...d,
    rack_id: d.rack_id ?? null,
    start_u: d.start_u == null ? null : Number(d.start_u),
    size_u: Number(d.size_u),
    power_kw: Number(d.power_kw),
    cooling_kw: Number(d.cooling_kw),
  };
}
