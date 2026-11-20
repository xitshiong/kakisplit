# KakiSplit 🧾

Split bills lah, no drama.

## Setup

1. Get a Google AI Studio API key at https://aistudio.google.com/apikey for primary receipt scanning with Gemini 2.5 Flash. Eligible accounts can use Google's free tier, subject to quotas and availability. Optionally get an OpenRouter key at https://openrouter.ai for paid Gemini 2.5 Flash Lite fallback.
2. Create a `.env` file in the root:
   ```
   VITE_GEMINI_API_KEY=your_google_ai_studio_key
   VITE_OPENROUTER_API_KEY=your_optional_openrouter_key
   ```
   Gemini is tried first. OpenRouter is used if the Gemini key is missing, or on quota exhaustion, server errors, connection failures or timeouts. After quota exhaustion, Gemini is skipped until the page is reloaded. Either key alone works; without either, items can still be entered manually.

   Vite embeds these keys in the browser bundle; they are not server-side secrets. Restrict keys and set provider quotas/spending limits before deploying publicly.

3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

## Tests

Use Node.js 22.13+ (on the 22.x LTS line). Run `npm ci` and then `npm test` for the full suite.
Use `npm run test:unit` for Node unit tests, `npm run test:receipt` for the
table receipt OCR and review tests, or `npm run test:ui` for React integration
tests in jsdom. The suite runs without live credentials or network services.
GitHub Actions runs the full suite and the production build on pull requests.

## Deploy to Vercel

1. Push to GitHub
2. Import repo on vercel.com
3. Add `VITE_GEMINI_API_KEY` (primary, free tier where available) and optionally `VITE_OPENROUTER_API_KEY` (paid fallback) in Vercel → Settings → Environment Variables
4. Deploy!
