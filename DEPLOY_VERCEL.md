# NEXUSvault — Vercel Deployment Guide

This project is **ready to deploy to Vercel** as-is. Just upload, set env vars, deploy.

---

## 1. Project structure

```
nexusvault-vercel/
├── api/
│   └── index.js            ← Vercel serverless entry (wraps Express)
├── backend/                ← Express app, routes, models
│   ├── server.js
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   └── seed.js
├── frontend/
│   └── index.html          ← Single-file static frontend
├── package.json            ← All deps live here (Vercel installs from root)
├── vercel.json             ← Routing + function config
├── .env.example            ← Copy values into Vercel dashboard
└── .vercelignore
```

## 2. Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables**:

| Name | Example / notes |
|------|-----------------|
| `MONGO_URI` | `mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net/nexusvault` (MongoDB Atlas) |
| `JWT_SECRET` | Long random string (e.g. `openssl rand -hex 48`) |
| `JWT_EXPIRE` | `7d` (optional, default `7d`) |
| `CLOUDINARY_CLOUD_NAME` | from cloudinary.com console |
| `CLOUDINARY_API_KEY` | from cloudinary.com console |
| `CLOUDINARY_API_SECRET` | from cloudinary.com console |
| `MAX_FILE_SIZE` | `52428800` (50 MB, optional) |

> ⚠️ MongoDB Atlas: in **Network Access** add `0.0.0.0/0` (allow all) so Vercel functions can connect.

## 3. Deploy steps

### Option A — Vercel Dashboard (easiest)

1. Go to <https://vercel.com/new>
2. Import this folder (drag-and-drop the zip after extracting, or push to GitHub and import).
3. Framework preset: **Other** (auto-detected).
4. Build command: leave default (none needed).
5. Output directory: `frontend` (already configured in `vercel.json`).
6. Add the env vars from section 2.
7. Click **Deploy**.

### Option B — Vercel CLI

```bash
npm i -g vercel
cd nexusvault-vercel
vercel              # first time → links project
vercel --prod       # production deploy
```

## 4. After deploy

- Frontend: `https://your-project.vercel.app/`
- API health check: `https://your-project.vercel.app/api/health` → `{ "success": true, "message": "NEXUSvault API running" }`
- All `/api/*` traffic is routed to the serverless Express function.

## 5. Local development

```bash
npm install
cp .env.example backend/.env   # fill in values
npm run dev                    # starts Express on http://localhost:5000
```

Open <http://localhost:5000>.

## 6. Optional — seed sample data

```bash
npm run seed
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `MongoServerSelectionError` | Whitelist `0.0.0.0/0` in MongoDB Atlas Network Access. |
| `401 Invalid or expired token` | `JWT_SECRET` must be the same value used when the token was issued. Re-login after changing it. |
| Uploads failing | Verify all 3 `CLOUDINARY_*` vars are set in Vercel. |
| `Function exceeded 60s` | Large file uploads — increase `maxDuration` in `vercel.json` (Pro plan required >60s). |
| Frontend loads but API 404 | Confirm `vercel.json` is at the project root and was deployed (check Vercel build logs). |
