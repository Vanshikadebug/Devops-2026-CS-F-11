/**
 * The reuse orbit: listing photos on a slowly turning ring (three.js via
 * @react-three/fiber). Scroll drives the rotation, the pointer tilts it,
 * hovering a card names it, clicking opens the listing. Cards behind the ring
 * fade into the page colour through fog, so the scene follows the theme.
 *
 * Lazy-loaded by Home -- three.js stays out of the main bundle.
 */
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const CARD_W = 1.6
const CARD_H = 2.0
const MIN_CARDS = 12

/** Live theme colours from the CSS custom properties; follows theme switches. */
function useThemeColors() {
  const read = () => {
    const css = getComputedStyle(document.documentElement)
    return {
      bg: css.getPropertyValue('--bg').trim() || '#ece8e3',
      photo: css.getPropertyValue('--photo').trim() || '#dcd7d1',
      ink: css.getPropertyValue('--ink').trim() || '#111',
    }
  }
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return colors
}

/** Crops a texture like CSS object-fit: cover for the card's aspect. */
function cover(texture) {
  const img = texture.image
  if (!img?.width) return texture
  const cardAspect = CARD_W / CARD_H
  const imgAspect = img.width / img.height
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  if (imgAspect > cardAspect) {
    texture.repeat.set(cardAspect / imgAspect, 1)
    texture.offset.set((1 - texture.repeat.x) / 2, 0)
  } else {
    texture.repeat.set(1, imgAspect / cardAspect)
    texture.offset.set(0, (1 - texture.repeat.y) / 2)
  }
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/** A card face for a listing with no photo: its category glyph on a swatch. */
function glyphTexture(glyph, bg) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 640
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.globalAlpha = 0.45
  ctx.font = '200px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.filter = 'grayscale(1)'
  ctx.fillText(glyph || '📦', c.width / 2, c.height / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function CardMesh({ texture, angle, radius, card, onHover, onOpen }) {
  const ref = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame((_, dt) => {
    const s = THREE.MathUtils.damp(ref.current.scale.x, hovered ? 1.14 : 1, 8, dt)
    ref.current.scale.set(s, s, s)
  })

  return (
    <mesh
      ref={ref}
      position={[Math.sin(angle) * radius, 0, Math.cos(angle) * radius]}
      rotation={[0, angle, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(card) }}
      onPointerOut={() => { setHovered(false); onHover(null) }}
      onClick={(e) => { e.stopPropagation(); onOpen(card) }}
    >
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  )
}

function PhotoCard({ card, ...rest }) {
  const raw = useTexture(card.photo)
  // Each card gets its own clone: repeated listings share one image, and
  // cover() mutates repeat/offset.
  const texture = useMemo(() => cover(raw.clone()), [raw])
  return <CardMesh texture={texture} card={card} {...rest} />
}

function GlyphCard({ card, swatch, ...rest }) {
  const texture = useMemo(() => glyphTexture(card.glyph, swatch), [card.glyph, swatch])
  useEffect(() => () => texture.dispose(), [texture])
  return <CardMesh texture={texture} card={card} {...rest} />
}

function Ring({ cards, progress, swatch, onHover, onOpen, spin }) {
  const group = useRef()
  const radius = Math.max(3.2, (cards.length * (CARD_W + 0.55)) / (Math.PI * 2))

  useFrame((state, dt) => {
    const g = group.current
    const target = progress.get() * Math.PI * 1.5 + (spin ? state.clock.elapsedTime * 0.05 : 0)
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, target, 3, dt)
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0.1 - state.pointer.y * 0.08, 3, dt)
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, state.pointer.x * 0.05, 3, dt)
  })

  // Sits below centre so the headline above it stays readable.
  return (
    <group ref={group} position={[0, -0.5, 0]}>
      {cards.map((card, i) => {
        const props = {
          card,
          angle: (i / cards.length) * Math.PI * 2,
          radius,
          onHover,
          onOpen,
        }
        const glyph = <GlyphCard key={i} swatch={swatch} {...props} />
        // A dead photo URL falls back to the glyph card, not a broken scene.
        return card.photo
          ? <GLBoundary key={i} fallback={glyph}><PhotoCard {...props} /></GLBoundary>
          : glyph
      })}
    </group>
  )
}

/** WebGL can be missing or blocked; the page must still work without it. */
class GLBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/**
 * items:    listings ({ id, name, image_url, category })
 * glyphFor: category label -> emoji, for photo-less cards
 * progress: framer-motion MotionValue 0..1 (section scroll)
 * active:   false pauses rendering while the section is off screen
 */
export default function ReuseOrbit({ items, glyphFor, photoUrl, progress, active, onOpen, onHover }) {
  const colors = useThemeColors()
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  // Repeat short lists so the ring always reads as a ring.
  const cards = useMemo(() => {
    if (!items.length) return []
    const base = items.map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      photo: it.image_url ? photoUrl(it.image_url) : null,
      glyph: glyphFor(it.category),
    }))
    const out = []
    while (out.length < Math.max(MIN_CARDS, base.length)) out.push(...base)
    return out.slice(0, Math.max(MIN_CARDS, base.length))
  }, [items, glyphFor, photoUrl])

  const radius = Math.max(3.2, (cards.length * (CARD_W + 0.55)) / (Math.PI * 2))

  if (!cards.length) return null

  return (
    <GLBoundary fallback={<div className="orbit__fallback" />}>
      <Canvas
        className="orbit__canvas"
        frameloop={active ? 'always' : 'never'}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0.4, radius + 6.5], fov: 34 }}
      >
        <fog attach="fog" args={[colors.bg, radius + 4.5, radius + 11]} />
        <Suspense fallback={null}>
          <Ring
            cards={cards}
            progress={progress}
            swatch={colors.photo}
            spin={!reduced}
            onHover={onHover}
            onOpen={onOpen}
          />
        </Suspense>
      </Canvas>
    </GLBoundary>
  )
}
