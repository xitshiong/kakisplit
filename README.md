# PayWho? 🧾

Split bills lah, no drama.

## Setup

1. Get a free Gemini API key at https://aistudio.google.com
2. Create a `.env` file in the root:
   ```
   VITE_GEMINI_API_KEY=your_key_here
   ```
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub
2. Import repo on vercel.com
3. Add `VITE_GEMINI_API_KEY` in Vercel → Settings → Environment Variables
4. Deploy!
