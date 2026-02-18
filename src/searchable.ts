import type { BaseModel } from '@stravigor/database'
import type { NormalizeConstructor } from '@stravigor/kernel'
import { Emitter } from '@stravigor/kernel'
import SearchManager from './search_manager.ts'
import type { SearchOptions, SearchResult, SearchDocument, IndexSettings } from './types.ts'

/**
 * Mixin that adds full-text search capabilities to a BaseModel subclass.
 *
 * @example
 * import { BaseModel } from '@stravigor/database'
 * import { searchable } from '@stravigor/search'
 *
 * class Article extends searchable(BaseModel) {
 *   declare id: number
 *   declare title: string
 *   declare body: string
 *
 *   static searchableAs() { return 'articles' }
 *
 *   toSearchableArray() {
 *     return { id: this.id, title: this.title, body: this.body }
 *   }
 * }
 *
 * // Composable with other mixins:
 * import { compose } from '@stravigor/kernel'
 * class Article extends compose(BaseModel, softDeletes, searchable) { }
 *
 * // Boot auto-indexing (in app bootstrap):
 * Article.bootSearch('article')
 *
 * // Search:
 * const results = await Article.search('typescript')
 */
export function searchable<T extends NormalizeConstructor<typeof BaseModel>>(Base: T) {
  return class Searchable extends Base {
    private static _searchBooted = false

    /**
     * The search index name for this model.
     * Defaults to the table name. Override to customize.
     */
    static searchableAs(): string {
      return (this as unknown as typeof BaseModel).tableName
    }

    /**
     * Convert this model instance to a document for the search index.
     * Override in subclass to control which fields are indexed.
     *
     * Default: returns all own properties that don't start with '_'.
     */
    toSearchableArray(): Record<string, unknown> {
      const data: Record<string, unknown> = {}
      for (const key of Object.keys(this)) {
        if (key.startsWith('_')) continue
        data[key] = (this as any)[key]
      }
      return data
    }

    /**
     * Whether this model instance should be indexed.
     * Override to conditionally exclude records (e.g. drafts).
     */
    shouldBeSearchable(): boolean {
      return true
    }

    /**
     * Index settings for this model (searchable/filterable/sortable attributes).
     * Override to configure. Returns undefined by default (use engine defaults).
     */
    static searchableSettings(): IndexSettings | undefined {
      return undefined
    }

    // ── Instance methods ─────────────────────────────────────────────────

    /** Index (upsert) this model instance in the search engine. */
    async searchIndex(): Promise<void> {
      if (!this.shouldBeSearchable()) return
      const ctor = this.constructor as typeof Searchable
      const index = SearchManager.indexName(ctor.searchableAs())
      const pkProp = (ctor as unknown as typeof BaseModel).primaryKeyProperty
      const id = (this as any)[pkProp]
      const document = this.toSearchableArray()
      await SearchManager.engine().upsert(index, id, document)
    }

    /** Remove this model instance from the search index. */
    async searchRemove(): Promise<void> {
      const ctor = this.constructor as typeof Searchable
      const index = SearchManager.indexName(ctor.searchableAs())
      const pkProp = (ctor as unknown as typeof BaseModel).primaryKeyProperty
      const id = (this as any)[pkProp]
      await SearchManager.engine().delete(index, id)
    }

    // ── Static methods ───────────────────────────────────────────────────

    /** Perform a full-text search on this model's index. */
    static async search(query: string, options?: SearchOptions): Promise<SearchResult> {
      const index = SearchManager.indexName(this.searchableAs())
      return SearchManager.engine().search(index, query, options)
    }

    /**
     * Import all records into the search index. Fetches from DB in chunks.
     * @param chunkSize Number of records per batch.
     * @returns The number of documents indexed.
     */
    static async importAll(chunkSize: number = 500): Promise<number> {
      const ModelCtor = this as unknown as typeof BaseModel & typeof Searchable
      const index = SearchManager.indexName(this.searchableAs())
      const db = ModelCtor.db
      const table = ModelCtor.tableName
      const pkCol = ModelCtor.primaryKeyColumn

      let imported = 0
      let offset = 0

      while (true) {
        const rows = (await db.sql.unsafe(
          `SELECT * FROM "${table}" ORDER BY "${pkCol}" LIMIT $1 OFFSET $2`,
          [chunkSize, offset]
        )) as Record<string, unknown>[]

        if (rows.length === 0) break

        const documents: SearchDocument[] = []
        for (const row of rows) {
          const instance = ModelCtor.hydrate(row) as InstanceType<typeof Searchable>
          if (instance.shouldBeSearchable()) {
            const doc = instance.toSearchableArray()
            const pkProp = ModelCtor.primaryKeyProperty
            documents.push({ id: (instance as any)[pkProp], ...doc })
          }
        }

        if (documents.length > 0) {
          await SearchManager.engine().upsertMany(index, documents)
          imported += documents.length
        }

        offset += chunkSize
        if (rows.length < chunkSize) break
      }

      return imported
    }

    /** Flush all documents from this model's search index. */
    static async flushIndex(): Promise<void> {
      const index = SearchManager.indexName(this.searchableAs())
      await SearchManager.engine().flush(index)
    }

    /** Create this model's search index with configured settings. */
    static async createSearchIndex(): Promise<void> {
      const index = SearchManager.indexName(this.searchableAs())
      const settings = this.searchableSettings()
      await SearchManager.engine().createIndex(index, settings)
    }

    /**
     * Register Emitter listeners for auto-indexing on model events.
     *
     * Hooks into `<prefix>.created`, `<prefix>.updated`, `<prefix>.synced`,
     * and `<prefix>.deleted` events emitted by generated services.
     *
     * @param eventPrefix The event prefix (e.g. 'article' for ArticleEvents).
     */
    static bootSearch(eventPrefix: string): void {
      if (this._searchBooted) return
      this._searchBooted = true

      const indexFn = async (model: unknown) => {
        if (model && typeof (model as any).searchIndex === 'function') {
          try {
            await (model as any).searchIndex()
          } catch {
            // Search indexing is secondary — failures should not break the event pipeline
          }
        }
      }

      const removeFn = async (model: unknown) => {
        if (model && typeof (model as any).searchRemove === 'function') {
          try {
            await (model as any).searchRemove()
          } catch {
            // Search removal is secondary — failures should not break the event pipeline
          }
        }
      }

      Emitter.on(`${eventPrefix}.created`, indexFn)
      Emitter.on(`${eventPrefix}.updated`, indexFn)
      Emitter.on(`${eventPrefix}.synced`, indexFn)
      Emitter.on(`${eventPrefix}.deleted`, removeFn)
    }
  }
}

/** The instance type of any searchable model. */
export type SearchableInstance = InstanceType<ReturnType<typeof searchable>>

/** The static type of any searchable model class. */
export type SearchableModel = ReturnType<typeof searchable>
