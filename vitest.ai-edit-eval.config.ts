import { defineConfig } from 'vitest/config'
import * as path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/ai-edit-quality.eval.ts'],
    env: { AI_EDIT_EVAL: process.env.AI_EDIT_EVAL ?? '' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'scripts/empty-module.cjs'),
    },
  },
})
