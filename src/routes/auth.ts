import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { config } from '../config';
import { getDb } from '../db';

const router = Router();

function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.googleOauthClientId,
    config.googleOauthClientSecret,
    `${config.appUrl}/auth/google/callback`
  );
}

// GET /auth/google — redirect to Google consent screen
router.get('/google', (_req: Request, res: Response) => {
  if (!config.googleOauthClientId || !config.googleOauthClientSecret) {
    return res.status(503).json({
      error: 'OAuth not configured',
      hint: 'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET as Fly.io secrets',
    });
  }

  const url = getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent',
  });

  return res.redirect(url);
});

// GET /auth/google/callback — exchange code, store refresh token
router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    const { tokens } = await getOAuth2Client().getToken(code);

    if (!tokens.refresh_token) {
      return res.status(400).json({
        error: 'No refresh token returned',
        hint: 'Revoke app access at https://myaccount.google.com/permissions and try again',
      });
    }

    const db = getDb();
    await db.execute({
      sql: `INSERT OR REPLACE INTO settings (key, value, updated_at)
            VALUES ('drive_refresh_token', ?, datetime('now'))`,
      args: [tokens.refresh_token],
    });

    return res.send(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:500px;margin:auto">
        <h2>✅ Google Drive authorized</h2>
        <p>FlowShift can now write playbooks to your Google Drive.</p>
        <p>You can close this tab.</p>
      </body></html>
    `);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('OAuth callback error:', err);
    return res.status(500).json({ error: 'Token exchange failed', details: msg });
  }
});

export default router;
