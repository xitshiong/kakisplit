# Abuse/security review and rollout

Repository implementation and local tests only: no live Supabase project, policies, provider keys or billing settings were changed. Server-side protections take effect only after the owner completes the rollout below.

## Findings

| Severity | Finding | Status |
| --- | --- | --- |
| Critical | OCR keys in browser bundles and unbounded provider spend | Fixed in code, pending deployment/key rotation. Browser calls only authenticated /api/ocr; server verifies the JWT with auth.getUser, consumes transactional user/global daily quota, and constructs fixed-model/schema requests. No public-key fallback remains. |
| Critical | Guessable codes and guests rewriting host fields | Fixed for new tables after full rollout. Eight cryptographic characters (~39 bits), normalized input, redacted guest reads and narrow locked RPCs replace direct guest row access. Lockdown removes broad policies and limits session rows to owners. Legacy four-digit tables remain guessable until concluded; retire them promptly. |
| High | Profile ownership was not established in repo | Fixed by lockdown self-only RLS; deployment required. SQL also constrains QR values to bounded raster data URLs. |
| Medium | Concurrent paid/selection writes lost updates | Fixed by SELECT FOR UPDATE in mark_paid/set_selections. Retries are idempotent for the same name/item; capacity is rechecked under lock. |
| Medium | Legacy worker cached arbitrary GETs; browser response headers absent | Fixed in repo: cache retirement, CSP, framing/MIME/referrer restrictions, no-store headers. Requires redeployment. |
| Medium | Hostile payment JSON and excessive model output | Client checks plus server input limits; bounded model token count, OCR arrays/names/rows and locked RPC input validation. |
| High (advisory ratings) | Nine vulnerable dependency packages | Compatible lockfile updates applied; npm audit fix reported zero vulnerabilities. Browser reachability varied; do not expose the Vite dev server publicly. |
| Residual | Guest payment/selection identity is a display name | Explicit limitation of the requested capability-link design. Anyone with the full code can impersonate another name, mark a payment without bank proof or reserve shares. RPCs protect host fields and serialize changes, not bank settlement or guest identity. Authenticated membership would be needed to prevent this. |
| Residual | Anonymous join brute force / legacy lookup | New code space is much larger, but get_session itself has no IP rate limiter or expiry. Keep codes private, conclude old tables, and use Vercel/Supabase edge protections against volumetric abuse. |
| Residual | LocalStorage auth and local table metadata | Supabase browser sessions persist locally. Same-origin XSS/shared-browser access remains a risk. Local table markers never authorize database writes. |

No HTML injection sink, eval or new Function path was found in application source. Receipt names are React-escaped; model output is untrusted data. A forged but balanced receipt can still deceive extraction, so human review remains necessary.

### CSP compatibility

Installed Tesseract.js 7.0.0 defaults use:
- https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js (blob bootstrap).
- https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/ for core variants/WASM.
- https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz with the prep worker's legacy options; LSTM-only uses 4.0.0_best_int.

CSP allows jsDelivr scripts/workers/connections, blob workers and wasm-unsafe-eval, but not JavaScript eval or inline scripts. Inline styles, Google HTTPS avatars, same-origin Vercel analytics, Supabase HTTPS/WSS and top-level OAuth redirects are allowed. Browser access to OpenRouter/Gemini has been removed. A custom Supabase domain needs explicit CSP entries. Self-hosting pinned Tesseract assets would reduce CDN trust.

## Ordered owner runbook

1. **Back up and preflight Supabase**, then run Part 1 in [Supabase SQL Editor](https://supabase.com/dashboard) → your project → SQL Editor:
   - File: `supabase/migrations/202611210001_add_security_rpcs.sql`.
   - Confirm existing sessions have a unique text-compatible `code`, JSON/JSONB `items/paid/selections`, boolean `concluded`, and the other fields referenced by the migration. Confirm `profiles.id` is the auth user UUID.
   - Inspect legacy QR values first: the new NOT VALID checks do not scan existing rows, but PostgreSQL enforces them on **every subsequent row update**, even changes to unrelated fields. Replace invalid/oversized existing QR values with trusted raster data URLs or NULL before rollout; existing remote image URLs will not pass.
   - Existing owner_id values are preserved; rows newly receiving this column retain NULL ownership. Defaults apply only to future inserts. Do not infer ownership from localStorage.
   - Part 1 deliberately accepts both code formats in its NOT VALID CHECK so old clients can still create tables during rollout. Part 2 adds an INSERT/code-change trigger that requires eight characters while permitting unchanged legacy codes. An eight-only CHECK in Part 1 would break the old client and even legacy payment updates; NOT VALID does not exempt updates.
   - The script is transactional and intended to run once. If it fails, investigate the actual schema rather than skipping failed statements. There is no silent compatibility fallback.
2. In [Vercel](https://vercel.com/dashboard) → project → Settings → Environment Variables, configure **server-only** `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` for production and preview as appropriate. Keep public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing at the same project. Remove `VITE_OPENROUTER_API_KEY` and `VITE_GEMINI_API_KEY` from all environments. Never expose a service-role key.
3. **Rotate previously deployed credentials**: [OpenRouter Keys](https://openrouter.ai/settings/keys) → create a replacement with a spending limit → set it as the server variable → revoke the old public key. For previous Gemini keys, [Google AI Studio API Keys](https://aistudio.google.com/apikey) → delete/revoke exposed keys (or the linked Google Cloud Credentials page). Gemini is no longer used by the browser/server path. Treat historical browser assets as exposed permanently; deleting variables is not sufficient.
4. Deploy this branch to Vercel, including `api/ocr.js`. Verify /api/ocr is a function, not the SPA rewrite. Confirm host create, authenticated OCR, new-code joins, guest payment and selections work using the Part 1 RPCs. Do not deploy as static files only. Old clients may remain open: announce/reload them before lockdown.
5. Run `supabase/migrations/202611210002_lockdown.sql` in SQL Editor **after** the new client is live. It removes all policies on sessions/profiles (including broad permissive policies), revokes direct anon access and creates owner/self-only RLS. Existing rows with NULL owner_id become guest-RPC-only; their host-return/QR/conclude controls cannot write them. For important active legacy tables, backfill ownership only using independently trusted records before lockdown, or recreate them. No automatic ownership claim is implemented.
6. Verify with a separate host, unrelated host and logged-out browser. Use local environment variables for credentials; never paste real tokens into tickets/logs. Example checks:

   ```sh
   # No auth: 401, JSON (not index.html)
   curl -i -X POST "$APP_URL/api/ocr" -H 'Content-Type: application/json' --data '{"image":"data:image/png;base64,dGVzdA=="}'
   # Anon direct table write: must fail (401/403), not return a successful mutation
   curl -i -X PATCH "$SUPABASE_URL/rest/v1/sessions?code=eq.ABCDEFGH" -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' --data '{"table_name":"must-not-change"}'
   # Redacted capability read: allowed; no owner_id field
   curl -s "$SUPABASE_URL/rest/v1/rpc/get_session" -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' --data '{"p_code":"ABCDEFGH"}'
   # JWT is a signed-in user's access token. Expected 400; no quota/provider call.
   curl -i -X POST "$APP_URL/api/ocr" -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' --data '{"image":"https://example.com/not-allowed","model":"ignored-but-rejected"}'
   ```

   With a real raster image, signed-in OCR should succeed until the 30/day limit returns 429. Every retry consumes quota; global daily cap is 2,000 provider attempts, UTC, including failed provider attempts. Set provider spending caps independently. Confirm an unrelated signed-in host cannot read/update another owner's rows, a guest cannot change QR/items/concluded, repeated pay is idempotent, concurrent selections survive, and concluded sessions disappear. Verify live CSP and OAuth on the real domain.
7. Periodically remove old ocr_usage rows with a trusted administrative job, inspect quota/billing dashboards, and retire four-digit legacy tables. Preserve deployment/migration records. Rollbacks after Part 2 must retain an RPC-capable client or temporarily disable table interaction; do not re-open broad anonymous table grants.

## Local SQL verification

`supabase/tests/security.sql` is a destructive bootstrap for a fresh disposable PostgreSQL database **only**. It supplies minimal auth stubs, applies both actual migration files, and asserts anon denial, owner isolation, legacy compatibility, payment idempotence/capacity, item validation, selection preservation, concluded denial and user/global quotas. See README for Docker commands. This does not establish that the unknown live schema matches the stub.

The household reader no longer has a provider-key fallback. It uses the fixed server extraction schema, adapts that data and always marks the legacy household result for review; independent-vendor verification/metadata is not supplied by this endpoint.
