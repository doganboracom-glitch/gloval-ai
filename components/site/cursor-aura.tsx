'use client'

import { useEffect, useRef, useState } from 'react'
import { canRunCursorAura, hexToRgb, type CursorAuraConfig } from '@/lib/cursor-aura'

const MAX_DPR = 2
const MAX_PUFFS = 60
const PUFF_LIFETIME_MS = 1400
const FOLLOW_EASING = 0.14
const MOVE_IDLE_MS = 120

type Puff = { x: number; y: number; r: number; rgb: [number, number, number]; life: number }

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: 2000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(run, 1200)
  return () => window.clearTimeout(handle)
}

/**
 * Soft, blurred dust trail that follows the mouse. Mounts a fixed,
 * click-through canvas only on devices with a real hover pointer and without
 * a reduced-motion preference, starts once the browser is idle, and stops its
 * animation loop whenever the pointer rests or the tab is hidden.
 */
export default function CursorAura({ config }: { config: CursorAuraConfig }) {
  const [active, setActive] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const queries = [
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(hover: none)'),
    ]
    const allowed = () =>
      canRunCursorAura({
        reducedMotion: queries[0].matches,
        coarsePointer: queries[1].matches,
        noHover: queries[2].matches,
      })

    let cancelIdle: (() => void) | null = null
    const evaluate = () => {
      cancelIdle?.()
      cancelIdle = null
      if (!allowed()) {
        setActive(false)
        return
      }
      cancelIdle = whenIdle(() => setActive(allowed()))
    }

    evaluate()
    queries.forEach((q) => q.addEventListener('change', evaluate))
    return () => {
      cancelIdle?.()
      queries.forEach((q) => q.removeEventListener('change', evaluate))
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!active || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const palette = config.colors.map(hexToRgb).filter((c): c is [number, number, number] => c !== null)
    if (palette.length === 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    let width = 0
    let height = 0
    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    let puffs: Puff[] = []
    const target = { x: 0, y: 0 }
    const pos = { x: 0, y: 0 }
    let hasPointer = false
    let lastMoveAt = 0
    let lastFrameAt = 0
    let raf = 0
    let colorCursor = 0

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(now - lastFrameAt, 50)
      lastFrameAt = now

      pos.x += (target.x - pos.x) * FOLLOW_EASING
      pos.y += (target.y - pos.y) * FOLLOW_EASING
      const gap = Math.hypot(target.x - pos.x, target.y - pos.y)
      const moving = now - lastMoveAt < MOVE_IDLE_MS

      if (moving || gap > 1.5) {
        const rgb = palette[Math.floor(colorCursor++ / 3) % palette.length]
        const jitter = config.size * 0.12
        puffs.push({
          x: pos.x + (Math.random() - 0.5) * jitter,
          y: pos.y + (Math.random() - 0.5) * jitter,
          r: (config.size / 2) * (0.7 + Math.random() * 0.5),
          rgb,
          life: 1,
        })
        if (puffs.length > MAX_PUFFS) puffs.splice(0, puffs.length - MAX_PUFFS)
      }

      ctx.clearRect(0, 0, width, height)
      for (const p of puffs) {
        p.life -= dt / PUFF_LIFETIME_MS
        if (p.life <= 0) continue
        const radius = p.r * (1 + (1 - p.life) * 0.6)
        const alpha = p.life * p.life * config.intensity * 0.45
        const [r, g, b] = p.rgb
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
        gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`)
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      puffs = puffs.filter((p) => p.life > 0)

      if (puffs.length === 0 && gap <= 1.5 && !moving) {
        ctx.clearRect(0, 0, width, height)
        return
      }
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (raf || document.hidden) return
      lastFrameAt = performance.now()
      raf = requestAnimationFrame(frame)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return
      target.x = event.clientX
      target.y = event.clientY
      if (!hasPointer) {
        pos.x = target.x
        pos.y = target.y
        hasPointer = true
      }
      lastMoveAt = performance.now()
      start()
    }

    const onVisibility = () => {
      if (!document.hidden) return
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      puffs = []
      ctx.clearRect(0, 0, width, height)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, config])

  if (!active) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-cursor-aura=""
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}
