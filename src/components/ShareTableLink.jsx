import { useState } from 'react';
import './host-tools.css';

export default function ShareTableLink({ url }) {
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);

  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied. Send it to your table group.');
    } catch {
      setStatus('Couldn’t copy. Please try again or ask guests to scan the table QR code.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="table-share">
      <button className="btn btn-ink" type="button" disabled={copying} onClick={copy}>
        {copying ? 'Copying…' : 'Copy table link'}
      </button>
      <p className="share-link-status" role="status">{status || 'Copy this link into WhatsApp, Telegram or your group chat.'}</p>
    </div>
  );
}
