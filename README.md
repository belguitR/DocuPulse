# Full-Text Document Indexing POC

This project is a proof of concept for `indexation et recherche plein texte` on PDF and DOCX documents.

It lets a user:
- upload PDF or DOCX files
- extract their text
- index that text in Meilisearch
- search across indexed content
- view matching results with metadata, snippets, extracted text, and original-file previews

## What You Need Before Starting

This README assumes:
- you are on Windows
- you are using PowerShell
- you will run commands manually in the terminal

You must have these installed:

1. `Node.js` version 22 or newer
2. `npm` (comes with Node.js)
3. `Docker Desktop`

To check that they are installed, open PowerShell and run:

```powershell
node -v
npm -v
docker --version
```

If one of these commands fails, install that tool first before continuing.

## Project Stack

- `frontend`: React + Vite + TypeScript
- `backend`: Node.js + Express + TypeScript
- `search engine`: Meilisearch
- `PDF text extraction`: `pdf-parse`
- `DOCX text extraction`: `mammoth`
- `local file storage`: `backend/uploads`
- `local search runtime`: Docker

## Project Structure

```text
.
|-- frontend/
|-- backend/
|-- docker-compose.yml
|-- README.md
|-- BUSINESS.md
|-- SPEC.md
|-- ARCHITECTURE.md
|-- AGENTS.md
`-- TASKS.md
```

## First-Time Setup

### 1. Open PowerShell in the project folder

Run:

```powershell
cd "C:\Users\errmi\Documents\ernestoProject"
```

### 2. Install all Node dependencies

Run:

```powershell
npm install
```

Wait until the installation finishes.

### 3. Create the backend environment file

Run:

```powershell
Copy-Item "backend\.env.example" "backend\.env"
```

### 4. Create the frontend environment file

Run:

```powershell
Copy-Item "frontend\.env.example" "frontend\.env"
```

### 5. Start Docker Desktop

Open Docker Desktop normally from Windows and wait until it says it is running.

Do not skip this step. Meilisearch will not start if Docker Desktop is closed.

### 6. Start Meilisearch

Back in PowerShell, run:

```powershell
docker compose up -d
```

### 7. Check that Meilisearch started correctly

Run:

```powershell
docker compose ps
```

You should see a container for Meilisearch in a running state.

## Launch the App Locally

You need **3 PowerShell windows** open in the same project folder.

In each PowerShell window, first run:

```powershell
cd "C:\Users\errmi\Documents\ernestoProject"
```

### Terminal 1: backend

Run:

```powershell
npm run dev:backend
```

Expected result:
- backend starts on `http://127.0.0.1:3001`

### Terminal 2: frontend

Run:

```powershell
npm run dev:frontend
```

Expected result:
- frontend starts on `http://127.0.0.1:5173`

### Terminal 3: optional status check

If you want to confirm Meilisearch is still running, run:

```powershell
docker compose ps
```

## Open the App

Open this URL in your browser:

```text
http://127.0.0.1:5173
```

Backend API URL:

```text
http://127.0.0.1:3001
```

Meilisearch URL:

```text
http://127.0.0.1:7700
```

## Exact Demo Flow

1. Open `http://127.0.0.1:5173`
2. Go to `Ingestion`
3. Select one or more PDF/DOCX files
4. Click `Index selected files`
5. Wait for the success message
6. Go to `Knowledge Search`
7. Type words that exist inside the uploaded document
8. Click `Search`
9. Click a result to open the original file preview in the site
10. Switch to `Extracted text` when you want highlighted search context

## How Document Import Works Right Now

Current behavior:

- PDF/DOCX files are uploaded to the backend
- the backend reads them in memory
- text is extracted from the files
- the original file is saved locally in `backend/uploads`
- extracted text and metadata are sent to Meilisearch
- the frontend can show the original preview through backend file routes

Indexed fields are:

- `id`
- `title`
- `fileName`
- `content`
- `tags`
- `uploadedAt`
- `documentType`
- `source`
- `mimeType`
- `originalFileUrl`
- `previewFileUrl`

## Useful Commands

### Rebuild the frontend

```powershell
npm run build --prefix frontend
```

### Rebuild the backend

```powershell
npm run build --prefix backend
```

### Run frontend lint

```powershell
npm run lint --prefix frontend
```

### Stop Meilisearch

```powershell
docker compose down
```

## Troubleshooting

### Problem: the UI says `System degraded`

Cause:
- Docker Desktop is probably not running
- or Meilisearch was not started

Fix:

```powershell
docker compose up -d
docker compose ps
```

### Problem: `docker compose up -d` fails

Cause:
- Docker Desktop is not open

Fix:
- open Docker Desktop
- wait until it is fully started
- run the command again

### Problem: frontend page does not open

Cause:
- frontend dev server is not running

Fix:

```powershell
npm run dev:frontend
```

### Problem: indexing fails

Possible causes:
- Meilisearch is not running
- backend is not running
- the file is not a valid PDF or DOCX
- the document has no extractable text

Check:

```powershell
docker compose ps
```

and make sure both of these are running:
- backend terminal
- frontend terminal

## Scope

Included:
- PDF/DOCX ingestion
- text extraction
- local original-file storage
- original-file preview for PDFs and DOCX files
- Meilisearch indexing
- keyword search
- metadata display
- result snippets

Not included:
- OCR for scanned PDFs
- authentication
- user roles
- long-term file storage
- semantic/vector search
- production deployment hardening

## Presentation Guidance

For the oral presentation, show:
- the business problem
- the architecture
- the ingestion flow
- the full-text search experience
- the current limits of the POC
