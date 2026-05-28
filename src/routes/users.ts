import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { requireApiKey, AuthedRequest, rowToUser } from '../auth';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { email, name } = req.body as { email?: string; name?: string };

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [normalizedEmail],
  });
  if (existing.rows.length) {
    return res.status(409).json({ error: 'A user with that email already exists' });
  }

  const id = uuidv4();
  const apiKey = uuidv4();

  await db.execute({
    sql: 'INSERT INTO users (id, email, name, api_key) VALUES (?, ?, ?, ?)',
    args: [id, normalizedEmail, name?.trim() ?? null, apiKey],
  });

  return res.status(201).json({ id, email: normalizedEmail, name: name?.trim() ?? null, api_key: apiKey });
});

router.get('/:id', requireApiKey, (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  if (user.id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { api_key, ...safe } = user;
  return res.json(safe);
});

router.get('/:id/runs', requireApiKey, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  if (user.id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, source, destination, status, original_filename,
                 gdrive_run_folder_url, error_message, created_at, completed_at
          FROM runs WHERE user_id = ? ORDER BY created_at DESC`,
    args: [req.params.id],
  });

  return res.json({ runs: result.rows });
});

export default router;
