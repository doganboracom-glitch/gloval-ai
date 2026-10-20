import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insert, order, limit } = vi.hoisted(() => ({
  insert: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => insert(table, row),
      select: () => ({ order: (...args: unknown[]) => (order(...args), { limit }) }),
    }),
  }),
}))

import { listBlogAudit, recordBlogAudit } from '@/lib/blog-audit'

const actor = { userId: 'u-1', email: 'admin@example.com' }

describe('recordBlogAudit', () => {
  beforeEach(() => {
    insert.mockReset()
    limit.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('writes who, what and which post into platform_blog_audit', async () => {
    insert.mockResolvedValue({ error: null })
    await recordBlogAudit({
      actor,
      action: 'post.publish',
      postId: 'p-1',
      postSlug: 'merhaba',
      postTitle: 'Merhaba',
      detail: { status: 'published' },
    })
    expect(insert).toHaveBeenCalledWith('platform_blog_audit', {
      actor_id: 'u-1',
      actor_email: 'admin@example.com',
      action: 'post.publish',
      post_id: 'p-1',
      post_slug: 'merhaba',
      post_title: 'Merhaba',
      detail: { status: 'published' },
    })
  })

  it('stores null for omitted post fields and caps the title at 200 characters', async () => {
    insert.mockResolvedValue({ error: null })
    await recordBlogAudit({ actor, action: 'category.create', postTitle: 'x'.repeat(500) })
    const row = insert.mock.calls[0][1] as Record<string, unknown>
    expect(row.post_id).toBeNull()
    expect(row.post_slug).toBeNull()
    expect(row.detail).toBeNull()
    expect((row.post_title as string).length).toBe(200)
  })

  it('does not block the editor when the database returns an error', async () => {
    insert.mockResolvedValue({ error: { message: 'relation "platform_blog_audit" does not exist' } })
    await expect(recordBlogAudit({ actor, action: 'post.delete' })).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('does not block the editor when the call throws', async () => {
    insert.mockRejectedValue(new Error('network down'))
    await expect(recordBlogAudit({ actor, action: 'post.update' })).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('listBlogAudit', () => {
  beforeEach(() => {
    limit.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns an empty list instead of throwing when the table is unreachable', async () => {
    limit.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(listBlogAudit()).resolves.toEqual([])
  })

  it('maps rows to camelCase', async () => {
    limit.mockResolvedValue({
      data: [
        {
          id: 'a',
          at: '2026-01-01T00:00:00Z',
          actor_email: 'admin@example.com',
          action: 'post.create',
          post_id: null,
          post_slug: 's',
          post_title: 'T',
          detail: null,
        },
      ],
      error: null,
    })
    const [row] = await listBlogAudit(5)
    expect(row).toMatchObject({ actorEmail: 'admin@example.com', postSlug: 's', postId: null })
  })
})
