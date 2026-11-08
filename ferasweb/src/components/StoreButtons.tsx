import { useState } from 'react';
import { CONFIG } from '../lib/config';
import { Icon } from './Icon';

interface StoreButtonsProps {
  compact?: boolean;
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.54c-.03-2.68 2.19-3.96 2.29-4.02-1.25-1.83-3.19-2.08-3.87-2.11-1.65-.17-3.22.97-4.06.97-.84 0-2.13-.95-3.5-.92-1.8.03-3.46 1.05-4.39 2.66-1.87 3.25-.48 8.06 1.34 10.7.89 1.29 1.95 2.74 3.34 2.69 1.34-.05 1.85-.87 3.47-.87 1.62 0 2.08.87 3.5.84 1.45-.02 2.36-1.31 3.24-2.61 1.02-1.5 1.44-2.96 1.46-3.04-.03-.01-2.79-1.07-2.82-4.29ZM14.5 4.5c.74-.9 1.24-2.15 1.1-3.4-1.07.05-2.37.72-3.14 1.61-.69.79-1.29 2.06-1.13 3.28 1.19.09 2.42-.6 3.17-1.49Z" />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M3.6 2.9c-.3.3-.5.8-.5 1.5v15.2c0 .7.2 1.2.5 1.5l.1.1L12 13.5v-.2L3.7 2.8l-.1.1Zm11.2 11.2-2.8-2.8 2.8-2.8 3.4 1.9c1 .6 1 1.5 0 2l-3.4 1.7Zm-.9.9L5.4 22.1c.4.2.9.2 1.6-.2l8.1-4.6-1.2-2.3Zm0-7.4 1.2-2.3-8.1-4.6c-.7-.4-1.2-.4-1.6-.2L14 7.6Z" />
    </svg>
  );
}

export function StoreButtons({ compact = false }: StoreButtonsProps) {
  const [notice, setNotice] = useState<string | null>(null);

  const open = (url: string, label: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    setNotice(`${label} links are coming soon.`);
    window.setTimeout(() => setNotice(null), 2600);
  };

  return (
    <div className={`store-buttons${compact ? ' compact' : ''}`}>
      <button
        type="button"
        className="store-btn"
        onClick={() => open(CONFIG.appStoreUrl, 'App Store')}
        aria-label="Download Feras on the App Store"
      >
        <span className="store-btn-icon">
          <AppleMark />
        </span>
        <span className="store-btn-text">
          <span className="store-btn-sub">Download on the</span>
          <span className="store-btn-head">App Store</span>
        </span>
        <span className="store-btn-soon">Soon</span>
      </button>

      <button
        type="button"
        className="store-btn"
        onClick={() => open(CONFIG.playStoreUrl, 'Google Play')}
        aria-label="Get Feras on Google Play"
      >
        <span className="store-btn-icon">
          <PlayMark />
        </span>
        <span className="store-btn-text">
          <span className="store-btn-sub">Get it on</span>
          <span className="store-btn-head">Google Play</span>
        </span>
        <span className="store-btn-soon">Soon</span>
      </button>

      {notice ? (
        <p className="text-tertiary copied" role="status" style={{ fontSize: 11.5 }}>
          <Icon name="info" size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />
          {notice}
        </p>
      ) : null}
    </div>
  );
}
