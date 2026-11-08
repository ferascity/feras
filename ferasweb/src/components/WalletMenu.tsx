import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { shortAddress } from '../lib/format';
import { useWallet } from '../lib/wallet';
import { Icon } from './Icon';

export function WalletMenu() {
  const { ready, authenticated, address, userLabel, login, logout } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setCopied(false);
  }, [address]);

  if (!authenticated) {
    return (
      <button
        type="button"
        className="wallet-btn connect"
        onClick={login}
        disabled={!ready}
      >
        Sign in
      </button>
    );
  }

  if (!ready) {
    return <span className="wallet-btn ghost-placeholder skeleton" aria-hidden="true" />;
  }

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked; the address stays visible on Profile.
    }
  };

  return (
    <div className="wallet-anchor" ref={anchorRef}>
      <button
        type="button"
        className="wallet-btn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="dot" />
        <span className="mono">{address ? shortAddress(address) : 'Account'}</span>
        <Icon name="chevron-down" size={13} />
      </button>

      {open ? (
        <div className="wallet-menu" role="menu">
          <div className="wallet-menu-head">
            <span className="wallet-menu-avatar">
              {(userLabel ?? 'F').trim().charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="wallet-menu-name">{userLabel ?? 'Feras account'}</div>
              <div className="wallet-menu-sub">
                {address ? shortAddress(address, 6) : 'Preparing Solana wallet…'}
              </div>
            </div>
          </div>

          <Link
            to="/profile"
            className="wallet-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Icon name="wallet" />
            Profile &amp; positions
          </Link>

          {address ? (
            <button
              type="button"
              className="wallet-menu-item"
              role="menuitem"
              onClick={copyAddress}
            >
              <Icon name={copied ? 'check' : 'copy'} />
              {copied ? 'Address copied' : 'Copy address'}
            </button>
          ) : null}

          <button
            type="button"
            className="wallet-menu-item danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
