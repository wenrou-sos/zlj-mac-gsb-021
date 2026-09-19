import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 以内存存储模式启动真实 HTTP 服务（PORT=0 使用随机端口） */
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: root,
      env: { ...process.env, DB_MODE: 'memory', PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('服务启动超时'));
      }
    }, 10000);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/http:\/\/localhost:(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]) });
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (!settled && /启动失败|Error/.test(text)) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error(text));
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`服务进程提前退出，退出码 ${code}`));
      }
    });
  });
}

test('服务可正常启动，健康检查与种子数据就绪', async () => {
  const { child, port } = await startServer();
  after(async () => {
    child.kill('SIGTERM');
    await new Promise((r) => child.on('exit', r));
  });

  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.storage, 'memory');

  const racks = await fetch(`http://127.0.0.1:${port}/api/racks`).then((r) => r.json());
  assert.ok(racks.length >= 4, '应包含种子机柜');
  for (const rack of racks) {
    assert.ok(rack.usage);
    assert.ok(Array.isArray(rack.devices));
  }
});
