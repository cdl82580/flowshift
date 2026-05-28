import { createClient, Client } from '@libsql/client';
import { config } from './config';

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;
  _client = createClient({ url: `file:${config.databasePath}` });
  return _client;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id                TEXT PRIMARY KEY,
      email             TEXT UNIQUE NOT NULL,
      name              TEXT,
      api_key           TEXT UNIQUE NOT NULL,
      gdrive_folder_id  TEXT,
      gdrive_folder_url TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      id                    TEXT PRIMARY KEY,
      user_id               TEXT NOT NULL REFERENCES users(id),
      source                TEXT,
      destination           TEXT NOT NULL,
      description           TEXT,
      original_filename     TEXT,
      status                TEXT NOT NULL DEFAULT 'pending',
      playbook_text         TEXT,
      import_file_content   TEXT,
      import_file_name      TEXT,
      import_file_extension TEXT,
      gdrive_run_folder_id  TEXT,
      gdrive_run_folder_url TEXT,
      error_message         TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS recovery_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
  `);

  await migrate(db);
}

// ── migrations ────────────────────────────────────────────────────────────────

async function migrate(db: Client): Promise<void> {
  // M1: make runs.source nullable (was TEXT NOT NULL on initial schema)
  const info = await db.execute({ sql: 'PRAGMA table_info(runs)', args: [] });
  const sourceCol = info.rows.find(r => (r as Record<string, unknown>).name === 'source');
  if (sourceCol && Number((sourceCol as Record<string, unknown>).notnull) === 1) {
    console.log('[db] migrating runs.source → nullable');
    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS runs_v2 (
        id                    TEXT PRIMARY KEY,
        user_id               TEXT NOT NULL REFERENCES users(id),
        source                TEXT,
        destination           TEXT NOT NULL,
        description           TEXT,
        original_filename     TEXT,
        status                TEXT NOT NULL DEFAULT 'pending',
        playbook_text         TEXT,
        import_file_content   TEXT,
        import_file_name      TEXT,
        import_file_extension TEXT,
        gdrive_run_folder_id  TEXT,
        gdrive_run_folder_url TEXT,
        error_message         TEXT,
        created_at            TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at          TEXT
      )`,
      args: [],
    });
    await db.execute({ sql: 'INSERT INTO runs_v2 SELECT * FROM runs', args: [] });
    await db.execute({ sql: 'DROP TABLE runs', args: [] });
    await db.execute({ sql: 'ALTER TABLE runs_v2 RENAME TO runs', args: [] });
    await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id)', args: [] });
    console.log('[db] migration M1 complete');
  }
}
