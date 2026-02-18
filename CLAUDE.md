# @stravigor/search

Full-text search with a unified API across multiple engines. Built-in drivers for Meilisearch, Typesense, and Algolia. The searchable() mixin integrates search directly into ORM models.

## Dependencies
- @stravigor/kernel (peer)
- @stravigor/database (peer)
- @stravigor/cli (peer)

## Commands
- bun test
- bun run build

## Architecture
- src/search_manager.ts — main manager class
- src/search_provider.ts — service provider registration
- src/search_engine.ts — engine abstraction
- src/searchable.ts — ORM mixin for model indexing
- src/drivers/ — engine implementations (Meilisearch, Typesense, Algolia)
- src/commands/ — CLI commands (index, flush, etc.)
- src/types.ts — type definitions
- src/errors.ts — package-specific errors

## Conventions
- Drivers implement the search engine interface in search_engine.ts
- Use searchable() mixin on ORM models — don't call drivers directly
- Index operations go through CLI commands for bulk operations
