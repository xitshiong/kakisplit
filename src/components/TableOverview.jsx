import { QRCodeSVG } from 'qrcode.react';
import ShareTableLink from './ShareTableLink.jsx';
import { formatTableDate, paymentStatus } from '../lib/tableUi.mjs';
import './table-overview.css';

export default function TableOverview({ code, tableName, tableDate, items, paidMap, currency }) {
  const url = `${window.location.origin}/app/?table=${code}`;
  const paidCount = items.filter(item => paymentStatus(paidMap[item.id]).complete).length;
  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

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
        {items.map(item => {
          const status = paymentStatus(paidMap[item.id]);
          return (
            <div key={item.id} className={`table-summary-item ${status.complete ? 'is-paid' : ''}`}>
              <div className="table-item-copy">
                <span className="table-item-name">{item.name}</span>
                <span className="table-item-status">
                  {status.complete ? `Paid by ${status.payers.join(', ')}` : status.payers.length
                    ? `${status.payers.length}/${status.total} shares paid · ${status.payers.join(', ')}` : 'Unpaid'}
                </span>
              </div>
              <span className="table-item-price">{currency} {Number(item.price).toFixed(2)}</span>
            </div>
          );
        })}
        <div className="bill-summary-row highlight table-summary-total">
          <span>Total</span>
          <span className="bill-summary-val">{currency} {total.toFixed(2)}</span>
        </div>
      </section>
    </>
  );
}
