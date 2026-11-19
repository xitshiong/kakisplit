import { useEffect, useRef, useState } from 'react'
import './receipt-transform.css'

const ITEMS = [
  { name: 'Chicken tenders', detail: 'Twelve pieces', price: '25.50', kaki: 'Mei', color: 'pink', delay: '0s' },
  { name: 'Iced lemon tea', detail: 'Normal ice', price: '5.10', kaki: 'Afiq', color: 'cyan', delay: '0.9s' },
  { name: 'Onion rings', detail: 'For the table', price: '12.75', kaki: 'Jo', color: 'lime', delay: '1.8s' },
  { name: 'Cheese sauce', detail: 'The essential extra', price: '4.25', kaki: 'Mei', color: 'pink', delay: '1.4s' },
]

const KAKIS = [
  { name: 'Mei', color: 'pink', delay: '0s' },
  { name: 'Afiq', color: 'cyan', delay: '0.9s' },
  { name: 'Jo', color: 'lime', delay: '1.8s' },
]

function DemoCursor({ name, className = '', style }) {
  return (
    <span className={`demo-cursor ${className}`} style={style}>
      <svg width="19" height="23" viewBox="0 0 19 23" fill="none">
        <path d="M2 2L16 13L10 14L7 20L2 2Z" fill="currentColor" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span>{name}</span>
    </span>
  )
}

export function ReceiptTransform() {
  const root = useRef(null)
  const [inView, setInView] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    )
    if (observer) observer.observe(root.current)
    else setInView(true)
    const onVisibilityChange = () => setPageVisible(!document.hidden)
    onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return (
    <figure className="receipt-demo" ref={root} aria-labelledby="receipt-demo-caption">
      <div className="demo-heading">
        <span className="demo-live-dot" aria-hidden="true" />
        One receipt. Zero mental maths.
        <span className="demo-example">Demo</span>
      </div>

      <div className="demo-scene" key={run} data-running={inView && pageVisible && !paused} aria-hidden="true">
        <div className="demo-registration demo-registration-tl" />
        <div className="demo-registration demo-registration-br" />
        <div className="demo-side-note">PAPER IN. PEACE OUT.</div>

        <div className="demo-paper">
          <img src="/receipt.png" width="1080" height="1350" alt="" fetchpriority="high" />
        </div>

        <div className="demo-digital">
          <div className="demo-receipt-top">
            <img src="/kakisplit-logo.png" width="44" height="31" alt="" />
            <span className="demo-ready"><span>✓</span> Digitised</span>
          </div>
          <div className="demo-table">
            <span>Table #1 · charles</span>
            <strong>Good food.<br />Fair shares.</strong>
          </div>
          <div className="demo-items-label"><span>Your items</span><span>MYR</span></div>
          <div className="demo-items">
            {ITEMS.map((item, index) => (
              <div className={`demo-item demo-item-${index} demo-person-${item.color}`} key={item.name} style={{ '--claim-delay': item.delay }}>
                <span className="demo-item-check"><span>✓</span></span>
                <div>
                  <strong>{item.name}</strong>
                  <span className="demo-item-description">
                    <span className="demo-item-detail">{item.detail}</span>
                    <span className="demo-item-owner">{item.kaki}’s pick</span>
                  </span>
                </div>
                <b>{item.price}</b>
                <DemoCursor name={item.kaki} className="demo-pick-cursor" />
              </div>
            ))}
          </div>
          <div className="demo-tax"><span>SST + rounding</span><span>2.85</span></div>
          <div className="demo-total"><span>Receipt total</span><strong><small>RM</small> 50.45</strong></div>
          <div className="demo-share">
            <span className="demo-share-pick">Pick what you ordered <span>↗</span></span>
            <span className="demo-share-pay">Pay Charles, the host <span>↗</span></span>
            <span className="demo-share-paid">Everyone marked paid <span>✓</span></span>
            {KAKIS.map((kaki, index) => (
              <DemoCursor key={kaki.name} name={kaki.name} className={`demo-pay-cursor demo-person-${kaki.color}`} style={{ '--pay-delay': kaki.delay, '--cursor-x': `${34 + index * 70}px` }} />
            ))}
          </div>
        </div>

        <div className="demo-kakis">
          {KAKIS.map((kaki) => (
            <div className={`demo-kaki demo-person-${kaki.color}`} key={kaki.name} style={{ '--pay-delay': kaki.delay }}>
              <span className="demo-avatar">{kaki.name[0]}</span>
              <div><strong>{kaki.name}</strong><span className="demo-kaki-status"><span className="demo-kaki-picking">Picking items</span><span className="demo-kaki-paid">Marked paid ✓</span></span></div>
            </div>
          ))}
        </div>
        <div className="demo-scan-track"><div className="demo-scan-line"><span>Reading the receipt</span></div></div>
        <div className="demo-stamp">All settled. <strong>No drama.</strong></div>
        <div className="demo-stage-labels">
          <span className="demo-label-paper">01 / The dinner evidence</span>
          <span className="demo-label-scan">02 / A little KakiSplit magic</span>
          <span className="demo-label-digital">03 / Every item, ready to split</span>
          <span className="demo-label-pick">04 / Your kakis pick their food</span>
          <span className="demo-label-pay">05 / Everyone pays the host</span>
        </div>
      </div>

      <figcaption id="receipt-demo-caption">Snap. Pick. Pay the host.<br /><span>Mei, Afiq and Jo pick their items, then mark paid.</span></figcaption>
      <div className="demo-controls">
        <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play receipt animation' : 'Pause receipt animation'}>
          <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span> {paused ? 'Play' : 'Pause'}
        </button>
        <button type="button" onClick={() => { setRun((value) => value + 1); setPaused(false) }}>
          <span aria-hidden="true">↻</span> Replay
        </button>
      </div>
      <p className="demo-reduced-note">Static preview · reduced motion</p>
    </figure>
  )
}
