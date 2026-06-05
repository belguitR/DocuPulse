# Delivery Roles

This file defines implementation roles and the execution workflow for the POC.

## Product Role

Focus:
- define business objective
- validate POC scope
- decide which features are mandatory for the demo

Main outputs:
- problem statement
- demo scenario
- acceptance criteria

## Frontend Role

Focus:
- upload workflow
- search interface
- results presentation
- UX polish for demo use

Main outputs:
- React pages and components
- forms, states, feedback, and layout

## Backend Role

Focus:
- upload API
- PDF parsing
- indexing orchestration
- search API

Main outputs:
- Express routes
- Meilisearch integration
- validation and error handling

## Search Role

Focus:
- index configuration
- searchable fields
- ranking behavior
- snippet strategy

Main outputs:
- Meilisearch index settings
- search tuning decisions

## QA Role

Focus:
- verify end-to-end indexing
- verify search relevance on sample PDFs
- verify local setup and demo readiness

Main outputs:
- test checklist
- smoke test results

## Working Sequence

1. Finalize scope and architecture.
2. Scaffold frontend and backend.
3. Start Meilisearch and connect the backend.
4. Implement PDF upload and extraction.
5. Implement indexing.
6. Implement search UI.
7. Test with sample PDFs.
8. Prepare screenshots and demo script.

## Definition of Done

The POC is done when:
- a PDF can be uploaded
- text is indexed in Meilisearch
- a query returns matching documents
- the interface is usable in a live presentation
