import type { SearchEngine } from '../search_engine.ts'
import type { SearchDocument, SearchOptions, SearchResult, IndexSettings } from '../types.ts'

/**
 * No-op search driver — silently discards all writes and returns empty results.
 *
 * Useful when search is disabled or during testing.
 */
export class NullDriver implements SearchEngine {
  readonly name = 'null'

  async upsert(
    _index: string,
    _id: string | number,
    _document: Record<string, unknown>
  ): Promise<void> {}
  async upsertMany(_index: string, _documents: SearchDocument[]): Promise<void> {}
  async delete(_index: string, _id: string | number): Promise<void> {}
  async deleteMany(_index: string, _ids: Array<string | number>): Promise<void> {}
  async flush(_index: string): Promise<void> {}
  async deleteIndex(_index: string): Promise<void> {}
  async createIndex(_index: string, _options?: IndexSettings): Promise<void> {}

  async search(_index: string, _query: string, options?: SearchOptions): Promise<SearchResult> {
    return { hits: [], totalHits: 0, page: options?.page ?? 1, perPage: options?.perPage ?? 20 }
  }
}
