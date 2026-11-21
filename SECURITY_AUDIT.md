# Abuse/security review

Scope: repository/static analysis and local regression tests, not a production penetration test. No production database, policies, deployed headers, credentials, or provider billing configuration were queried. This is not a guarantee of absence of bugs. Normal flow and split arithmetic work is separate.

## Findings

| Severity | Finding | Status |
| --- | --- | --- |
| Critical | OCR credentials are compiled into browser JavaScript whenever `VITE_GEMINI_API_KEY` or `VITE_OPENROUTER_API_KEY` is configured. | **Unfixed; needs server-side deployment.** `App.jsx` passes both variables into `scanReceipt`, which sends credentials directly to provider endpoints. README currently instructs operators to configure these public variables. No actual credential value was found in tracked source. Remove these deployment variables and rotate any keys previously deployed; removing them disables scanning, but manual entry remains available. |
| Critical, conditional on deployed grants/RLS | Table enumeration and guest mutation of host data. | **Unfixed; database authority redesign required.** Active `load` reads whole session rows by four-digit code. Guest writes update the same `sessions` row directly; host QR and conclude writes also filter only by code. There is no owner ID in the creation payload, join membership, or unguessable capability. Code space is only 9,000. If the grants needed by these direct guest writes are broad, an attacker can bypass UI restrictions and replace items, paid state or the payment QR. Deployed grants/policies are unknown; actual unauthorized access is **not verified**. Client-side throttles/randomness would not fix REST access. |
| High, conditional on deployed policies | Profile read/write isolation cannot be established. | **Unfixed; dashboard verification needed.** Profile calls filter by user ID in the browser, which is not authorization. No SQL, migrations, or policies are tracked. See policy suggestions below. |
| High | OCR cost/rate abuse. | **Unfixed; no active server endpoint exists in this repository.** Public provider credentials can be copied and used outside the app. Browser request timeout, token cap, and finite retries are not rate limits. The unused household module tries `/api/ocr` then falls back to a public key; it is not part of the active `src/main.jsx` import graph. Do not deploy an unauthenticated pass-through proxy as the fix. |
| Medium | Arbitrary same-origin GETs could enter the old service worker cache, including future API responses or callback URLs. | **Fixed in repo.** Replaced the retired worker with an upgrade cleanup worker that deletes only KakiSplit caches, claims clients and unregisters. It has no fetch handler. Active App already unregisters workers, so this is legacy/future defense, not evidence that current sessions were cached. Existing clients must receive this worker update for cleanup. |
| Medium | Missing clickjacking, MIME, referrer and content restrictions. | **Fixed in repo.** Vercel config denies framing/objects, restricts executable scripts and connection destinations, suppresses referrers (including table links), and disables app/API/worker HTTP caching. Inline styles and HTTPS images remain allowed for the current UI and avatars. Headers require a Vercel deploy and are not verified on the live domain. |
| Medium | Hostile paid JSON or inherited object keys can crash or corrupt the payment handler. | **Fixed in active handler.** Validate payment arguments, reject reserved object keys, check own properties and validate persisted entry shapes before mutation. Invalid input/state fails closed without writes. This is robustness, not authorization against callers who bypass the app. |
| Medium | Model output could amplify into an excessive number of UI rows or enormous names. | **Fixed in active OCR reconciler.** Reject more than 200 input items/100 adjustments, skip names over 300 characters, and bound expanded portions. This does not prevent a forged but mathematically balanced receipt. |
| High (dependency advisories; reachability varies) | Dependency audit reported 9 vulnerable packages, including Vite development-server issues and transitive `ws`. | **Fixed in lockfile.** Applied compatible `npm audit fix` updates; no forced upgrades. The production browser uses native WebSocket, so the Node `ws` advisory was not established as reachable in deployed clients. Development/build-tool findings still warrant patched dependencies; do not expose the Vite development server publicly. |
| Medium | Concurrent selections overwrite each other; names are guest-supplied identities. | **Unfixed; needs authenticated membership and transactional RPC.** `updateGuestSelection` reads the whole map then writes it without a compare-and-swap. Two callers can erase each other's choices. Duplicate guest names can replace another guest's selections. Hostile clients can overwrite the map directly if RLS permits it. |
| Low / residual | Payment acknowledgements are self-asserted, not bank confirmations. | Active `savePaidWithClient` already uses bounded compare-and-swap retries; existing regression tests cover same/different item races, duplicate writes and capacity. It is not tamper resistance. A client supplies payer name and initial split count. The unused `src/utils/supabase.js` duplicate uses unconditional writes; it is not imported into the active app and should not be reused. |

## Other checks

- Table creation uses `insert` with collision retries, not the unused `save` upsert helper: collision alone does not overwrite a table. Database uniqueness on `code` is assumed by the code and must be verified in Supabase.
- No `dangerouslySetInnerHTML`, `eval`, or `new Function` path was found in application source. Receipt/item text is rendered through React escaping. OCR already requests structured JSON, treats image text as data, rejects malformed readings, and flags unreconciled totals; a prompt cannot establish trust in money or payment destination. Human review is still required. The model has no tools or database execution access.
- Payment QR images from session/profile rows may be attacker-controlled if RLS is wrong. `<img>` is not an HTML execution sink, but remote images can track visitors and a substituted QR can redirect payment. CSP is not a substitute for owner-only writes. Consider restricting stored QR values to re-encoded raster data URLs, with server-side size limits, during the backend redesign.
- Supabase URL and anon/publishable key are intended to be public. No service-role key literal was found in tracked source. Do not configure a service-role key in **any** `VITE_` variable.
- Supabase defaults persist browser auth tokens in localStorage; local table codes/names/QR images are also persisted. Local host-return markers are not proof of ownership. An XSS or an untrusted same-origin script can read browser tokens; a shared browser retains table metadata. CSP reduces script injection exposure but does not create a server-side session. A backend-for-frontend with HttpOnly cookies is a separate architecture change.

### CSP compatibility

Tesseract.js 7.0.0 browser defaults were checked in the installed package (`src/worker/browser/defaultOptions.js`, `spawnWorker.js`, `src/worker-script/browser/getCore.js`, and `src/worker-script/index.js`). The worker is `https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js`, bootstrapped through a blob worker. Core glue and WASM come from `https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/` (SIMD/relaxed-SIMD and legacy/LSTM variants depend on runtime features/options). The current prep options enable legacy language/core support, so English data is `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz`; LSTM-only defaults use `4.0.0_best_int` instead. No separate tessdata host is used by these v7 defaults.

The CSP permits jsDelivr in script/worker/connect sources, blob workers, and WASM compilation via `'wasm-unsafe-eval'`, without allowing JavaScript eval or inline scripts. Allowing the CDN also trusts its executable scripts; self-hosting pinned OCR assets would reduce that trust boundary. Same-origin Vercel analytics scripts/events, HTTPS Google avatars, Supabase HTTPS/WSS calls and top-level OAuth redirects remain permitted. React inline styles and static `<style>` tags are allowed; the four source HTML entrypoints contain no inline scripts or event handlers. Custom Supabase domains would need explicit CSP entries.

## Required Supabase/server actions

1. Inspect all `sessions`/`profiles` grants, RLS flags, policies and SECURITY DEFINER functions in the dashboard. Confirm production matches intended schema before applying migrations. Check for overlapping permissive policies: adding a restrictive-looking permissive policy does not remove an existing `USING (true)` policy.
2. For profiles, a suggested baseline (after reviewing/removing conflicting policies) is:

   ```sql
   alter table public.profiles enable row level security;
   revoke all on public.profiles from anon;
   grant select, insert, update on public.profiles to authenticated;
   create policy profiles_self_read on public.profiles
     for select to authenticated using (id = (select auth.uid()));
   create policy profiles_self_insert on public.profiles
     for insert to authenticated with check (id = (select auth.uid()));
   create policy profiles_self_update on public.profiles
     for update to authenticated using (id = (select auth.uid()))
     with check (id = (select auth.uid()));
   ```

3. Sessions need a coordinated schema/client migration, **not** a policy that allows updates by knowledge of a code. Add immutable `owner_id uuid` referencing `auth.users`, authenticated/anonymous-authenticated table membership with member IDs, expiry, and an unguessable invite token. The four-digit code should be only a rate-limited lookup challenge, not authority. Backfill ownership using trusted records, never localStorage. Suggested owner policy shape after that migration:

   ```sql
   alter table public.sessions enable row level security;
   revoke all on public.sessions from anon;
   create policy sessions_owner_read on public.sessions
     for select to authenticated using (owner_id = (select auth.uid()));
   create policy sessions_owner_insert on public.sessions
     for insert to authenticated with check (owner_id = (select auth.uid()));
   create policy sessions_owner_update on public.sessions
     for update to authenticated using (owner_id = (select auth.uid()))
     with check (owner_id = (select auth.uid()));
   ```

   These are **design examples, not a drop-in migration**: `owner_id` does not exist in this repo's creation payload. Applied alone they would break guests. Remove broad guest table privileges/policies; implement narrow, authenticated RPCs for joining, reading a redacted session view, changing only the caller's selections and marking only the caller's payments. RPCs must check membership, expiry/concluded state, item existence, split/capacity limits and payload bounds, and serialize updates with row locks/atomic JSON operations. Restrict EXECUTE grants and set a safe search_path for any SECURITY DEFINER function. Host-only fields (items, QR, ownership, concluded) must never be accepted from a guest RPC. Rate-limit code guesses by authenticated identity and IP in durable server-side storage; return generic failures and expire sessions.
4. Move OCR keys to server-only variables and rotate exposed keys. Use an authenticated server handler with a fixed model/prompt, raster-only size-limited images, fixed token/call limits, timeout, durable per-user/IP quotas, global daily budget and provider spend caps. Do not accept arbitrary model URLs, messages or keys from clients. Disable public-key fallbacks in both OCR modules when migrating; revoke old deployed assets/keys. Deploy and verify the complete path before re-enabling scanning.
5. Add production integration checks using separate host, unrelated host and guest identities: list tables, guess codes, replace QR/items, conclude another table, mutate another profile, replay joins/payments, concurrent payments/selections and post-expiry access. This review did not exercise a live backend or render the UI.
