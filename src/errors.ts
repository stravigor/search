import { StravError } from '@stravigor/kernel'

/** Base error class for all search errors. */
export class SearchError extends StravError {}

/** Thrown when a search index is not found. */
export class IndexNotFoundError extends SearchError {
  constructor(index: string) {
    super(`Search index "${index}" not found.`)
  }
}

/** Thrown when a search query fails. */
export class SearchQueryError extends SearchError {
  constructor(index: string, cause?: string) {
    super(`Search query on "${index}" failed${cause ? `: ${cause}` : ''}.`)
  }
}
