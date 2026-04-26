# NEXUSvault

A self-hosted project & document management platform with versioning, private project access control, and a per-project **Head** model (no global admin).

## Highlights

- **No global admin.** Whoever uploads a private project becomes its **Head** and fully controls it.
- **Head powers** (private projects):
  - Approve / reject join requests with a per-member role (Viewer / Editor)
  - Change member roles after the fact
  - **Block / unblock** individual members
  - Remove members
  - **Delete any version** of the project
  - **Permanently delete** the entire project
  - Regenerate the 6-digit access code
- **Public projects:** anyone in the workspace can browse & comment.
- **Versioning:** semantic version bumps (minor / major), in-browser diff between any two text versions.
- **Project trees:** upload a `.zip` and browse the file tree with content preview.
- **Stars**, **comments**, **member messages on join requests**, **rich profiles** (title, location, website, skills, avatar color), **public profile pages with project showcase**, and a **People** directory.

## Quick Start

```bash
# Backend
cd backend
npm install
cp .env .env.local   # adjust if needed
npm run seed         # seeds 3 demo users + 1 public + 1 private project
npm run dev          # http://localhost:5000

# Frontend
cd frontend
# Open index.html in your browser, or serve it:
npx serve .          # http://localhost:3000
```

## Demo Accounts (after `npm run seed`)

| Email                    | Password    | Notes                                       |
|--------------------------|-------------|---------------------------------------------|
| aarav@nexusvault.io      | password123 | Owns the public API doc                     |
| rahul@nexusvault.io      | password123 | **Head** of the seeded private project      |
| priya@nexusvault.io      | password123 | Designer — try requesting access            |

The private project's 6-digit access code is printed in the seed output.

## Architecture

- **Backend:** Node.js + Express + MongoDB (Mongoose). JWT auth. Multer uploads. AdmZip for project trees. `diff` for version comparison.
- **Frontend:** Single-file vanilla HTML/CSS/JS (`frontend/index.html`) — no build step.

## API Overview

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
PUT    /api/auth/profile
PUT    /api/auth/password
GET    /api/auth/users
GET    /api/auth/users/:id      (public profile + project stats)

GET    /api/documents                  list accessible
POST   /api/documents                  create (you become Head if private)
GET    /api/documents/:id
PUT    /api/documents/:id              edit metadata (editor+ / head)
DELETE /api/documents/:id              hard delete (head only)
POST   /api/documents/:id/star         toggle star
POST   /api/documents/:id/access       verify code & request access
POST   /api/documents/:id/access-code  regenerate code (head)
GET    /api/documents/:id/requests     pending requests (head)
PUT    /api/documents/:id/requests/:reqId       approve/reject (head)
PUT    /api/documents/:id/members/:mId/role     change role (head)
PUT    /api/documents/:id/members/:mId/block    block/unblock (head)
DELETE /api/documents/:id/members/:mId          remove member (head)
GET    /api/documents/:id/versions
POST   /api/documents/:id/versions              new version (editor+ / head)
DELETE /api/documents/:id/versions/:ver         delete version (head)
GET    /api/documents/:id/diff?v1=&v2=
GET    /api/documents/:id/versions/:ver/download
GET    /api/documents/:id/versions/:ver/preview
POST   /api/documents/:id/versions/:ver/comments
DELETE /api/documents/:id/versions/:ver/comments/:cid
```

## Notes

- Max upload size: 50 MB (set `MAX_FILE_SIZE` in `.env` to override).
- `.zip` uploads are auto-extracted into a browsable tree. Other binary files are stored & served as-is.
