import path from 'path';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'flowshift.db'),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-4-7',
  maxTokens: parseInt(process.env.MAX_TOKENS || '8192', 10),

  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  googleServiceAccountKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  gdriveParentFolderId: process.env.GDRIVE_PARENT_FOLDER_ID || '11BCUCoM3a0di8tYiz-r9EOuQ7AZlt7FU',

  driveEnabled: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
};
