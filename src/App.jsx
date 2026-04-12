import { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@supabase/supabase-js";
import { Analytics } from "@vercel/analytics/react"

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const LOGO_SRC = "/kakisplit-logo.png";

// ── DESIGN SYSTEM ─────────────────────────────────────────────
// Thermal Receipt × Night Market Neon
// Cream paper bg, dark ink type, electric neon accents
// Fonts: Playfair Display (display) + DM Mono (body/numbers)

const css = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Mono:wght@400;500&family=Unbounded:wght@700;900&display=swap');

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
  font-family: 'DM Mono', monospace;
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
  font-size: 0.6rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ink-faint);
  transition: color 0.3s;
}

.step-item .step-num.active ~ .step-label { color: var(--ink); }
.step-item .step-num.done ~ .step-label { color: var(--ink-light); }

/* ── CONTENT ── */
.section { padding: 22px 24px; border-bottom: 1px dashed var(--ink-faint); }
.section:last-child { border-bottom: none; }

.section-head {
  font-family: 'Playfair Display', serif;
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--ink);
  margin-bottom: 6px;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.section-sub {
  font-size: 0.75rem;
  color: var(--ink-faint);
  letter-spacing: 0.5px;
  text-transform: uppercase;
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
  font-family: 'Playfair Display', serif;
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

.upload-hint { font-size: 0.75rem; color: var(--ink-faint); letter-spacing: 0.5px; text-transform: uppercase; }

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
  font-family: 'Playfair Display', serif;
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
  color: var(--neon-pink);
  margin-bottom: 16px;
  line-height: 1.6;
}

/* ── BUTTONS ── */
.btn {
  width: 100%;
  padding: 18px 20px;
  border: none;
  border-radius: 3px;
  font-family: 'DM Mono', monospace;
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
}
.line-item:last-of-type { border-bottom: none; }

.item-name-in {
  flex: 1;
  font-family: 'DM Mono', monospace;
  font-size: 0.9rem;
  color: var(--ink);
  background: transparent;
  border: none;
  outline: none;
  font-weight: 500;
  min-height: 44px;
  padding: 4px 0;
}

.item-price-in {
  font-family: 'DM Mono', monospace;
  font-size: 0.9rem;
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
  font-family: 'Playfair Display', serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
}
.total-row.grand .total-val {
  font-family: 'Playfair Display', serif;
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
  font-family: 'Unbounded', sans-serif;
  font-size: 2.4rem;
  font-weight: 900;
  color: var(--neon-lime);
  letter-spacing: 8px;
  margin: 14px 0;
  position: relative;
}

.share-code-label {
  font-size: 0.65rem;
  color: rgba(245,240,232,0.4);
  letter-spacing: 3px;
  text-transform: uppercase;
}

.share-url-box {
  background: rgba(245,240,232,0.06);
  border-radius: 3px;
  padding: 14px;
  font-size: 0.7rem;
  color: rgba(245,240,232,0.5);
  word-break: break-all;
  margin: 14px 0 6px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
  min-height: 48px;
  display: flex; align-items: center; justify-content: center;
}
.share-url-box:hover { background: rgba(245,240,232,0.1); }
.share-hint { font-size: 0.65rem; color: rgba(245,240,232,0.3); letter-spacing: 1px; text-transform: uppercase; }

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
  font-family: 'Playfair Display', serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 6px;
}
.mode-desc { font-size: 0.72rem; color: var(--ink-faint); line-height: 1.5; }

/* ── GUEST ITEMS ── */
.guest-item {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 0;
  border-bottom: 1px dotted var(--ink-faint);
  cursor: pointer;
  transition: all 0.15s;
  min-height: 60px;
}
.guest-item:last-of-type { border-bottom: none; }
.guest-item:active { opacity: 0.7; }

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

.guest-item.sel .g-check {
  background: var(--neon-pink);
  border-color: var(--neon-pink);
  color: white;
}

.g-name {
  flex: 1;
  font-family: 'DM Mono', monospace;
  font-size: 0.9rem;
  color: var(--ink);
  font-weight: 500;
  line-height: 1.4;
}

.g-price {
  font-family: 'DM Mono', monospace;
  font-size: 0.9rem;
  color: var(--ink-light);
  font-weight: 500;
}

.guest-item.sel .g-name { color: var(--neon-pink); }
.guest-item.sel .g-price { color: var(--neon-pink); }

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

.sticky-label { font-size: 0.65rem; color: rgba(245,240,232,0.4); letter-spacing: 2px; text-transform: uppercase; }
.sticky-amt {
  font-family: 'Playfair Display', serif;
  font-size: 1.7rem;
  font-weight: 900;
  color: var(--neon-lime);
  line-height: 1;
}

.sticky-pay-btn {
  background: var(--neon-pink);
  color: var(--paper);
  border: none;
  border-radius: 3px;
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
.sticky-pay-btn:not(:disabled):hover { background: #e02068; }

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
  border-radius: 4px;
  width: 100%; max-width: 340px;
  text-align: center;
  overflow: hidden;
}

.qr-modal-top {
  padding: 24px 24px 16px;
  border-bottom: 1px dashed var(--ink-faint);
}

.qr-modal-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.4rem;
  font-weight: 900;
  color: var(--ink);
  margin-bottom: 4px;
}

.qr-modal-sub { font-size: 0.75rem; color: var(--ink-faint); letter-spacing: 1px; text-transform: uppercase; }

.qr-modal-amt {
  font-family: 'Unbounded', sans-serif;
  font-size: 2.2rem;
  font-weight: 900;
  color: var(--neon-pink);
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
  font-family: 'DM Mono', monospace;
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
  opacity: 0.45;
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
  opacity: 0.4;
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
  color: var(--neon-orange);
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
  font-family: 'Playfair Display', serif;
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
  color: var(--neon-pink);
}

@keyframes hero-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.hero-sub {
  font-family: 'DM Mono', monospace;
  font-size: 0.78rem;
  color: var(--ink-faint);
  letter-spacing: 0.5px;
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
  font-family: 'Unbounded', sans-serif;
  font-size: 1.3rem; font-weight: 900; line-height: 1;
  flex-shrink: 0; width: 36px; padding-top: 2px;
}
.how-step:nth-child(1) .how-step-num { color: var(--neon-pink); }
.how-step:nth-child(2) .how-step-num { color: var(--ink); }
.how-step:nth-child(3) .how-step-num { color: var(--neon-cyan); }

.how-step-title {
  font-family: 'Playfair Display', serif;
  font-size: 1rem; font-weight: 700;
  color: var(--ink); margin-bottom: 3px;
}

.how-step-desc {
  font-family: 'DM Mono', monospace;
  font-size: 0.72rem; color: var(--ink-faint);
  line-height: 1.6; letter-spacing: 0.3px;
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
  font-family: 'Playfair Display', serif;
  font-size: 0.95rem; font-weight: 700; color: var(--ink); margin-bottom: 2px;
}

.recent-meta {
  font-family: 'DM Mono', monospace;
  font-size: 0.62rem; color: var(--ink-faint); letter-spacing: 0.5px;
}

.recent-code {
  font-family: 'Unbounded', sans-serif;
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
    if ('serviceWorker' in navigator) {
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
async function save(d) {
  const { data, error } = await supabase.from("sessions").upsert({
    code: d.code,
    items: d.items,
    qr_image: d.qrImage || null,
    paid: {},
    table_name: d.tableName || "My Table",
    table_date: d.tableDate || new Date().toISOString().split("T")[0]
  });
  console.log("SAVE RESULT:", data, error);
}

async function load(code) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("code", code)
    .limit(1);
  if (!data || error || data.length === 0) return null;
  const row = data[0];
  return {
    code: row.code,
    items: row.items,
    qrImage: row.qr_image,
    paid: row.paid,
    tableName: row.table_name,
    tableDate: row.table_date
  };
}

async function savePaid(itemId, name, code, splitCount = 1) {
  if (!code) code = new URLSearchParams(window.location.search).get("table") || localStorage.getItem("ks_current_code");
  if (!code) return;
  const { data } = await supabase.from("sessions").select("paid").eq("code", code).single();
  const paid = data?.paid || {};
  if (!paid[itemId]) paid[itemId] = { payers: [], total: splitCount };
  if (!paid[itemId].payers) paid[itemId] = { payers: [paid[itemId]], total: 1 };
  if (!paid[itemId].payers.includes(name)) paid[itemId].payers.push(name);
  await supabase.from("sessions").update({ paid }).eq("code", code);
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
    <div className="step-bar">
      {steps.map((s, i) => (
        <div key={s} className="step-item">
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
    for (const i of myItems) {
      const paidInfo = paidMap[i.id];
      const totalSplit = paidInfo?.total || splits[i.id] || 1;
      await savePaid(i.id, name, session.code, totalSplit);
    }
    const { paid } = await loadSessionState(session.code);
    setPaidMap(paid);
    setDone(true);
    setShowQR(false);
  };

  if (!named) return (
    <div className="receipt" style={{ marginTop: 0 }}>
      <div className="receipt-inner">
        <div className="section-head">What's your name?</div>
        <div className="section-sub" style={{ marginBottom: 16 }}>So the host knows who's paid</div>
        <input className="name-in" placeholder="e.g. Yagiz, Dylan, Sabry..."
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
          <div style={{ fontSize: "0.55rem", color: "rgba(245,240,232,0.4)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>You paid</div>
          <div style={{ fontFamily: "Unbounded,sans-serif", fontSize: "2.4rem", fontWeight: 900, color: "var(--neon-lime)", letterSpacing: -1 }}>
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

  return (
    <>
      <div className="receipt">
        <div className="header-receipt" style={{ paddingBottom: 14 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
            Hey {name} 👋
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--ink-faint)", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 4 }}>
            Tap everything you ordered
          </div>
        </div>
        <div style={{ padding: "4px 24px 90px" }}>
          {items.map(item => {
            const paidInfo = paidMap[item.id];
            const paidBy = paidInfo?.payers || (paidInfo ? [paidInfo] : []);
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
                <div className={`guest-item ${sel[item.id] ? "sel" : ""}`}
                  onClick={() => setSel(s => ({ ...s, [item.id]: !s[item.id] }))}>
                  <div className="g-check">{sel[item.id] ? "✓" : ""}</div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <span className="g-name">{item.name}</span>
                    {selections[item.id] && selections[item.id].filter(n => n !== name).length > 0 && (
                      <span style={{ fontSize: "0.6rem", color: "var(--neon-pink)", fontWeight: 600 }}>
                        Highlighted by {selections[item.id].filter(n => n !== name).join(", ")}
                      </span>
                    )}
                  </div>
                  <span className="g-price">{currency} {splitPrice.toFixed(2)}</span>
                </div>
                {paidBy.length > 0 && (
                  <div style={{ padding: "4px 24px 4px 56px", fontSize: "0.65rem", color: "var(--ink-light)" }}>
                    {paidBy.length}/{totalSplit} paid by {paidBy.join(", ")}
                  </div>
                )}
                {sel[item.id] && paidBy.length === 0 && (
                  <div style={{ padding: "8px 24px 12px 56px", display: "flex", alignItems: "center", gap: 12, fontSize: "0.75rem", color: "var(--ink)" }}>
                    <span style={{ fontWeight: 500 }}>Split with:</span>
                    <button onClick={() => setSplits(s => ({ ...s, [item.id]: Math.max(1, (s[item.id] || totalSplit) - 1) }))}
                      style={{ padding: "8px 16px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "1rem", fontWeight: 600, minWidth: 40 }}>−</button>

                    <span style={{ minWidth: 80, textAlign: "center", fontWeight: 600, fontSize: "0.8rem" }}>
                      {(splits[item.id] || totalSplit) === 1 ? "no one" : `${(splits[item.id] || totalSplit) - 1} other${(splits[item.id] || totalSplit) > 2 ? "s" : ""}`}
                    </span>

                    <button onClick={() => setSplits(s => ({ ...s, [item.id]: (s[item.id] || totalSplit) + 1 }))}
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

      {showQR && (
        <div className="qr-modal" onClick={() => setShowQR(false)}>
          <div className="qr-modal-inner" onClick={e => e.stopPropagation()}>
            <div className="qr-modal-top">
              <div className="qr-modal-title">Scan & Pay</div>
              <div className="qr-modal-sub">Pay exactly this amount</div>
            </div>
            <div className="qr-modal-amt">{currency} {myTotal.toFixed(2)}</div>
            <div className="qr-img-wrap">
              <img src={qrImage} className="qr-img" alt="QR" />
            </div>
            <button className="qr-modal-close" style={{ background: "var(--neon-pink)", color: "var(--paper)" }}
              onClick={confirmPayment}>
              ✅ I Have Paid
            </button>
            <button className="qr-modal-close" style={{ background: "transparent", color: "var(--ink-faint)", borderTop: "1px dashed var(--ink-faint)" }}
              onClick={() => setShowQR(false)}>
              ← Back
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── SCAN TO EXCEL ─────────────────────────────────────────────
function ScanToExcel({ onHome, currency }) {
  const [img, setImg] = useState(null);
  const [b64, setB64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState([]);
  const [tax, setTax] = useState(0);
  const [sc, setSc] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();

  const handleFile = f => {
    if (!f?.type.startsWith("image/")) return;
    setImg(URL.createObjectURL(f));
    const r = new FileReader();
    r.onload = e => setB64(e.target.result.split(",")[1]);
    r.readAsDataURL(f);
    setErr(""); setItems([]); setCopied(false);
  };

  const scanReceipt = async () => {
    setLoading(true); setErr("");
    try {
      const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: "image/jpeg", data: b64 } },
                { text: `Extract individual line items from this receipt. Return ONLY valid JSON, no markdown, no explanation:\n{"items":[{"name":"Item Name","price":12.50,"qty":2}],"tax":1.50,"serviceCharge":2.00,"discount":0}\nRules:\n- price = unit price for ONE item (divide total by qty)\n- qty = quantity shown on receipt, default 1\n- If same item appears multiple times, combine them into one entry with combined qty\n- IGNORE subtotal, total, grand total, rounding rows\n- tax = Govt SST amount, serviceCharge = Service Charge amount, discount = discount amount, all in ringgit not %\n- use 0 if any field absent` }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
          })
        }
      );
      const data = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = JSON.parse(txt.replace(/```json|```/g, "").trim());
      setItems((parsed.items || []).map((it, i) => ({ id: i, name: it.name, price: parseFloat(it.price || 0), qty: parseInt(it.qty || 1) })));
      setTax(parseFloat(parsed.tax || 0));
      setSc(parseFloat(parsed.serviceCharge || 0));
      setDiscount(parseFloat(parsed.discount || 0));
    } catch (e) { setErr("Couldn't read receipt. Try a clearer photo."); }
    setLoading(false);
  };

  const copyForExcel = () => {
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const extras = tax + sc - discount;
    const rows = ["Item Name\tPrice\tTax\tTotal"];
    items.forEach(it => {
      const lineTotalRaw = it.price * it.qty;
      const proportion = subtotal > 0 ? lineTotalRaw / subtotal : 0;
      const itemTaxTotal = extras * proportion;
      const itemTaxUnit = itemTaxTotal / it.qty;
      const itemFinalTotal = (it.price + itemTaxUnit) * it.qty;
      rows.push(`${it.name}\t${it.price.toFixed(2)}\t${itemTaxUnit.toFixed(2)}\t${(it.price + itemTaxUnit).toFixed(2)}`);
    });
    rows.push(`\t\t\t`);
    rows.push(`Subtotal\t${subtotal.toFixed(2)}\t\t`);
    if (tax > 0) rows.push(`Tax (SST)\t\t${tax.toFixed(2)}\t`);
    if (sc > 0) rows.push(`Service Charge\t\t${sc.toFixed(2)}\t`);
    if (discount > 0) rows.push(`Discount\t\t-${discount.toFixed(2)}\t`);
    rows.push(`Grand Total\t\t\t${(subtotal + extras).toFixed(2)}`);
    navigator.clipboard.writeText(rows.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const upd = (id, f, v) => setItems(its => its.map(it => it.id === id ? { ...it, [f]: v } : it));

  return (
    <div className="receipt">
      <div className="header-receipt">
        <button className="home-btn" onClick={onHome}>
          <span className="home-btn-icon">⌂</span>
          <span className="home-btn-label">Home</span>
        </button>
        <img src={LOGO_SRC} alt="KakiSplit" className="logo-img" />
        <div className="logo-tagline">Split bills lah, no drama</div>
        <div><span className="badge-strip">📊 Scan to Excel</span></div>
      </div>

      <div className="section">
        <div className="section-head">Scan your receipt</div>
        <div className="section-sub">Extract items & copy straight into Excel</div>

        {!img ? (
          <div className={`upload-zone ${drag ? "drag" : ""}`}
            onClick={() => fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files[0])} />
            <span className="upload-emoji">📸</span>
            <div className="upload-label">Tap to snap or upload</div>
            <div className="upload-hint">Any receipt · JPG, PNG, HEIC</div>
          </div>
        ) : (
          <>
            <img src={img} className="preview-img" alt="Receipt" />
            {err && <div className="error-strip">⚠ {err}</div>}
            {loading ? (
              <div className="loading-receipt">
                <div className="spinner" />
                <div className="loading-label">Extracting items...</div>
                <div className="loading-sub">Reading your receipt</div>
              </div>
            ) : items.length === 0 ? (
              <>
                <button className="btn btn-ink" onClick={scanReceipt}>Extract Items →</button>
                <button className="btn btn-outline" onClick={() => { setImg(null); setB64(null); setErr(""); }}>Try another photo</button>
              </>
            ) : null}
          </>
        )}

        {items.length > 0 && (
          <>
            <div style={{ marginTop: 16, marginBottom: 8 }}>
              {items.map(it => (
                <div key={it.id} className="line-item">
                  <input className="item-name-in" value={it.name} onChange={e => upd(it.id, "name", e.target.value)} />
                  <input className="item-price-in" type="number" step="1" min="1" value={it.qty}
                    onChange={e => upd(it.id, "qty", parseInt(e.target.value) || 1)}
                    style={{ width: 36, textAlign: "center" }} title="Qty" />
                  <span className="rm-tag">{currency}</span>
                  <input className="item-price-in" type="number" step="0.01" value={it.price} onChange={e => upd(it.id, "price", parseFloat(e.target.value) || 0)} />
                </div>
              ))}
              <div className="total-row grand" style={{ marginTop: 12 }}>
                <span className="total-label">GRAND TOTAL</span>
                <span className="total-val">{currency} {(items.reduce((s, it) => s + it.price * it.qty, 0) + tax + sc - discount).toFixed(2)}</span>
              </div>
            </div>

            <button className="btn btn-ink" onClick={copyForExcel} style={{ background: copied ? "var(--neon-lime)" : undefined, color: copied ? "var(--ink)" : undefined }}>
              {copied ? "✅ Copied! Paste into Excel" : "📋 Copy for Excel"}
            </button>
            <button className="btn btn-outline" onClick={() => { setImg(null); setB64(null); setItems([]); setErr(""); setCopied(false); }}>
              Scan another receipt
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── HOST VIEW ─────────────────────────────────────────────────
function HostView({ onHome, currency }) {
  const [step, setStep] = useState(0);
  const [receipts, setReceipts] = useState([]); // [{id, img, b64, items, tax, sc, discount}]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState([]);
  const [qrImg, setQrImg] = useState(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [paidMap, setPaidMap] = useState({});
  const fileRef = useRef();
  const qrRef = useRef();
  const STEPS = ["Receipt", "Details", "Items", "QR", "Share"];
  const [tableName, setTableName] = useState("");
  const [tableDate, setTableDate] = useState(new Date().toISOString().split("T")[0]);

  const handleFile = async (files) => {
    const newReceipts = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;

      const b64Str = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result.split(",")[1]);
        r.readAsDataURL(f);
      });

      newReceipts.push({
        id: Math.random().toString(36).substr(2, 9),
        img: URL.createObjectURL(f),
        b64: b64Str,
        items: []
      });
    }
    setReceipts(prev => [...prev, ...newReceipts]);
    setErr("");
  };

  const parseReceipt = async () => {
    setLoading(true); setErr("");
    try {
      const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      const allBakedItems = [];
      let globalIdCounter = 1;

      for (const receipt of receipts) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: "image/jpeg", data: receipt.b64 } },
                  { text: `You are a professional accounting auditor. Extract data from this receipt with 100% mathematical integrity.
                  
                  RETURN ONLY THIS JSON SCHEMA:
                  {
                    "items": [{"name": "Item Name", "price": 12.50, "qty": 1}],
                    "tax": 1.50,
                    "serviceCharge": 2.20,
                    "discount": 0.00,
                    "rounding": 0.02,
                    "grandTotal": 16.22
                  }

                  STRICT AUDIT RULES:
                  1. ITEM PRICE: Extract the unit price (price for 1 qty).
                  2. INDIVIDUAL ENTRIES: DO NOT combine duplicates. If an item appears multiple times as separate lines on the receipt, LIST THEM INDIVIDUALLY in the JSON.
                  3. BALANCE THE BOOKS: The sum of (price * qty) + tax + serviceCharge - discount + rounding MUST EQUAL grandTotal exactly.
                  4. ROUNDING: Use the 'rounding' field for small balancing adjustments (e.g. 0.01, -0.05) to ensure the equation is perfect.
                  5. CLEAN NAMES: Remove prefix numbers or symbols from item names.

                  Return ONLY the raw JSON object. No markdown, no prose.` }
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
            })
          }
        );
        const data = await res.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = JSON.parse(txt.replace(/```json|```/g, "").trim());
        
        const rawItems = parsed.items || [];
        const tax = parseFloat(parsed.tax || 0);
        const sc = parseFloat(parsed.serviceCharge || 0);
        const discount = parseFloat(parsed.discount || 0);
        const rounding = parseFloat(parsed.rounding || 0);
        const receiptGrandTotal = parseFloat(parsed.grandTotal || 0);
        
        const extras = tax + sc - discount + rounding;
        const rawSubtotal = rawItems.reduce((s, i) => s + parseFloat(i.price || 0) * parseInt(i.qty || 1), 0);
        
        const currentReceiptBaked = [];
        rawItems.forEach(it => {
          const itemPrice = parseFloat(it.price || 0);
          const qty = parseInt(it.qty || 1);
          const lineTotal = itemPrice * qty;
          const proportion = rawSubtotal > 0 ? lineTotal / rawSubtotal : 0;
          const totalExtras = extras * proportion;
          const taxPerUnit = totalExtras / qty;
          const finalUnitPrice = parseFloat((itemPrice + taxPerUnit).toFixed(2));
          
          for (let q = 0; q < qty; q++) {
            currentReceiptBaked.push({
              name: qty > 1 ? `${it.name} (${q + 1}/${qty})` : it.name,
              rawPrice: itemPrice,
              itemTax: taxPerUnit,
              price: finalUnitPrice,
              id: globalIdCounter++,
              receiptId: receipt.id
            });
          }
        });

        // RECONCILIATION: Ensure unit price rounding doesn't create a discrepancy
        const bakedSum = currentReceiptBaked.reduce((s, i) => s + i.price, 0);
        const targetSum = receiptGrandTotal > 0 ? receiptGrandTotal : (rawSubtotal + extras);
        const diff = targetSum - bakedSum;
        
        if (Math.abs(diff) > 0 && Math.abs(diff) < 1 && currentReceiptBaked.length > 0) {
          currentReceiptBaked[currentReceiptBaked.length - 1].price = parseFloat((currentReceiptBaked[currentReceiptBaked.length - 1].price + diff).toFixed(2));
        }
        
        allBakedItems.push(...currentReceiptBaked);
      }
      setItems(allBakedItems);
      setStep(1);
    } catch (e) { 
      console.error("Auditor error:", e);
      setErr("Auditor Error: Couldn't verify the receipt balance. Try a clearer photo."); 
    }
    setLoading(false);
  };

  const handleQR = f => {
    if (!f?.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = e => setQrImg(e.target.result);
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

  const finalise = async () => {
    const c = genCode();
    // Save to list of all host tables
    const existing = JSON.parse(localStorage.getItem("ks_tables") || "[]");
    existing.unshift({ code: c, name: tableName || "My Table", date: tableDate });
    localStorage.setItem("ks_tables", JSON.stringify(existing));
    localStorage.setItem("ks_current_code", c);
    localStorage.setItem("ks_current_name", tableName || "My Table");
    localStorage.setItem("ks_current_date", tableDate);
    await save({ code: c, items, qrImage: qrImg, tableName: tableName || "My Table", tableDate });
    setCode(c);
    setPaidMap({});
    setStep(4);
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

          <div className={`upload-zone ${drag ? "drag" : ""}`}
            onClick={() => fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files); }}>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => handleFile(e.target.files)} />
            <span className="upload-emoji">📸</span>
            <div className="upload-label">Tap to snap or upload</div>
            <div className="upload-hint">Upload one or more receipts</div>
          </div>

          {receipts.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 10, marginBottom: 20 }}>
                {receipts.map(r => (
                  <div key={r.id} style={{ position: "relative", aspectRatio: "3/4" }}>
                    <img src={r.img} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4, border: "1px solid var(--ink-faint)" }} />
                    <button onClick={() => setReceipts(prev => prev.filter(x => x.id !== r.id))}
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
                  <button className="btn btn-ink" onClick={parseReceipt}>Scan All Receipts →</button>
                  <button className="btn btn-outline" onClick={() => setReceipts([])}>Clear All</button>
                </>
              )}
            </div>
          )}
          {err && <div className="error-strip" style={{ marginTop: 16 }}>⚠ {err}</div>}
        </div>}
        {/* STEP 1 - TABLE DETAILS */}
        {step === 1 && <div className="section">
          <div className="section-head">Name your table</div>
          <div className="section-sub">So you can find it later</div>
          <input className="name-in" placeholder="e.g. Jalan Alor dinner, KLCC lunch..."
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
                <div key={val} className="date-chip" onClick={() => setTableDate(val)}
                  style={{
                    background: tableDate === val ? "var(--ink)" : "var(--paper-dark)",
                    border: tableDate === val ? "1.5px solid var(--ink)" : "1.5px solid var(--ink-faint)",
                  }}>
                  <div style={{ fontSize: "0.55rem", color: tableDate === val ? "var(--neon-lime)" : "var(--ink-faint)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500, color: tableDate === val ? "var(--neon-lime)" : "var(--ink)" }}>{dayNum}</div>
                </div>
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

          {receipts.map((receipt, idx) => {
            const receiptItems = items.filter(it => it.receiptId === receipt.id);
            if (receiptItems.length === 0) return null;
            return (
              <div key={receipt.id} style={{ marginBottom: 32, border: "1px solid var(--paper-dark)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: "var(--paper-dark)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={receipt.img} style={{ width: 40, height: 54, objectFit: "cover", borderRadius: 2 }} />
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ink)" }}>Receipt #{idx + 1}</div>
                    <div style={{ fontSize: "0.6rem", color: "var(--ink-faint)", textTransform: "uppercase" }}>{receiptItems.length} items</div>
                  </div>
                </div>
                <div style={{ padding: "0 16px" }}>
                  {receiptItems.map(it => (
                    <div key={it.id} className="line-item">
                      <input className="item-name-in" value={it.name} onChange={e => upd(it.id, "name", e.target.value)} />
                      <span className="rm-tag">{currency}</span>
                      <input className="item-price-in" type="number" step="0.01" value={it.price} onChange={e => upd(it.id, "price", e.target.value)} />
                      <button className="del-btn" onClick={() => deleteItem(it.id)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {items.filter(it => !it.receiptId).length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: "0.65rem", color: "var(--ink-faint)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, paddingLeft: 8 }}>Manual Items</div>
              {items.filter(it => !it.receiptId).map(it => (
                <div key={it.id} className="line-item">
                  <input className="item-name-in" value={it.name} onChange={e => upd(it.id, "name", e.target.value)} />
                  <span className="rm-tag">{currency}</span>
                  <input className="item-price-in" type="number" step="0.01" value={it.price} onChange={e => upd(it.id, "price", e.target.value)} />
                  <button className="del-btn" onClick={() => deleteItem(it.id)}>×</button>
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

        {/* STEP 3 */}
        {step === 3 && <div className="section">
          <div className="section-head">Your payment QR</div>
          <div className="section-sub">Guests scan this to pay you directly</div>
          {!qrImg ? (
            <div className="qr-zone" onClick={() => qrRef.current.click()}>
              <input ref={qrRef} type="file" accept="image/*" onChange={e => handleQR(e.target.files[0])} />
              <span className="upload-emoji">💳</span>
              <div className="upload-label">Upload your QR code</div>
              <div className="upload-hint">DuitNow • TNG • Maybank2u • Any QR</div>
            </div>
          ) : (
            <>
              <img src={qrImg} className="qr-preview" alt="QR" />
              <button className="btn btn-outline" onClick={() => setQrImg(null)} style={{ marginBottom: 14 }}>Change QR</button>
            </>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-ink" disabled={!qrImg} onClick={finalise}>🔗 Generate Table Link →</button>
            {!qrImg && <div className="error-strip" style={{ marginTop: 12 }}>Upload your payment QR to continue — guests need it to pay you.</div>}
            <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
          </div>
        </div>}

        {/* STEP 4 */}
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
              <span style={{ color: "var(--ink-light)", fontSize: "0.6rem" }}>{Object.keys(paidMap).length}/{items.length} paid</span>
            </div>
            {items.map(i => {
              const paidInfo = paidMap[i.id];
              const payers = paidInfo?.payers || (paidInfo ? [paidInfo] : []);
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
        <div className="section-sub" style={{ marginBottom: 16 }}>Enter the 6-letter code from the host</div>
        <input className="name-in" placeholder="e.g. 1234" value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={e => e.key === "Enter" && tryJoin()} autoFocus
          inputMode="numeric" pattern="[0-9]*"
          style={{ textAlign: "center", letterSpacing: 6, fontSize: "1.2rem" }} />
        {err && <div className="error-strip">⚠ {err}</div>}
        <button className="btn btn-ink" disabled={!code.trim() || loading} onClick={tryJoin}>
          {loading ? "Looking up..." : "Join Table →"}
        </button>
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────
function HostReturn({ onHome, currency }) {
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
          <div style={{ fontSize: "0.55rem", color: "rgba(245,240,232,0.4)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>Table Code</div>
          <div style={{ fontFamily: "Unbounded,sans-serif", fontSize: "2.4rem", fontWeight: 900, color: "var(--neon-lime)", letterSpacing: 8 }}>{code}</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(245,240,232,0.5)", marginTop: 8, letterSpacing: 1 }}>
            {session.tableName} · {session.tableDate}
          </div>
        </div>

        <div style={{ fontSize: "0.7rem", color: "var(--ink-faint)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Bill Summary</span>
          <span style={{ color: "var(--ink-light)", fontSize: "0.6rem" }}>{Object.keys(paidMap).length}/{session.items.length} paid</span>
        </div>

        {/* UNPAID ITEMS */}
        {session.items.filter(i => !paidMap[i.id]).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.6rem", color: "var(--neon-pink)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
              ⏳ Unpaid ({session.items.filter(i => !paidMap[i.id]).length})
            </div>
            {session.items.filter(i => !paidMap[i.id]).map(i => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px dotted var(--ink-faint)" }}>
                <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--ink)", fontFamily: "'DM Mono',monospace" }}>
                  {i.name}
                </span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "0.85rem", color: "var(--neon-pink)", fontWeight: 500 }}>
                  {currency} {parseFloat(i.price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* PAID ITEMS */}
        {session.items.filter(i => paidMap[i.id]).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.6rem", color: "var(--ink-light)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
              ✓ Paid ({session.items.filter(i => paidMap[i.id]).length})
            </div>
            {session.items.filter(i => paidMap[i.id]).map(i => {
              const paidInfo = paidMap[i.id];
              const payers = paidInfo?.payers || [paidInfo];
              return (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px dotted var(--ink-faint)", opacity: 0.5 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--ink)", fontFamily: "'DM Mono',monospace", textDecoration: "line-through" }}>
                      {i.name}
                    </span>
                    <div style={{ fontSize: "0.65rem", color: "var(--ink-faint)", marginTop: 2 }}>
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
            const payers = paidInfo?.payers ? paidInfo.payers.join(", ") : (paidInfo || "");
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
        <button className="btn btn-outline" style={{ marginTop: 10, borderColor: "var(--neon-pink)", color: "var(--neon-pink)" }}
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

// ── LANDING PAGE ──────────────────────────────────────────────
function LandingPage({ onHost, onGuest, onScanExcel, onReturnTable, currency, onCurrencyChange }) {
  const tables = JSON.parse(localStorage.getItem("ks_tables") || "[]");
  const [notifState, setNotifState] = useState(() => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"));

  const handleNotifReq = async () => {
    const res = await requestNotificationPermission();
    setNotifState(res);
  };

  const oldTables = tables.filter(t => {
    const tableDate = new Date(t.date);
    const now = new Date();
    const diff = now - tableDate;
    return diff > 12 * 60 * 60 * 1000;
  });

  return (
    <div className="receipt landing">
      {notifState === "default" && (
        <div className="notify-banner">
          <span>🔔 Want real-time payment alerts?</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-notify-perm" onClick={handleNotifReq}>Enable</button>
          </div>
        </div>
      )}

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
            <button key={c} className={`currency-chip ${currency === c ? 'active' : ''}`} onClick={() => onCurrencyChange(c)}>
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
            <div key={t.code} className="recent-card" onClick={() => onReturnTable(t.code)}>
              <div>
                <div className="recent-name">{t.name}</div>
                <div className="recent-meta">{t.date}</div>
              </div>
              <div className="recent-code">{t.code}</div>
            </div>
          ))}
        </div>
      )}

      <div className="landing-footer">
        <div className="tool-chip" onClick={onScanExcel}>
          <span className="tool-chip-icon">📊</span>
          <span className="tool-chip-label">Scan to Excel</span>
        </div>
      </div>
    </div>
  );
}

export default function KakiSplit() {
  const [mode, setMode] = useState(null);
  const [guestSession, setGuestSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(e => console.error("SW failed:", e));
    }
  }, []);

  const [currency, setCurrency] = useState(() => {
    const saved = localStorage.getItem("ks_currency");
    if (saved === "RM") return "MYR"; // Migration
    return saved || "MYR";
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("table");
    if (t) {
      load(t).then(s => {
        if (s) { setGuestSession(s); setMode("guest"); }
        else setMode("notfound");
        setInitializing(false);
      });
    } else {
      setInitializing(false);
    }
  }, []);

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
          {!mode && (
            <LandingPage
              onHost={() => setMode("host")}
              onGuest={() => setMode("guest-code")}
              onScanExcel={() => setMode("scan-excel")}
              onReturnTable={code => { localStorage.setItem("ks_current_code", code); setMode("host-return"); }}
              currency={currency}
              onCurrencyChange={changeCurrency}
            />
          )}

          {mode === "host" && <HostView onHome={() => setMode(null)} currency={currency} />}
          {mode === "host-return" && <HostReturn onHome={() => setMode(null)} currency={currency} />}
          {mode === "scan-excel" && <ScanToExcel onHome={() => setMode(null)} currency={currency} />}

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