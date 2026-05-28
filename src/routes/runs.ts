import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { requireApiKey, AuthedRequest } from '../auth';
import { generateMigrationPlaybook, VALID_PLATFORMS } from '../services/claude';
import { getOrCreateUserFolder, createRunFolder, uploadFile } from '../services/drive';
import { config } from '../config';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', requireApiKey, upload.single('file'), async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  const { source, destination, description } = req.body as Record<string, string>;
  const file = req.file;

  if (!source || !destination) {
    return res.status(400).json({ error: 'source and destination are required' });
  }
  if (!(VALID_PLATFORMS as readonly string[]).includes(source)) {
    return res.status(400).json({ error: `Invalid source. Valid platforms: ${VALID_PLATFORMS.join(', ')}` });
  }
  if (!(VALID_PLATFORMS as readonly string[]).includes(destination)) {
    return res.status(400).json({ error: `Invalid destination. Valid platforms: ${VALID_PLATFORMS.join(', ')}` });
  }
  if (source === destination) {
    return res.status(400).json({ error: 'source and destination cannot be the same' });
  }
  if (!file && !description?.trim()) {
    return res.status(400).json({ error: 'Provide a file upload or a description (or both)' });
  }

  const runId = uuidv4();
  const db = getDb();

  const fileContent = file ? file.buffer.toString('utf-8') : undefined;
  const fileName = file ? file.originalname : undefined;

  await db.execute({
    sql: `INSERT INTO runs (id, user_id, source, destination, description, original_filename, status)
          VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
    args: [runId, user.id, source, destination, description?.trim() ?? null, fileName ?? null],
  });

  try {
    const result = await generateMigrationPlaybook({ source, destination, description, fileContent, fileName });

    let runFolderUrl: string | null = null;
    let runFolderId: string | null = null;

    if (config.driveEnabled) {
      const { folderId: userFolderId, folderUrl: userFolderUrl } = await getOrCreateUserFolder(
        user.email,
        user.gdrive_folder_id
      );

      if (!user.gdrive_folder_id) {
        await db.execute({
          sql: 'UPDATE users SET gdrive_folder_id = ?, gdrive_folder_url = ? WHERE id = ?',
          args: [userFolderId, userFolderUrl, user.id],
        });
      }

      const runFolder = await createRunFolder(userFolderId, runId);
      runFolderId = runFolder.folderId;
      runFolderUrl = runFolder.folderUrl;

      await uploadFile(runFolderId, 'playbook.md', result.playbookText, 'text/markdown');

      if (result.importFileContent && result.importFileName) {
        const mime = result.importFileExtension === 'json' ? 'application/json' : 'text/plain';
        await uploadFile(runFolderId, result.importFileName, result.importFileContent, mime);
      }
    }

    await db.execute({
      sql: `UPDATE runs SET
              status = 'completed',
              playbook_text = ?,
              import_file_content = ?,
              import_file_name = ?,
              import_file_extension = ?,
              gdrive_run_folder_id = ?,
              gdrive_run_folder_url = ?,
              completed_at = datetime('now')
            WHERE id = ?`,
      args: [
        result.playbookText,
        result.importFileContent,
        result.importFileName,
        result.importFileExtension,
        runFolderId,
        runFolderUrl,
        runId,
      ],
    });

    const runResult = await db.execute({ sql: 'SELECT * FROM runs WHERE id = ?', args: [runId] });
    return res.status(201).json(formatRun(runResult.rows[0] as Record<string, unknown>));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.execute({
      sql: `UPDATE runs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`,
      args: [msg, runId],
    });
    console.error(`Run ${runId} failed:`, err);
    return res.status(500).json({ error: 'Processing failed', details: msg });
  }
});

router.get('/:id', requireApiKey, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM runs WHERE id = ? AND user_id = ?',
    args: [req.params.id, user.id],
  });
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Run not found' });
  }
  return res.json(formatRun(result.rows[0] as Record<string, unknown>));
});

function formatRun(run: Record<string, unknown>) {
  return {
    id: run.id,
    user_id: run.user_id,
    source: run.source,
    destination: run.destination,
    description: run.description,
    original_filename: run.original_filename,
    status: run.status,
    playbook_text: run.playbook_text,
    import_file_name: run.import_file_name,
    import_file_extension: run.import_file_extension,
    import_file_content: run.import_file_content,
    has_import_file: !!run.import_file_content,
    gdrive_run_folder_url: run.gdrive_run_folder_url,
    error_message: run.error_message,
    created_at: run.created_at,
    completed_at: run.completed_at,
  };
}

export default router;
