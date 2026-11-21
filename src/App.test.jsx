import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { LOGIN_INTENT_KEY } from './lib/authFlow.mjs';
import { localDate } from './lib/tableUi.mjs';
import { scanReceipt } from './lib/receiptOcr.js';
import { dinner, mockTableBackend, testProfile, testUser } from './test/tableBackend.js';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@supabase/supabase-js', async importOriginal => {
  const { createClient } = await importOriginal();
  return {
    createClient(_url, _key, options) {
      const client = createClient('https://kakisplit.example.test', 'test-key', {
        ...options,
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      Object.assign(client.auth, {
        getSession: auth.getSession,
        onAuthStateChange: auth.onAuthStateChange,
        signInWithOAuth: auth.signInWithOAuth,
        signOut: auth.signOut,
      });
      return client;
    },
  };
});

vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));
vi.mock('./lib/receiptOcr.js', async importOriginal => ({
  ...await importOriginal(),
  scanReceipt: vi.fn(),
}));

const button = (name, options) => screen.getByRole('button', { name, ...options });

beforeAll(() => {
  // jsdom does not implement the native dialog methods used by the sign-in modal.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  Object.values(auth).forEach(mock => mock.mockReset());
  vi.mocked(scanReceipt).mockReset();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: auth.unsubscribe } } });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

afterEach(() => vi.useRealTimers());

function mockImageDecoding(dataUrl = 'data:image/jpeg;base64,dGVzdA==') {
  const revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = file => `blob:${file.name}`;
    static revokeObjectURL = revoke;
  });
  vi.stubGlobal('Image', class {
    width = 480;
    height = 960;
    async decode() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(), drawImage: vi.fn(),
  });
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);
  return { dataUrl, revoke, encode };
}

function renderApp(options = {}) {
  const backend = mockTableBackend(options);
  if (options.signedIn) auth.getSession.mockResolvedValue({
    data: { session: { user: testUser } }, error: null,
  });
  if (options.search) window.history.replaceState(null, '', `/app/?${options.search}`);
  const user = userEvent.setup();
  return { ...render(<App />), ...backend, user };
}

async function joinViaLink(options = {}) {
  const app = renderApp({ search: 'table=1234', tables: [dinner()], ...options });
  await screen.findByLabelText('Your name');
  return app;
}

async function enterName(user, name = 'Ari') {
  await user.type(screen.getByLabelText('Your name'), name);
  await user.click(button(/Continue/));
}

async function manualEditor(user, name = 'Friday dinner') {
  await user.click(await screen.findByRole('button', { name: /Host a Table/ }));
  await user.click(button(/Enter Items Manually/));
  await user.type(screen.getByLabelText('Table name'), name);
  await user.click(button(/Next: Check Items/));
}

async function addItem(user, name, amount) {
  await user.click(button(/Add item/));
  await user.type(screen.getAllByLabelText(/^Item \d+$/).at(-1), name);
  await user.type(screen.getAllByRole('textbox', { name: /Total/ }).at(-1), amount);
}

function saveLocally(...tables) {
  localStorage.setItem('ks_tables', JSON.stringify(tables.map(table => ({
    code: table.code,
    name: table.table_name,
    date: table.table_date,
  }))));
}

describe('home and sign-in', () => {
  it('persists the currency across reloads', async () => {
    const { user, unmount } = renderApp();
    expect(await screen.findByRole('button', { name: 'MYR', pressed: true })).toBeVisible();
    await user.click(button('SGD'));
    expect(localStorage.getItem('ks_currency')).toBe('SGD');
    unmount();

    render(<App />);
    expect(await screen.findByRole('button', { name: 'SGD', pressed: true })).toBeVisible();
  });

  it('falls back to MYR for an unsupported saved currency', async () => {
    localStorage.setItem('ks_currency', 'EUR');
    renderApp();
    expect(await screen.findByRole('button', { name: 'MYR', pressed: true })).toBeVisible();
  });

  it('requires Google sign-in before hosting, and saves the return intent', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: /Host a Table/ }));
    const dialog = screen.getByRole('dialog', { name: 'Host sign-in' });
    expect(dialog).toHaveTextContent('You need to be signed in to host');
    await user.click(within(dialog).getByRole('button', { name: /Sign in with Google/ }));

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/` },
    });
    expect(JSON.parse(localStorage.getItem(LOGIN_INTENT_KEY))).toMatchObject({ mode: 'host', ts: expect.any(Number) });
  });

  it('closes sign-in without calling the provider when canceled', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Host Login' }));
    await user.click(button('Cancel'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('allows retry when the OAuth provider cannot start', async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({ error: new Error('offline') });
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Host Login' }));
    await user.click(button(/Sign in with Google/));
    expect(await screen.findByRole('alert')).toHaveTextContent("Google sign-in couldn't start");
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(button('Host Login'));
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('does not start OAuth if the return intent cannot be written', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Host Login' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('denied'); });
    await user.click(button(/Sign in with Google/));
    expect(screen.getByRole('alert')).toHaveTextContent('Please allow browser storage');
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('keeps a saved-table return intent when a signed-out host opens the table', async () => {
    saveLocally(dinner());
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Open Night market, table 1234' }));
    await user.click(button(/Sign in with Google/));
    expect(JSON.parse(localStorage.getItem(LOGIN_INTENT_KEY))).toMatchObject({
      mode: 'host-return', code: '1234',
    });
  });

  it('resumes a host workflow after login and consumes the stored intent', async () => {
    localStorage.setItem(LOGIN_INTENT_KEY, JSON.stringify({ mode: 'host', ts: Date.now() }));
    renderApp({ signedIn: true });
    expect(await screen.findByRole('button', { name: /Enter Items Manually/ })).toBeVisible();
    expect(localStorage.getItem(LOGIN_INTENT_KEY)).toBeNull();
  });

  it('resumes the intended saved table instead of the last open one', async () => {
    localStorage.setItem('ks_current_code', '9876');
    localStorage.setItem(LOGIN_INTENT_KEY, JSON.stringify({ mode: 'host-return', code: '1234', ts: Date.now() }));
    const { requests } = renderApp({ signedIn: true, tables: [dinner()] });
    expect(await screen.findByRole('heading', { name: 'Night market' })).toBeVisible();
    expect(requests.filter(request => request.resource === 'sessions').map(request => request.code)).toEqual(['1234']);
    expect(localStorage.getItem('ks_current_code')).toBe('1234');
  });

  it('unsubscribes from auth events on unmount', async () => {
    const { unmount } = renderApp();
    await screen.findByRole('button', { name: 'Host Login' });
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('shows QR onboarding for a new host and remembers a skip', async () => {
    const { user, unmount } = renderApp({ signedIn: true, profile: { ...testProfile, qr_url: null } });
    expect(await screen.findByText('Welcome, Hana!')).toBeVisible();
    await user.click(button('Skip for now'));
    expect(button(/Host a Table/)).toBeVisible();
    expect(localStorage.getItem('ks_qr_skipped')).toBe('1');
    unmount();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Open profile' })).toBeVisible();
    expect(screen.queryByText('Welcome, Hana!')).not.toBeInTheDocument();
  });

  it('reports a profile QR save failure and saves the replacement on retry', async () => {
    const { dataUrl } = mockImageDecoding();
    const { user, requests, failNext } = renderApp({ signedIn: true });
    await user.click(await screen.findByRole('button', { name: 'Open profile' }));
    expect(await screen.findByRole('img', { name: 'Default QR' })).toHaveAttribute('src', testProfile.qr_url);
    const input = screen.getByLabelText('Default payment QR image');
    const file = new File(['image'], 'payment.png', { type: 'image/png' });
    failNext(request => request.resource === 'profiles' && request.method === 'PATCH');
    await user.upload(input, file);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save your payment QR');
    expect(screen.getByRole('img', { name: 'Default QR' })).toHaveAttribute('src', testProfile.qr_url);
    await user.upload(input, file);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Default QR' })).toHaveAttribute('src', dataUrl));
    expect(requests.filter(request => request.method === 'PATCH').at(-1).body).toEqual({ qr_url: dataUrl });
  });

  it('signs out from the profile and returns to public home', async () => {
    const { user } = renderApp({ signedIn: true });
    await user.click(await screen.findByRole('button', { name: 'Open profile' }));
    await user.click(button('Sign Out'));
    expect(await screen.findByRole('button', { name: 'Host Login' })).toBeVisible();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('joining and paying as a guest', () => {
  it('requires four digits, handles an unknown code, and joins a corrected code on Enter', async () => {
    const { user, requests } = renderApp({ tables: [dinner()] });
    await user.click(await screen.findByRole('button', { name: /Join as Guest/ }));
    const code = screen.getByLabelText('Table code');
    await user.type(code, 'x99');
    expect(code).toHaveValue('99');
    expect(button(/Join Table/)).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(requests).toHaveLength(0);

    await user.type(code, '999');
    expect(code).toHaveValue('9999');
    await user.click(button(/Join Table/));
    expect(await screen.findByRole('alert')).toHaveTextContent('Table not found');
    expect(code).toBeInvalid();
    await user.clear(code);
    await user.type(code, '1234{Enter}');
    expect(await screen.findByLabelText('Your name')).toBeVisible();
    expect(requests.map(request => request.code)).toEqual(['9999', '1234']);
  });

  it('keeps non-table query parameters when returning home from a bad deep link', async () => {
    const { user } = renderApp({ search: 'table=1234&campaign=dinner' });
    expect(await screen.findByText('Table not found')).toBeVisible();
    await user.click(button('Back to Home'));
    expect(button(/Join as Guest/)).toBeVisible();
    expect(window.location.search).toBe('?campaign=dinner');
  });

  it('does not accept a whitespace-only name by click or Enter', async () => {
    const { user, requests } = await joinViaLink();
    await user.type(screen.getByLabelText('Your name'), '   {Enter}');
    expect(button(/Continue/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Noodles/ })).not.toBeInTheDocument();
    expect(requests.some(request => request.method === 'PATCH')).toBe(false);
  });

  it('recalculates a guest share and synchronizes selection without removing another guest', async () => {
    const { user, rows } = await joinViaLink({ tables: [dinner({ selections: { tea: ['Bela'] } })] });
    await enterName(user);
    const pay = button(/Pay host/);
    expect(pay).toBeDisabled();
    await user.click(button(/Tea/, { pressed: false }));
    expect(button(/Tea/, { pressed: true })).toBeVisible();
    expect(button('Split Tea with fewer people')).toBeDisabled();
    await user.click(button('Split Tea with more people'));
    expect(button(/Tea.*Split 2 ways.*1\.50/)).toBeVisible();
    expect(pay).toBeEnabled();
    await waitFor(() => expect(rows.get('1234').selections.tea).toEqual(['Bela', 'Ari']));

    await user.click(button(/Tea/, { pressed: true }));
    expect(pay).toBeDisabled();
    await waitFor(() => expect(rows.get('1234').selections.tea).toEqual(['Bela']));
  });

  it('shows the payment QR, supports going back, and records the selected share once', async () => {
    const { user, rows, requests } = await joinViaLink();
    await enterName(user);
    await user.click(button(/Noodles/));
    await user.click(button('Split Noodles with more people'));
    await user.click(button(/Pay host/));
    expect(screen.getByRole('img', { name: "Host's payment QR code" })).toHaveAttribute('src', '/payment.png');
    expect(screen.getByText('MYR 7.50')).toBeVisible();
    await user.click(button(/← BACK/i));
    expect(button(/Noodles/, { pressed: true })).toBeVisible();
    await user.click(button(/Pay host/));
    await user.click(button('I have paid'));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(rows.get('1234').paid).toEqual({ noodles: { payers: ['Ari'], total: 2 } });
    expect(requests.filter(request => request.body?.paid)).toHaveLength(1);
  });

  it('confirms without a QR on an older table and honors a split already started', async () => {
    const { user, rows } = await joinViaLink({
      tables: [dinner({ qr_image: null, paid: { noodles: { payers: ['Bela'], total: 3 } } })],
    });
    await enterName(user);
    await user.click(button(/Noodles.*5\.00/));
    expect(screen.queryByRole('button', { name: /Split Noodles with more/ })).not.toBeInTheDocument();
    await user.click(button(/Confirm →/));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(rows.get('1234').paid.noodles).toEqual({ payers: ['Bela', 'Ari'], total: 3 });
  });

  it('confirms a free item without requiring a bank transfer', async () => {
    const { user, rows } = await joinViaLink({
      tables: [dinner({ items: [{ id: 'water', name: 'Free water', price: 0 }] })],
    });
    await enterName(user);
    await user.click(button(/Free water/));
    await user.click(button(/Confirm →/));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(rows.get('1234').paid.water).toEqual({ payers: ['Ari'], total: 1 });
  });

  it('excludes legacy discount and invalid lines without blocking other payments', async () => {
    const { user, rows } = await joinViaLink({ tables: [dinner({ qr_image: null, items: [
      { id: 'discount', name: 'Legacy discount', price: -2 },
      { id: 'invalid', name: 'Unreadable price', price: 'junk' },
      { id: 'food', name: 'Food', price: 10 },
    ] })] });
    await enterName(user);
    expect(screen.getAllByText('Not payable · check with host')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Legacy discount|Unreadable price/ })).not.toBeInTheDocument();
    await user.click(button(/Food/));
    await user.click(button(/Confirm →/));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(rows.get('1234').paid).toEqual({ food: { payers: ['Ari'], total: 1 } });
  });

  it('quotes and confirms the first cent-allocated share', async () => {
    const { user, rows } = await joinViaLink({
      tables: [dinner({ items: [{ id: 'food', name: 'Food', price: 10 }] })],
    });
    await enterName(user);
    await user.click(button(/Food/));
    await user.click(button('Split Food with more people'));
    await user.click(button('Split Food with more people'));
    expect(button(/Food.*3\.34/)).toBeVisible();
    await user.click(button(/Pay host/));
    expect(screen.getByText('MYR 3.34')).toBeVisible();
    await user.click(button('I have paid'));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(rows.get('1234').paid.food).toEqual({ payers: ['Ari'], total: 3 });
    expect(screen.getAllByText('MYR 3.34')).toHaveLength(2);
  });

  it('does not let a guest select a fully paid item or a share they have already paid', async () => {
    const { user } = await joinViaLink({
      tables: [dinner({ paid: { tea: 'Bela', noodles: { payers: ['Ari'], total: 2 } } })],
    });
    await enterName(user);
    expect(screen.getByText('paid by Bela')).toBeVisible();
    expect(screen.getByText('you paid')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Tea|Noodles/ })).not.toBeInTheDocument();
    expect(button(/Pay host/)).toBeDisabled();
  });

  it('surfaces a failed payment read and lets the guest retry without paying again', async () => {
    const { user, rows, failNext } = await joinViaLink();
    await enterName(user);
    await user.click(button(/Tea/));
    await user.click(button(/Pay host/));
    failNext(request => request.method === 'GET' && request.select === 'paid');
    await user.click(button('I have paid'));
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t pay again');
    expect(rows.get('1234').paid).toEqual({});
    expect(button('I have paid')).toBeEnabled();

    await user.click(button('I have paid'));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(rows.get('1234').paid.tea.payers).toEqual(['Ari']);
  });

  it('does not overwrite an item another guest pays before confirmation', async () => {
    const { user, rows, requests } = await joinViaLink();
    await enterName(user);
    await user.click(button(/Tea/));
    await user.click(button(/Pay host/));
    rows.get('1234').paid = { tea: { payers: ['Bela'], total: 1 } };
    await user.click(button('I have paid'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already paid by someone else: Tea');
    expect(button('I have paid')).toBeDisabled();
    expect(requests.some(request => request.body?.paid)).toBe(false);
  });

  it('treats an already recorded split payment as successful without a duplicate write', async () => {
    const { user, rows, requests } = await joinViaLink();
    await enterName(user);
    await user.click(button(/Noodles/));
    await user.click(button('Split Noodles with more people'));
    await user.click(button(/Pay host/));
    rows.get('1234').paid = { noodles: { payers: ['Ari'], total: 2 } };
    await user.click(button('I have paid'));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(requests.some(request => request.body?.paid)).toBe(false);
  });

  it('refreshes remote selections between guests and stops polling on home', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { user, rows, requests } = await joinViaLink();
    await enterName(user);
    expect(screen.queryByText('Highlighted by Bela')).not.toBeInTheDocument();
    rows.get('1234').selections = { noodles: ['Ari', 'Bela'] };
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText('Highlighted by Bela')).toBeVisible();
    await user.click(button('← Home'));
    const count = requests.length;
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(requests).toHaveLength(count);
  });

  it('closes a stale QR quote when polling sees another guest take its slot', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { user, rows } = await joinViaLink({ tables: [dinner({
      items: [{ id: 'food', name: 'Food', price: 10 }],
    })] });
    await enterName(user);
    await user.click(button(/Food/));
    await user.click(button('Split Food with more people'));
    await user.click(button('Split Food with more people'));
    await user.click(button(/Pay host/));
    expect(screen.getByText('MYR 3.34')).toBeVisible();
    rows.get('1234').paid = { food: { payers: ['Bela'], total: 3 } };
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.queryByRole('button', { name: 'I have paid' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Check the updated amount before paying');
    expect(button(/Food.*3\.33/)).toBeVisible();
    await user.click(button(/Pay host/));
    expect(screen.getByText('MYR 3.33')).toBeVisible();
  });

  it('retries a rejected payment update before showing success', async () => {
    const { user, rows, requests, failNext } = await joinViaLink();
    await enterName(user);
    await user.click(button(/Tea/));
    await user.click(button(/Pay host/));
    failNext(request => request.body?.paid);
    await user.click(button('I have paid'));
    expect(await screen.findByText('Confirmed, Ari!')).toBeVisible();
    expect(requests.filter(request => request.body?.paid)).toHaveLength(2);
    expect(rows.get('1234').paid.tea).toEqual({ payers: ['Ari'], total: 1 });
  });
});

describe('creating and returning to a table', () => {
  it('publishes manual whole-bill discounts into regular item prices', async () => {
    const { user, rows } = renderApp({ signedIn: true });
    await manualEditor(user);
    await addItem(user, 'Food', '10,00');
    await addItem(user, 'Free water', '0');
    await addItem(user, 'Coupon', '-1,50');
    await user.click(screen.getAllByRole('checkbox', { name: 'Applies to whole bill' })[2]);
    await user.click(button(/Next: Payment QR/));
    await user.click(button(/Generate Table Link/));
    expect(await screen.findByRole('heading', { name: 'Friday dinner' })).toBeVisible();
    const [created] = rows.values();
    expect(created.items.map(({ name, price }) => ({ name, price }))).toEqual([
      { name: 'Food', price: '8.50' }, { name: 'Free water', price: '0.00' },
    ]);
  });

  it('walks through manual receipt entry, QR, and a shareable table saved locally', async () => {
    const { user, rows } = renderApp({ signedIn: true });
    await manualEditor(user);
    expect(button(/Next: Payment QR/)).toBeDisabled();
    await addItem(user, 'Noodles', '15.50');
    await addItem(user, 'Tea', '3.25');
    await user.click(button(/Next: Payment QR/));
    expect(screen.getByRole('img', { name: 'Payment QR code' })).toHaveAttribute('src', '/payment.png');
    await user.click(button(/Generate Table Link/));

    expect(await screen.findByRole('heading', { name: 'Friday dinner' })).toBeVisible();
    const [created] = rows.values();
    expect(created).toMatchObject({
      code: expect.stringMatching(/^\d{4}$/), table_name: 'Friday dinner', qr_image: '/payment.png',
      items: [{ name: 'Noodles', price: '15.50' }, { name: 'Tea', price: '3.25' }],
    });
    expect(screen.getByText('RM18.75')).toBeVisible();
    expect(JSON.parse(localStorage.getItem('ks_tables'))).toContainEqual({
      code: created.code, name: 'Friday dinner', date: localDate(),
    });
    await user.click(button('Copy table link'));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/app/?table=${created.code}`);
  });

  it('generates a new code after a collision without overwriting the existing table', async () => {
    const { user, rows, requests } = renderApp({ signedIn: true, tables: [dinner({ code: '1000' })] });
    await manualEditor(user);
    await addItem(user, 'Tea', '3');
    await user.click(button(/Next: Payment QR/));
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5);
    await user.click(button(/Generate Table Link/));
    expect(await screen.findByRole('heading', { name: 'Friday dinner' })).toBeVisible();
    expect(requests.filter(request => request.method === 'POST').map(request => request.body.code)).toEqual(['1000', '5500']);
    expect(rows.get('1000').table_name).toBe('Night market');
    expect(rows.get('5500').table_name).toBe('Friday dinner');
  });

  it('leaves a failed table creation retryable and does not store the failed table', async () => {
    const { user, failNext } = renderApp({ signedIn: true });
    await manualEditor(user);
    await addItem(user, 'Tea', '3');
    await user.click(button(/Next: Payment QR/));
    failNext(request => request.method === 'POST');
    await user.click(button(/Generate Table Link/));
    expect(await screen.findByText('Failed to create table: Server unavailable')).toBeVisible();
    expect(localStorage.getItem('ks_tables')).toBeNull();
    await user.click(button(/Generate Table Link/));
    expect(await screen.findByRole('heading', { name: 'Friday dinner' })).toBeVisible();
  });

  it('lets a host replace the profile QR just for this table', async () => {
    const { dataUrl, revoke } = mockImageDecoding();
    const { user, rows, requests } = renderApp({ signedIn: true });
    await manualEditor(user);
    await addItem(user, 'Tea', '3');
    await user.click(button(/Next: Payment QR/));
    expect(screen.getByRole('img', { name: 'Payment QR code' })).toHaveAttribute('src', testProfile.qr_url);

    await user.click(button('Change QR'));
    expect(button(/Generate Table Link/)).toBeDisabled();
    await user.upload(screen.getByLabelText('Upload payment QR'), new File(['image'], 'new.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Payment QR code' })).toHaveAttribute('src', dataUrl));
    expect(revoke).toHaveBeenCalledWith('blob:new.png');
    await user.click(button(/Generate Table Link/));
    expect(await screen.findByRole('heading', { name: 'Friday dinner' })).toBeVisible();
    expect([...rows.values()][0].qr_image).toBe(dataUrl);
    expect(requests.some(request => request.resource === 'profiles' && request.method === 'PATCH')).toBe(false);

    await user.click(button(/Start new table/));
    await user.click(button(/Enter Items Manually/));
    await user.click(button(/Next: Check Items/));
    await addItem(user, 'Tea', '3');
    await user.click(button(/Next: Payment QR/));
    expect(screen.getByRole('img', { name: 'Payment QR code' })).toHaveAttribute('src', testProfile.qr_url);
  });

  it('supports editing and undo before continuing to payment', async () => {
    const { user, requests } = renderApp({ signedIn: true });
    await manualEditor(user);
    await addItem(user, 'Tea', '3');
    await addItem(user, 'Noodles', '15');
    await user.click(button('Remove Noodles'));
    expect(screen.queryByDisplayValue('Noodles')).not.toBeInTheDocument();
    expect(screen.getByText('MYR 3.00')).toBeVisible();
    await user.click(button('Undo'));
    expect(screen.getByDisplayValue('Noodles')).toBeVisible();
    expect(screen.getByText('MYR 18.00')).toBeVisible();
    expect(requests.some(request => request.method === 'POST')).toBe(false);
  });

  it('keeps successful scanned items and displays which receipt failed', async () => {
    const { dataUrl, revoke } = mockImageDecoding();
    vi.mocked(scanReceipt)
      .mockRejectedValueOnce(new Error('Receipt too dark'))
      .mockResolvedValueOnce({ items: [{ name: 'Rice', price: 7 }], warnings: [] });
    const { user } = renderApp({ signedIn: true });
    await user.click(await screen.findByRole('button', { name: /Host a Table/ }));
    const files = ['dark.png', 'clear.png'].map(name => new File(['image'], name, { type: 'image/png' }));
    await user.upload(screen.getByLabelText('Upload receipts'), files);
    await user.click(await screen.findByRole('button', { name: /Scan All Receipts/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Check Items/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Receipt #1: Receipt too dark');
    expect(within(screen.getByRole('group', { name: 'Receipt #2 · 1 item' })).getByDisplayValue('Rice')).toBeVisible();
    expect(vi.mocked(scanReceipt).mock.calls.map(([image]) => image)).toEqual([dataUrl, dataUrl]);
    expect(revoke.mock.calls.flat()).toEqual(['blob:dark.png', 'blob:clear.png']);
  });

  it('rejects non-image receipts and still allows manual entry', async () => {
    const { user } = renderApp({ signedIn: true });
    await user.click(await screen.findByRole('button', { name: /Host a Table/ }));
    fireEvent.change(screen.getByLabelText('Upload receipts'), {
      target: { files: [new File(['bad'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText(/Some files couldn't be opened/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Scan All Receipts/ })).not.toBeInTheDocument();
    await user.click(button(/Enter Items Manually/));
    expect(screen.getByLabelText('Table name')).toBeVisible();
  });

  it('retries opening a saved table after a failed lookup', async () => {
    saveLocally(dinner());
    const { user, failNext } = renderApp({ signedIn: true, tables: [dinner()] });
    failNext(request => request.resource === 'sessions' && request.method === 'GET');
    await user.click(await screen.findByRole('button', { name: 'Open Night market, table 1234' }));
    expect(await screen.findByRole('heading', { name: 'Table unavailable' })).toBeVisible();
    await user.click(button('Try again'));
    expect(await screen.findByRole('heading', { name: 'Night market' })).toBeVisible();
  });

  it('copies the saved bill with price, tax, total and paid-by columns', async () => {
    const table = dinner({
      items: [{ id: 'tea', name: 'Tea', rawPrice: 3, itemTax: 0.25, price: 3.25 }],
      paid: { tea: { payers: ['Ari'], total: 1 } },
    });
    saveLocally(table);
    const { user } = renderApp({ signedIn: true, tables: [table] });
    await user.click(await screen.findByRole('button', { name: /Open Night market/ }));
    await user.click(await screen.findByRole('button', { name: 'Copy to Excel' }));
    expect(await navigator.clipboard.readText()).toBe(
      'Item\tPrice\tTax\tTotal\tPaid By\nTea\t3.00\t0.25\t3.25\tAri\n\t\t\t\t\nTotal\t\t\t3.25\t',
    );
    expect(button(/Bill copied/)).toBeVisible();
  });

  it('refreshes a reopened table when a remote guest pays', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    saveLocally(dinner());
    const { user, rows } = renderApp({ signedIn: true, tables: [dinner()] });
    await user.click(await screen.findByRole('button', { name: /Open Night market/ }));
    expect(await screen.findByText('0/2 items paid')).toBeVisible();
    rows.get('1234').paid = { noodles: { payers: ['Ari'], total: 2 } };
    rows.get('1234').selections = { noodles: ['Ari', 'Bela'] };
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(within(screen.getByRole('region', { name: 'Part paid' })).getByText('Owes: Bela')).toBeVisible();
    rows.get('1234').paid.noodles.payers.push('Bela');
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText('1/2 items paid')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Paid' })).getByText('Paid by Ari, Bela')).toBeVisible();
  });

  it('keeps the saved table when conclusion is canceled or fails, then removes only that table', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const second = dinner({ code: '4321', table_name: 'Lunch' });
    saveLocally(dinner(), second);
    const { user, requests, rows, failNext } = renderApp({ signedIn: true, tables: [dinner(), second] });
    await user.click(await screen.findByRole('button', { name: /Open Night market/ }));
    await user.click(await screen.findByRole('button', { name: 'Conclude table' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(requests.some(request => request.body?.concluded)).toBe(false);

    failNext(request => request.body?.concluded);
    await user.click(button('Conclude table'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t conclude this table');
    expect(JSON.parse(localStorage.getItem('ks_tables'))).toHaveLength(2);

    await user.click(button('Conclude table'));
    expect(await screen.findByRole('button', { name: /Open Lunch/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Open Night market/ })).not.toBeInTheDocument();
    expect(rows.get('1234').concluded).toBe(true);
    expect(rows.get('4321').concluded).toBeUndefined();
  });
});

it('passes a newly generated link to a guest and shows their payment when the host reopens the table', async () => {
  const { user, unmount } = renderApp({ signedIn: true });
  await manualEditor(user);
  await addItem(user, 'Noodles', '15.50');
  await user.click(button(/Next: Payment QR/));
  await user.click(button(/Generate Table Link/));
  await user.click(await screen.findByRole('button', { name: 'Copy table link' }));
  const link = new URL(await navigator.clipboard.readText());
  unmount();

  auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
  window.history.replaceState(null, '', link.pathname + link.search);
  const guest = render(<App />);
  await screen.findByLabelText('Your name');
  await enterName(user, 'Bela');
  await user.click(button(/Noodles/));
  await user.click(button(/Pay host/));
  expect(screen.getByText('MYR 15.50')).toBeVisible();
  await user.click(button('I have paid'));
  expect(await screen.findByText('Confirmed, Bela!')).toBeVisible();
  guest.unmount();

  window.history.replaceState(null, '', '/app/');
  render(<App />);
  await user.click(await screen.findByRole('button', { name: /Open Friday dinner/ }));
  const paid = within(await screen.findByRole('region', { name: 'Paid' }));
  expect(paid.getByText('Noodles')).toBeVisible();
  expect(paid.getByText('Paid by Bela')).toBeVisible();
});
