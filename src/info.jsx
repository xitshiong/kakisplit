import React from 'react'
import ReactDOM from 'react-dom/client'
import { ReceiptTransform } from './components/ReceiptTransform'
import './index.css'

const STEPS = [
  {
    num: '01',
    title: 'Snap the receipt',
    body: 'Host takes one photo. KakiSplit reads the receipt and turns every line into editable items.',
  },
  {
    num: '02',
    title: 'Share the code',
    body: 'Friends join with a four-digit table code. No guest account or group-chat spreadsheet needed.',
  },
  {
    num: '03',
    title: 'Pay exact share',
    body: 'Everyone taps their food, scans your payment QR, and marks paid when they settle up.',
  },
]

const RECEIPT_LINES = [
  ['AI receipt scan', 'Gemini reads messy bills'],
  ['Guest mode', 'No signup needed'],
  ['Shared dishes', 'Split fairly by headcount'],
  ['QR payments', 'DuitNow, TNG, bank QR'],
]

function InfoPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=DM+Mono:wght@400;500&display=swap');

        :root {
          --ink: #120a04;
          --ink-2: #1a0d07;
          --paper: #f8f0e4;
          --paper-muted: rgba(248,240,228,0.62);
          --pink: #ff0a85;
          --lime: #a6ff00;
          --lime-soft: #c8ff36;
          --cyan: #00ffd1;
          --receipt: #f7f1e8;
          --receipt-ink: #21160c;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        html { scroll-behavior: smooth; }

        body {
          font-family: 'DM Mono', monospace;
          color: var(--paper);
          background: var(--ink);
          overflow-x: hidden;
          -webkit-text-size-adjust: 100%;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        body::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 70% 42% at 78% 18%, rgba(255,10,133,0.18) 0%, transparent 58%),
            radial-gradient(ellipse 58% 48% at 18% 74%, rgba(166,255,0,0.11) 0%, transparent 60%),
            linear-gradient(180deg, #120905 0%, #170a06 54%, #100902 100%);
        }

        body::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          opacity: 0.32;
          background-image:
            radial-gradient(circle, rgba(248,240,228,0.09) 0.7px, transparent 0.7px),
            linear-gradient(rgba(255,255,255,0.015), rgba(255,255,255,0));
          background-size: 22px 22px, 100% 100%;
          mix-blend-mode: screen;
        }

        .page {
          position: relative;
          z-index: 2;
        }

        .topbar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: max(18px, env(safe-area-inset-top, 0px)) max(20px, env(safe-area-inset-right, 0px)) 16px max(20px, env(safe-area-inset-left, 0px));
          pointer-events: none;
        }

        .brand-mark,
        .open-app {
          pointer-events: auto;
        }

        .brand-mark {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          text-decoration: none;
        }

        .brand-mark img {
          width: 54px;
          height: auto;
          filter: drop-shadow(0 0 12px rgba(255,10,133,0.28));
        }

        .open-app {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 22px;
          border: 1px solid rgba(248,240,228,0.32);
          color: var(--paper);
          text-decoration: none;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.72rem;
          background: rgba(18,10,4,0.28);
          transition: transform 700ms cubic-bezier(0.32,0.72,0,1), border-color 700ms cubic-bezier(0.32,0.72,0,1), background 700ms cubic-bezier(0.32,0.72,0,1);
        }

        .open-app:hover { border-color: rgba(166,255,0,0.8); background: rgba(166,255,0,0.08); }
        .open-app:active { transform: scale(0.98); }
        .open-app:focus-visible,
        .btn-primary:focus-visible,
        .footer-link:focus-visible { outline: 2px solid var(--lime); outline-offset: 4px; }

        .hero {
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: max(92px, calc(env(safe-area-inset-top, 0px) + 80px)) max(22px, env(safe-area-inset-right, 0px)) max(42px, env(safe-area-inset-bottom, 0px)) max(22px, env(safe-area-inset-left, 0px));
          overflow: hidden;
        }

        .hero-inner {
          width: min(100%, 1100px);
          display: grid;
          grid-template-columns: 1fr 0.95fr;
          gap: clamp(40px, 6vw, 84px);
          align-items: center;
          text-align: left;
        }

        .hero-pitch { min-width: 0; }

        .hero-kicker {
          color: var(--lime-soft);
          font-size: 0.66rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-bottom: clamp(22px, 4vw, 34px);
          text-shadow: 0 0 20px rgba(166,255,0,0.28);
          animation: rise-in 900ms 80ms cubic-bezier(0.32,0.72,0,1) both;
        }

        .hero-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 900;
          font-size: clamp(7rem, 12vw, 10.5rem);
          line-height: 0.82;
          letter-spacing: -0.035em;
          text-transform: uppercase;
          margin-bottom: clamp(24px, 5vw, 40px);
          text-wrap: balance;
          animation: rise-in 950ms 150ms cubic-bezier(0.32,0.72,0,1) both;
        }

        .hero-title-line {
          display: block;
          position: relative;
        }

        .hero-title-line.split { color: var(--paper); text-shadow: 0 12px 42px rgba(0,0,0,0.5); }
        .hero-title-line.bills { color: var(--lime); text-shadow: 0 0 26px rgba(166,255,0,0.22); }
        .hero-title-line.lah { color: var(--pink); text-shadow: 0 0 28px rgba(255,10,133,0.22); }

        .hero-copy {
          max-width: 50ch;
          color: var(--paper-muted);
          font-size: clamp(0.85rem, 1.2vw, 1rem);
          line-height: 1.65;
          margin-bottom: clamp(28px, 6vw, 42px);
          text-wrap: balance;
          animation: rise-in 950ms 230ms cubic-bezier(0.32,0.72,0,1) both;
        }

        .btn-primary {
          position: relative;
          display: inline-flex;
          min-height: clamp(60px, 9.8vw, 76px);
          min-width: min(100%, 380px);
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          padding: 0 clamp(2rem, 7vw, 3.8rem);
          font-family: 'DM Mono', monospace;
          font-size: clamp(0.78rem, 2vw, 0.92rem);
          font-weight: 500;
          color: var(--ink);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-decoration: none;
          background-color: transparent;
          margin-bottom: clamp(46px, 8vw, 78px);
          animation: rise-in 950ms 310ms cubic-bezier(0.32,0.72,0,1) both;
        }

        .btn-primary-bg {
          overflow: hidden;
          border-radius: 999px;
          position: absolute;
          inset: 0;
          transform: scale(1);
          transition: transform 1.8s cubic-bezier(0.19, 1, 0.22, 1), box-shadow 1.8s cubic-bezier(0.19, 1, 0.22, 1);
          background: var(--lime);
          box-shadow: 0 0 42px rgba(166,255,0,0.24), inset 0 1px 0 rgba(255,255,255,0.35);
        }

        .btn-primary-bg-layers {
          position: absolute;
          left: 50%;
          top: -85%;
          aspect-ratio: 1 / 1;
          width: max(210%, 15rem);
          transform: translateX(-50%);
        }

        .btn-primary-bg-layer {
          border-radius: 9999px;
          position: absolute;
          inset: 0;
          transform: scale(0);
        }

        .btn-primary-bg-layer-1 { background-color: var(--pink); }
        .btn-primary-bg-layer-2 { background-color: var(--cyan); }
        .btn-primary-bg-layer-3 { background-color: var(--lime); }

        .btn-primary-inner {
          position: relative;
          pointer-events: none;
          display: block;
        }

        .btn-primary-inner-hover {
          position: absolute;
          top: 0;
          left: 0;
          opacity: 0;
          transform: translateY(70%);
          pointer-events: none;
          display: block;
        }

        .btn-primary-inner-static {
          pointer-events: none;
          display: block;
          transition: transform 1.4s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.3s linear;
        }

        .btn-primary:hover .btn-primary-bg { transform: scale(1.025); box-shadow: 0 0 58px rgba(166,255,0,0.35), inset 0 1px 0 rgba(255,255,255,0.42); }
        .btn-primary:active .btn-primary-bg { transform: scale(0.98); }
        .btn-primary:hover .btn-primary-inner-static { opacity: 0; transform: translateY(-70%); }
        .btn-primary:hover .btn-primary-inner-hover { opacity: 1; transform: translateY(0); transition: transform 1.4s cubic-bezier(0.19, 1, 0.22, 1), opacity 1.4s cubic-bezier(0.19, 1, 0.22, 1); }
        .btn-primary:hover .btn-primary-bg-layer { transition: transform 1.3s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.3s linear; }
        .btn-primary:hover .btn-primary-bg-layer-1 { transform: scale(1); }
        .btn-primary:hover .btn-primary-bg-layer-2 { transition-delay: 0.1s; transform: scale(1); }
        .btn-primary:hover .btn-primary-bg-layer-3 { transition-delay: 0.2s; transform: scale(1); }

        .hero-pitch .btn-primary { min-width: min(100%, 340px); margin-bottom: 0; }

        .section-how {
          position: relative;
          background: var(--lime);
          color: var(--ink);
          padding: clamp(64px, 12vw, 128px) max(22px, env(safe-area-inset-right, 0px)) clamp(70px, 13vw, 140px) max(22px, env(safe-area-inset-left, 0px));
          overflow: hidden;
        }

        .section-how::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.18;
          background-image: radial-gradient(circle, rgba(18,10,4,0.22) 0.8px, transparent 0.8px);
          background-size: 18px 18px;
        }

        .section-inner {
          position: relative;
          width: min(100%, 980px);
          margin: 0 auto;
        }

        .section-kicker {
          font-size: clamp(0.7rem, 2vw, 0.85rem);
          letter-spacing: 0.32em;
          text-transform: uppercase;
          text-align: center;
          color: rgba(18,10,4,0.54);
          margin-bottom: 16px;
        }

        .section-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 900;
          font-size: clamp(4.4rem, 16vw, 10rem);
          line-height: 0.82;
          letter-spacing: -0.035em;
          text-transform: uppercase;
          text-align: center;
          margin-bottom: clamp(38px, 7vw, 70px);
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .step-card {
          background: var(--receipt);
          color: var(--receipt-ink);
          padding: 28px 24px 24px;
          min-height: 230px;
          position: relative;
          box-shadow: 0 18px 52px rgba(18,10,4,0.18);
          transform: rotate(var(--tilt, 0deg));
        }

        .step-card:nth-child(1) { --tilt: -1.2deg; }
        .step-card:nth-child(2) { --tilt: 0.8deg; margin-top: 26px; }
        .step-card:nth-child(3) { --tilt: -0.5deg; }

        .step-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -8px;
          right: -8px;
          height: 14px;
          background: repeating-radial-gradient(circle at 50% 0, transparent 0, transparent 6px, var(--lime) 6px, var(--lime) 7px, transparent 7px) center top / 20px 14px no-repeat, var(--receipt);
        }

        .step-num {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 900;
          font-size: 3.6rem;
          line-height: 0.85;
          color: var(--pink);
          margin-bottom: 18px;
        }

        .step-card:nth-child(2) .step-num { color: var(--ink); }
        .step-card:nth-child(3) .step-num { color: #00a889; }

        .step-card h3 {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 1.8rem;
          line-height: 0.9;
          text-transform: uppercase;
          letter-spacing: -0.02em;
          margin-bottom: 12px;
        }

        .step-card p {
          color: rgba(33,22,12,0.68);
          font-size: 0.82rem;
          line-height: 1.55;
        }

        .section-dark {
          padding: clamp(72px, 12vw, 132px) max(22px, env(safe-area-inset-right, 0px)) clamp(80px, 13vw, 140px) max(22px, env(safe-area-inset-left, 0px));
          background:
            radial-gradient(ellipse 60% 40% at 70% 18%, rgba(255,10,133,0.12) 0%, transparent 60%),
            var(--ink-2);
        }

        .receipt-panel {
          width: min(100%, 760px);
          margin: 0 auto;
          background: var(--receipt);
          color: var(--receipt-ink);
          padding: clamp(26px, 5vw, 46px);
          position: relative;
          box-shadow: 0 30px 90px rgba(0,0,0,0.34);
        }

        .receipt-panel::before {
          content: '';
          position: absolute;
          top: 0;
          left: -8px;
          right: -8px;
          height: 14px;
          background: repeating-radial-gradient(circle at 50% 0, transparent 0, transparent 6px, var(--ink-2) 6px, var(--ink-2) 7px, transparent 7px) center top / 20px 14px no-repeat, var(--receipt);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 18px;
          border-bottom: 1px dashed rgba(33,22,12,0.32);
          margin-bottom: 16px;
          font-size: 0.72rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(33,22,12,0.58);
        }

        .receipt-line {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 16px 0;
          border-bottom: 1px dashed rgba(33,22,12,0.2);
        }

        .receipt-line-index {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 1.4rem;
          font-weight: 900;
          color: var(--pink);
        }

        .receipt-line strong {
          display: block;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 1.5rem;
          line-height: 0.95;
          text-transform: uppercase;
        }

        .receipt-line span {
          color: rgba(33,22,12,0.58);
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .receipt-check {
          width: 26px;
          height: 26px;
          border: 1.5px solid rgba(33,22,12,0.42);
          display: grid;
          place-items: center;
          color: var(--ink);
          font-size: 0.85rem;
        }

        .panel-total {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding-top: 20px;
          font-size: 0.8rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .panel-total strong {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 2.2rem;
          line-height: 0.9;
          color: var(--pink);
        }

        .final-cta {
          text-align: center;
          margin-top: clamp(52px, 8vw, 86px);
        }

        .final-cta h2 {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: clamp(4rem, 14vw, 8.4rem);
          line-height: 0.82;
          letter-spacing: -0.035em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }

        .final-cta h2 span { color: var(--pink); }

        .footer-link {
          color: rgba(248,240,228,0.5);
          text-decoration: none;
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        footer {
          text-align: center;
          padding: 28px max(20px, env(safe-area-inset-right, 0px)) max(32px, env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 0px));
          color: rgba(248,240,228,0.34);
          font-size: 0.68rem;
        }

        @keyframes rise-in {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 760px) {
          .topbar { padding-left: 18px; padding-right: 18px; }
          .open-app { padding: 0 18px; }
          .hero { align-items: start; padding-top: max(110px, calc(env(safe-area-inset-top, 0px) + 100px)); padding-bottom: 42px; }
          .hero-inner { grid-template-columns: 1fr; justify-items: center; gap: 44px; text-align: center; }
          .hero-pitch { width: min(100%, 460px); }
          .hero-title { font-size: clamp(4.65rem, 19vw, 7rem); margin-bottom: 24px; }
          .hero-title-line.bills, .hero-title-line.lah { display: inline; }
          .hero-copy { max-width: 36ch; margin-bottom: 26px; }
          .btn-primary { width: min(100%, 360px); margin-bottom: 32px; }
          .hero-copy { margin-inline: auto; }
          .steps { grid-template-columns: 1fr; gap: 18px; }
          .step-card { transform: none; min-height: auto; }
          .step-card:nth-child(2) { margin-top: 0; }
          .receipt-line { grid-template-columns: auto 1fr; }
          .receipt-check { display: none; }
        }

        @media (max-width: 420px) {
          .brand-mark img { width: 44px; }
          .open-app { font-size: 0.62rem; padding: 0 14px; }
          .hero-kicker { letter-spacing: 0.26em; margin-bottom: 18px; }
          .hero-title { font-size: clamp(4rem, 19vw, 5rem); }
          .hero-copy { font-size: 0.92rem; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <main className="page">
        <nav className="topbar" aria-label="Primary navigation">
          <a href="/" className="brand-mark" aria-label="KakiSplit home">
            <img src="/kakisplit-logo.png" alt="KakiSplit" />
          </a>
          <a href="/app" className="open-app">Open app</a>
        </nav>

        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-inner">
            <div className="hero-pitch">
              <p className="hero-kicker">Malaysian bill splitting, done right</p>
              <h1 className="hero-title" id="hero-title">
                <span className="hero-title-line split">Split</span>
                <span className="hero-title-line bills">Bills</span>{' '}
                <span className="hero-title-line lah">Lah.</span>
              </h1>

              <p className="hero-copy">
                Snap the receipt. Share a code. Everyone picks what they ordered and pays their share — no drama, no calculator, no awkward silence.
              </p>

              <a href="/app" className="btn-primary">
                <span className="btn-primary-bg">
                  <span className="btn-primary-bg-layers">
                    <span className="btn-primary-bg-layer btn-primary-bg-layer-1" />
                    <span className="btn-primary-bg-layer btn-primary-bg-layer-2" />
                    <span className="btn-primary-bg-layer btn-primary-bg-layer-3" />
                  </span>
                </span>
                <span className="btn-primary-inner">
                  <span className="btn-primary-inner-static">Start splitting</span>
                  <span className="btn-primary-inner-hover">Start splitting</span>
                </span>
              </a>

            </div>
            <ReceiptTransform />
          </div>
        </section>

        <section className="section-how">
          <div className="section-inner">
            <p className="section-kicker">Three steps, zero hassle</p>
            <h2 className="section-title">How it<br />works</h2>
            <div className="steps">
              {STEPS.map((step) => (
                <article className="step-card" key={step.num}>
                  <div className="step-num">{step.num}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section-dark">
          <div className="receipt-panel">
            <div className="panel-header">
              <span>KakiSplit receipt</span>
              <span>No drama</span>
            </div>
            {RECEIPT_LINES.map(([title, body], index) => (
              <div className="receipt-line" key={title}>
                <span className="receipt-line-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </div>
                <span className="receipt-check">✓</span>
              </div>
            ))}
            <div className="panel-total">
              <span>Total awkward maths</span>
              <strong>RM 0.00</strong>
            </div>
          </div>

          <div className="final-cta">
            <h2>Ready<br /><span>to split?</span></h2>
            <a href="/app" className="btn-primary">
              <span className="btn-primary-bg">
                <span className="btn-primary-bg-layers">
                  <span className="btn-primary-bg-layer btn-primary-bg-layer-1" />
                  <span className="btn-primary-bg-layer btn-primary-bg-layer-2" />
                  <span className="btn-primary-bg-layer btn-primary-bg-layer-3" />
                </span>
              </span>
              <span className="btn-primary-inner">
                <span className="btn-primary-inner-static">Open KakiSplit</span>
                <span className="btn-primary-inner-hover">Open KakiSplit</span>
              </span>
            </a>
            <div>
              <a href="/privacy.html" className="footer-link">Privacy policy</a>
            </div>
          </div>
        </section>

        <footer>© 2026 KakiSplit</footer>
      </main>
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <InfoPage />
  </React.StrictMode>,
)
