import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { initDb } from './db';
import usersRouter from './routes/users';
import runsRouter from './routes/runs';
import authRouter from './routes/auth';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'flowshift-api', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.json({
    service: 'flowshift-api',
    version: '1.0.0',
    description: 'iPaaS Migration Playbook Generator',
    endpoints: {
      'POST /users': 'Register a new user',
      'GET /users/:id': 'Get user details (requires X-API-Key header)',
      'GET /users/:id/runs': 'List all runs for a user (requires X-API-Key header)',
      'POST /runs': 'Submit a migration run (requires X-API-Key header)',
      'GET /runs/:id': 'Get run details and results (requires X-API-Key header)',
    },
    platforms: ['n8n', 'Make', 'Zapier', 'Tray', 'Boomi', 'Workato', 'Celigo'],
  });
});

app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/runs', runsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

initDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`FlowShift API running on port ${config.port}`);
      console.log(`Drive integration: ${config.driveEnabled ? 'enabled' : 'disabled'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
