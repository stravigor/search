import SearchManager from './search_manager.ts'
import type { SearchEngine } from './search_engine.ts'
import type {
  SearchDocument,
  SearchOptions,
  SearchResult,
  IndexSettings,
  DriverConfig,
} from './types.ts'

/**
 * Search helper — the primary convenience API.
 *
 * @example
 * import { search } from '@stravigor/search'
 *
 * const results = await search.query('articles', 'typescript generics')
 * await search.upsert('articles', 1, { title: 'Guide', body: '...' })
 */
export const search = {
  /** Get the underlying engine instance (default or named). */
  engine(name?: string): SearchEngine {
    return SearchManager.engine(name)
  },

  /** Register a custom search driver factory. */
  extend(name: string, factory: (config: DriverConfig) => SearchEngine): void {
    SearchManager.extend(name, factory)
  },

  /** Perform a full-text search query. */
  query(index: string, query: string, options?: SearchOptions): Promise<SearchResult> {
    return SearchManager.engine().search(SearchManager.indexName(index), query, options)
  },

  /** Add or update a single document. */
  upsert(index: string, id: string | number, document: Record<string, unknown>): Promise<void> {
    return SearchManager.engine().upsert(SearchManager.indexName(index), id, document)
  },

  /** Add or update multiple documents. */
  upsertMany(index: string, documents: SearchDocument[]): Promise<void> {
    return SearchManager.engine().upsertMany(SearchManager.indexName(index), documents)
  },

  /** Remove a document from the index. */
  delete(index: string, id: string | number): Promise<void> {
    return SearchManager.engine().delete(SearchManager.indexName(index), id)
  },

  /** Remove multiple documents from the index. */
  deleteMany(index: string, ids: Array<string | number>): Promise<void> {
    return SearchManager.engine().deleteMany(SearchManager.indexName(index), ids)
  },

  /** Remove all documents from an index. */
  flush(index: string): Promise<void> {
    return SearchManager.engine().flush(SearchManager.indexName(index))
  },

  /** Create an index with optional settings. */
  createIndex(index: string, options?: IndexSettings): Promise<void> {
    return SearchManager.engine().createIndex(SearchManager.indexName(index), options)
  },

  /** Delete an entire index. */
  deleteIndex(index: string): Promise<void> {
    return SearchManager.engine().deleteIndex(SearchManager.indexName(index))
  },
}
