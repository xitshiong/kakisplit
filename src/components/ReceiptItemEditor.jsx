import { useId, useState } from 'react';
import { reviewReceiptItems } from '../lib/receiptReview.mjs';
import './host-tools.css';

function ItemRow({ item, index, currency, error, showErrors, autoFocus, onUpdate, onDelete, idPrefix }) {
  const [touched, setTouched] = useState({});
  const id = `${idPrefix}-${index}`;
  const nameError = (showErrors || touched.name) && error.name;
  const priceError = (showErrors || touched.price) && error.price;

  return (
    <div className="receipt-edit-row">
      <div className="receipt-edit-name">
        <label htmlFor={`${id}-name`}>Item {index + 1}</label>
        <input id={`${id}-name`} className="name-in" value={item.name} placeholder="e.g. Nasi lemak"
          required autoFocus={autoFocus} aria-invalid={!!nameError}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
          onChange={event => onUpdate(item.id, 'name', event.target.value)}
          onBlur={() => setTouched(value => ({ ...value, name: true }))} />
        {nameError && <p id={`${id}-name-error`} className="field-error">{nameError}</p>}
      </div>
      <div className="receipt-edit-price">
        <label htmlFor={`${id}-price`}>Total ({currency})</label>
        <input id={`${id}-price`} className="name-in" type="number" inputMode="decimal" step="0.01"
          required value={item.price} placeholder="0.00" aria-invalid={!!priceError}
          aria-describedby={priceError ? `${id}-price-error` : undefined}
          onChange={event => onUpdate(item.id, 'price', event.target.value)}
          onBlur={() => setTouched(value => ({ ...value, price: true }))} />
        {priceError && <p id={`${id}-price-error`} className="field-error">{priceError}</p>}
      </div>
      <button type="button" className="del-btn" aria-label={`Remove ${item.name || `item ${index + 1}`}`}
        onClick={() => onDelete(item.id)}>×</button>
    </div>
  );
}

export default function ReceiptItemEditor({ items, receipts, currency, notices, onUpdate, onDelete, onAdd, onNext, onBack }) {
  const [showErrors, setShowErrors] = useState(false);
  const [newItemId, setNewItemId] = useState(null);
  const idPrefix = useId();
  const review = reviewReceiptItems(items);
  const groups = receipts.map((receipt, index) => ({
    id: receipt.id, title: `Receipt #${index + 1}`, image: receipt.img,
    entries: items.map((item, index) => ({ item, index })).filter(({ item }) => item.receiptId === receipt.id),
  }));
  const receiptIds = new Set(receipts.map(receipt => receipt.id));
  groups.push({ id: 'manual', title: 'Manual items', entries: items.map((item, index) => ({ item, index }))
    .filter(({ item }) => !receiptIds.has(item.receiptId)) });

  const submit = event => {
    event.preventDefault();
    if (review.valid) { onNext(); return; }
    setShowErrors(true);
    const index = review.errors.findIndex(error => error.name || error.price);
    if (index >= 0) {
      const field = review.errors[index].name ? 'name' : 'price';
      document.getElementById(`${idPrefix}-${index}-${field}`)?.focus();
    }
  };

  return (
    <form className="section receipt-editor" noValidate onSubmit={submit}>
      <h2 className="section-head">Check items</h2>
      <p className="section-sub">Edit each name and line total. Include tax or service charges as separate items.</p>
      {notices}
      {!items.length && <div className="editor-empty">
        <strong>No items yet</strong>
        <p>Add your first item below, then enter its name and total.</p>
      </div>}
      {groups.filter(group => group.entries.length).map(group => (
        <fieldset className="receipt-edit-group" key={group.id}>
          <legend>{group.title} · {group.entries.length} item{group.entries.length === 1 ? '' : 's'}</legend>
          {group.image && <img className="receipt-edit-thumb" src={group.image} alt={group.title} />}
          {group.entries.map(({ item, index }) => <ItemRow key={item.id} item={item} index={index} currency={currency}
            error={review.errors[index]} showErrors={showErrors} autoFocus={item.id === newItemId}
            onUpdate={onUpdate} onDelete={onDelete} idPrefix={idPrefix} />)}
        </fieldset>
      ))}
      <button type="button" className="add-line-btn" onClick={() => setNewItemId(onAdd())}>+ Add item</button>
      <div className="editor-total total-row grand">
        <span className="total-label">Bill total</span>
        <span className="total-val">{review.errors.some(error => error.price) ? '—' : `${currency} ${review.total.toFixed(2)}`}</span>
      </div>
      {showErrors && !review.valid && <p className="error-strip" role="alert">
        {review.totalError || 'Check the highlighted fields before continuing.'}
      </p>}
      <button className="btn btn-ink" type="submit" disabled={!items.length}
        aria-describedby={!items.length ? `${idPrefix}-empty-hint` : undefined}>Next: Payment QR →</button>
      {!items.length && <p className="editor-help" id={`${idPrefix}-empty-hint`}>Add an item to continue.</p>}
      <button className="btn btn-outline" type="button" onClick={onBack}>← Back: Table details</button>
    </form>
  );
}
