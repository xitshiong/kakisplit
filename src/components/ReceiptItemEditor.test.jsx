import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import ReceiptItemEditor from './ReceiptItemEditor.jsx';

function renderEditor(initialItems = [], props = {}) {
  const onNext = vi.fn();
  const onBack = vi.fn();
  function Draft() {
    const [items, setItems] = useState(initialItems);
    return <ReceiptItemEditor items={items} receipts={[]} currency="MYR" onNext={onNext} onBack={onBack}
      onUpdate={(id, field, value) => setItems(previous =>
        previous.map(item => item.id === id ? { ...item, [field]: value } : item))}
      onDelete={id => setItems(previous => previous.filter(item => item.id !== id))}
      onAdd={() => {
        const id = crypto.randomUUID();
        setItems(previous => [...previous, { id, name: '', price: '' }]);
        return id;
      }}
      {...props} />;
  }
  const user = userEvent.setup();
  render(<Draft />);
  return { user, onNext, onBack };
}

const next = () => screen.getByRole('button', { name: /Next: Payment QR/ });

it('explains why an empty draft cannot advance and focuses the first added item', async () => {
  const { user, onNext } = renderEditor();
  expect(screen.getByText('No items yet')).toBeVisible();
  expect(next()).toBeDisabled();
  expect(next()).toHaveAccessibleDescription('Add an item to continue.');
  await user.click(screen.getByRole('button', { name: /Add item/ }));
  expect(screen.getByLabelText('Item 1')).toHaveFocus();
  expect(screen.queryByText('No items yet')).not.toBeInTheDocument();
  expect(onNext).not.toHaveBeenCalled();
});

it('shows the attempted validation errors and advances after correcting them', async () => {
  const { user, onNext } = renderEditor([{ id: 'a', name: ' ', price: '3.123' }]);
  const name = screen.getByLabelText('Item 1');
  const amount = screen.getByRole('spinbutton', { name: 'Total (MYR)' });
  expect(name).not.toBeInvalid();
  expect(screen.getByText('—')).toBeVisible();
  await user.click(next());
  expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields');
  expect(name).toHaveAccessibleDescription('Enter an item name.');
  expect(amount).toHaveAccessibleDescription('Enter an amount with up to 2 decimal places.');
  expect(onNext).not.toHaveBeenCalled();

  await user.clear(name);
  await user.type(name, 'Tea');
  await user.clear(amount);
  await user.type(amount, '3.25');
  expect(name).not.toBeInvalid();
  expect(amount).toHaveValue(3.25);
  expect(amount).toHaveAttribute('aria-invalid', 'false');
  expect(screen.getByText('MYR 3.25')).toBeVisible();
  await user.click(next());
  expect(onNext).toHaveBeenCalledTimes(1);
});

it('rejects a zero net bill even when each individual line is valid', async () => {
  const { user, onNext } = renderEditor([
    { id: 'a', name: 'Tea', price: '3' },
    { id: 'b', name: 'Coupon', price: '-3' },
  ]);
  expect(screen.getByText('MYR 0.00')).toBeVisible();
  await user.click(next());
  expect(screen.getByRole('alert')).toHaveTextContent('Your bill total must be more than zero.');
  expect(onNext).not.toHaveBeenCalled();
});

it('keeps items grouped with their source receipt and separates manual items', () => {
  renderEditor([
    { id: 'a', name: 'Tea', price: 3, receiptId: 'receipt-1' },
    { id: 'b', name: 'Ice', price: 0, receiptId: 'receipt-1' },
    { id: 'c', name: 'Rice', price: 7, receiptId: 'receipt-2' },
    { id: 'd', name: 'Service', price: 1 },
  ], { receipts: [
    { id: 'receipt-1', img: '/tea.png' },
    { id: 'receipt-2', img: '/rice.png' },
    { id: 'empty', img: '/unused.png' },
  ] });
  const first = within(screen.getByRole('group', { name: 'Receipt #1 · 2 items' }));
  expect(first.getByRole('img', { name: 'Receipt #1' })).toHaveAttribute('src', '/tea.png');
  expect(first.getByDisplayValue('Tea')).toBeVisible();
  expect(first.getByDisplayValue('Ice')).toBeVisible();
  expect(first.queryByDisplayValue('Rice')).not.toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Receipt #2 · 1 item' })).getByDisplayValue('Rice')).toBeVisible();
  expect(within(screen.getByRole('group', { name: 'Manual items · 1 item' })).getByDisplayValue('Service')).toBeVisible();
  expect(screen.queryByRole('img', { name: 'Receipt #3' })).not.toBeInTheDocument();
});

it('goes back without submitting and recalculates the total when a row is deleted', async () => {
  const { user, onBack, onNext } = renderEditor([
    { id: 'a', name: 'Tea', price: '3' },
    { id: 'b', name: 'Rice', price: '7' },
  ]);
  expect(screen.getByText('MYR 10.00')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Remove Rice' }));
  expect(screen.queryByDisplayValue('Rice')).not.toBeInTheDocument();
  expect(screen.getByText('MYR 3.00')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /Back: Table details/ }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onNext).not.toHaveBeenCalled();
});
