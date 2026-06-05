# Architecture

## Overview

The POC uses a thin three-part architecture:

1. React frontend
2. Node/Express backend
3. Meilisearch search engine

## Components

### Frontend

Responsibilities:
- upload PDF files
- trigger indexing requests
- submit search queries
- display results and status

Recommended implementation:
- React
- Vite
- TypeScript
- clean dashboard-style interface

### Backend

Responsibilities:
- receive uploaded PDF files
- extract text content
- map files into the document schema
- send documents to Meilisearch
- expose search endpoints for the frontend

Recommended implementation:
- Node.js
- Express
- Multer for uploads
- `pdf-parse` for text extraction

### Meilisearch

Responsibilities:
- store searchable document records
- perform keyword-based full-text search
- return ranked matches

## Data Flow

### Indexing Flow

1. User uploads PDF from the frontend.
2. Frontend sends file to the backend.
3. Backend extracts text from the PDF.
4. Backend creates a document object with metadata and content.
5. Backend sends the document to Meilisearch.
6. Backend returns indexing status to the frontend.

### Search Flow

1. User enters a query in the frontend.
2. Frontend calls the backend search endpoint.
3. Backend queries Meilisearch.
4. Backend returns matched documents.
5. Frontend renders results and snippets.

## Why This Architecture

- keeps API keys out of the browser
- keeps document parsing out of the browser
- stays small enough for a POC
- looks more professional than a pure frontend hack

## Deployment Model

Local development:
- frontend on `5173`
- backend on `3001`
- Meilisearch on `7700`

## Risks

- scanned PDFs may produce poor results without OCR
- very large PDFs may need extra processing constraints
- poor metadata quality can reduce result usefulness

## Future Extensions

- OCR pipeline
- authentication
- saved searches
- filters and facets
- highlighting improvements
- semantic or hybrid search
