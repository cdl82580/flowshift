import { google } from 'googleapis';
import { Readable } from 'stream';
import { config } from '../config';

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.googleServiceAccountEmail,
      private_key: config.googleServiceAccountKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
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

  const drive = getDrive();

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
  const drive = getDrive();

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
  const drive = getDrive();

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
