import { Request, Response, NextFunction } from 'express';
import { getDb } from './db';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  api_key: string;
  gdrive_folder_id: string | null;
  gdrive_folder_url: string | null;
  created_at: string;
}

export interface AuthedRequest extends Request {
  user: UserRow;
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = (req.headers['x-api-key'] as string) || '';
  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  const db = getDb();
  db.execute({ sql: 'SELECT * FROM users WHERE api_key = ?', args: [apiKey] })
    .then((result) => {
      if (!result.rows.length) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
      (req as AuthedRequest).user = rowToUser(result.rows[0] as Record<string, unknown>);
      next();
    })
    .catch((err) => {
      console.error('Auth error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
}

export function rowToUser(row: Record<string, unknown>): UserRow {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    api_key: row.api_key as string,
    gdrive_folder_id: (row.gdrive_folder_id as string | null) ?? null,
    gdrive_folder_url: (row.gdrive_folder_url as string | null) ?? null,
    created_at: row.created_at as string,
  };
}
