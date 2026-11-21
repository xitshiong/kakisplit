import { QRCodeSVG } from 'qrcode.react';
import ShareTableLink from './ShareTableLink.jsx';
import { formatTableDate, paymentBreakdown } from '../lib/tableUi.mjs';
import './table-overview.css';

export default function TableOverview({ code, tableName, tableDate, items, paidMap, selections = {}, currency }) {
  const url = `${window.location.origin}/app/?table=${code}`;
  const rows = items.map(item => ({ item, status: paymentBreakdown(item.price, paidMap[item.id], selections[item.id]) }));
  const paidCount = rows.filter(({ status }) => status.complete).length;
  const totalCents = rows.reduce((sum, { status }) => sum + status.totalCents, 0);
  const money = cents => `${currency === 'MYR' ? 'RM' : `${currency} `}${(cents / 100).toFixed(2)}`;
  const groups = [
    { label: 'Unpaid', kind: 'unpaid', rows: rows.filter(({ status }) => !status.payers.length) },
    { label: 'Part paid', kind: 'partial', rows: rows.filter(({ status }) => status.payers.length && !status.complete) },
    { label: 'Paid', kind: 'paid', rows: rows.filter(({ status }) => status.complete) },
  ];

  return (
    <>
      <h1 className="section-head table-heading">{tableName || 'My Table'}</h1>
      <p className="section-sub table-date">{formatTableDate(tableDate)}</p>
      <div className="share-receipt">
        <div className="share-code-label">Table code</div>
        <div className="share-code">{code}</div>
        <div className="neon-divider" />
        <div className="table-join-qr">
          <QRCodeSVG value={url} size={180} title={`Join table ${code}`} />
        </div>
        <p className="share-hint">Scan to join, or copy the table link below</p>
      </div>
      <ShareTableLink url={url} />
      <section className="table-summary" aria-label="Bill summary">
        <div className="table-summary-heading">
          <h2>Bill summary</h2>
          <span>{paidCount}/{items.length} items paid</span>
        </div>
        {groups.filter(group => group.rows.length).map(group => (
          <section className={`table-payment-group is-${group.kind}`} key={group.kind} aria-label={group.label}>
            <h3 className="table-group-heading">{group.label} ({group.rows.length})</h3>
            {group.rows.map(({ item, status }) => (
              <div key={item.id} className={`table-summary-item ${status.complete ? 'is-paid' : ''}`}>
                <div className="table-item-copy">
                  <span className="table-item-name">{item.name}</span>
                  {status.payers.length > 0 && <>
                    <span className={`table-payment-chip ${status.complete ? 'is-complete' : ''}`}>
                      {status.complete ? '✓ Paid' : 'Part paid'}
                    </span>
                    <span className="table-item-status">Paid by {status.payers.join(', ')}</span>
                    {!status.complete && <span className="table-item-status">
                      {status.owing.length > 0 && `Owes: ${status.owing.join(', ')}${status.unnamedShares ? ' · ' : ''}`}
                      {status.unnamedShares > 0 && `${status.unnamedShares} ${status.owing.length ? 'more ' : ''}share${status.unnamedShares === 1 ? '' : 's'} unpaid`}
                    </span>}
                  </>}
                </div>
                <span className="table-item-price">{group.kind === 'partial'
                  ? `${money(status.paidCents)} of ${money(status.totalCents)}`
                  : money(status.totalCents)}</span>
              </div>
            ))}
          </section>
        ))}
        <div className="bill-summary-row highlight table-summary-total">
          <span>Total</span>
          <span className="bill-summary-val">{money(totalCents)}</span>
        </div>
      </section>
    </>
  );
}
