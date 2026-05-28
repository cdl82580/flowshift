import { google } from 'googleapis';
import { Readable } from 'stream';
import { config } from '../config';
import { getDb } from '../db';

async function getDriveClient() {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT value FROM settings WHERE key = 'drive_refresh_token'",
    args: [],
  });

  if (!result.rows.length) {
    throw new Error('Drive not authorized. Visit /auth/google to authorize.');
  }

  const refreshToken = result.rows[0].value as string;
  const auth = new google.auth.OAuth2(
    config.googleOauthClientId,
    config.googleOauthClientSecret,
    `${config.appUrl}/auth/google/callback`
  );
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}

export async function getOrCreateUserFolder(
  userEmail: string,
  existingFolderId: string | null
): Promise<{ folderId: string; folderUrl: string }> {
  if (existingFolderId) {
    return {
      folderId: existingFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${existingFolderId}`,
    };
  }

  const drive = await getDriveClient();

  const folder = await drive.files.create({
    requestBody: {
      name: userEmail,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [config.gdriveParentFolderId],
    },
    fields: 'id',
  });

  const folderId = folder.data.id!;

  await drive.permissions.create({
    fileId: folderId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    folderId,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
  };
}

export async function createRunFolder(
  userFolderId: string,
  runId: string
): Promise<{ folderId: string; folderUrl: string }> {
  const drive = await getDriveClient();

  const folder = await drive.files.create({
    requestBody: {
      name: `run_${runId}`,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [userFolderId],
    },
    fields: 'id',
  });

  const folderId = folder.data.id!;

  await drive.permissions.create({
    fileId: folderId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    folderId,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
  };
}

export async function uploadFile(
  folderId: string,
  fileName: string,
  content: string,
  mimeType = 'text/plain'
): Promise<string> {
  const drive = await getDriveClient();

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from([content]),
    },
    fields: 'id',
  });

  return file.data.id!;
}
