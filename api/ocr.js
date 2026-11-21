import { createClient } from '@supabase/supabase-js';
import { buildReceiptRequest } from '../src/lib/receiptRequest.mjs';

const MAX_BODY = 4_000_000;
export const maxDuration = 60;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

export function createOcrHandler({ env = process.env, makeClient = createClient, fetchModel = fetch } = {}) {
  return async function handler(req, res) {
    const send = (status, body) => { res.setHeader('Cache-Control', 'no-store'); return res.status(status).json(body); };
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'POST required.' }); }
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) return send(401, { error: 'Sign in to scan receipts.' });
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.OPENROUTER_API_KEY) return send(503, { error: 'Receipt scanning is not configured.' });
    try {
      const client = makeClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        ...options, global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user) return send(401, { error: 'Sign in to scan receipts.' });
      if (Number(req.headers['content-length']) > MAX_BODY) return send(413, { error: 'Image is too large.' });
      let body = req.body;
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        if (Buffer.byteLength(body) > MAX_BODY) return send(413, { error: 'Image is too large.' });
        try { body = JSON.parse(body.toString()); } catch { return send(400, { error: 'Invalid JSON.' }); }
      }
      if (body && Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) return send(413, { error: 'Image is too large.' });
      if (!body || Array.isArray(body) || Object.keys(body).some(key => !['image', 'retry'].includes(key)) ||
          (body.retry !== undefined && typeof body.retry !== 'boolean') || typeof body.image !== 'string' ||
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)) return send(400, { error: 'Choose a JPEG, PNG or WebP image.' });
      const encoded = body.image.slice(body.image.indexOf(',') + 1);
      if (encoded.length % 4 !== 0 || Buffer.from(encoded, 'base64').toString('base64') !== encoded) return send(400, { error: 'Invalid image encoding.' });
      const quota = await client.rpc('consume_ocr_quota');
      if (quota.error) return send(503, { error: 'Receipt quota unavailable.' });
      if (quota.data !== true) return send(429, { error: 'Daily scan limit reached.' });
      const response = await fetchModel('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(40_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
        body: JSON.stringify(buildReceiptRequest(body.image, body.retry)),
      });
      if (!response.ok) return send(502, { error: 'Receipt service unavailable.' });
      const result = await response.json();
      const choice = result?.choices?.[0];
      if (typeof choice?.message?.content !== 'string' || choice.message.content.length > 200_000) return send(502, { error: 'Invalid receipt response.' });
      return send(200, { text: choice.message.content, finishReason: choice.finish_reason || 'stop' });
    } catch { return send(503, { error: 'Receipt service unavailable. Try again.' }); }
  };
}

export default createOcrHandler();
