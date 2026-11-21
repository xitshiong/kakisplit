import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import TableOverview from './TableOverview.jsx';
import ShareTableLink from './ShareTableLink.jsx';

const url = 'https://kakisplit.example.test/app/?table=1234';
const overview = {
  code: '1234',
  tableName: 'After work',
  tableDate: '2026-02-12',
  items: [
    { id: 'a', name: 'Tea', price: 3 },
    { id: 'b', name: 'Noodles', price: 15 },
    { id: 'c', name: 'Rice', price: 7.5 },
  ],
  paidMap: { b: { payers: ['Ari'], total: 3 }, c: { name: 'Mei' } },
  selections: { b: ['Ari', 'Bela'] },
};

it('shows unpaid, partial and legacy paid rows in their own groups', () => {
  render(<TableOverview {...overview} currency="MYR" />);
  expect(screen.getByRole('heading', { name: 'After work' })).toBeVisible();
  expect(screen.getByText('12 Feb 2026')).toBeVisible();
  expect(screen.getByText('1/3 items paid')).toBeVisible();
  const unpaid = within(screen.getByRole('region', { name: 'Unpaid' }));
  const partial = within(screen.getByRole('region', { name: 'Part paid' }));
  const paid = within(screen.getByRole('region', { name: 'Paid' }));
  expect(unpaid.getByText('Tea')).toBeVisible();
  expect(unpaid.getByText('RM3.00')).toBeVisible();
  expect(partial.getByText('Noodles')).toBeVisible();
  expect(partial.getByText('Paid by Ari')).toBeVisible();
  expect(partial.getByText('Owes: Bela · 1 more share unpaid')).toBeVisible();
  expect(partial.getByText('RM5.00 of RM15.00')).toBeVisible();
  expect(paid.getByText('Rice')).toBeVisible();
  expect(paid.getByText('Paid by Mei')).toBeVisible();
  expect(screen.getByText('RM25.50')).toBeVisible();
});

it('omits empty payment groups and shows the selected currency everywhere', () => {
  render(<TableOverview {...overview} currency="SGD" tableName="" items={[overview.items[1]]} />);
  expect(screen.getByRole('heading', { name: 'My Table' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Unpaid' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Paid' })).not.toBeInTheDocument();
  expect(screen.getByText('0/1 items paid')).toBeVisible();
  expect(screen.getByText('SGD 5.00 of SGD 15.00')).toBeVisible();
  expect(screen.getByText('SGD 15.00')).toBeVisible();
});

it('uses the same excluded legacy amounts for line breakdowns and the grand total', () => {
  render(<TableOverview {...overview} currency="MYR" paidMap={{}} items={[
    { id: 'food', name: 'Food', price: 10 },
    { id: 'discount', name: 'Legacy discount', price: -2 },
    { id: 'invalid', name: 'Unreadable', price: 'junk' },
  ]} />);
  const lines = screen.getByRole('region', { name: 'Unpaid' });
  expect(within(lines).getByText('RM10.00')).toBeVisible();
  expect(within(lines).getAllByText('RM0.00')).toHaveLength(2);
  const summary = screen.getByText('Total').parentElement;
  expect(within(summary).getByText('RM10.00')).toBeVisible();
  expect(screen.queryByText('RM8.00')).not.toBeInTheDocument();
});

it('blocks duplicate copy while the clipboard is pending and announces success', async () => {
  const user = userEvent.setup();
  let resolveCopy;
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
    () => new Promise(resolve => { resolveCopy = resolve; }),
  );
  render(<ShareTableLink url={url} />);
  await user.click(screen.getByRole('button', { name: 'Copy table link' }));
  const pending = screen.getByRole('button', { name: 'Copying…' });
  expect(pending).toBeDisabled();
  await user.click(pending);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(url);
  await act(() => resolveCopy());
  expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  expect(screen.getByRole('button', { name: 'Copy table link' })).toBeEnabled();
});

it('offers the join QR as an alternative when clipboard copying fails', async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Permission denied'));
  render(<ShareTableLink url={url} />);
  const copy = screen.getByRole('button', { name: 'Copy table link' });
  await user.click(copy);
  expect(screen.getByRole('status')).toHaveTextContent('ask guests to scan the table QR code');
  expect(copy).toBeEnabled();
  await user.click(copy);
  expect(write).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('status')).toHaveTextContent('Link copied');
});
