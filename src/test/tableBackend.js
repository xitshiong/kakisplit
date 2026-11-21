import { vi } from 'vitest';
import { guestShareCents, isPayableItem } from '../lib/splitMoney.mjs';
import { paymentStatus } from '../lib/tableUi.mjs';

export const testUser = {
  id: 'host-1',
  email: 'host@example.test',
  user_metadata: { full_name: 'Hana Host' },
};

export const testProfile = {
  id: testUser.id,
  full_name: 'Hana Host',
  avatar_url: '/avatar.png',
  qr_url: '/payment.png',
};

export const dinner = (overrides = {}) => ({
  code: '1234',
  table_name: 'Night market',
  table_date: '2026-02-12',
  qr_image: '/payment.png',
  items: [
    { id: 'tea', name: 'Tea', price: 3 },
    { id: 'noodles', name: 'Noodles', price: 15 },
  ],
  paid: {},
  selections: {},
  ...overrides,
});

const json = (body, status = 200) => Response.json(body, { status });

export function mockTableBackend({ tables = [], profile = testProfile } = {}) {
  const rows = new Map(tables.map(table => [table.code, structuredClone(table)]));
  const profileRow = structuredClone(profile);
  const requests = [];
  const failures = [];
  const fetch = vi.fn(async (input, init) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    const resource = url.pathname.replace(/^\/rest\/v1\//, '');
    let code = url.searchParams.get('code')?.replace(/^eq\./, '');
    const select = url.searchParams.get('select');
    const paidFilter = url.searchParams.get('paid');
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (resource.startsWith('rpc/')) code = body.p_code;
    const request = { method, resource, code, select, body };
    requests.push(request);

    const failure = failures.findIndex(entry => entry.matches(request));
    if (failure >= 0) {
      const [{ error, status }] = failures.splice(failure, 1);
      return json(error, status);
    }

    if (resource === 'profiles') {
      if (method === 'GET') return json(profileRow);
      if (method === 'PATCH') {
        Object.assign(profileRow, body);
        return new Response(null, { status: 204 });
      }
    }
    if (resource.startsWith('rpc/')) {
      const row = rows.get(code);
      if (resource === 'rpc/get_session') return json(row && !row.concluded ? row : null);
      if (!row || row.concluded) return json(resource === 'rpc/mark_paid' ? { success: false } : false);
      if (resource === 'rpc/mark_paid') {
        const { p_item_id: id, p_name: name, p_split_count: count } = body;
        const item = row.items.find(item => String(item.id) === id);
        if (!item || !isPayableItem(item)) return json({ success: false });
        const saved = row.paid[id];
        const entry = typeof saved === 'string' ? { payers: [saved], total: 1 }
          : { payers: saved?.payers || [], total: saved?.total || count };
        if (entry.payers.includes(name)) return json({ success: true, alreadyPaid: true });
        if (entry.payers.length >= entry.total) return json({ success: false, full: true });
        if (body.p_expected_cents !== undefined && guestShareCents(item.price, entry, name, count) !== body.p_expected_cents) return json({ success: false, amountChanged: true });
        entry.payers.push(name);
        row.paid[id] = entry;
        row.selections[id] = (row.selections[id] || []).filter(selected => selected !== name && entry.payers.length < entry.total);
        return json({ success: true });
      }
      if (resource === 'rpc/set_selections') {
        for (const id of Object.keys(row.selections)) row.selections[id] = row.selections[id].filter(name => name !== body.p_name);
        for (const id of body.p_item_ids) {
          const status = paymentStatus(row.paid[id]);
          if (!status.complete && !status.payers.includes(body.p_name)) row.selections[id] = [...(row.selections[id] || []), body.p_name];
        }
        return json(true);
      }
    }
    if (resource !== 'sessions') return json({ message: 'Unexpected test request' }, 500);
    if (method === 'POST') {
      if (rows.has(body.code)) return json({ code: '23505', message: 'Duplicate code' }, 409);
      rows.set(body.code, { paid: {}, selections: {}, ...structuredClone(body) });
      return new Response(null, { status: 201 });
    }

    const row = rows.get(code);
    if (method === 'PATCH' && row) {
      if (paidFilter === 'is.null' && row.paid != null) return json([]);
      if (paidFilter?.startsWith('eq.') && JSON.stringify(row.paid) !== paidFilter.slice(3)) return json([]);
      Object.assign(row, body);
      return select === 'paid' ? json([{ paid: row.paid }]) : new Response(null, { status: 204 });
    }
    if (method === 'GET') {
      const single = new Headers(init.headers).get('accept') === 'application/vnd.pgrst.object+json';
      if (!row) return single ? json({ code: 'PGRST116', message: 'No rows' }, 406) : json([]);
      const result = select === '*' ? row : { [select]: row[select] };
      return json(single ? result : [result]);
    }
    return json({ message: 'Unexpected test request' }, 500);
  });
  vi.stubGlobal('fetch', fetch);

  return {
    rows,
    requests,
    failNext(matches, error = { message: 'Server unavailable' }, status = 503) {
      failures.push({ matches, error, status });
    },
  };
}
