import { createApp } from './app.js';
import { pool, waitForDatabase } from './db.js';
import { initSchema, seedDemoData } from './init/seed.js';

const PORT = Number(process.env.PORT || 3000);

async function main() {
  await waitForDatabase();
  await initSchema();
  if (process.env.SEED_DEMO === '1') {
    await seedDemoData();
  }

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`🚀 数据中心容量管理 API 已启动: http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
