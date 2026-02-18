import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import SearchManager from '../src/search_manager.ts'
import { searchable } from '../src/searchable.ts'
import { Emitter } from '@stravigor/kernel'
import { bootSearch, recordingEngine } from './helpers.ts'

// ---------------------------------------------------------------------------
// Minimal BaseModel stub for testing the mixin
// ---------------------------------------------------------------------------

class FakeBaseModel {
  static softDeletes = false
  _exists = false

  static get tableName() {
    return 'article'
  }

  static get primaryKeyColumn() {
    return 'id'
  }

  static get primaryKeyProperty() {
    return 'id'
  }

  static get db(): any {
    return (FakeBaseModel as any)._db
  }

  static hydrate(row: Record<string, unknown>) {
    const instance = new this()
    Object.assign(instance, row)
    return instance
  }

  merge(attrs: Record<string, unknown>) {
    Object.assign(this, attrs)
  }
}

// ---------------------------------------------------------------------------
// Searchable model for tests
// ---------------------------------------------------------------------------

class Article extends searchable(FakeBaseModel as any) {
  declare id: number
  declare title: string
  declare body: string
  declare status: string

  static searchableAs() {
    return 'articles'
  }

  toSearchableArray() {
    return { id: this.id, title: this.title, body: this.body }
  }
}

// Model that conditionally excludes records
class DraftArticle extends searchable(FakeBaseModel as any) {
  declare id: number
  declare title: string
  declare published: boolean

  shouldBeSearchable() {
    return this.published === true
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchable() mixin', () => {
  let engine: ReturnType<typeof recordingEngine>

  beforeEach(() => {
    bootSearch()
    engine = recordingEngine('meilisearch')
    SearchManager.useEngine(engine.engine)
    Emitter.reset()
    ;(Article as any)._searchBooted = false
    ;(DraftArticle as any)._searchBooted = false
  })

  afterEach(() => {
    SearchManager.reset()
  })

  // ── searchableAs ─────────────────────────────────────────────────────────

  test('searchableAs returns custom index name', () => {
    expect(Article.searchableAs()).toBe('articles')
  })

  // ── toSearchableArray ────────────────────────────────────────────────────

  test('toSearchableArray returns custom fields', () => {
    const article = new Article()
    Object.assign(article, { id: 1, title: 'Hello', body: 'World', status: 'published' })

    const data = article.toSearchableArray()
    expect(data).toEqual({ id: 1, title: 'Hello', body: 'World' })
    expect(data).not.toHaveProperty('status') // not included
  })

  // ── shouldBeSearchable ───────────────────────────────────────────────────

  test('shouldBeSearchable defaults to true', () => {
    const article = new Article()
    expect(article.shouldBeSearchable()).toBe(true)
  })

  test('shouldBeSearchable can filter out records', () => {
    const draft = new DraftArticle()
    Object.assign(draft, { published: false })
    expect(draft.shouldBeSearchable()).toBe(false)

    Object.assign(draft, { published: true })
    expect(draft.shouldBeSearchable()).toBe(true)
  })

  // ── searchIndex ──────────────────────────────────────────────────────────

  test('searchIndex calls engine.upsert', async () => {
    const article = new Article()
    Object.assign(article, { id: 1, title: 'Hello', body: 'World' })

    await article.searchIndex()

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('upsert')
    expect(engine.calls[0].args[0]).toBe('articles') // index name
    expect(engine.calls[0].args[1]).toBe(1) // id
    expect(engine.calls[0].args[2]).toEqual({ id: 1, title: 'Hello', body: 'World' })
  })

  test('searchIndex skips non-searchable records', async () => {
    const draft = new DraftArticle()
    Object.assign(draft, { id: 1, published: false })

    await draft.searchIndex()
    expect(engine.calls.length).toBe(0)
  })

  // ── searchRemove ─────────────────────────────────────────────────────────

  test('searchRemove calls engine.delete', async () => {
    const article = new Article()
    Object.assign(article, { id: 42, title: 'Bye', body: '' })

    await article.searchRemove()

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('delete')
    expect(engine.calls[0].args[0]).toBe('articles')
    expect(engine.calls[0].args[1]).toBe(42)
  })

  // ── static search ────────────────────────────────────────────────────────

  test('search delegates to engine.search', async () => {
    await Article.search('typescript', { page: 2, perPage: 10 })

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('search')
    expect(engine.calls[0].args[0]).toBe('articles')
    expect(engine.calls[0].args[1]).toBe('typescript')
    expect(engine.calls[0].args[2]).toEqual({ page: 2, perPage: 10 })
  })

  // ── flushIndex ───────────────────────────────────────────────────────────

  test('flushIndex delegates to engine.flush', async () => {
    await Article.flushIndex()

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('flush')
    expect(engine.calls[0].args[0]).toBe('articles')
  })

  // ── createSearchIndex ────────────────────────────────────────────────────

  test('createSearchIndex delegates to engine.createIndex', async () => {
    await Article.createSearchIndex()

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('createIndex')
    expect(engine.calls[0].args[0]).toBe('articles')
  })

  // ── bootSearch (auto-indexing via Emitter) ───────────────────────────────

  test('bootSearch registers event listeners', () => {
    Article.bootSearch('article')

    expect(Emitter.listenerCount('article.created')).toBe(1)
    expect(Emitter.listenerCount('article.updated')).toBe(1)
    expect(Emitter.listenerCount('article.synced')).toBe(1)
    expect(Emitter.listenerCount('article.deleted')).toBe(1)
  })

  test('bootSearch is idempotent', () => {
    Article.bootSearch('article')
    Article.bootSearch('article')

    expect(Emitter.listenerCount('article.created')).toBe(1)
  })

  test('created event triggers searchIndex', async () => {
    Article.bootSearch('article')

    const article = new Article()
    Object.assign(article, { id: 1, title: 'New', body: 'Content' })

    await Emitter.emit('article.created', article)

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('upsert')
  })

  test('updated event triggers searchIndex', async () => {
    Article.bootSearch('article')

    const article = new Article()
    Object.assign(article, { id: 1, title: 'Updated', body: 'Content' })

    await Emitter.emit('article.updated', article)

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('upsert')
  })

  test('deleted event triggers searchRemove', async () => {
    Article.bootSearch('article')

    const article = new Article()
    Object.assign(article, { id: 1, title: 'Deleted', body: '' })

    await Emitter.emit('article.deleted', article)

    expect(engine.calls.length).toBe(1)
    expect(engine.calls[0].method).toBe('delete')
  })

  // ── Index prefix ─────────────────────────────────────────────────────────

  test('respects index prefix from config', async () => {
    SearchManager.reset()
    bootSearch({ prefix: 'myapp_' })
    const eng = recordingEngine('meilisearch')
    SearchManager.useEngine(eng.engine)

    const article = new Article()
    Object.assign(article, { id: 1, title: 'Hello', body: 'World' })
    await article.searchIndex()

    expect(eng.calls[0].args[0]).toBe('myapp_articles')
  })
})
