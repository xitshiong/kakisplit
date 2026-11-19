import { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@supabase/supabase-js";
import { Analytics } from "@vercel/analytics/react"
import { scanReceipt, scanReceiptBatch } from "./lib/receiptOcr.js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    global: {
      fetch: (...args) => fetch(...args),
    },
  }
);

const LOGO_SRC = "/kakisplit-logo.png";

// ── DESIGN SYSTEM ─────────────────────────────────────────────
// Thermal Receipt × Night Market Neon
// Cream paper bg, dark ink type, electric neon accents
// Fonts: Barlow Condensed (display), DM Sans (reading), DM Mono (data)

const css = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

:root {
  --paper: #F5F0E8;
  --paper-dark: #EDE8DC;
  --ink: #1A1208;
  --ink-light: #4A3F2F;
  --ink-faint: #8C7B65;
  --neon-pink: #FF2D7A;
  --neon-lime: #B8FF00;
  --neon-cyan: #00FFD1;
  --neon-orange: #FF6B1A;
  --receipt-shadow: 0 4px 40px rgba(26,18,8,0.15), 0 1px 0 rgba(26,18,8,0.05);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'DM Sans', sans-serif;
  background: var(--ink);
  min-height: 100vh;
  overflow-x: hidden;
  -webkit-text-size-adjust: 100%;
  touch-action: manipulation;
}

/* Night market background */
.bg {
  position: fixed; inset: 0; z-index: 0;
  background:
    radial-gradient(ellipse 60% 40% at 20% 20%, rgba(255,45,122,0.12) 0%, transparent 60%),
    radial-gradient(ellipse 50% 60% at 80% 70%, rgba(0,255,209,0.08) 0%, transparent 60%),
    radial-gradient(ellipse 80% 50% at 50% 50%, rgba(184,255,0,0.04) 0%, transparent 70%),
    var(--ink);
}

/* Floating receipt dots pattern */
.bg::after {
  content: '';
  position: absolute; inset: 0;
  background-image: radial-gradient(circle, rgba(245,240,232,0.03) 1px, transparent 1px);
  background-size: 24px 24px;
}

.app {
  position: relative; z-index: 1;
  max-width: 420px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 16px 16px calc(100px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── RECEIPT CARD ── */
.receipt {
  background: var(--paper);
  border-radius: 4px;
  box-shadow: var(--receipt-shadow);
  position: relative;
  overflow: hidden;
}

/* Perforated top edge */
.receipt::before {
  content: '';
  position: absolute;
  top: 0; left: -8px; right: -8px;
  height: 16px;
  background: repeating-radial-gradient(circle at 50% 0, transparent 0, transparent 6px, var(--ink) 6px, var(--ink) 7px, transparent 7px) center top / 20px 16px no-repeat,
    var(--paper);
  border-radius: 0 0 4px 4px;
}

.receipt-inner { padding: 28px 24px 24px; }

/* ── NEW AUTH & PROFILE STYLES ── */
.top-nav { display: flex; justify-content: flex-end; padding: 16px 20px; position: absolute; top: 0; right: 0; width: 100%; z-index: 10; pointer-events: none; }
.login-pill, .user-chip { pointer-events: auto; }
.login-pill { background: rgba(26, 18, 8, 0.4); backdrop-filter: blur(8px); border: 1.5px solid var(--ink-faint); color: var(--paper); padding: 6px 14px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; cursor: pointer; }
.user-chip { display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--paper); padding: 4px 12px 4px 4px; border-radius: 20px; cursor: pointer; transition: transform 0.2s; border: 1.5px solid var(--ink-faint); }
.user-chip:active { transform: scale(0.95); }
.user-avatar { width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--neon-lime); object-fit: cover; background: var(--paper-dark); color: transparent; }
.user-name { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.5px; }
.profile-hero { text-align: center; padding: 40px 20px 20px; border-bottom: 1px dashed var(--ink-faint); margin-bottom: 24px; }
.profile-large-avatar { width: 100px; height: 100px; border-radius: 50%; border: 3px solid var(--neon-lime); margin-bottom: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); object-fit: cover; background: var(--paper-dark); color: transparent; }
.profile-name { font-family: 'DM Mono', monospace; font-size: 1.3rem; font-weight: 900; color: var(--ink); margin-bottom: 4px; letter-spacing: -0.5px; }
.profile-email { font-size: 0.7rem; color: var(--ink-faint); letter-spacing: 1px; text-transform: uppercase; }
.vault-card { background: var(--paper-dark); border: 2px dashed var(--ink-faint); border-radius: 12px; padding: 24px; margin-top: 10px; }
.vault-title { font-family: 'DM Mono', monospace; font-size: 0.9rem; font-weight: 800; color: var(--ink); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.vault-desc { font-size: 0.68rem; color: var(--ink-light); line-height: 1.5; margin-bottom: 20px; opacity: 0.8; }
.vault-qr-area { width: 100%; aspect-ratio: 1; border: 1.5px solid var(--ink); border-radius: 12px; overflow: hidden; position: relative; cursor: pointer; background: white; box-shadow: inset 0 2px 10px rgba(0,0,0,0.05); }
.vault-qr-placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--ink-faint); gap: 12px; }
.vault-qr-placeholder span { font-size: 2.5rem; filter: grayscale(1); }
.vault-qr-preview { width: 100%; height: 100%; object-fit: contain; padding: 20px; }
.welcome-tag { font-family: 'DM Sans', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--ink-light); margin-top: 16px; animation: slideUp 0.6s cubic-bezier(0.23, 1, 0.32, 1); }
@keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

/* ── HEADER ── */
.header-receipt {
  text-align: center;
  padding: 28px 24px 20px;
  border-bottom: 1px dashed var(--ink-faint);
  margin-bottom: 0;
  position: relative;
}

.logo-img {
  height: 64px;
  width: auto;
  display: block;
  margin: 0 auto;
}

.logo-tagline {
  font-family: 'DM Mono', monospace;
  font-size: 0.6rem;
  color: var(--ink-faint);
  letter-spacing: 3px;
  text-transform: uppercase;
  margin-top: 6px;
}

.badge-strip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  background: var(--ink);
  color: var(--neon-lime);
  font-family: 'DM Mono', monospace;
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 5px 12px;
  border-radius: 2px;
}

.badge-strip.guest-badge { color: var(--neon-cyan); }

/* ── STEP BAR ── */
.step-bar {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px dashed var(--ink-faint);
  gap: 0;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 5px;
  position: relative;
}

.step-item::after {
  content: '- - -';
  position: absolute;
  right: -24px;
  top: 12px;
  font-size: 0.5rem;
  color: var(--ink-faint);
  letter-spacing: -2px;
}

.step-item:last-child::after { display: none; }

.step-num {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1.5px solid var(--ink-faint);
  color: var(--ink-faint);
  transition: all 0.3s;
}

.step-num.active { background: var(--ink); color: var(--neon-lime); border-color: var(--ink); }
.step-num.done { background: var(--neon-lime); color: var(--ink); border-color: var(--neon-lime); }

.step-label {
  font-size: 0.55rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--ink-faint);
  transition: color 0.3s;
  text-align: center;
  line-height: 1.2;
}

.step-item .step-num.active ~ .step-label { color: var(--ink); }
.step-item .step-num.done ~ .step-label { color: var(--ink-light); }

/* ── CONTENT ── */
.section { padding: 22px 24px; border-bottom: 1px dashed var(--ink-faint); }
.section:last-child { border-bottom: none; }

.section-head {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--ink);
  margin-bottom: 6px;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.section-sub {
  font-size: 0.94rem;
  color: var(--ink-faint);
  line-height: 1.55;
  margin-bottom: 20px;
}

/* ── UPLOAD ZONE ── */
.upload-zone {
  border: 2px dashed var(--ink-faint);
  border-radius: 4px;
  padding: 48px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--paper-dark);
  position: relative;
  overflow: hidden;
}

.upload-zone:hover, .upload-zone.drag {
  border-color: var(--neon-pink);
  background: rgba(255,45,122,0.04);
}

.upload-zone input { display: none; }

.upload-emoji { font-size: 3rem; display: block; margin-bottom: 12px; }

.upload-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 6px;
}

.currency-selector-row { display: flex; gap: 8px; justify-content: center; margin-bottom: 24px; flex-wrap: wrap; }
.currency-chip { 
  background: var(--paper-dark); border: 1.5px solid var(--ink-faint); padding: 8px 16px; border-radius: 6px;
  font-family: 'DM Mono', monospace; font-size: 0.8rem; color: var(--ink-light); cursor: pointer; transition: 0.2s;
}
.currency-chip:hover { border-color: var(--ink); color: var(--ink); }
.currency-chip.active { background: var(--ink); color: var(--neon-lime); border-color: var(--ink); transform: scale(1.05); font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

.upload-hint { font-size: 0.875rem; color: var(--ink-faint); line-height: 1.5; }

.preview-img {
  width: 100%;
  border-radius: 4px;
  margin-bottom: 16px;
  max-height: 240px;
  object-fit: contain;
  border: 1px solid var(--ink-faint);
}

/* ── SPINNER ── */
.loading-receipt {
  padding: 40px 20px;
  text-align: center;
}

.spinner {
  width: 44px; height: 44px;
  border: 3px solid var(--ink-faint);
  border-top-color: var(--neon-pink);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.loading-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.1rem;
  font-style: italic;
  color: var(--ink);
  margin-bottom: 6px;
}
.loading-sub { font-size: 0.75rem; color: var(--ink-faint); letter-spacing: 1px; text-transform: uppercase; }

/* ── ERROR ── */
.error-strip {
  background: rgba(255,45,122,0.08);
  border-left: 3px solid var(--neon-pink);
  border-radius: 0 4px 4px 0;
  padding: 14px 16px;
  font-size: 0.82rem;
  color: var(--accent-ink);
  margin-bottom: 16px;
  line-height: 1.6;
}

/* ── BUTTONS ── */
.btn {
  width: 100%;
  padding: 18px 20px;
  border: none;
  border-radius: 3px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
  display: block;
  min-height: 56px;
}

.btn:active { transform: scale(0.98); }

.btn-ink {
  background: var(--ink);
  color: var(--neon-lime);
}
.btn-ink:hover { background: #2a1f0f; }
.btn-ink:disabled { background: var(--ink-faint); color: var(--paper-dark); cursor: not-allowed; transform: none; }

.btn-outline {
  background: transparent;
  color: var(--ink-light);
  border: 1.5px solid var(--ink-faint);
  margin-top: 10px;
}
.btn-outline:hover { border-color: var(--ink); color: var(--ink); }

.btn-neon {
  background: var(--neon-pink);
  color: var(--paper);
  font-weight: 500;
}
.btn-neon:hover { background: #e02068; }

/* ── LINE ITEMS ── */
.line-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px dotted var(--ink-faint);
  min-height: 56px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.line-item:last-of-type { border-bottom: none; }

.line-item.host-selectable {
  cursor: pointer;
  padding: 14px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  border: 2px solid transparent;
}

.line-item.host-selectable:hover {
  background: rgba(184, 255, 0, 0.1);
}

.line-item.host-selected {
  background: var(--neon-lime);
  border-color: var(--ink);
  opacity: 1;
}

.line-item.host-unselected {
  opacity: 1;
}

.item-name-in {
  flex: 1;
  font-family: 'DM Sans', sans-serif;
  font-size: 1rem;
  color: var(--ink);
  background: transparent;
  border: none;
  outline: none;
  font-weight: 500;
  min-height: 44px;
  min-width: 0;
  padding: 4px 0;
}

.item-price-in {
  font-family: 'DM Mono', monospace;
  font-size: 1rem;
  font-weight: 500;
  color: var(--ink);
  background: rgba(26,18,8,0.06);
  border: none;
  outline: none;
  border-radius: 3px;
  padding: 10px 10px;
  width: 88px;
  text-align: right;
  min-height: 44px;
  -moz-appearance: textfield;
}

.item-price-in::-webkit-outer-spin-button,
.item-price-in::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.rm-tag { font-size: 0.78rem; color: var(--ink-faint); flex-shrink: 0; }

.del-btn {
  background: rgba(255,45,122,0.06);
  border: none;
  color: var(--ink-faint);
  cursor: pointer;
  font-size: 1.2rem;
  width: 44px; height: 44px;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.del-btn:hover { color: var(--neon-pink); background: rgba(255,45,122,0.12); }

.add-line-btn {
  display: flex; align-items: center; gap: 10px;
  background: transparent;
  border: 1.5px dashed var(--ink-faint);
  border-radius: 3px;
  padding: 16px 14px;
  cursor: pointer; transition: all 0.2s;
  color: var(--ink-faint);
  font-family: 'DM Mono', monospace;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
  width: 100%; margin-top: 12px;
  min-height: 52px;
}
.add-line-btn:hover { border-color: var(--neon-pink); color: var(--neon-pink); }

/* ── TOTALS TABLE ── */
.totals-table { width: 100%; }
.total-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0;
  font-size: 0.82rem;
  border-bottom: 1px dotted var(--ink-faint);
  color: var(--ink-light);
}
.total-row:last-child { border-bottom: none; }
.total-val { font-weight: 500; color: var(--ink); }

.total-row.grand {
  padding-top: 14px;
  margin-top: 4px;
  border-top: 2px solid var(--ink);
  border-bottom: none;
}
.total-row.grand .total-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
}
.total-row.grand .total-val {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--ink);
}

.tax-in {
  font-family: 'DM Mono', monospace;
  font-size: 0.85rem;
  color: var(--ink);
  background: rgba(26,18,8,0.06);
  border: none; outline: none;
  border-radius: 3px;
  padding: 10px 10px;
  width: 88px; text-align: right;
  min-height: 44px;
}

/* ── QR UPLOAD ── */
.qr-zone {
  border: 2px dashed var(--ink-faint);
  border-radius: 4px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--paper-dark);
}
.qr-zone:hover { border-color: var(--neon-cyan); }
.qr-zone input { display: none; }

.qr-preview {
  width: 180px; height: 180px;
  border-radius: 4px;
  object-fit: contain;
  display: block; margin: 0 auto 16px;
  border: 1.5px solid var(--ink-faint);
}

/* ── SHARE BOX ── */
.share-receipt {
  background: var(--ink);
  border-radius: 4px;
  padding: 24px 20px;
  text-align: center;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
}

.share-receipt::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% 50%, rgba(184,255,0,0.08) 0%, transparent 70%);
}

.share-code {
  font-family: 'DM Mono', monospace;
  font-size: 2.4rem;
  font-weight: 900;
  color: var(--neon-lime);
  letter-spacing: 8px;
  margin: 14px 0;
  position: relative;
}

.share-code-label {
  font-size: 0.75rem;
  color: var(--on-dark-muted);
  letter-spacing: 3px;
  text-transform: uppercase;
}

.share-url-box {
  background: rgba(245,240,232,0.06);
  border-radius: 3px;
  padding: 14px;
  font-size: 0.875rem;
  color: var(--on-dark-muted);
  word-break: break-all;
  margin: 14px 0 6px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
  min-height: 48px;
  display: flex; align-items: center; justify-content: center;
}
.share-url-box:hover { background: rgba(245,240,232,0.1); }
.share-hint { font-size: 0.8rem; color: var(--on-dark-muted); line-height: 1.5; }

/* ── MODE SELECT ── */
.mode-grid { display: flex; gap: 12px; }

.mode-card {
  flex: 1;
  background: var(--paper-dark);
  border: 1.5px solid var(--ink-faint);
  border-radius: 4px;
  padding: 28px 14px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  min-height: 140px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.mode-card:hover { border-color: var(--ink); background: var(--paper); transform: translateY(-2px); }
.mode-card:active { transform: translateY(0); }

.mode-emoji { font-size: 2.4rem; display: block; margin-bottom: 12px; }

.mode-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 6px;
}
.mode-desc { font-size: 0.72rem; color: var(--ink-faint); line-height: 1.5; }

/* ── GUEST ITEMS ── */
.guest-item {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 60px;
  opacity: 1;
  width: 100%;
  font: inherit;
  text-align: left;
  color: var(--ink);
}
.guest-item:last-of-type { border-bottom: none; }
.guest-item:active { opacity: 1; }
.guest-item:hover { background: rgba(184, 255, 0, 0.1); }

.g-check {
  width: 28px; height: 28px;
  border-radius: 4px;
  border: 2px solid var(--ink-faint);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem;
  transition: all 0.15s;
  flex-shrink: 0;
  background: transparent;
}

.guest-item.sel {
  background: var(--neon-lime);
  border-color: var(--ink);
  opacity: 1;
}

.guest-item.sel .g-check {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--neon-lime);
}

.g-name {
  flex: 1;
  font-family: 'DM Sans', sans-serif;
  font-size: 1rem;
  color: var(--ink);
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.g-price {
  font-family: 'DM Mono', monospace;
  font-size: 0.9rem;
  color: var(--ink-light);
  font-weight: 500;
  white-space: nowrap;
}

.guest-item.sel .g-name { color: var(--ink); }
.guest-item.sel .g-price { color: var(--ink); }

/* ── STICKY TOTAL ── */
.sticky-total {
  position: fixed;
  bottom: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 420px;
  background: var(--ink);
  padding: 16px 20px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px;
  z-index: 50;
  min-height: 72px;
}

.sticky-total::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--neon-pink), transparent);
}

.sticky-label { font-size: 0.75rem; color: var(--on-dark-muted); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
.sticky-amt {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.7rem;
  font-weight: 900;
  color: var(--neon-lime);
  line-height: 1;
}

.sticky-pay-btn {
  background: var(--accent-fill);
  color: white;
  border: none;
  border-radius: 999px;
  padding: 16px 22px;
  font-family: 'DM Mono', monospace;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  min-height: 52px;
}
.sticky-pay-btn:disabled { background: var(--ink-faint); color: var(--paper-dark); cursor: not-allowed; }
.sticky-pay-btn:not(:disabled):hover { background: var(--accent-ink); }

/* ── QR MODAL ── */
.qr-modal {
  position: fixed; inset: 0;
  background: rgba(26,18,8,0.92);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; padding: 24px;
  backdrop-filter: blur(4px);
}

.qr-modal-inner {
  background: var(--paper);
  border-radius: 18px;
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  width: 100%; max-width: 340px;
  text-align: center;
  overflow: hidden;
}

.qr-modal-top {
  padding: 24px 24px 16px;
  border-bottom: 1px dashed var(--ink-faint);
}

.qr-modal-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.4rem;
  font-weight: 900;
  color: var(--ink);
  margin-bottom: 4px;
}

.qr-modal-sub { font-size: 0.75rem; color: var(--ink-faint); letter-spacing: 1px; text-transform: uppercase; }

.qr-modal-amt {
  font-family: 'DM Mono', monospace;
  font-size: 2.2rem;
  font-weight: 900;
  color: var(--accent-ink);
  padding: 20px 16px;
  border-bottom: 1px dashed var(--ink-faint);
}

.qr-img-wrap { padding: 24px; border-bottom: 1px dashed var(--ink-faint); }
.qr-img { width: 210px; height: 210px; border-radius: 4px; object-fit: contain; margin: 0 auto; display: block; }

.qr-modal-close {
  display: block; width: 100%;
  background: var(--ink); color: var(--neon-lime);
  border: none; padding: 20px;
  font-family: 'DM Mono', monospace;
  font-size: 0.82rem; letter-spacing: 2px;
  text-transform: uppercase; cursor: pointer;
  transition: background 0.15s;
  min-height: 60px;
}
.qr-modal-close:hover { background: #2a1f0f; }

/* ── NAME INPUT ── */
.name-in {
  width: 100%;
  background: var(--paper-dark);
  border: 1.5px solid var(--ink-faint);
  border-radius: 3px;
  padding: 18px 16px;
  font-family: 'DM Sans', sans-serif;
  font-size: 1rem;
  color: var(--ink);
  outline: none;
  margin-bottom: 14px;
  transition: border-color 0.2s;
  min-height: 56px;
}
.name-in:focus { border-color: var(--neon-pink); }
.name-in::placeholder { color: var(--ink-faint); }

/* ── SUCCESS ── */
.success-mark { font-size: 3.5rem; display: block; margin-bottom: 16px; text-align: center; }

/* ── NEON ACCENTS ── */
.neon-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--neon-pink) 40%, var(--neon-lime) 60%, transparent);
  opacity: 0.3;
  margin: 4px 0;
}

.bill-summary-row {
  display: flex; justify-content: space-between;
  padding: 10px 0;
  font-size: 0.82rem;
  border-bottom: 1px dotted var(--ink-faint);
  color: var(--ink-light);
}
.bill-summary-row:last-child { border-bottom: none; }
.bill-summary-val { font-weight: 500; color: var(--ink); }
.bill-summary-row.highlight .bill-summary-val { color: var(--neon-pink); font-weight: 500; }

/* ── PAID ITEM STYLES ── */
.line-item.paid {
  opacity: 1;
}
.paid-tag {
  font-size: 0.62rem;
  color: var(--ink-light);
  background: rgba(184,255,0,0.12);
  border: 1px solid rgba(184,255,0,0.25);
  border-radius: 3px;
  padding: 3px 8px;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
}
.guest-item.paid-item {
  opacity: 1;
  pointer-events: none;
}
.guest-paid-tag {
  font-size: 0.65rem;
  color: var(--ink-faint);
  font-style: italic;
  flex-shrink: 0;
}

/* ── NOTIFICATIONS & ALERTS ── */
.notify-banner {
  background: var(--ink);
  color: var(--neon-cyan);
  padding: 12px 16px;
  font-family: 'DM Mono', monospace;
  font-size: 0.72rem;
  display: flex;
  align-items: center; justify-content: space-between;
  border-bottom: 2px solid var(--neon-cyan);
  position: sticky; top: 0; z-index: 100;
  animation: slide-down 0.3s ease;
}

@keyframes slide-down {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}

.pending-alert {
  background: rgba(255, 107, 26, 0.1);
  border: 1px dashed var(--neon-orange);
  border-radius: 4px;
  padding: 14px;
  margin-bottom: 20px;
  display: flex;
  align-items: center; gap: 12px;
}

.pending-title {
  color: var(--warning-ink);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.pending-desc {
  font-size: 0.7rem;
  color: var(--ink-light);
  line-height: 1.4;
}

.btn-notify-perm {
  background: transparent;
  border: 1px solid var(--neon-cyan);
  color: var(--neon-cyan);
  padding: 6px 12px;
  border-radius: 3px;
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-notify-perm:hover {
  background: var(--neon-cyan);
  color: var(--ink);
}

/* ── UNDO TOAST ── */
.undo-toast {
  position: fixed;
  bottom: calc(88px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
  background: var(--ink);
  border: 1px solid rgba(184,255,0,0.2);
  border-radius: 3px;
  padding: 14px 18px;
  display: flex; align-items: center; gap: 16px;
  z-index: 200;
  animation: toast-in 0.2s ease;
  max-width: calc(100vw - 32px);
  flex-wrap: wrap;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.toast-msg {
  font-family: 'DM Mono', monospace;
  font-size: 0.78rem;
  color: rgba(245,240,232,0.7);
  letter-spacing: 0.5px;
}

.toast-undo {
  font-family: 'DM Mono', monospace;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--neon-lime);
  letter-spacing: 1px;
  text-transform: uppercase;
  background: none; border: none;
  cursor: pointer; padding: 8px 4px;
  transition: opacity 0.15s;
  min-height: 44px;
}
.toast-undo:hover { opacity: 0.7; }

.toast-bar {
  position: absolute;
  bottom: 0; left: 0;
  height: 2px;
  background: var(--neon-lime);
  animation: toast-bar 4s linear forwards;
}
@keyframes toast-bar { from { width: 100%; } to { width: 0%; } }

/* ── HOME BUTTON ── */
.home-btn {
  position: absolute;
  top: 12px; right: 12px;
  background: rgba(26,18,8,0.06);
  border: 1px solid var(--ink-faint);
  border-radius: 4px;
  cursor: pointer;
  padding: 8px 12px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  transition: all 0.2s;
  min-width: 48px; min-height: 48px;
  justify-content: center;
}
.home-btn:hover { background: rgba(26,18,8,0.12); border-color: var(--ink); }
.home-btn-icon { font-size: 1.1rem; line-height: 1; }
.home-btn-label {
  font-family: 'DM Mono', monospace;
  font-size: 0.5rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* ── DATE STRIP SCROLL ── */
.date-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
  margin-bottom: 20px;
  scrollbar-width: none;
}
.date-strip::-webkit-scrollbar { display: none; }
.date-chip {
  flex-shrink: 0;
  min-width: 48px;
  text-align: center;
  padding: 10px 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

/* ── RESPONSIVE TWEAKS ── */
@media (max-width: 380px) {
  .share-code {
    font-size: 2rem;
    letter-spacing: 4px;
  }
}

@media (max-width: 360px) {
  .step-label {
    font-size: 0.5rem;
  }
  .step-num {
    width: 28px; height: 28px;
    font-size: 0.7rem;
  }
  .item-price-in {
    width: 72px;
  }
  .mode-card {
    padding: 20px 10px;
    min-height: 120px;
  }
}

/* ── LANDING PAGE ── */
.landing {
  display: flex; flex-direction: column;
}

.hero {
  padding: 36px 24px 28px;
  text-align: center;
  border-bottom: 1px dashed var(--ink-faint);
}

.hero-logo {
  height: 72px; width: auto;
  display: block; margin: 0 auto 24px;
  animation: hero-drop 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
}

@keyframes hero-drop {
  from { opacity: 0; transform: translateY(-20px) scale(0.9); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.hero-headline {
  font-family: 'DM Sans', sans-serif;
  font-size: 2.8rem;
  font-weight: 900;
  color: var(--ink);
  line-height: 1.05;
  letter-spacing: -1px;
  margin-bottom: 16px;
  animation: hero-up 0.5s 0.1s ease both;
}

.hero-headline em {
  font-style: italic;
  color: var(--accent-ink);
}

@keyframes hero-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.hero-sub {
  font-family: 'DM Sans', sans-serif;
  font-size: 1rem;
  color: var(--ink-faint);
  line-height: 1.8;
  margin-bottom: 28px;
  animation: hero-up 0.5s 0.2s ease both;
}

.hero-cta-row {
  display: flex; flex-direction: column; gap: 10px;
  animation: hero-up 0.5s 0.3s ease both;
}

.btn-hero-host {
  width: 100%; padding: 20px;
  background: var(--neon-pink); color: var(--paper);
  border: none; border-radius: 3px;
  font-family: 'DM Mono', monospace;
  font-size: 0.88rem; font-weight: 500;
  letter-spacing: 2px; text-transform: uppercase;
  cursor: pointer; transition: all 0.15s;
  min-height: 60px; position: relative; overflow: hidden;
}
.btn-hero-host::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%);
}
.btn-hero-host:hover { background: #e02068; transform: translateY(-1px); }
.btn-hero-host:active { transform: translateY(0); }

.btn-hero-guest {
  width: 100%; padding: 20px;
  background: var(--ink); color: var(--neon-cyan);
  border: none; border-radius: 3px;
  font-family: 'DM Mono', monospace;
  font-size: 0.88rem; font-weight: 500;
  letter-spacing: 2px; text-transform: uppercase;
  cursor: pointer; transition: all 0.15s;
  min-height: 60px;
}
.btn-hero-guest:hover { background: #2a1f0f; transform: translateY(-1px); }
.btn-hero-guest:active { transform: translateY(0); }

.how-section {
  padding: 24px 24px;
  border-bottom: 1px dashed var(--ink-faint);
  animation: hero-up 0.5s 0.4s ease both;
}

.how-label {
  font-family: 'DM Mono', monospace;
  font-size: 0.58rem; color: var(--ink-faint);
  letter-spacing: 3px; text-transform: uppercase;
  text-align: center; margin-bottom: 18px;
}

.how-steps { display: flex; flex-direction: column; gap: 2px; }

.how-step {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 14px 16px;
  background: var(--paper-dark);
  border: 1px solid rgba(26,18,8,0.08);
  border-radius: 3px; transition: all 0.2s;
}
.how-step:hover { background: rgba(26,18,8,0.04); border-color: rgba(26,18,8,0.18); }

.how-step-num {
  font-family: 'DM Mono', monospace;
  font-size: 1.3rem; font-weight: 900; line-height: 1;
  flex-shrink: 0; width: 36px; padding-top: 2px;
}
.how-step:nth-child(1) .how-step-num { color: var(--accent-ink); }
.how-step:nth-child(2) .how-step-num { color: var(--ink); }
.how-step:nth-child(3) .how-step-num { color: var(--teal-ink); }

.how-step-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 1rem; font-weight: 700;
  color: var(--ink); margin-bottom: 3px;
}

.how-step-desc {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.9rem; color: var(--ink-faint);
  line-height: 1.6;
}

.recent-tables {
  padding: 0 24px 8px;
  animation: hero-up 0.5s 0.45s ease both;
}

.recent-label {
  font-family: 'DM Mono', monospace;
  font-size: 0.58rem; color: var(--ink-faint);
  letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px;
}

.recent-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px;
  background: var(--paper-dark);
  border: 1px solid rgba(26,18,8,0.1);
  border-radius: 3px; cursor: pointer; transition: all 0.2s; margin-bottom: 8px;
}
.recent-card:hover { background: rgba(26,18,8,0.04); border-color: var(--ink); }

.recent-name {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.95rem; font-weight: 700; color: var(--ink); margin-bottom: 2px;
}

.recent-meta {
  font-family: 'DM Mono', monospace;
  font-size: 0.62rem; color: var(--ink-faint); letter-spacing: 0.5px;
}

.recent-code {
  font-family: 'DM Mono', monospace;
  font-size: 0.85rem; font-weight: 700;
  color: var(--ink); letter-spacing: 2px;
  background: var(--neon-lime); padding: 4px 8px; border-radius: 2px;
}

.landing-footer {
  padding: 16px 24px 32px;
  animation: hero-up 0.5s 0.5s ease both;
}

.tool-chip {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  padding: 14px 18px;
  background: var(--paper-dark);
  border: 1.5px solid var(--ink-faint);
  border-radius: 3px; cursor: pointer; transition: all 0.2s;
}
.tool-chip:hover { border-color: var(--ink); background: rgba(26,18,8,0.04); }

.tool-chip-icon { font-size: 1.1rem; }

.tool-chip-label {
  font-family: 'DM Mono', monospace;
  font-size: 0.68rem; color: var(--ink-faint);
  letter-spacing: 1px; text-transform: uppercase;
}

/* ── 2026 APP REVAMP: NIGHT MARKET RECEIPT ── */
:root {
  --paper: #F8F0E4;
  --paper-dark: #EFE6D8;
  --ink: #120A04;
  --ink-light: #3F2A18;
  --ink-faint: #6B5948;
  --neon-pink: #FF0A85;
  --neon-lime: #A6FF00;
  --neon-cyan: #00FFD1;
  --neon-orange: #FF6B1A;
  --accent-ink: #AD0053;
  --accent-fill: #C90061;
  --teal-ink: #006354;
  --warning-ink: #934100;
  --on-dark-muted: #C4B8AA;
  --focus-ring: #006354;
  --receipt-shadow: 0 22px 70px rgba(0,0,0,0.26), 0 2px 0 rgba(26,18,8,0.06);
}

body {
  background: var(--ink);
  color: var(--paper);
  -webkit-tap-highlight-color: transparent;
}

.bg {
  background:
    radial-gradient(ellipse 70% 42% at 78% 18%, rgba(255,10,133,0.18) 0%, transparent 58%),
    radial-gradient(ellipse 58% 48% at 18% 74%, rgba(166,255,0,0.11) 0%, transparent 60%),
    linear-gradient(180deg, #120905 0%, #170a06 54%, #100902 100%);
}

.bg::after {
  background-image: radial-gradient(circle, rgba(248,240,228,0.055) 0.8px, transparent 0.8px);
  background-size: 22px 22px;
  opacity: 0.7;
}

.app {
  max-width: 430px;
  padding: 14px 14px calc(96px + env(safe-area-inset-bottom, 0px));
  gap: 14px;
}

.receipt {
  border-radius: 18px;
  color: var(--ink);
  box-shadow: var(--receipt-shadow);
  border: 1px solid rgba(248,240,228,0.08);
}

.receipt::before {
  height: 18px;
  background:
    repeating-radial-gradient(circle at 50% 0, transparent 0, transparent 6px, var(--ink) 6px, var(--ink) 7px, transparent 7px) center top / 20px 18px no-repeat,
    var(--paper);
}

.receipt-inner {
  padding: 30px 22px 24px;
}

.header-receipt {
  padding: 30px 22px 22px;
  border-bottom-color: rgba(144,123,99,0.45);
}

.logo-img,
.hero-logo {
  filter: drop-shadow(0 0 12px rgba(255,10,133,0.22));
}

.badge-strip,
.guest-badge,
.login-pill,
.user-chip {
  border-radius: 999px;
}

.badge-strip {
  padding: 7px 14px;
  border: 1px solid rgba(166,255,0,0.18);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}

.login-pill {
  min-height: 40px;
  padding: 8px 16px;
  border-color: rgba(248,240,228,0.24);
  background: rgba(18,10,4,0.62);
  color: var(--paper);
}

.user-chip {
  min-height: 40px;
  border-color: rgba(248,240,228,0.24);
  background: rgba(18,10,4,0.82);
}

.hero {
  padding: 34px 22px 28px;
}

.hero-headline {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(2.8rem, 12vw, 3.6rem);
  line-height: 0.98;
  letter-spacing: -0.035em;
  text-transform: uppercase;
}

.hero-headline em {
  font-family: inherit;
  font-style: normal;
  color: var(--accent-ink);
}

.hero-sub,
.section-sub,
.logo-tagline,
.how-step-desc,
.mode-desc,
.tool-chip-label,
.recent-meta {
  color: var(--ink-faint);
}

.section {
  padding: 24px 22px;
  border-bottom-color: rgba(144,123,99,0.45);
}

.section-head,
.mode-title,
.how-step-title,
.recent-name,
.profile-name,
.vault-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 900;
  letter-spacing: -0.02em;
  text-transform: uppercase;
}

.section-head {
  font-size: 2rem;
  line-height: 1.1;
}

.step-bar {
  padding: 16px 18px;
  border-bottom-color: rgba(144,123,99,0.45);
}

.step-item::after {
  color: rgba(144,123,99,0.45);
}

.step-num {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  font-weight: 600;
}

.step-num.active {
  background: var(--ink);
  color: var(--neon-lime);
  box-shadow: 0 0 18px rgba(166,255,0,0.22);
}

.step-num.done {
  background: var(--neon-lime);
  color: var(--ink);
  box-shadow: 0 0 18px rgba(166,255,0,0.22);
}

.btn,
.btn-hero-host,
.btn-hero-guest,
.currency-chip,
.tool-chip,
.recent-card,
.mode-card,
.guest-item,
.line-item.host-selectable,
.how-step,
.upload-zone,
.qr-zone,
.vault-card,
.vault-qr-area,
.share-url-box,
.date-chip,
.name-in,
.item-price-in,
.split-count-input {
  border-radius: 18px !important;
}

.btn,
.btn-hero-host,
.btn-hero-guest {
  min-height: 58px;
  border-radius: 999px !important;
  letter-spacing: 0.16em;
  font-weight: 600;
  transition: transform 260ms cubic-bezier(0.32,0.72,0,1), box-shadow 260ms cubic-bezier(0.32,0.72,0,1), background 260ms cubic-bezier(0.32,0.72,0,1), border-color 260ms cubic-bezier(0.32,0.72,0,1);
}

.btn:active,
.btn-hero-host:active,
.btn-hero-guest:active,
.mode-card:active,
.guest-item:active,
.tool-chip:active,
.recent-card:active,
.currency-chip:active,
.line-item.host-selectable:active {
  transform: scale(0.98);
}

.btn-ink,
.btn-hero-guest {
  background: var(--ink);
  color: var(--neon-lime);
  box-shadow: 0 12px 30px rgba(18,10,4,0.2);
}

.btn-ink:hover,
.btn-hero-guest:hover {
  background: #1f1108;
  box-shadow: 0 0 28px rgba(166,255,0,0.18);
}

.btn-neon,
.btn-hero-host {
  background: var(--accent-fill);
  color: white;
  box-shadow: none;
}

.btn-neon:hover,
.btn-hero-host:hover {
  background: var(--accent-ink);
  box-shadow: none;
}

.btn-outline {
  border: 1.5px solid rgba(18,10,4,0.18);
  background: rgba(18,10,4,0.035);
  color: var(--ink-light);
}

.btn-outline:hover {
  border-color: var(--ink);
  background: rgba(18,10,4,0.07);
}

.btn:disabled,
.btn-ink:disabled {
  background: rgba(144,123,99,0.35);
  color: rgba(63,42,24,0.45);
  box-shadow: none;
}

.currency-selector-row {
  gap: 10px;
  margin-bottom: 26px;
}

.currency-chip {
  min-height: 44px;
  padding: 10px 18px;
  background: rgba(18,10,4,0.045);
  border-color: rgba(18,10,4,0.13);
}

.currency-chip.active {
  background: var(--ink);
  color: var(--neon-lime);
  box-shadow: 0 0 22px rgba(166,255,0,0.2);
}

.upload-zone,
.qr-zone,
.vault-card {
  background:
    radial-gradient(ellipse 70% 60% at 50% 0%, rgba(166,255,0,0.08) 0%, transparent 62%),
    var(--paper-dark);
  border-color: rgba(18,10,4,0.18);
}

.upload-zone:hover,
.upload-zone.drag,
.qr-zone:hover {
  border-color: var(--neon-pink);
  background:
    radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,10,133,0.08) 0%, transparent 62%),
    var(--paper-dark);
}

.preview-img,
.qr-preview,
.vault-qr-preview {
  border-radius: 18px;
}

.line-item,
.guest-item,
.how-step,
.recent-card,
.tool-chip,
.mode-card {
  transition: transform 260ms cubic-bezier(0.32,0.72,0,1), background 260ms cubic-bezier(0.32,0.72,0,1), border-color 260ms cubic-bezier(0.32,0.72,0,1), opacity 260ms cubic-bezier(0.32,0.72,0,1);
}

.line-item {
  border-bottom-color: rgba(144,123,99,0.38);
}

.line-item.host-selectable,
.guest-item,
.how-step,
.recent-card,
.tool-chip,
.mode-card {
  background: rgba(18,10,4,0.04);
  border: 1.5px solid rgba(18,10,4,0.08);
}

.line-item.host-selectable:hover,
.guest-item:hover,
.how-step:hover,
.recent-card:hover,
.tool-chip:hover,
.mode-card:hover {
  background: rgba(166,255,0,0.08);
  border-color: rgba(18,10,4,0.22);
  transform: translateY(-1px);
}

.line-item.host-selected,
.guest-item.sel {
  background: var(--neon-lime);
  border-color: var(--ink);
  color: var(--ink);
  box-shadow: 0 0 22px rgba(166,255,0,0.18);
}

.item-name-in,
.item-price-in,
.name-in,
.split-count-input {
  border-radius: 14px !important;
}

.item-price-in,
.name-in,
.split-count-input {
  background: rgba(18,10,4,0.055);
}

.item-name-in:focus,
.item-price-in:focus,
.name-in:focus,
.split-count-input:focus {
  box-shadow: 0 0 0 2px rgba(166,255,0,0.5);
}

.del-btn,
.g-check,
.split-count-btn,
.home-btn {
  border-radius: 999px !important;
}

.mode-grid {
  gap: 12px;
}

.mode-card {
  padding: 28px 16px;
}

.mode-emoji,
.upload-emoji,
.tool-chip-icon {
  filter: saturate(1.15);
}

.share-receipt {
  border-radius: 22px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 44px rgba(0,0,0,0.24);
}

.share-code {
  color: var(--neon-lime);
  text-shadow: 0 0 24px rgba(166,255,0,0.25);
}

.recent-code {
  border-radius: 999px;
  padding: 6px 10px;
}

.error-strip {
  border-left: none;
  border: 1px solid rgba(255,10,133,0.24);
  border-radius: 16px;
  background: rgba(255,10,133,0.08);
}

/* Reading text stays ink on paper; neon is reserved for dark surfaces. */
button, input { font-family: inherit; }
button { touch-action: manipulation; }
:is(button, input, a, [tabindex]):focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
}
.sticky-total { --focus-ring: var(--neon-lime); }
.section-head, .hero-headline { text-wrap: balance; }
.hero-sub, .section-sub, .how-step-desc, .vault-desc { text-wrap: pretty; }
.how-steps { gap: 10px; }
.how-step-title { font-size: 1.2rem; line-height: 1.2; }
.how-label, .recent-label, .step-label { font-size: 0.7rem; }
.how-step-num, .share-code { font-family: 'DM Mono', monospace; }
.total-val, .g-price, .item-price-in, .sticky-amt, .share-code,
.bill-summary-val, .qr-modal-amt { font-variant-numeric: tabular-nums; }
.total-row.grand .total-label, .total-row.grand .total-val {
  font-family: 'DM Sans', sans-serif;
}
.hero-cta-row button { font-family: 'DM Sans', sans-serif; font-size: 0.94rem; }
.hero-cta-row button, .btn { letter-spacing: 0.05em; }
.btn-ink, .btn-hero-guest, .currency-chip.active, .step-num.active,
.step-num.done, .guest-item.sel, .share-code { box-shadow: none; text-shadow: none; }
.guest-item.sel { background: var(--neon-lime); border-color: var(--ink); }
.guest-item.paid-item { background: var(--paper-dark); border-style: dashed; }
.guest-paid-tag { white-space: normal; max-width: 35%; font-size: 0.8rem; }
.bill-summary-row { gap: 16px; }
.bill-summary-val { flex-shrink: 0; }
.item-price-in, .del-btn, .g-price { flex-shrink: 0; }
.home-btn { color: var(--ink); }
.date-chip { font: inherit; min-width: 60px; min-height: 64px; }
.split-controls { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 4px 0 16px; color: var(--ink); font-size: 0.875rem; flex-wrap: wrap; }
.split-controls button { min-width: 44px; min-height: 44px; }
.split-controls .split-value { min-width: 64px; text-align: center; font-weight: 600; }
.field-label { display: block; margin-bottom: 8px; color: var(--ink-light); font-size: 0.875rem; font-weight: 600; }
.table-code-input { font-family: 'DM Mono', monospace; }
.qr-modal-sub, .vault-desc, .pending-desc { font-size: 0.9rem; line-height: 1.6; }
.auth-dialog { margin: auto; padding: 0; border: none; border-radius: 18px; width: min(340px, calc(100% - 32px)); background: var(--paper); color: var(--ink); max-height: calc(100dvh - 48px); }
.auth-dialog::backdrop { background: rgba(18,10,4,0.88); }
.auth-dialog .qr-modal-inner { max-height: none; }
.vault-qr-area { display: block; font: inherit; padding: 0; }
.split-controls button:disabled { opacity: 0.5; cursor: not-allowed; }
.upload-zone, .qr-zone { width: 100%; font: inherit; color: var(--ink); display: block; }
.upload-label, .upload-hint { display: block; }
.recent-card { width: 100%; text-align: left; font: inherit; }
.user-chip { font: inherit; color: var(--paper); cursor: pointer; }

@media (max-width: 380px) {
  .line-item { gap: 6px; }
  .item-price-in { width: 72px; padding-inline: 6px; }
  .guest-item { gap: 8px; padding-inline: 10px; }
  .g-price { font-size: 0.8rem; }
  .sticky-total { padding-inline: 14px; gap: 10px; }
  .sticky-amt { font-size: 1.5rem; }
  .sticky-pay-btn { padding-inline: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}

@media (max-width: 380px) {
  .app { padding-left: 10px; padding-right: 10px; }
  .receipt-inner,
  .section { padding-left: 18px; padding-right: 18px; }
  .hero-headline { font-size: clamp(2.6rem, 12vw, 3.4rem); }
}
`;

// ── UTILS ─────────────────────────────────────────────────────
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    const permission = await new Promise((resolve, reject) => {
      const p = Notification.requestPermission(resolve);
      if (p && p.then) p.then(resolve).catch(reject);
    });
    return permission;
  } catch (e) {
    return "denied";
  }
}

function sendLocalNotification(title, body) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;

  const options = {
    body,
    icon: LOGO_SRC,
    vibrate: [200, 100, 200],
    tag: 'kakisplit-payment', // Prevents flooding
    renotify: true
  };

  try {
    // We check if an active Service Worker exists to use the robust showNotification.
    // If not, we fall back to the standard new Notification API.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  } catch (e) {
    console.warn("Notification failed:", e);
  }
}

function genCode() { return Math.floor(1000 + Math.random() * 9000).toString(); }

function isDuplicateCodeError(error) {
  return error?.code === "23505" || /duplicate key/i.test(error?.message || "");
}

async function prepareReceiptImage(file) {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const maxSide = image.height > image.width * 2 ? 3200 : 2000;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(source);
  }
}

function prepareQrForSave(qr) {
  if (!qr) return Promise.resolve(null);
  if (!qr.startsWith("data:")) return Promise.resolve(qr);
  if (qr.length < 80000) return Promise.resolve(qr);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const compress = (max, quality) => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", quality);
      };
      let result = compress(320, 0.65);
      if (result.length > 80000) result = compress(240, 0.5);
      if (result.length > 80000) result = compress(180, 0.4);
      resolve(result);
    };
    img.onerror = () => resolve(qr);
    img.src = qr;
  });
}

async function save(d) {
  const { error } = await supabase.from("sessions").upsert({
    code: d.code,
    items: d.items,
    qr_image: d.qrImage || null,
    paid: d.paid || {},
    table_name: d.tableName || "My Table",
    table_date: d.tableDate || new Date().toISOString().split("T")[0]
  });
  if (error) throw new Error(error.message);
}

async function load(code) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("code", code)
    .limit(1);
  if (!data || error || data.length === 0) return null;
  const row = data[0];
  const qrImage = localStorage.getItem(`ks_qr_${code}`) || null;
  return {
    code: row.code,
    items: row.items,
    qrImage: row.qr_image || qrImage,
    paid: row.paid,
    tableName: row.table_name,
    tableDate: row.table_date
  };
}

async function savePaid(itemId, name, code, splitCount = 1) {
  if (!code) code = new URLSearchParams(window.location.search).get("table") || localStorage.getItem("ks_current_code");
  if (!code) return { success: false };

  // Optimistic concurrency: retry up to 4 times if update races
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.from("sessions").select("paid").eq("code", code).single();
    if (error) return { success: false };

    const paid = data?.paid || {};
    if (!paid[itemId]) paid[itemId] = { payers: [], total: splitCount };
    if (!paid[itemId].payers) paid[itemId] = { payers: [paid[itemId]], total: 1 };

    const payers = paid[itemId].payers;
    const total = paid[itemId].total || splitCount;

    // Already paid by this user
    if (payers.includes(name)) return { success: true, alreadyPaid: true };

    // Item already full
    if (payers.length >= total) return { success: false, full: true };

    payers.push(name);

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ paid })
      .eq("code", code);

    if (!updateError) return { success: true };
    // If update failed (race), wait briefly and retry
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
  }
  return { success: false };
}

async function loadSessionState(code) {
  // Use select("*") to avoid crashing if certain columns (like selections) haven't been added yet
  const { data, error } = await supabase.from("sessions").select("*").eq("code", code).single();
  if (error || !data) return { paid: {}, selections: {} };
  return { paid: data.paid || {}, selections: data.selections || {} };
}

async function updateGuestSelection(code, name, sel) {
  if (!code || !name) return;
  try {
    const { data } = await supabase.from("sessions").select("selections").eq("code", code).single();
    let selections = data?.selections || {};

    // Remove user from all previously held items
    Object.keys(selections).forEach(itemId => {
      if (Array.isArray(selections[itemId])) {
        selections[itemId] = selections[itemId].filter(n => n !== name);
      }
    });

    // Add user to currently selected items
    Object.keys(sel).forEach(itemId => {
      if (sel[itemId]) {
        if (!selections[itemId]) selections[itemId] = [];
        if (!selections[itemId].includes(name)) selections[itemId].push(name);
      }
    });

    // We use a try-catch in case the 'selections' column is missing in Supabase
    await supabase.from("sessions").update({ selections }).eq("code", code);
  } catch (e) {
    console.warn("Selections sync failed (Column might be missing)", e);
  }
}
// ── STEP BAR ──────────────────────────────────────────────────
function StepBar({ current, steps }) {
  return (
    <div className="step-bar" aria-label="Table setup progress">
      {steps.map((s, i) => (
        <div key={s} className="step-item" aria-current={i === current ? "step" : undefined}>
          <div className={`step-num ${i < current ? "done" : i === current ? "active" : ""}`}>
            {i < current ? "✓" : i + 1}
          </div>
          <div className="step-label">{s}</div>
        </div>
      ))}
    </div>
  );
}

// ── GUEST VIEW ────────────────────────────────────────────────
function GuestView({ session, onBack, currency }) {
  const [named, setNamed] = useState(false);
  const [name, setName] = useState("");
  const [sel, setSel] = useState({});
  const [splits, setSplits] = useState({});
  const [done, setDone] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [paidMap, setPaidMap] = useState({});
  const { items = [], qrImage } = session;

  const [selections, setSelections] = useState({});

  // Reload session state (paid + selections) periodically
  useEffect(() => {
    const t = setInterval(() => {
      loadSessionState(session.code).then(state => {
        setPaidMap(state.paid);
        setSelections(state.selections);
      });
    }, 2000);
    return () => clearInterval(t);
  }, [session.code]);

  // Sync our selection to Supabase
  useEffect(() => {
    if (named && name) {
      updateGuestSelection(session.code, name, sel);
    }
  }, [sel, named, name, session.code]);

  const myItems = items.filter(i => sel[i.id]);
  const myTotal = myItems.reduce((s, i) => {
    const paidInfo = paidMap[i.id];
    const totalSplit = paidInfo?.total || splits[i.id] || 1;
    return s + parseFloat(i.price || 0) / totalSplit;
  }, 0);

  const confirmPayment = async () => {
    const failures = [];
    const failedIds = [];
    for (const i of myItems) {
      const paidInfo = paidMap[i.id];
      const totalSplit = paidInfo?.total || splits[i.id] || 1;
      const result = await savePaid(i.id, name, session.code, totalSplit);
      if (result?.full) { failures.push(i.name); failedIds.push(i.id); }
    }
    const { paid } = await loadSessionState(session.code);
    setPaidMap(paid);
    if (failures.length > 0) {
      // Deselect items that were already taken
      setSel(s => {
        const next = { ...s };
        failedIds.forEach(id => { delete next[id]; });
        return next;
      });
      alert(`Someone else just paid for: ${failures.join(", ")}. Removed from your total.`);
    } else {
      setDone(true);
      setShowQR(false);
    }
  };

  if (!named) return (
    <div className="receipt" style={{ marginTop: 0 }}>
      <div className="receipt-inner">
        <div className="section-head">What's your name?</div>
        <div className="section-sub" style={{ marginBottom: 16 }}>So the host knows who's paid</div>
        <label className="field-label" htmlFor="guest-name">Your name</label>
        <input id="guest-name" className="name-in" placeholder="e.g. Yagiz, Dylan, Sabry..." autoComplete="given-name"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && setNamed(true)} autoFocus />
        <button className="btn btn-ink" disabled={!name.trim()} onClick={() => setNamed(true)}>
          Continue →
        </button>
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
      </div>
    </div>
  );

  if (done) return (
    <div className="receipt">
      <div className="receipt-inner">
        <span className="success-mark">✅</span>
        <div className="section-head" style={{ textAlign: "center" }}>Confirmed, {name}!</div>
        <div className="section-sub" style={{ textAlign: "center", marginBottom: 20 }}>Here's your share of the bill</div>

        <div style={{ background: "var(--ink)", borderRadius: 4, padding: "16px 20px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--on-dark-muted)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>You paid</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "2.4rem", fontWeight: 900, color: "var(--neon-lime)", letterSpacing: -1 }}>
            {currency} {myTotal.toFixed(2)}
          </div>
        </div>

        {myItems.map(i => {
          const paidInfo = paidMap[i.id];
          const totalSplit = paidInfo?.total || splits[i.id] || 1;
          const splitPrice = parseFloat(i.price) / totalSplit;
          return (
            <div key={i.id} className="bill-summary-row">
              <span>{i.name}{totalSplit > 1 ? ` (split ${totalSplit} ways)` : ""}</span>
              <span className="bill-summary-val">{currency} {splitPrice.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (showQR) return (
    <div className="receipt">
      <div className="header-receipt" style={{ paddingBottom: 20 }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--ink)" }}>
          Scan & Pay
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--ink-faint)", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 8 }}>
          Pay exactly this amount
        </div>
      </div>
      
      <div style={{ textAlign: "center", padding: "30px 24px", borderBottom: "1px dashed var(--ink-faint)" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "clamp(1.6rem, 7vw, 2.4rem)", fontWeight: 900, color: "var(--accent-ink)" }}>
          {currency} {myTotal.toFixed(2)}
        </div>
      </div>

      <div style={{ padding: "30px 24px", display: "flex", justifyContent: "center", background: "white", borderBottom: "1px dashed var(--ink-faint)" }}>
        <img src={qrImage} alt="QR" style={{ width: "100%", maxWidth: "340px", height: "auto", objectFit: "contain", borderRadius: 8 }} />
      </div>

      <div style={{ padding: "24px" }}>
        <button className="btn btn-neon" style={{ width: "100%", marginBottom: 12, padding: "20px", fontSize: "1rem" }} onClick={confirmPayment}>
          ✅ I HAVE PAID
        </button>
        <button className="btn btn-outline" style={{ width: "100%", border: "none" }} onClick={() => setShowQR(false)}>
          ← BACK
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="receipt">
        <div className="header-receipt" style={{ paddingBottom: 14 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
            Hey {name} 👋
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-faint)", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 4 }}>
            Tap everything you ordered
          </div>
        </div>
        <div style={{ padding: "4px 24px 90px" }}>
          {items.map(item => {
            const paidInfo = paidMap[item.id];
            const paidBy = (paidInfo?.payers || (paidInfo ? [paidInfo] : [])).map(p => typeof p === 'object' ? (p.name || "Host") : p);
            const alreadyPaid = paidBy.includes(name);
            const totalSplit = paidInfo?.total || splits[item.id] || 1;
            const splitPrice = parseFloat(item.price || 0) / totalSplit;
            const fullyPaid = paidBy.length >= totalSplit;

            if (fullyPaid) return (
              <div key={item.id} className="guest-item paid-item">
                <div className="g-check" style={{ borderColor: "var(--ink-faint)" }}>–</div>
                <span className="g-name" style={{ textDecoration: "line-through" }}>{item.name}</span>
                <span className="guest-paid-tag">paid by {paidBy.join(", ")}</span>
              </div>
            );

            if (alreadyPaid) return (
              <div key={item.id} className="guest-item paid-item">
                <div className="g-check">✓</div>
                <span className="g-name">{item.name}</span>
                <span className="guest-paid-tag">you paid</span>
              </div>
            );

            return (
              <div key={item.id}>
                <button type="button" className={`guest-item ${sel[item.id] ? "sel" : ""}`} aria-pressed={!!sel[item.id]}
                  onClick={() => setSel(s => ({ ...s, [item.id]: !s[item.id] }))}>
                  <div className="g-check">{sel[item.id] ? "✓" : ""}</div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <span className="g-name">{item.name}</span>
                    {selections[item.id] && selections[item.id].filter(n => n !== name).length > 0 && (
                      <span style={{ fontSize: "0.75rem", color: "var(--accent-ink)", fontWeight: 600 }}>
                        Highlighted by {selections[item.id].filter(n => n !== name).join(", ")}
                      </span>
                    )}
                  </div>
                  <span className="g-price">{currency} {splitPrice.toFixed(2)}</span>
                </button>
                {paidBy.length > 0 && (
                  <div style={{ padding: "4px 24px 4px 56px", fontSize: "0.75rem", color: "var(--ink-light)" }}>
                    {paidBy.length}/{totalSplit} paid by {paidBy.join(", ")}
                  </div>
                )}
                {sel[item.id] && paidBy.length === 0 && (
                  <div className="split-controls">
                    <span style={{ fontWeight: 500 }}>Split with:</span>
                    <button aria-label={`Split ${item.name} with fewer people`} disabled={(splits[item.id] || totalSplit) <= 1} onClick={() => setSplits(s => ({ ...s, [item.id]: Math.max(1, (s[item.id] || totalSplit) - 1) }))}
                      style={{ padding: "8px 16px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "1rem", fontWeight: 600, minWidth: 40 }}>−</button>

                    <span className="split-value" aria-live="polite">
                      {(splits[item.id] || totalSplit) === 1 ? "no one" : `${(splits[item.id] || totalSplit) - 1} other${(splits[item.id] || totalSplit) > 2 ? "s" : ""}`}
                    </span>

                    <button aria-label={`Split ${item.name} with more people`} onClick={() => setSplits(s => ({ ...s, [item.id]: (s[item.id] || totalSplit) + 1 }))}
                      style={{ padding: "8px 16px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "1rem", fontWeight: 600, minWidth: 40 }}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky-total">
        <div>
          <div className="sticky-label">Your total</div>
          <div className="sticky-amt">{myTotal > 0 ? `${currency} ${myTotal.toFixed(2)}` : "— —"}</div>
        </div>
        <button className="sticky-pay-btn" disabled={myTotal === 0} onClick={() => qrImage ? setShowQR(true) : confirmPayment()}>
          {qrImage ? "Pay Now →" : "Confirm →"}
        </button>
      </div>
    </>
  );
}

// ── HOST VIEW ─────────────────────────────────────────────────
function HostView({ onHome, currency, user, profile }) {
  const [step, setStep] = useState(0);
  const [receipts, setReceipts] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanWarnings, setScanWarnings] = useState([]);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState([]);
  const [qrImg, setQrImg] = useState(null);

  // Pre-fill QR from profile if it exists
  useEffect(() => {
    if (profile?.qr_url && !qrImg) {
      setQrImg(profile.qr_url);
    }
  }, [profile, qrImg]);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [paidMap, setPaidMap] = useState({});
  const fileRef = useRef();
  const qrRef = useRef();
  const STEPS = ["Receipt", "Details", "Items", "QR", "Share"];
  const [tableName, setTableName] = useState("");
  const [tableDate, setTableDate] = useState(new Date().toISOString().split("T")[0]);

  const handleFile = async (files) => {
    if (preparing || loading) return;
    setPreparing(true);
    setErr("");
    const newReceipts = [];
    let failed = 0;
    for (const file of files) {
      try {
        if (file.type && !file.type.startsWith("image/")) throw new Error();
        const img = await prepareReceiptImage(file);
        newReceipts.push({ id: Math.random().toString(36).slice(2), img });
      } catch {
        failed++;
      }
    }
    setReceipts(prev => [...prev, ...newReceipts]);
    if (failed) setErr("Some files couldn't be opened. Try uploading JPEG or PNG photos.");
    setPreparing(false);
  };

  const parseReceipt = async () => {
    setLoading(true);
    setErr("");
    try {
      const result = await scanReceiptBatch(receipts, image => scanReceipt(image, {
        geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY,
        openRouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
      }));
      setItems(prev => [...result.items, ...prev.filter(item => !item.receiptId)]);
      setScanWarnings(result.warnings);
      if (result.items.length) setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const enterItemsManually = () => {
    setItems(prev => prev.filter(item => !item.receiptId || receipts.some(receipt => receipt.id === item.receiptId)));
    setStep(1);
  };

  const handleQR = f => {
    if (!f?.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        setQrImg(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(f);
  };

  const notifiedRef = useRef(new Set());
  useEffect(() => {
    if (!paidMap || step !== 4) return;

    // On first data load, mark everything already paid as notified
    if (notifiedRef.current.size === 0 && Object.keys(paidMap).length > 0) {
      Object.keys(paidMap).forEach(itemId => {
        const payers = paidMap[itemId]?.payers || [];
        payers.forEach(p => notifiedRef.current.add(`${itemId}-${p}`));
      });
      return;
    }

    const newPaymentsByPayer = {};
    Object.keys(paidMap).forEach(itemId => {
      const current = paidMap[itemId]?.payers || [];
      current.forEach(payer => {
        const key = `${itemId}-${payer}`;
        if (!notifiedRef.current.has(key)) {
          const item = items.find(i => i.id.toString() === itemId.toString());
          if (!newPaymentsByPayer[payer]) newPaymentsByPayer[payer] = [];
          newPaymentsByPayer[payer].push(item?.name || "an item");
          notifiedRef.current.add(key);
        }
      });
    });

    Object.keys(newPaymentsByPayer).forEach(payer => {
      sendLocalNotification("Incoming Payment!", `${payer} paid for ${newPaymentsByPayer[payer].join(", ")}`);
    });
  }, [paidMap, items, step]);

  const [finalising, setFinalising] = useState(false);
  const finalise = async () => {
    if (finalising) return;
    setFinalising(true);
    setErr("");
    try {
      const qrForSave = await prepareQrForSave(qrImg);
      let c;
      let success = false;
      const initialPaid = {};

      for (let attempt = 0; attempt < 10 && !success; attempt++) {
        c = genCode();
        const { error } = await supabase.from("sessions").insert({
          code: c,
          items,
          qr_image: null,
          paid: initialPaid,
          table_name: tableName || "My Table",
          table_date: tableDate || new Date().toISOString().split("T")[0]
        });

        if (!error) {
          success = true;
        } else if (isDuplicateCodeError(error)) {
          continue;
        } else {
          throw new Error(error.message);
        }
      }

      if (!success) throw new Error("Could not create table. Please try again.");

      if (qrForSave) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const { error: qrError } = await supabase
            .from("sessions")
            .update({ qr_image: qrForSave })
            .eq("code", c);
          if (!qrError) break;
          await new Promise(r => setTimeout(r, 800));
        }
        if (qrForSave.startsWith("data:")) {
          localStorage.setItem(`ks_qr_${c}`, qrForSave);
        }
      }

      const existing = JSON.parse(localStorage.getItem("ks_tables") || "[]");
      existing.unshift({ code: c, name: tableName || "My Table", date: tableDate });
      localStorage.setItem("ks_tables", JSON.stringify(existing));
      localStorage.setItem("ks_current_code", c);
      localStorage.setItem("ks_current_name", tableName || "My Table");
      localStorage.setItem("ks_current_date", tableDate);

      setCode(c);
      setPaidMap(initialPaid);
      setStep(4);
    } catch (e) {
      setErr("Failed to create table: " + e.message);
    } finally {
      setFinalising(false);
    }
  };
  // Poll paid status every 2s once live
  useEffect(() => {
    if (step !== 4) return;
    const t = setInterval(() => {
      loadSessionState(code).then(s => setPaidMap(s.paid));
    }, 2000);
    return () => clearInterval(t);
  }, [step, code]);

  const [toast, setToast] = useState(null);   // {item, timer}

  const deleteItem = (id) => {
    const item = items.find(it => it.id === id);
    if (!item) return;
    setItems(its => its.filter(x => x.id !== id));
    if (toast?.timer) clearTimeout(toast.timer);
    const timer = setTimeout(() => setToast(null), 4000);
    setToast({ item, timer });
  };

  const undoDelete = () => {
    if (!toast) return;
    clearTimeout(toast.timer);
    setItems(its => [...its, toast.item]);
    setToast(null);
  };

  const url = code ? `${window.location.origin}${window.location.pathname}?table=${code}` : "";
  const subtotal = (items || []).reduce((s, i) => s + parseFloat(i?.price || 0), 0) || 0;
  const upd = (id, f, v) => setItems(its => its.map(it => it.id === id ? { ...it, [f]: v } : it));
  const busy = loading || preparing;
  const scanNotices = receipts.map((receipt, index) => {
    const warning = scanWarnings.find(entry => entry.receiptId === receipt.id);
    return warning && <div key={receipt.id} className="error-strip" role="status" style={{ marginBottom: 12 }}>
      <strong>Receipt #{index + 1}:</strong> {warning.message}
    </div>;
  });

  return (
    <>
      <div className="receipt">
        <div className="header-receipt">
          <button className="home-btn" onClick={onHome}>
            <span className="home-btn-icon">⌂</span>
            <span className="home-btn-label">Home</span>
          </button>
          <img src={LOGO_SRC} alt="KakiSplit" className="logo-img" />
          <div className="logo-tagline">Split bills lah, no drama</div>
          <div><span className="badge-strip">🧾 Host Mode</span></div>
        </div>
        <StepBar current={step} steps={STEPS} />

        {/* STEP 0 */}
        {step === 0 && <div className="section">
          <div className="section-head">Snap receipts</div>
          <div className="section-sub">You can upload multiple receipts</div>

          <button type="button" className={`upload-zone ${drag ? "drag" : ""}`} disabled={busy}
            onClick={() => !busy && fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files); }}>
            <span className="upload-emoji">📸</span>
            <span className="upload-label">Tap to snap or upload</span>
            <span className="upload-hint">Upload one or more receipts</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden disabled={busy} aria-label="Upload receipts" onChange={e => {
            handleFile(Array.from(e.target.files));
            e.target.value = "";
          }} />

          {receipts.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 10, marginBottom: 20 }}>
                {receipts.map((r, index) => (
                  <div key={r.id} style={{ position: "relative", aspectRatio: "3/4" }}>
                    <img src={r.img} alt={`Receipt #${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4, border: "1px solid var(--ink-faint)" }} />
                    <button disabled={busy} aria-label={`Remove receipt #${index + 1}`} onClick={() => setReceipts(prev => prev.filter(x => x.id !== r.id))}
                      style={{ position: "absolute", top: -5, right: -5, background: "var(--neon-pink)", color: "white", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", fontSize: "14px" }}>×</button>
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="loading-receipt">
                  <div className="spinner" />
                  <div className="loading-label">Extracting items...</div>
                  <div className="loading-sub">Processing {receipts.length} receipt{receipts.length > 1 ? "s" : ""}</div>
                </div>
              ) : (
                <>
                  <button className="btn btn-ink" disabled={busy} onClick={parseReceipt}>Scan All Receipts →</button>
                  <button className="btn btn-outline" disabled={busy} onClick={() => setReceipts([])}>Clear All</button>
                </>
              )}
            </div>
          )}
          {preparing && <div className="section-sub" role="status">Preparing photos…</div>}
          {err && <div className="error-strip" style={{ marginTop: 16 }}>⚠ {err}</div>}
          {!busy && scanNotices}
          <button className="btn btn-outline" disabled={busy} onClick={enterItemsManually}>Enter Items Manually →</button>
        </div>}
        {/* STEP 1 - TABLE DETAILS */}
        {step === 1 && <div className="section">
          <div className="section-head">Name your table</div>
          <div className="section-sub">So you can find it later</div>
          <label className="field-label" htmlFor="table-name">Table name</label>
          <input id="table-name" className="name-in" placeholder="e.g. Jalan Alor dinner, KLCC lunch..."
            value={tableName} onChange={e => setTableName(e.target.value)}
            style={{ marginBottom: 12 }} />
          <div style={{ fontSize: "0.7rem", color: "var(--ink-faint)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Date</div>
          <div className="date-strip">
            {[0, 1, 2, 3, 4, 5, 6].map(d => {
              const date = new Date();
              date.setDate(date.getDate() - d);
              const val = date.toISOString().split("T")[0];

              const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              const label = d === 0 ? "Today" : d === 1 ? "Yesterday" : dayNames[date.getDay()];
              const dayNum = date.getDate();

              return (
                <button type="button" key={val} className="date-chip" aria-pressed={tableDate === val} aria-label={date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} onClick={() => setTableDate(val)}
                  style={{
                    background: tableDate === val ? "var(--ink)" : "var(--paper-dark)",
                    border: tableDate === val ? "1.5px solid var(--ink)" : "1.5px solid var(--ink-faint)",
                  }}>
                  <div style={{ fontSize: "0.75rem", color: tableDate === val ? "var(--neon-lime)" : "var(--ink-faint)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500, color: tableDate === val ? "var(--neon-lime)" : "var(--ink)" }}>{dayNum}</div>
                </button>
              );
            })}
          </div>
          <button className="btn btn-ink" onClick={() => setStep(2)}>Next: Check Items →</button>
          <button className="btn btn-outline" onClick={() => setStep(0)}>← Back</button>
        </div>}

        {/* STEP 2 - CHECK ITEMS */}
        {step === 2 && <div className="section">
          <div className="section-head">Check items</div>
          <div className="section-sub">Review items from all receipts</div>
          {scanNotices}

          {receipts.map((receipt, idx) => {
            const receiptItems = items.filter(it => it.receiptId === receipt.id);
            if (receiptItems.length === 0) return null;
            return (
              <div key={receipt.id} style={{ marginBottom: 32, border: "1px solid var(--paper-dark)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: "var(--paper-dark)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={receipt.img} alt={`Receipt ${idx + 1}`} style={{ width: 40, height: 54, objectFit: "cover", borderRadius: 2 }} />
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ink)" }}>Receipt #{idx + 1}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-faint)", textTransform: "uppercase" }}>{receiptItems.length} items</div>
                  </div>
                </div>
                <div style={{ padding: "0 16px" }}>
                  {receiptItems.map(it => (
                    <div key={it.id} className="line-item">
                      <input className="item-name-in" aria-label="Item name" value={it.name} onChange={e => upd(it.id, "name", e.target.value)} />
                      <span className="rm-tag">{currency}</span>
                      <input className="item-price-in" aria-label={`Price in ${currency}`} type="number" inputMode="decimal" step="0.01" value={it.price} onChange={e => upd(it.id, "price", e.target.value)} />
                      <button className="del-btn" aria-label={`Remove ${it.name || "item"}`} onClick={() => deleteItem(it.id)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {items.filter(it => !it.receiptId).length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--ink-faint)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, paddingLeft: 8 }}>Manual Items</div>
              {items.filter(it => !it.receiptId).map(it => (
                <div key={it.id} className="line-item">
                  <input className="item-name-in" aria-label="Item name" value={it.name} onChange={e => upd(it.id, "name", e.target.value)} />
                  <span className="rm-tag">{currency}</span>
                  <input className="item-price-in" aria-label={`Price in ${currency}`} type="number" inputMode="decimal" step="0.01" value={it.price} onChange={e => upd(it.id, "price", e.target.value)} />
                  <button className="del-btn" aria-label={`Remove ${it.name || "item"}`} onClick={() => deleteItem(it.id)}>×</button>
                </div>
              ))}
            </div>
          )}
          <button className="add-line-btn" onClick={() => setItems(its => [...its, { id: Date.now(), name: "New Item", price: 0 }])}>
            + Add item
          </button>
          <div style={{ marginTop: 16 }}>
            <div className="total-row grand">
              <span className="total-label">TOTAL (incl. tax)</span>
              <span className="total-val">{currency} {subtotal.toFixed(2)}</span>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <button className="btn btn-ink" disabled={items.length === 0} onClick={() => setStep(3)}>Next: Payment QR →</button>
            <button className="btn btn-outline" onClick={() => setStep(0)}>← Back</button>
          </div>
        </div>}

        {/* STEP 3 - QR */}
        {step === 3 && <div className="section">
          <div className="section-head">Your payment QR</div>
          <div className="section-sub">Guests scan this to pay you directly</div>
          {!qrImg ? (
            <>
            <button type="button" className="qr-zone" onClick={() => qrRef.current.click()}>
              <span className="upload-emoji">💳</span>
              <span className="upload-label">Upload your QR code</span>
              <span className="upload-hint">DuitNow • TNG • Maybank2u • Any QR</span>
            </button>
            <input ref={qrRef} type="file" accept="image/*" hidden aria-label="Upload payment QR" onChange={e => handleQR(e.target.files[0])} />
            </>
          ) : (
            <>
              <img src={qrImg} className="qr-preview" alt="QR" />
              <button className="btn btn-outline" onClick={() => setQrImg(null)} style={{ marginBottom: 14 }}>Change QR</button>
            </>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-ink" disabled={!qrImg || finalising} onClick={finalise}>🔗 {finalising ? "Generating..." : "Generate Table Link →"}</button>
            {err && <div className="error-strip" style={{ marginTop: 12 }}>{err}</div>}
            {!qrImg && !err && <div className="error-strip" style={{ marginTop: 12 }}>Upload your payment QR to continue — guests need it to pay you.</div>}
            <button className="btn btn-outline" onClick={() => setStep(2)}>← Back</button>
          </div>
        </div>}

        {/* STEP 4 - SHARE */}
        {step === 4 && <div className="section">
          <div className="section-head">Table is live!</div>
          <div className="section-sub">Share with everyone at the table</div>
          <div className="share-receipt">
            <div className="share-code-label">Table Code</div>
            <div className="share-code">{code}</div>
            <div className="neon-divider" />
            <div style={{ background: "white", padding: 16, borderRadius: 4, display: "inline-block", margin: "14px 0" }}>
              <QRCodeSVG value={url} size={180} />
            </div>
            <div className="share-hint">Tap to copy • Share to WhatsApp / Telegram</div>
          </div>
          <button className="btn btn-ink" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? "✓ Copied!" : "📋 Copy Link"}
          </button>
          <div style={{ marginTop: 16, borderTop: "1px dashed var(--ink-faint)", paddingTop: 16 }}>
            <div style={{ fontSize: "0.7rem", color: "var(--ink-faint)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Bill Summary</span>
              <span style={{ color: "var(--ink-light)", fontSize: "0.75rem" }}>{Object.keys(paidMap).length}/{items.length} paid</span>
            </div>
            {items.map(i => {
              const paidInfo = paidMap[i.id];
              const payers = (paidInfo?.payers || (paidInfo ? [paidInfo] : [])).map(p => typeof p === 'object' ? (p.name || "Host") : p);
              const isPaid = payers.length > 0;
              return (
                <div key={i.id} className={`line-item ${isPaid ? "paid" : ""}`} style={{ borderBottom: "1px dotted var(--ink-faint)" }}>
                  <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--ink)", fontFamily: "'DM Mono',monospace", textDecoration: isPaid ? "line-through" : "none" }}>
                    {i.name}
                  </span>
                  {isPaid
                    ? <span className="paid-tag">✓ {payers.join(", ")}</span>
                    : <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "0.85rem", color: "var(--ink-light)", fontWeight: 500 }}>{currency} {parseFloat(i.price).toFixed(2)}</span>
                  }
                </div>
              );
            })}
            <div className="bill-summary-row highlight" style={{ marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--ink)" }}>
              <span style={{ fontWeight: 500, color: "var(--ink)" }}>Total</span>
              <span className="bill-summary-val">{currency} {subtotal.toFixed(2)}</span>
            </div>
          </div>
          <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => { setStep(0); setReceipts([]); setItems([]); setQrImg(null); setCode(""); setCopied(false); }}>
            🔄 Start new table
          </button>
        </div>}
      </div>

      {/* UNDO TOAST */}
      {toast && (
        <div className="undo-toast">
          <span className="toast-msg">"{toast.item.name}" removed</span>
          <button className="toast-undo" onClick={undoDelete}>Undo</button>
          <div className="toast-bar" />
        </div>
      )}
    </>
  );
}
function GuestCode({ onJoin, onBack }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const tryJoin = async () => {
    setLoading(true);
    setErr("");
    const s = await load(code.trim());
    if (s) { onJoin(s); }
    else setErr("Table not found. Ask the host for the correct code.");
    setLoading(false);
  };
  return (
    <div className="receipt">
      <div className="receipt-inner">
        <div className="section-head">Join a table</div>
        <div className="section-sub" id="table-code-hint" style={{ marginBottom: 16 }}>Ask your host for the 4-digit table code.</div>
        <label className="field-label" htmlFor="table-code">Table code</label>
        <input id="table-code" className="name-in table-code-input" placeholder="e.g. 1234" value={code} aria-describedby="table-code-hint" aria-invalid={!!err}
          onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={e => e.key === "Enter" && code.length === 4 && !loading && tryJoin()} autoFocus
          inputMode="numeric" pattern="[0-9]{4}"
          style={{ textAlign: "center", letterSpacing: 6, fontSize: "1.2rem" }} />
        {err && <div className="error-strip" role="alert">⚠ {err}</div>}
        <button className="btn btn-ink" disabled={code.length !== 4 || loading} onClick={tryJoin}>
          {loading ? "Looking up..." : "Join Table →"}
        </button>
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

// ── PROFILE VIEW ─────────────────────────────────────────────
function ProfileView({ onHome, user, profile, setProfile, onLogout }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleQR = async (f) => {
    if (!f?.type.startsWith("image/")) return;
    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = async () => {
          const max = 400;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          const b64 = canvas.toDataURL("image/jpeg", 0.7);

          const { error } = await supabase.from('profiles').update({ qr_url: b64 }).eq('id', user.id);
          if (!error) setProfile(prev => ({ ...prev, qr_url: b64 }));
          setUploading(false);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(f);
    } catch (e) {
      console.error(e);
      setUploading(false);
    }
  };

  return (
    <div className="receipt">
      <div className="header-receipt">
        <button className="home-btn" onClick={onHome}>
          <span className="home-btn-icon">←</span>
          <span className="home-btn-label">Back</span>
        </button>
        <div className="profile-hero">
          <img src={user?.user_metadata?.picture || user?.user_metadata?.avatar_url || profile?.avatar_url} alt="User" className="profile-large-avatar" />
          <div className="profile-name">{profile?.full_name}</div>
          <div className="profile-email">{user.email}</div>
        </div>
      </div>

      <div className="section" style={{ paddingTop: 0 }}>
        <div className="vault-card">
          <div className="vault-title">🛡️ Personal QR</div>
          <p className="vault-desc">Save your default payment QR code here. It will be pre-filled every time you start a table.</p>

          <button type="button" className="vault-qr-area" onClick={() => fileRef.current.click()} aria-label="Change your default payment QR">
            {profile?.qr_url ? (
              <img src={profile.qr_url} alt="Default QR" className="vault-qr-preview" />
            ) : (
              <span className="vault-qr-placeholder">
                <span>➕</span>
                <span>Upload Payment QR</span>
              </span>
            )}
          </button>
          <input type="file" ref={fileRef} hidden accept="image/*" aria-label="Default payment QR image" onChange={e => handleQR(e.target.files[0])} />
          {uploading && <div className="spinner" style={{ margin: "10px auto" }} />}
        </div>

        <button className="btn btn-outline" style={{ marginTop: 40, color: "var(--accent-ink)", borderColor: "var(--neon-pink)" }} onClick={onLogout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
function HostReturn({ onHome, currency, user, profile }) {
  const [session, setSession] = useState(null);
  const [paidMap, setPaidMap] = useState({});
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedExcel, setCopiedExcel] = useState(false);
  const code = localStorage.getItem("ks_current_code");

  useEffect(() => {
    if (!code) return;
    load(code).then(s => {
      if (s) setSession(s);
    });
  }, []);

  const notifiedRef = useRef(new Set());
  useEffect(() => {
    if (!paidMap || !session || !code) return;

    // On first load, mark existing as notified
    if (notifiedRef.current.size === 0 && Object.keys(paidMap).length > 0) {
      Object.keys(paidMap).forEach(itemId => {
        const payers = paidMap[itemId]?.payers || [];
        payers.forEach(p => notifiedRef.current.add(`${itemId}-${p}`));
      });
      return;
    }

    const newPaymentsByPayer = {};
    Object.keys(paidMap).forEach(itemId => {
      const current = paidMap[itemId]?.payers || [];
      current.forEach(payer => {
        const key = `${itemId}-${payer}`;
        if (!notifiedRef.current.has(key)) {
          const item = session.items.find(i => i.id.toString() === itemId.toString());
          if (!newPaymentsByPayer[payer]) newPaymentsByPayer[payer] = [];
          newPaymentsByPayer[payer].push(item?.name || "an item");
          notifiedRef.current.add(key);
        }
      });
    });

    Object.keys(newPaymentsByPayer).forEach(payer => {
      sendLocalNotification("Incoming Payment!", `${payer} paid for ${newPaymentsByPayer[payer].join(", ")}`);
    });
  }, [paidMap, session, code]);

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => {
      loadSessionState(code).then(s => setPaidMap(s.paid));
    }, 2000);
    return () => clearInterval(t);
  }, [code]);


  if (!session) return (
    <div className="receipt">
      <div className="receipt-inner" style={{ textAlign: "center", padding: "40px 24px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <div className="section-sub">Loading your table...</div>
      </div>
    </div>
  );

  const url = `${window.location.origin}${window.location.pathname}?table=${code}`;
  const subtotal = session.items.reduce((s, i) => s + parseFloat(i.price || 0), 0);

  return (
    <div className="receipt">
      <div className="header-receipt">
        <button className="home-btn" onClick={onHome}>
          <span className="home-btn-icon">⌂</span>
          <span className="home-btn-label">Home</span>
        </button>
        <img src={LOGO_SRC} alt="KakiSplit" className="logo-img" />
        <div className="logo-tagline">Split bills lah, no drama</div>
        <div><span className="badge-strip">🧾 Your Table</span></div>
      </div>

      <div className="section">
        <div style={{ background: "var(--ink)", borderRadius: 4, padding: "16px 20px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--on-dark-muted)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>Table Code</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "2.4rem", fontWeight: 900, color: "var(--neon-lime)", letterSpacing: 8 }}>{code}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--on-dark-muted)", marginTop: 8, letterSpacing: 1 }}>
            {session.tableName} · {session.tableDate}
          </div>
        </div>

        <div style={{ fontSize: "0.7rem", color: "var(--ink-faint)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Bill Summary</span>
          <span style={{ color: "var(--ink-light)", fontSize: "0.75rem" }}>{Object.keys(paidMap).length}/{session.items.length} paid</span>
        </div>

        {/* UNPAID ITEMS */}
        {session.items.filter(i => !paidMap[i.id]).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--accent-ink)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
              ⏳ Unpaid ({session.items.filter(i => !paidMap[i.id]).length})
            </div>
            {session.items.filter(i => !paidMap[i.id]).map(i => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px dotted var(--ink-faint)" }}>
                <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--ink)", fontFamily: "'DM Mono',monospace" }}>
                  {i.name}
                </span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "0.85rem", color: "var(--accent-ink)", fontWeight: 500 }}>
                  {currency} {parseFloat(i.price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* PAID ITEMS */}
        {session.items.filter(i => paidMap[i.id]).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--ink-light)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
              ✓ Paid ({session.items.filter(i => paidMap[i.id]).length})
            </div>
            {session.items.filter(i => paidMap[i.id]).map(i => {
              const paidInfo = paidMap[i.id];
              const payers = (paidInfo?.payers || [paidInfo]).map(p => typeof p === 'object' ? (p.name || "Host") : p);
              return (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px dotted var(--ink-faint)", opacity: 0.5 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--ink)", fontFamily: "'DM Mono',monospace", textDecoration: "line-through" }}>
                      {i.name}
                    </span>
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-faint)", marginTop: 2 }}>
                      paid by {payers.join(", ")}
                    </div>
                  </div>
                  <span className="paid-tag">✓ {payers.join(", ")}</span>
                </div>
              )
            })}
          </div>
        )}

        <div className="bill-summary-row highlight" style={{ marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--ink)" }}>
          <span style={{ fontWeight: 500, color: "var(--ink)" }}>Total</span>
          <span className="bill-summary-val">{currency} {subtotal.toFixed(2)}</span>
        </div>

        <button className="btn btn-ink" style={{ marginTop: 16 }} onClick={() => {
          navigator.clipboard.writeText(url);
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2000);
        }}>
          {copiedLink ? "✓ Copied!" : "📋 Copy Table Link"}
        </button>
        <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => {
          const rows = ["Item\tPrice\tTax\tTotal\tPaid By"];
          session.items.forEach(i => {
            const paidInfo = paidMap[i.id];
            const payersArray = (paidInfo?.payers || (paidInfo ? [paidInfo] : [])).map(p => typeof p === 'object' ? (p.name || "Host") : p);
            const payers = payersArray.join(", ");
            const originalPrice = i.rawPrice || i.price;
            const itemTax = i.itemTax || 0;
            rows.push(`${i.name}\t${originalPrice.toFixed(2)}\t${itemTax.toFixed(2)}\t${parseFloat(i.price).toFixed(2)}\t${payers}`);
          });
          rows.push(`\t\t\t\t`);
          rows.push(`Total\t\t\t${subtotal.toFixed(2)}\t`);
          navigator.clipboard.writeText(rows.join("\n"));
          setCopiedExcel(true);
          setTimeout(() => setCopiedExcel(false), 2000);
        }}>
          {copiedExcel ? "✓ Copied!" : "📊 Copy to Excel"}
        </button>
        <button className="btn btn-outline" style={{ marginTop: 10, borderColor: "var(--neon-pink)", color: "var(--accent-ink)" }}
          onClick={async () => {
            await supabase.from("sessions").update({ concluded: true }).eq("code", code);
            const tables = JSON.parse(localStorage.getItem("ks_tables") || "[]");
            const updated = tables.filter(t => t.code !== code);
            localStorage.setItem("ks_tables", JSON.stringify(updated));
            localStorage.removeItem("ks_current_code");
            localStorage.removeItem("ks_current_name");
            localStorage.removeItem("ks_current_date");
            onHome();
          }}>
          🏁 Conclude Table
        </button>
        <button className="btn btn-outline" onClick={onHome}>← Home</button>
      </div>
    </div>
  );
}

// ── AUTH MODAL ────────────────────────────────────────────────
function AuthModal({ onClose, onLogin }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={dialogRef} className="auth-dialog" aria-labelledby="auth-title" onClose={e => { if (!e.currentTarget.open) onClose(); }} onClick={e => { if (e.target === e.currentTarget) dialogRef.current.close(); }}>
      <div className="qr-modal-inner">
        <div className="qr-modal-top">
          <div id="auth-title" className="qr-modal-title" style={{ fontSize: '1.2rem', marginBottom: 12 }}>Join KakiSplit</div>
          <div className="qr-modal-sub" style={{ textTransform: 'none', lineHeight: 1.4 }}>
            You need to be signed in to host a table or scan receipts.
          </div>
        </div>
        
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <button className="btn btn-ink" onClick={() => onLogin('google')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>G</span> Sign in with Google
          </button>
        </div>
        
        <button className="qr-modal-close" onClick={() => dialogRef.current.close()}>Cancel</button>
      </div>
    </dialog>
  );
}

// ── QR ONBOARDING ─────────────────────────────────────────────
function QROnboarding({ onSkip, user, profile, setProfile }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleQR = async (f) => {
    if (!f?.type.startsWith("image/")) return;
    setUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result;
      const { error } = await supabase.from('profiles').update({ qr_url: b64 }).eq('id', user.id);
      if (!error) {
        setProfile(prev => ({ ...prev, qr_url: b64 }));
        onSkip();
      }
      setUploading(false);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="receipt landing">
      <div className="header-receipt">
        <div className="profile-hero" style={{ borderBottom: "none", marginBottom: 0 }}>
          <img src={user?.user_metadata?.picture || user?.user_metadata?.avatar_url || profile?.avatar_url} alt="User" className="profile-large-avatar" />
          <div className="profile-name">Welcome, {profile?.full_name?.split(" ")[0]}!</div>
        </div>
      </div>

      <div className="section" style={{ paddingTop: 0, textAlign: "center" }}>
        <p className="vault-desc" style={{ fontSize: "0.8rem", marginBottom: "24px" }}>
          Before hosting, upload your payment QR code. We'll automatically attach it to your receipts.
        </p>

        <button type="button" className="vault-qr-area" onClick={() => fileRef.current.click()} aria-label="Upload your payment QR" style={{ marginBottom: "24px", maxWidth: "240px", margin: "0 auto 24px" }}>
          {profile?.qr_url ? (
            <img src={profile.qr_url} alt="Default QR" className="vault-qr-preview" />
          ) : (
            <span className="vault-qr-placeholder">
              <span>➕</span>
              <span>Upload QR (Optional)</span>
            </span>
          )}
        </button>
        <input type="file" ref={fileRef} hidden accept="image/*" aria-label="Payment QR image" onChange={e => handleQR(e.target.files[0])} />
        {uploading && <div className="spinner" style={{ margin: "10px auto" }} />}

        <button className="btn btn-ink" style={{ marginBottom: "12px" }} onClick={() => fileRef.current.click()}>Select Image</button>
        <button className="btn btn-outline" onClick={onSkip}>Skip for now</button>
      </div>
    </div>
  );
}

// ── LANDING PAGE ──────────────────────────────────────────────
function LandingPage({ onHost, onGuest, onReturnTable, currency, onCurrencyChange, user, profile, onLogin, onProfile }) {
  const tables = JSON.parse(localStorage.getItem("ks_tables") || "[]");

  const oldTables = tables.filter(t => {
    const tableDate = new Date(t.date);
    const now = new Date();
    const diff = now - tableDate;
    return diff > 12 * 60 * 60 * 1000;
  });

  return (
    <div className="receipt landing">
      <div className="top-nav">
        {user ? (
          <button className="user-chip" onClick={onProfile} aria-label="Open your profile">
            <img src={user.user_metadata.picture || user.user_metadata.avatar_url || profile?.avatar_url} alt="Profile" className="user-avatar" />
            <span className="user-name">{profile?.full_name?.split(" ")[0]}</span>
          </button>
        ) : (
          <button className="login-pill" onClick={onLogin}>Host Login</button>
        )}
      </div>

      <div className="hero">
        <img src={LOGO_SRC} alt="KakiSplit" className="hero-logo" />

        {oldTables.length > 0 && (
          <div className="pending-alert">
            <span style={{ fontSize: "1.5rem" }}>🕒</span>
            <div>
              <div className="pending-title">Unconcluded Tables</div>
              <div className="pending-desc">You have {oldTables.length} table{oldTables.length > 1 ? "s" : ""} from {oldTables[0].date} still active.</div>
            </div>
          </div>
        )}

        <div className="hero-headline">
          Split bills lah,<br /><em>no drama.</em>
        </div>
        <div className="hero-sub">
          Snap a receipt. Share a code.<br />
          Everyone pays their exact share — instantly.
        </div>

        <div className="currency-selector-row">
          {["MYR", "SGD", "AUD"].map(c => (
            <button key={c} className={`currency-chip ${currency === c ? 'active' : ''}`} aria-pressed={currency === c} onClick={() => onCurrencyChange(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="hero-cta-row">
          <button className="btn-hero-host" onClick={onHost}>
            🧾 Host a Table
          </button>
          <button className="btn-hero-guest" onClick={onGuest}>
            👥 Join as Guest
          </button>
        </div>
      </div>

      <div className="how-section">
        <div className="how-label">How it works</div>
        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-num">01</div>
            <div>
              <div className="how-step-title">Snap the receipt</div>
              <div className="how-step-desc">AI reads every line item in seconds. Edit anything it misses.</div>
            </div>
          </div>
          <div className="how-step">
            <div className="how-step-num">02</div>
            <div>
              <div className="how-step-title">Share the code</div>
              <div className="how-step-desc">Guests tap what they ordered. Splitting is automatic.</div>
            </div>
          </div>
          <div className="how-step">
            <div className="how-step-num">03</div>
            <div>
              <div className="how-step-title">Settle up</div>
              <div className="how-step-desc">Everyone scans your {currency === "MYR" ? "DuitNow" : ""} QR and pays their exact share.</div>
            </div>
          </div>
        </div>
      </div>

      {tables.length > 0 && (
        <div className="recent-tables" style={{ paddingTop: 20, borderTop: "1px dashed var(--ink-faint)" }}>
          <div className="recent-label">Your Tables</div>
          {tables.map(t => (
            <button key={t.code} className="recent-card" onClick={() => onReturnTable(t.code)} aria-label={`Open ${t.name}, table ${t.code}`}>
              <div>
                <div className="recent-name">{t.name}</div>
                <div className="recent-meta">{t.date}</div>
              </div>
              <div className="recent-code">{t.code}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KakiSplit() {
  const [mode, setMode] = useState(null);
  const [guestSession, setGuestSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const fetchProfile = async (currentUser) => {
    if (!currentUser) return;
    const uid = currentUser.id;

    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();

    const meta = currentUser.user_metadata || {};
    const gName = meta.full_name || meta.name || currentUser.email?.split("@")[0] || "Host";
    const gPic = meta.avatar_url || meta.picture || "";

    if (data) {
      if (!data.full_name || !data.avatar_url) {
        const { data: updated } = await supabase.from('profiles').update({
          full_name: data.full_name || gName,
          avatar_url: data.avatar_url || gPic
        }).eq('id', uid).select().single();
        if (updated) setProfile(updated);
      } else {
        setProfile(data);
      }
    } else if (error && error.code === 'PGRST116') {
      const { data: created } = await supabase.from('profiles').insert({
        id: uid,
        full_name: gName,
        avatar_url: gPic
      }).select().single();
      if (created) setProfile(created);
    }
  };

  const restorePostLoginMode = () => {
    const stored = localStorage.getItem("ks_post_login_mode");
    if (!stored) return;
    try {
      const { mode: savedMode, ts } = JSON.parse(stored);
      if (Date.now() - ts < 60000) {
        localStorage.removeItem("ks_post_login_mode");
        setMode(savedMode);
      } else {
        localStorage.removeItem("ks_post_login_mode");
      }
    } catch {
      localStorage.removeItem("ks_post_login_mode");
    }
  };

  useEffect(() => {
    // Unregister any existing Service Workers to prevent iOS Safari fetch stalling bugs
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.unregister();
        }
      });
    }

    // Haptic feedback on button clicks
    const handleClick = (e) => {
      const btn = e.target.closest('button, .btn, .mode-card, .guest-item, .tool-chip, .line-item.host-selectable');
      if (btn && !btn.disabled && navigator.vibrate) {
        navigator.vibrate(10);
      }
    };
    document.addEventListener('click', handleClick, { passive: true });

    let mounted = true;
    let subscription = null;

    const init = async () => {
      const tableCode = new URLSearchParams(window.location.search).get("table");

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user);

        const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((event, session) => {
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchProfile(session.user);
            if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
              if (!tableCode) restorePostLoginMode();
            }
          } else {
            setProfile(null);
          }
        });
        subscription = sub;

        if (tableCode) {
          const s = await load(tableCode);
          if (!mounted) return;
          if (s) {
            setGuestSession(s);
            setMode("guest");
          } else {
            setMode("notfound");
          }
        } else {
          restorePostLoginMode();
        }
      } catch (e) {
        console.error("Init failed:", e);
        if (mounted && tableCode) setMode("notfound");
      } finally {
        if (mounted) setInitializing(false);
      }
    };

    init();

    return () => {
      mounted = false;
      document.removeEventListener('click', handleClick);
      subscription?.unsubscribe();
    };
  }, []);

  const handleLogin = async (provider, intendedMode = "host") => {
    try {
      localStorage.setItem("ks_post_login_mode", JSON.stringify({ mode: intendedMode, ts: Date.now() }));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: window.location.origin + "/app"
        }
      });
      if (error) throw error;
    } catch (e) {
      console.error("Login failed:", e);
      alert("Login failed. Check your Supabase settings.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setMode(null);
  };

  const [currency, setCurrency] = useState(() => {
    const saved = localStorage.getItem("ks_currency");
    if (saved === "RM") return "MYR"; // Migration
    return saved || "MYR";
  });

  const [showQROnboarding, setShowQROnboarding] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (user && profile && !profile.qr_url && !localStorage.getItem("ks_qr_skipped")) {
      setShowQROnboarding(true);
    }
  }, [user, profile]);

  const handleSkipQR = () => {
    localStorage.setItem("ks_qr_skipped", "1");
    setShowQROnboarding(false);
  };

  const changeCurrency = (c) => {
    setCurrency(c);
    localStorage.setItem("ks_currency", c);
  };

  return (
    <>
      <style>{css}</style>
      <div className="bg" />
      <div className="app">
        {initializing && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <div style={{ textAlign: "center", color: "var(--paper)" }}>
              <div className="spinner" style={{ margin: "0 auto 16px" }} />
              <div style={{ fontSize: "0.8rem", letterSpacing: 2, textTransform: "uppercase", opacity: 0.5 }}>Loading...</div>
            </div>
          </div>
        )}

        {!initializing && <>
          {showQROnboarding && (
            <QROnboarding 
              onSkip={handleSkipQR}
              user={user}
              profile={profile}
              setProfile={setProfile}
            />
          )}

          {showAuthModal && (
            <AuthModal 
              onClose={() => setShowAuthModal(false)} 
              onLogin={handleLogin} 
            />
          )}

          {!showQROnboarding && !mode && (
            <LandingPage
              onHost={user ? () => setMode("host") : () => setShowAuthModal(true)}
              onGuest={() => setMode("guest-code")}
              onReturnTable={code => {
                if (user) {
                  localStorage.setItem("ks_current_code", code);
                  setMode("host-return");
                } else {
                  setShowAuthModal(true);
                }
              }}
              currency={currency}
              onCurrencyChange={changeCurrency}
              user={user}
              profile={profile}
              onLogin={() => setShowAuthModal(true)}
              onProfile={() => setMode("profile")}
            />
          )}

          {mode === "host" && <HostView onHome={() => setMode(null)} currency={currency} user={user} profile={profile} />}
          {mode === "host-return" && <HostReturn onHome={() => setMode(null)} currency={currency} user={user} profile={profile} />}
          {mode === "profile" && <ProfileView onHome={() => setMode(null)} user={user} profile={profile} setProfile={setProfile} onLogout={handleLogout} />}

          {mode === "guest" && guestSession && (
            <>
              <div className="receipt">
                <div className="header-receipt">
                  <button className="home-btn" onClick={() => setMode(null)}>
                    <span className="home-btn-icon">⌂</span>
                    <span className="home-btn-label">Home</span>
                  </button>
                  <img src={LOGO_SRC} alt="KakiSplit" className="logo-img" />
                  <div className="logo-tagline">Split bills lah, no drama</div>
                  <div><span className="badge-strip guest-badge">👥 Guest</span></div>
                </div>
              </div>
              <GuestView session={guestSession} onBack={() => setMode(null)} currency={currency} />
            </>
          )}

          {mode === "guest-code" && (
            <>
              <div className="receipt">
                <div className="header-receipt">
                  <button className="home-btn" onClick={() => setMode(null)}>
                    <span className="home-btn-icon">⌂</span>
                    <span className="home-btn-label">Home</span>
                  </button>
                  <img src={LOGO_SRC} alt="KakiSplit" className="logo-img" />
                  <div className="logo-tagline">Split bills lah, no drama</div>
                  <div><span className="badge-strip guest-badge">👥 Guest</span></div>
                </div>
              </div>
              <GuestCode onJoin={s => { setGuestSession(s); setMode("guest"); }} onBack={() => setMode(null)} />
            </>
          )}

          {mode === "notfound" && (
            <div className="receipt">
              <div className="receipt-inner" style={{ textAlign: "center", padding: "40px 24px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 14 }}>😕</div>
                <div className="section-head" style={{ textAlign: "center" }}>Table not found</div>
                <div className="section-sub" style={{ textAlign: "center", marginBottom: 24 }}>Link may have expired or host hasn't started yet</div>
                <button className="btn btn-ink" onClick={() => setMode(null)}>Back to Home</button>
              </div>
            </div>
          )}
        </>}
      </div>
    </>
  );
}