import express from 'express';
import cors from 'cors';
import { errorHandler } from './errors.js';
import racksRouter from './routes/racks.js';
import devicesRouter from './routes/devices.js';
import mountRouter from './routes/mount.js';
import migrationsRouter from './routes/migrations.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'dc-capacity-api' }));

  app.use('/api/racks', racksRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api', mountRouter);
  app.use('/api/migrations', migrationsRouter);

  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: '接口不存在' } }));
  app.use(errorHandler);
  return app;
}
