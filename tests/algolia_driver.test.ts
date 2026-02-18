import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { AlgoliaDriver } from '../src/drivers/algolia_driver.ts'
import { mockFetch, restoreFetch, lastFetchCall, fetchBody } from './helpers.ts'
import type { FetchCall } from './helpers.ts'

describe('AlgoliaDriver', () => {
  const driver = new AlgoliaDriver({
    driver: 'algolia',
    appId: 'TESTAPP',
    apiKey: 'alg-test-key',
  })

  let calls: FetchCall[]

  beforeEach(() => {
    calls = mockFetch({ objectID: '1' })
  })

  afterEach(() => {
    restoreFetch()
  })

  // ── Auth ─────────────────────────────────────────────────────────────────

  test('sends Algolia auth headers', async () => {
    await driver.upsert('articles', 1, { title: 'hi' })
    const { init } = lastFetchCall(calls)
    expect((init.headers as any)['x-algolia-application-id']).toBe('TESTAPP')
    expect((init.headers as any)['x-algolia-api-key']).toBe('alg-test-key')
  })

  test('uses correct base URL with appId', async () => {
    await driver.upsert('articles', 1, { title: 'hi' })
    expect(lastFetchCall(calls).url).toStartWith('https://TESTAPP.algolia.net/')
  })

  // ── upsert ───────────────────────────────────────────────────────────────

  test('upsert sends PUT to /1/indexes/{index}/{id}', async () => {
    await driver.upsert('articles', 1, { title: 'Hello' })
    const call = lastFetchCall(calls)
    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles/1')
    expect(call.init.method).toBe('PUT')
    expect(fetchBody(call)).toEqual({ title: 'Hello' })
  })

  // ── upsertMany ───────────────────────────────────────────────────────────

  test('upsertMany sends batch request with updateObject actions', async () => {
    const docs = [
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]
    await driver.upsertMany('articles', docs)
    const call = lastFetchCall(calls)
    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles/batch')
    expect(call.init.method).toBe('POST')

    const body = fetchBody(call)
    expect(body.requests.length).toBe(2)
    expect(body.requests[0].action).toBe('updateObject')
    expect(body.requests[0].body.objectID).toBe('1')
    expect(body.requests[1].body.objectID).toBe('2')
  })

  // ── delete ───────────────────────────────────────────────────────────────

  test('delete sends DELETE to /1/indexes/{index}/{id}', async () => {
    await driver.delete('articles', 42)
    const call = lastFetchCall(calls)
    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles/42')
    expect(call.init.method).toBe('DELETE')
  })

  // ── deleteMany ───────────────────────────────────────────────────────────

  test('deleteMany sends batch request with deleteObject actions', async () => {
    await driver.deleteMany('articles', [1, 2, 3])
    const call = lastFetchCall(calls)
    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles/batch')

    const body = fetchBody(call)
    expect(body.requests.length).toBe(3)
    expect(body.requests[0].action).toBe('deleteObject')
    expect(body.requests[0].body.objectID).toBe('1')
  })

  // ── flush ────────────────────────────────────────────────────────────────

  test('flush sends POST to /1/indexes/{index}/clear', async () => {
    await driver.flush('articles')
    const call = lastFetchCall(calls)
    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles/clear')
    expect(call.init.method).toBe('POST')
  })

  // ── deleteIndex ──────────────────────────────────────────────────────────

  test('deleteIndex sends DELETE to /1/indexes/{index}', async () => {
    await driver.deleteIndex('articles')
    const call = lastFetchCall(calls)
    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles')
    expect(call.init.method).toBe('DELETE')
  })

  // ── createIndex ──────────────────────────────────────────────────────────

  test('createIndex applies settings', async () => {
    await driver.createIndex('articles', {
      searchableAttributes: ['title', 'body'],
      filterableAttributes: ['status'],
    })
    const call = lastFetchCall(calls)
    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles/settings')
    expect(call.init.method).toBe('PUT')

    const body = fetchBody(call)
    expect(body.searchableAttributes).toEqual(['title', 'body'])
    expect(body.attributesForFaceting).toEqual(['filterOnly(status)'])
  })

  test('createIndex is a no-op without settings', async () => {
    await driver.createIndex('articles')
    expect(calls.length).toBe(0) // Algolia creates indexes implicitly
  })

  // ── search ───────────────────────────────────────────────────────────────

  test('search sends POST to /1/indexes/{index}/query', async () => {
    calls = mockFetch({
      hits: [
        {
          objectID: '1',
          title: 'TS Guide',
          _highlightResult: { title: { value: '<em>TS</em> Guide' } },
        },
      ],
      nbHits: 1,
      processingTimeMS: 2,
    })

    const result = await driver.search('articles', 'typescript', { page: 1, perPage: 10 })
    const call = lastFetchCall(calls)

    expect(call.url).toBe('https://TESTAPP.algolia.net/1/indexes/articles/query')
    expect(call.init.method).toBe('POST')

    const body = fetchBody(call)
    expect(body.query).toBe('typescript')
    expect(body.hitsPerPage).toBe(10)
    expect(body.page).toBe(0) // 0-based

    expect(result.totalHits).toBe(1)
    expect(result.hits.length).toBe(1)
    expect(result.hits[0].highlights?.title).toBe('<em>TS</em> Guide')
    expect(result.processingTimeMs).toBe(2)
  })

  test('search with filter string', async () => {
    calls = mockFetch({ hits: [], nbHits: 0 })

    await driver.search('articles', 'test', { filter: 'status:published' })
    expect(fetchBody(lastFetchCall(calls)).filters).toBe('status:published')
  })

  // ── Error handling ───────────────────────────────────────────────────────

  test('throws ExternalServiceError on non-ok response', async () => {
    calls = mockFetch({ message: 'Index not found' }, 404)
    await expect(driver.search('missing', 'test')).rejects.toThrow('Algolia')
  })
})
