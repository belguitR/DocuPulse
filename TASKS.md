# Tasks

Status legend:
- `[ ]` not started
- `[-]` in progress
- `[x]` done

## Foundation

- [x] Confirm project theme from the presentation deck
- [x] Choose technical approach and architecture
- [x] Create business, spec, architecture, and delivery docs
- [x] Create root workspace configuration

## Search Stack

- [x] Add Docker Compose for Meilisearch
- [x] Configure backend Meilisearch client
- [x] Create the `documents` index
- [x] Configure searchable/displayed fields

## Backend

- [x] Scaffold Express + TypeScript backend
- [x] Add health endpoint
- [x] Add PDF/DOCX upload endpoint
- [x] Extract text from uploaded PDF/DOCX files
- [x] Store original uploaded files locally
- [x] Map extracted content into the document schema
- [x] Send documents to Meilisearch
- [x] Add search endpoint
- [x] Add original file preview endpoints

## Frontend

- [x] Scaffold React + Vite + TypeScript frontend
- [x] Build main dashboard layout
- [x] Add PDF/DOCX upload form
- [x] Add indexing feedback states
- [x] Add search form
- [x] Add result list with metadata and snippets
- [x] Add original-file reader preview
- [x] Add health/status indicator

## Verification

- [x] Run backend build
- [x] Run frontend build
- [x] Start Meilisearch locally
- [x] Smoke test end-to-end indexing and search
- [ ] Capture screenshots for presentation
