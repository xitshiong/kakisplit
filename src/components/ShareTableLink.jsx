import { useId, useRef, useState } from 'react';
import './host-tools.css';

export default function ShareTableLink({ url }) {
  const id = useId();
  const inputRef = useRef(null);
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);

  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied. Send it to your table group.');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setStatus('Couldn’t copy automatically. Copy the selected link and send it to your table group.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="table-share">
      <label className="share-link-label" htmlFor={id}>Table link · guests join here</label>
      <input className="share-link-input" id={id} ref={inputRef} value={url} readOnly
        onFocus={event => event.target.select()} aria-describedby={`${id}-status`} />
      <button className="btn btn-ink" type="button" disabled={copying} onClick={copy}>
        {copying ? 'Copying…' : 'Copy table link'}
      </button>
      <p className="share-link-status" id={`${id}-status`} role="status">{status || 'Copy this link into WhatsApp, Telegram or your group chat.'}</p>
    </div>
  );
}
