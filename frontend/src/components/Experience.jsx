/**
 * Site-wide motion layer: intro preloader, cursor follower, route curtain
 * and the ticker pill. None of these carry content — they are skipped for
 * reduced-motion users and touch devices where they make no sense.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { motion } from 'framer-motion'

import { api } from '../lib/api'
import { assetUrl } from '../lib/origin'
import { useConfig } from '../app/ConfigProvider'
import './Experience.css'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function seenIntro() {
  try {
    return sessionStorage.getItem('rh-intro') === '1'
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------
   Preloader — counter runs to 100 while a stack of listing photos flicks
   through behind the wordmark, then the letters drop out and the curtain
   lifts. Once per browser session.
   ------------------------------------------------------------------------- */
export function Preloader() {
  const { setting } = useConfig()
  const [done, setDone] = useState(() => seenIntro() || reducedMotion())
  const [photos, setPhotos] = useState([])
  const root = useRef(null)
  const counter = useRef(null)

  // Pages hold their own entrance animations while this flag is set.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('is-loading', !done)
  }, [done])

  useEffect(() => {
    if (done) return
    api.get('/items?limit=6&status=Available')
      .then((res) => setPhotos((res.data || []).filter((i) => i.image_url).map((i) => assetUrl(i.image_url))))
      .catch(() => {})
  }, [done])

  useGSAP(() => {
    if (done) return
    const count = { v: 0 }
    const tl = gsap.timeline({
      onComplete: () => {
        try { sessionStorage.setItem('rh-intro', '1') } catch { /* private mode */ }
        setDone(true)
      },
    })

    tl.from('.pre__char', { yPercent: 110, duration: 0.8, stagger: 0.05, ease: 'power4.out' })
      .to(count, {
        v: 100,
        duration: 1.8,
        ease: 'power2.inOut',
        onUpdate: () => {
          if (counter.current) counter.current.textContent = String(Math.round(count.v)).padStart(3, '0')
        },
      }, 0.2)
      .fromTo('.pre__card',
        { scale: 0.6, opacity: 0, rotate: 0 },
        { scale: 1, opacity: 1, rotate: () => gsap.utils.random(-14, 14), duration: 0.35, stagger: 0.22, ease: 'power3.out' },
        0.3)
      .to('.pre__card', { scale: 0, opacity: 0, duration: 0.4, stagger: 0.03, ease: 'power3.in' }, '>-0.05')
      .to('.pre__char', { yPercent: -110, duration: 0.6, stagger: 0.035, ease: 'power4.in' }, '<0.1')
      .to('.pre__count', { opacity: 0, duration: 0.3 }, '<')
      .to(root.current, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '>-0.15')
  }, { scope: root, dependencies: [done] })

  if (done) return null

  const word = setting('site_name', 'ReuseHub').toUpperCase()
  // Fall back to flat colour cards until (or unless) real photos arrive.
  const cards = photos.length ? photos : ['accent', 'paper', 'ink', 'accent', 'paper']

  return (
    <div className="pre" ref={root} aria-hidden="true">
      <div className="pre__word">
        {[...word].map((ch, i) => (
          <span className="pre__mask" key={i}><span className="pre__char">{ch}</span></span>
        ))}
        <span className="pre__count" ref={counter}>000</span>
        <div className="pre__stack">
          {cards.map((c, i) =>
            ['accent', 'paper', 'ink'].includes(c)
              ? <div key={i} className={`pre__card pre__card--${c}`} />
              : <img key={i} className="pre__card" src={c} alt="" />,
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
   Cursor — a red dot that eases after the pointer and grows into a label
   over anything marked data-cursor="…".
   ------------------------------------------------------------------------- */
export function Cursor() {
  const ref = useRef(null)
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || reducedMotion()) return
    const el = ref.current
    let x = -100, y = -100, cx = x, cy = y, raf

    const move = (e) => {
      x = e.clientX
      y = e.clientY
      el.classList.add('is-on')
      setLabel(e.target.closest?.('[data-cursor]')?.dataset.cursor || '')
    }
    const leave = () => el.classList.remove('is-on')
    const loop = () => {
      cx += (x - cx) * 0.18
      cy += (y - cy) * 0.18
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('mousemove', move, { passive: true })
    document.addEventListener('mouseleave', leave)
    loop()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', move)
      document.removeEventListener('mouseleave', leave)
    }
  }, [])

  return (
    <div ref={ref} className={`cursor ${label ? 'is-big' : ''}`} aria-hidden="true">
      <span className="cursor__label">{label}</span>
    </div>
  )
}

/* -------------------------------------------------------------------------
   Route curtain — a black panel carrying the wordmark wipes up on every
   page change; also resets scroll so the new page starts at the top.
   ------------------------------------------------------------------------- */
export function RouteCurtain() {
  const { pathname } = useLocation()
  const { setting } = useConfig()
  // Compare against the last path (not a "first render" flag) so StrictMode's
  // double effect run doesn't fire the curtain on initial load.
  const prev = useRef(pathname)
  const [key, setKey] = useState(null)

  useEffect(() => {
    if (prev.current === pathname) return
    prev.current = pathname
    window.scrollTo(0, 0)
    if (!reducedMotion()) setKey(pathname)
  }, [pathname])

  if (!key) return null
  return (
    <motion.div
      key={key}
      className="curtain"
      initial={{ y: '0%' }}
      animate={{ y: '-100%' }}
      transition={{ duration: 0.75, delay: 0.25, ease: [0.7, 0, 0.2, 1] }}
      onAnimationComplete={() => setKey(null)}
      aria-hidden="true"
    >
      <span className="curtain__word">{setting('site_name', 'ReuseHub').toUpperCase()}<sup>®</sup></span>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------
   Ticker — the small looping pill pinned bottom-left.
   ------------------------------------------------------------------------- */
export function Ticker() {
  const { setting } = useConfig()
  const text = `${setting('site_name', 'ReuseHub')} — ${setting('tagline', 'Give your things a second life')} — free, local, reused — `
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker__track">
        <span>{text}</span>
        <span>{text}</span>
      </div>
    </div>
  )
}
