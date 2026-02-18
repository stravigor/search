import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import SearchManager from '../src/search_manager.ts'
import { search } from '../src/helpers.ts'
import { bootSearch, recordingEngine } from './helpers.ts'
import type { EngineCall } from './helpers.ts'

describe('search helper', () => {
  let calls: EngineCall[]

  beforeEach(() => {
    bootSearch()
    const eng = recordingEngine('meilisearch')
    calls = eng.calls
    SearchManager.useEngine(eng.engine)
  })

  afterEach(() => {
    SearchManager.reset()
  })

  test('query delegates to engine.search', async () => {
    await search.query('articles', 'typescript', { page: 1 })
    expect(calls.length).toBe(1)
    expect(calls[0].method).toBe('search')
    expect(calls[0].args[0]).toBe('articles')
    expect(calls[0].args[1]).toBe('typescript')
  })

  test('upsert delegates to engine.upsert', async () => {
    await search.upsert('articles', 1, { title: 'Hi' })
    expect(calls[0].method).toBe('upsert')
    expect(calls[0].args).toEqual(['articles', 1, { title: 'Hi' }])
  })

  test('upsertMany delegates to engine.upsertMany', async () => {
    const docs = [
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]
    await search.upsertMany('articles', docs)
    expect(calls[0].method).toBe('upsertMany')
    expect(calls[0].args[0]).toBe('articles')
  })

  test('delete delegates to engine.delete', async () => {
    await search.delete('articles', 1)
    expect(calls[0].method).toBe('delete')
    expect(calls[0].args).toEqual(['articles', 1])
  })

  test('deleteMany delegates to engine.deleteMany', async () => {
    await search.deleteMany('articles', [1, 2])
    expect(calls[0].method).toBe('deleteMany')
    expect(calls[0].args).toEqual(['articles', [1, 2]])
  })

  test('flush delegates to engine.flush', async () => {
    await search.flush('articles')
    expect(calls[0].method).toBe('flush')
    expect(calls[0].args).toEqual(['articles'])
  })

  test('createIndex delegates to engine.createIndex', async () => {
    await search.createIndex('articles', { searchableAttributes: ['title'] })
    expect(calls[0].method).toBe('createIndex')
    expect(calls[0].args[0]).toBe('articles')
  })

  test('deleteIndex delegates to engine.deleteIndex', async () => {
    await search.deleteIndex('articles')
    expect(calls[0].method).toBe('deleteIndex')
    expect(calls[0].args).toEqual(['articles'])
  })

  test('engine returns the underlying engine', () => {
    const engine = search.engine()
    expect(engine.name).toBe('meilisearch')
  })

  test('applies prefix to index names', async () => {
    SearchManager.reset()
    bootSearch({ prefix: 'prod_' })
    const eng = recordingEngine('meilisearch')
    SearchManager.useEngine(eng.engine)

    await search.query('articles', 'test')
    expect(eng.calls[0].args[0]).toBe('prod_articles')
  })
})
