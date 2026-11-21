# KakiSplit 🧾

Split bills lah, no drama.

## Setup

Use Node.js 22.13+ and run `npm ci` then `npm run dev` for the Vite UI.
Create a local `.env` (never commit credentials):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
OPENROUTER_API_KEY=your-server-only-openrouter-key
```

Only the first two variables are public browser configuration. Never put an OCR
key or Supabase service-role key in a `VITE_` variable. OCR runs exclusively in
`api/ocr.js`, using a fixed model/prompt/schema. It requires Supabase sign-in
and SQL quotas (30 requests per user/day and 2,000 globally/day, UTC). Every
request, including a retry, consumes quota before contacting the provider.
Manual item entry remains available if OCR is unavailable.

Vite alone does not serve serverless functions. Use Vercel's development runtime
or a Vercel preview deployment to exercise OCR; `npm run dev` is for UI-only
development. Static-only deployments cannot scan receipts.

## Deploy to Vercel

Follow the ordered rollout in [SECURITY_AUDIT.md](SECURITY_AUDIT.md): additive
SQL first, server environment variables/key rotation, client/function deploy,
then lockdown SQL. Do not apply lockdown before deploying the RPC-aware client.
Keep the two public Supabase variables in Vercel alongside the three server
variables above; use the same Supabase project for both.

New tables use cryptographically random eight-character codes, displayed as
`ABCD-EFGH`. Guests may enter lowercase, spaces or dashes. Existing four-digit
tables remain joinable until concluded; they are still low-entropy links and
should be retired promptly. Existing rows without a trusted owner are guest-
accessible through RPCs only after lockdown; localStorage cannot claim them.

## Tests

`npm test` runs Node unit tests and React integration tests without live services.
`npm run build` builds the production UI. `supabase/tests/security.sql` bootstraps
a minimal schema and applies both migrations in a **fresh disposable** PostgreSQL
database (never run it against Supabase). Example:

```sh
docker run --name kakisplit-security-test -e POSTGRES_PASSWORD=local-only -d postgres:16
# Once PostgreSQL is ready:
docker cp supabase kakisplit-security-test:/audit
docker exec kakisplit-security-test psql -U postgres -v ON_ERROR_STOP=1 -f /audit/tests/security.sql
```

The household reader also uses the fixed server extraction endpoint (no public
key fallback). Its legacy metadata/independent-model verification is not provided
by this endpoint, so adapted household results are always marked for review.
