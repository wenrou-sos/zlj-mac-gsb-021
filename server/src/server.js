import { createApp } from './app.js';
import { createMemoryStore } from './db/memoryStore.js';
import { createPgStore } from './db/pgStore.js';
import { createPool, runMigrations, waitForDatabase } from './db/pg.js';
import { seedIfEmpty } from './seed.js';

const PORT = Number(process.env.PORT || 3000);
// DB_MODE=memory 时使用内存存储（无需 PostgreSQL，便于本地演示）
const useMemory = (process.env.DB_MODE || '').toLowerCase() === 'memory';

async function main() {
  let store;
  if (useMemory) {
    store = createMemoryStore();
    console.log('[storage] 使用内存存储 (DB_MODE=memory)');
    await seedIfEmpty(store);
  } else {
    const pool = createPool();
    await waitForDatabase(pool);
    await runMigrations(pool);
    store = createPgStore(pool);
    console.log('[storage] 已连接 PostgreSQL 并完成建表');
    await seedIfEmpty(store);
  }

  const app = createApp(store);
  const server = app.listen(PORT, () => {
    const actualPort = server.address().port;
    console.log(`🚀 数据中心机柜容量管理 API 已启动: http://localhost:${actualPort}`);
    console.log(`   健康检查: http://localhost:${actualPort}/api/health`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('启动失败:', err.message);
  console.error('提示: 可设置 DB_MODE=memory 使用内存存储快速体验');
  process.exit(1);
});
