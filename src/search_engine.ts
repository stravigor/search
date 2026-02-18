import type { SearchDocument, SearchOptions, SearchResult, IndexSettings } from './types.ts'

/**
 * Contract that every search engine driver must implement.
 *
 * Drivers communicate with an external search service (Meilisearch,
 * Typesense, Algolia, etc.) via their REST API.
 */
export interface SearchEngine {
  /** Driver name (e.g. 'meilisearch', 'typesense', 'algolia'). */
  readonly name: string

  /** Add or update a single document. */
  upsert(index: string, id: string | number, document: Record<string, unknown>): Promise<void>

  /** Add or update multiple documents at once. */
  upsertMany(index: string, documents: SearchDocument[]): Promise<void>

  /** Remove a single document by ID. */
  delete(index: string, id: string | number): Promise<void>

  /** Remove multiple documents by ID. */
  deleteMany(index: string, ids: Array<string | number>): Promise<void>

  /** Remove all documents from an index (keep the index itself). */
  flush(index: string): Promise<void>

  /** Delete the entire index. */
  deleteIndex(index: string): Promise<void>

  /** Create an index with optional settings. */
  createIndex(index: string, options?: IndexSettings): Promise<void>

  /** Perform a full-text search. */
  search(index: string, query: string, options?: SearchOptions): Promise<SearchResult>
}
