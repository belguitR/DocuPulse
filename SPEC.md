# Functional Specification

## Functional Requirements

### FR-1 Upload PDFs

The user can upload one or more PDF files from the browser.

### FR-2 Extract Text

The system extracts textual content from uploaded PDFs.

### FR-3 Index Documents

The system creates or updates searchable document records in Meilisearch.

### FR-4 Search Full Text

The user can enter keywords and retrieve matching documents based on indexed PDF content.

### FR-5 Display Results

Each result displays:
- title
- file name
- document type
- source
- upload date
- content snippet

### FR-6 Show Indexing Feedback

The interface shows whether indexing succeeded or failed.

### FR-7 Basic Health Visibility

The frontend can detect whether the backend is reachable and whether the search stack is available.

## Data Model

Each indexed document contains:

- `id`
- `title`
- `fileName`
- `content`
- `tags`
- `uploadedAt`
- `documentType`
- `source`

## Non-Functional Requirements

### NFR-1 Simplicity

The solution must be small enough to build and explain in a short academic POC.

### NFR-2 Cost

The solution must rely on free or open-source tools.

### NFR-3 Usability

The interface must be understandable without technical training.

### NFR-4 Demo Readiness

The system must run locally with a short setup path.

### NFR-5 Performance

Search requests should feel near real-time for a small demo dataset.

### NFR-6 Maintainability

The codebase must be organized clearly enough for quick iteration.

## Assumptions

- input files are valid PDFs
- most PDFs contain extractable text
- scanned PDFs without embedded text are out of scope
- local Docker is available for Meilisearch

## Exclusions

- OCR
- authentication and authorization
- advanced analytics
- collaborative workflows
- enterprise document lifecycle management
