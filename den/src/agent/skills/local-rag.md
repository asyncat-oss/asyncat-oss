---
name: local-rag
description: Build and query offline local retrieval indexes for codebases, docs folders, notes, and project knowledge
brain_region: hippocampus
weight: 1.0
tags: [rag, retrieval, embeddings, docs, codebase, offline, local]
when_to_use: |
  Use when the user wants to ingest, index, search, query, or answer from a
  local codebase/docs folder without cloud services.
---
# Local RAG

## Workflow

1. Build an index with `local_rag_index` for the requested folder.
2. Search it with `local_rag_search` before answering detailed questions about that folder.
3. Cite the returned file paths and excerpts in the answer.
4. Re-index after major file changes.

## Notes

- This first pipeline is fully offline and file-backed under `.asyncat/rag`.
- It uses local hashed lexical vectors, so it works without a network or embedding model.
- If a future local embeddings endpoint is added, this skill can keep the same workflow and upgrade the indexer internally.
