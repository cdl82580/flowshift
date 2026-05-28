# FlowShift

AI-powered iPaaS migration playbook generator. Describe a workflow in one platform, get a full migration playbook and a ready-to-import workflow file for another — powered by Claude.

**Live:** https://flowshift-cdl.fly.dev

---

## What it does

Submit a source workflow (file upload or plain-text description) and a source/destination platform pair. FlowShift calls Claude to produce:

1. **A migration playbook** — step-by-step breakdown, node mapping, credential setup guide, and gotchas
2. **An import file** — a functional, ready-to-import JSON (n8n workflow, Make blueprint, etc.) with `{{PLACEHOLDER}}` tokens for API keys
3. **A Google Drive folder** — both files uploaded automatically under a per-user, per-run subfolder, shared publicly via link

**Supported platforms:** n8n · Make · Zapier · Tray · Boomi · Workato · Celigo

---

## Stack

| Layer | Tech |
|---|---|
| API | Node.js · TypeScript · Express |
| Database | SQLite via `@libsql/client` (persisted on Fly.io volume) |
| AI | Anthropic Claude (`claude-opus-4-7`) |
| Storage | Google Drive API v3 (OAuth2) |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| Deploy | Fly.io · Docker (multi-stage) |

---

## API

All data endpoints are prefixed `/api`. Authentication uses an `X-API-Key` header.

### Users

```
POST /api/users
Content-Type: application/json
```
Register a new user. Returns an `api_key` — **shown once, save it**.

```json
{ "email": "you@example.com", "name": "Your Name" }
```

---

```
GET /api/users/me
X-API-Key: <key>
```
Identify the current user by API key. Used by the sign-in flow.

---

```
GET /api/users/:id
X-API-Key: <key>
```
Get user profile (includes GDrive folder URL once a run has been submitted).

---

```
GET /api/users/:id/runs
X-API-Key: <key>
```
List all runs for a user, newest first.

---

### Runs

```
POST /api/runs
X-API-Key: <key>
Content-Type: application/json
```

| Field | Type | Required |
|---|---|---|
| `source` | string | ✓ |
| `destination` | string | ✓ |
| `description` | string | one of these two |
| `fileContent` | string (file text) | one of these two |
| `fileName` | string | with `fileContent` |

**Async** — returns `202 Accepted` immediately with `status: "pending"`. Processing (Claude + Drive upload) happens in the background. Poll `GET /api/runs/:id` until `status` is `"completed"` or `"failed"`.

> **Note on file uploads:** The frontend reads the file as text client-side and sends it as a JSON string in `fileContent`. Chrome on macOS may block programmatic file reading (`NotReadableError`) for files with special characters in their name. The UI provides a paste fallback for this case.

---

```
GET /api/runs/:id
X-API-Key: <key>
```
Full run detail: `status`, `playbook_text`, `import_file_content`, `import_file_name`, `gdrive_run_folder_url`.

---

### OAuth (Google Drive setup)

```
GET /auth/google            → redirects to Google consent screen
GET /auth/google/callback   → exchanges code, stores refresh token in DB
```

Visit `/auth/google` once to authorize Drive access. The refresh token is stored in the database; all subsequent runs use it automatically.

---

### Health

```
GET /health   → { "status": "ok", "service": "flowshift-api", "timestamp": "..." }
```

---

## Google Drive output structure

```
Parent folder (your GDrive, authorized via OAuth)
└── you@example.com/          ← user folder, anyone-with-link can view
    └── run_<uuid>/           ← per-run folder, anyone-with-link can view
        ├── playbook.md
        └── flowshift_<src>_to_<dst>.json
```

---

## Frontend

The React SPA is built by Vite and served as static files from the same Express process. Routes:

| Page | Path |
|---|---|
| Auth (register / sign in) | `/auth` |
| Dashboard | `/` |
| New Migration | `/runs/new` |
| Run Detail | `/runs/:id` |

The run detail page polls `GET /api/runs/:id` every 3 seconds while status is `pending` or `processing`, then renders the playbook as markdown and the import file in a syntax-highlighted code viewer with copy and download buttons.

---

## Local development

```bash
git clone https://github.com/cdl82580/flowshift
cd flowshift

# Install API deps
npm install

# Install frontend deps
cd frontend && npm install && cd ..

# Copy and fill in env vars
cp .env.example .env

# Run API (port 8080)
npm run dev

# Run frontend dev server (port 5173, proxies /api and /auth to :8080)
cd frontend && npm run dev
```

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_OAUTH_CLIENT_ID` | GCP OAuth 2.0 client ID (Web application) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | GCP OAuth 2.0 client secret |
| `GDRIVE_PARENT_FOLDER_ID` | Parent GDrive folder ID (default: project folder) |
| `APP_URL` | Public base URL — used to build the OAuth callback URI |
| `PORT` | Server port (default: `8080`) |
| `DATABASE_PATH` | SQLite file path (default: `./flowshift.db`) |

---

## Google Drive setup

1. **GCP project** — enable the Drive API
2. **OAuth 2.0 Client ID** — type: Web application, redirect URI: `https://<your-host>/auth/google/callback`
3. **Test users** — add your Google account email (required until the app is verified by Google)
4. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` as secrets
5. Visit `https://<your-host>/auth/google` and authorize — refresh token is stored automatically

---

## Deployment (Fly.io)

```bash
# First-time setup
fly apps create flowshift-cdl
fly volumes create flowshift_data --region iad --size 1 --app flowshift-cdl

# Secrets
fly secrets set \
  ANTHROPIC_API_KEY="sk-ant-..." \
  GOOGLE_OAUTH_CLIENT_ID="..." \
  GOOGLE_OAUTH_CLIENT_SECRET="..." \
  --app flowshift-cdl

# Deploy
fly deploy --app flowshift-cdl

# Authorize Drive (one-time, after first deploy)
# Visit: https://flowshift-cdl.fly.dev/auth/google
```

The Dockerfile runs a multi-stage build: frontend (Vite) → API (tsc) → slim runtime image. SQLite lives on the mounted `/data` volume. The machine runs continuously (`auto_stop_machines = false`) so background run processing is never interrupted; a health check at `/health` runs every 15 seconds.
