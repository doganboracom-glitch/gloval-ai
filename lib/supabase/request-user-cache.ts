import { cache } from 'react'

export function cacheRequestUser<T>(resolve: () => Promise<T>): () => Promise<T> {
  return cache(resolve)
}
