import { useEffect, useRef, useState } from 'react'
import './receipt-transform.css'

const ITEMS = [
  { name: 'Chicken tenders', detail: 'Twelve pieces', price: '25.50' },
  { name: 'Iced lemon tea', detail: 'Normal ice', price: '5.10' },
  { name: 'Onion rings', detail: 'For the table', price: '12.75' },
  { name: 'Cheese sauce', detail: 'The essential extra', price: '4.25' },
]

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
          <img src="/receipt.png" width="1080" height="1350" alt="" fetchPriority="high" />
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
              <div className={`demo-item demo-item-${index}`} key={item.name}>
                <span className="demo-item-check">✓</span>
                <div><strong>{item.name}</strong><span>{item.detail}</span></div>
                <b>{item.price}</b>
              </div>
            ))}
          </div>
          <div className="demo-tax"><span>SST + rounding</span><span>2.85</span></div>
          <div className="demo-total"><span>Receipt total</span><strong><small>RM</small> 50.45</strong></div>
          <div className="demo-share"><span>Ready for your kakis</span><span>↗</span></div>
        </div>

        <div className="demo-scan-track"><div className="demo-scan-line"><span>Reading the receipt</span></div></div>
        <div className="demo-stamp">Same bill.<br /><strong>No drama.</strong></div>
        <div className="demo-stage-labels">
          <span className="demo-label-paper">01 / The dinner evidence</span>
          <span className="demo-label-scan">02 / A little KakiSplit magic</span>
          <span className="demo-label-digital">03 / Every item, ready to split</span>
        </div>
      </div>

      <figcaption id="receipt-demo-caption">From a paper bill to editable items.<br /><span>Just snap. We’ll take it from here.</span></figcaption>
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
