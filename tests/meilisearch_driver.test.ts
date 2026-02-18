import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { MeilisearchDriver } from '../src/drivers/meilisearch_driver.ts'
import { mockFetch, restoreFetch, lastFetchCall, fetchBody } from './helpers.ts'
import type { FetchCall } from './helpers.ts'

describe('MeilisearchDriver', () => {
  const driver = new MeilisearchDriver({
    driver: 'meilisearch',
    host: 'localhost',
    port: 7700,
    apiKey: 'ms-test-key',
  })

  let calls: FetchCall[]

  beforeEach(() => {
    calls = mockFetch({ taskUid: 1 })
  })

  afterEach(() => {
    restoreFetch()
  })

  // ── Auth ─────────────────────────────────────────────────────────────────

  test('sends Bearer auth header', async () => {
    await driver.upsert('articles', 1, { title: 'hi' })
    const { init } = lastFetchCall(calls)
    expect((init.headers as any)['authorization']).toBe('Bearer ms-test-key')
  })

  test('sends content-type header', async () => {
    await driver.upsert('articles', 1, { title: 'hi' })
    const { init } = lastFetchCall(calls)
    expect((init.headers as any)['content-type']).toBe('application/json')
  })

  // ── upsert ───────────────────────────────────────────────────────────────

  test('upsert sends POST to /indexes/{index}/documents', async () => {
    await driver.upsert('articles', 1, { title: 'Hello' })
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:7700/indexes/articles/documents')
    expect(call.init.method).toBe('POST')
    expect(fetchBody(call)).toEqual([{ id: 1, title: 'Hello' }])
  })

  // ── upsertMany ───────────────────────────────────────────────────────────

  test('upsertMany sends array of documents', async () => {
    const docs = [
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]
    await driver.upsertMany('articles', docs)
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:7700/indexes/articles/documents')
    expect(fetchBody(call)).toEqual(docs)
  })

  // ── delete ───────────────────────────────────────────────────────────────

  test('delete sends DELETE to /indexes/{index}/documents/{id}', async () => {
    await driver.delete('articles', 42)
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:7700/indexes/articles/documents/42')
    expect(call.init.method).toBe('DELETE')
  })

  // ── deleteMany ───────────────────────────────────────────────────────────

  test('deleteMany sends POST to delete-batch', async () => {
    await driver.deleteMany('articles', [1, 2, 3])
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:7700/indexes/articles/documents/delete-batch')
    expect(fetchBody(call)).toEqual([1, 2, 3])
  })

  // ── flush ────────────────────────────────────────────────────────────────

  test('flush sends DELETE to /indexes/{index}/documents', async () => {
    await driver.flush('articles')
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:7700/indexes/articles/documents')
    expect(call.init.method).toBe('DELETE')
  })

  // ── deleteIndex ──────────────────────────────────────────────────────────

  test('deleteIndex sends DELETE to /indexes/{index}', async () => {
    await driver.deleteIndex('articles')
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:7700/indexes/articles')
    expect(call.init.method).toBe('DELETE')
  })

  // ── createIndex ──────────────────────────────────────────────────────────

  test('createIndex sends POST to /indexes', async () => {
    await driver.createIndex('articles', { primaryKey: 'id' })
    // First call creates the index
    expect(calls[0].url).toBe('http://localhost:7700/indexes')
    expect(fetchBody(calls[0])).toEqual({ uid: 'articles', primaryKey: 'id' })
  })

  test('createIndex applies settings', async () => {
    await driver.createIndex('articles', {
      searchableAttributes: ['title', 'body'],
      filterableAttributes: ['status'],
    })
    // Second call patches settings
    expect(calls.length).toBe(2)
    expect(calls[1].url).toBe('http://localhost:7700/indexes/articles/settings')
    expect(calls[1].init.method).toBe('PATCH')
    expect(fetchBody(calls[1])).toEqual({
      searchableAttributes: ['title', 'body'],
      filterableAttributes: ['status'],
    })
  })

  // ── search ───────────────────────────────────────────────────────────────

  test('search sends POST to /indexes/{index}/search', async () => {
    calls = mockFetch({
      hits: [{ id: 1, title: 'TS Guide', _formatted: { title: '<em>TS</em> Guide' } }],
      estimatedTotalHits: 1,
      processingTimeMs: 3,
    })

    const result = await driver.search('articles', 'typescript', { page: 1, perPage: 10 })
    const call = lastFetchCall(calls)

    expect(call.url).toBe('http://localhost:7700/indexes/articles/search')
    expect(call.init.method).toBe('POST')
    expect(fetchBody(call).q).toBe('typescript')
    expect(fetchBody(call).limit).toBe(10)
    expect(fetchBody(call).offset).toBe(0)

    expect(result.totalHits).toBe(1)
    expect(result.hits.length).toBe(1)
    expect(result.hits[0].document.title).toBe('TS Guide')
    expect(result.processingTimeMs).toBe(3)
  })

  test('search with filters', async () => {
    calls = mockFetch({ hits: [], estimatedTotalHits: 0 })

    await driver.search('articles', 'test', { filter: { status: 'published' } })
    expect(fetchBody(lastFetchCall(calls)).filter).toBe('status = "published"')
  })

  test('search with sort', async () => {
    calls = mockFetch({ hits: [], estimatedTotalHits: 0 })

    await driver.search('articles', 'test', { sort: ['created_at:desc'] })
    expect(fetchBody(lastFetchCall(calls)).sort).toEqual(['created_at:desc'])
  })

  test('search pagination offset', async () => {
    calls = mockFetch({ hits: [], estimatedTotalHits: 0 })

    await driver.search('articles', 'test', { page: 3, perPage: 10 })
    expect(fetchBody(lastFetchCall(calls)).offset).toBe(20)
  })

  // ── Error handling ───────────────────────────────────────────────────────

  test('throws ExternalServiceError on non-ok response', async () => {
    calls = mockFetch({ message: 'Not Found' }, 404)

    await expect(driver.search('missing', 'test')).rejects.toThrow('Meilisearch')
  })

  // ── Custom protocol ──────────────────────────────────────────────────────

  test('supports https protocol', async () => {
    const httpsDriver = new MeilisearchDriver({
      driver: 'meilisearch',
      host: 'search.example.com',
      port: 443,
      apiKey: 'key',
      protocol: 'https',
    })
    calls = mockFetch({ hits: [], estimatedTotalHits: 0 })

    await httpsDriver.search('articles', 'q')
    expect(lastFetchCall(calls).url).toStartWith('https://search.example.com:443')
  })
})
