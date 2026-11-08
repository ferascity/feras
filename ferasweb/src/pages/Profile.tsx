import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { BetaCreditsCard } from '../components/BetaCreditsCard';
import { getPositions } from '../lib/api/positions';
import {
  formatMultiplier,
  formatRelativeTime,
  formatUsdc,
  shortAddress,
} from '../lib/format';
import { useWallet } from '../lib/wallet';
import type { MarketPosition } from '../lib/types';

type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export function Profile() {
  const {
    ready,
    authDelayed,
    authenticated,
    address,
    walletName,
    userLabel,
    solBalance,
    usdcBalance,
    balanceStatus,
    balanceError,
    refreshBalances,
    login,
    logout,
    createWallet,
    requestDevnetSol,
  } = useWallet();

  const [copied, setCopied] = useState(false);
  const [positions, setPositions] = useState<MarketPosition[]>([]);
  const [positionsStatus, setPositionsStatus] = useState<AsyncStatus>('idle');
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [positionsNonce, setPositionsNonce] = useState(0);

  const [airdropStatus, setAirdropStatus] = useState<AsyncStatus>('idle');
  const [airdropMessage, setAirdropMessage] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<AsyncStatus>('idle');
  const [walletMessage, setWalletMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setPositions([]);
      setPositionsStatus('idle');
      setPositionsError(null);
      return;
    }

    let cancelled = false;
    setPositionsStatus('loading');
    setPositionsError(null);

    getPositions(address)
      .then((list) => {
        if (cancelled) return;
        setPositions(list);
        setPositionsStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPositionsStatus('error');
        setPositionsError(
          error instanceof Error
            ? error.message
            : 'Positions are unavailable right now.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [address, positionsNonce]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be blocked; the address is still selectable.
    }
  };

  const handleAirdrop = async () => {
    setAirdropStatus('loading');
    setAirdropMessage(null);
    try {
      const signature = await requestDevnetSol();
      setAirdropStatus('ready');
      setAirdropMessage(
        `1 SOL requested from the Devnet faucet · ${shortAddress(signature, 6)}`,
      );
    } catch (error) {
      setAirdropStatus('error');
      setAirdropMessage(
        error instanceof Error ? error.message : 'The Devnet faucet is unavailable.',
      );
    }
  };

  const handleCreateWallet = async () => {
    setWalletStatus('loading');
    setWalletMessage(null);
    try {
      await createWallet();
      setWalletStatus('ready');
    } catch (error) {
      setWalletStatus('error');
      setWalletMessage(
        error instanceof Error ? error.message : 'The Solana wallet could not be created.',
      );
    }
  };

  // Only wait on Privy while restoring an existing session. Signed-out
  // visitors should see the sign-in card immediately instead of skeletons
  // that look like an empty page.
  if (!ready && authenticated) {
    return (
      <div className="page route-view">
        <div className="page-head">
          <div>
            <span className="eyebrow">Profile · Solana Devnet</span>
            <h1>Your arena identity.</h1>
            <p className="lede">Wallet, balances, and market positions.</p>
          </div>
        </div>
        <div className="profile-grid">
          <div className="card wallet-panel">
            <div className="skeleton" style={{ height: 18, width: '40%' }} />
            <div className="skeleton" style={{ height: 46, marginTop: 18 }} />
            <div className="skeleton" style={{ height: 84, marginTop: 12 }} />
          </div>
          <div className="card positions-panel">
            <div className="skeleton" style={{ height: 18, width: '40%' }} />
            <div className="skeleton" style={{ height: 120, marginTop: 18 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="page route-view">
        <div className="page-head">
          <div>
            <span className="eyebrow">Profile · Solana Devnet</span>
            <h1>Your arena identity.</h1>
            <p className="lede">
              Wallet, balances, and market positions tied to your Privy account.
            </p>
          </div>
        </div>

        <div className="card profile-signed-out">
          <img src="/logo.png" alt="" />
          <h2>Sign in to continue</h2>
          <p>
            Use the same Privy account you use in the Feras app. Your Solana wallet
            and positions will appear here.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={login}>
            Sign in with Privy
          </button>
        </div>

        {authDelayed ? (
          <div className="notice error" style={{ marginTop: 16 }}>
            <Icon name="alert" />
            <span>
              Privy could not initialize on this origin. Add{' '}
              <span className="mono">{window.location.origin}</span> to the allowed
              origins in the Privy dashboard, then reload. Markets, replays, and
              drafts stay available without sign-in.
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  const explorerAddress = address
    ? `https://explorer.solana.com/address/${address}?cluster=devnet`
    : null;

  return (
    <div className="page route-view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Profile · Solana Devnet</span>
          <h1>Your arena identity.</h1>
          <p className="lede">
            Wallet, balances, and market positions tied to your Privy account.
          </p>
        </div>
        <div className="page-head-actions">
          <span className="chip">
            <span className="dot live" />
            {walletName ?? 'Privy'}
          </span>
        </div>
      </div>

      <div className="card profile-banner">
        <span className="profile-avatar">
          {(userLabel ?? 'F').trim().charAt(0).toUpperCase()}
        </span>
        <div className="profile-identity">
          <h2>{userLabel ?? 'Feras account'}</h2>
          <p>
            {address
              ? `Solana Devnet · ${shortAddress(address, 6)}`
              : 'Preparing your Solana wallet…'}
          </p>
        </div>
        <div className="profile-actions">
          {address ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyAddress}>
              <Icon name={copied ? 'check' : 'copy'} className="btn-icon" />
              {copied ? 'Copied' : 'Copy address'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void logout()}
          >
            <Icon name="logout" className="btn-icon" />
            Sign out
          </button>
        </div>
      </div>

      <BetaCreditsCard />

      <div className="profile-grid">
        <div className="card wallet-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Wallet</div>
              <div className="panel-sub">Solana Devnet · {walletName ?? 'Privy embedded'}</div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={refreshBalances}
              disabled={balanceStatus === 'loading'}
              aria-label="Refresh balances"
            >
              <Icon name="rewind" />
            </button>
          </div>

          <div className="wallet-address">
            <span className="mono">{address ?? 'No Solana wallet yet'}</span>
            <div className="wallet-address-actions">
              {address ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={copyAddress}
                  aria-label="Copy wallet address"
                >
                  <Icon name={copied ? 'check' : 'copy'} />
                </button>
              ) : null}
              {explorerAddress ? (
                <a
                  className="icon-btn"
                  href={explorerAddress}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View wallet on Solana Explorer"
                >
                  <Icon name="external" />
                </a>
              ) : null}
            </div>
          </div>

          <div className="balance-grid">
            <div className="balance">
              <div className="balance-label">SOL</div>
              <div className="balance-value">
                {balanceStatus === 'loading' ? '—' : solBalance.toFixed(3)}
              </div>
              <div className="balance-sub">Network fees</div>
            </div>
            <div className="balance">
              <div className="balance-label">USDC</div>
              <div className="balance-value">
                {balanceStatus === 'loading' ? '—' : usdcBalance.toFixed(2)}
              </div>
              <div className="balance-sub">Devnet test-USDC</div>
            </div>
          </div>

          {balanceError ? (
            <div className="notice error" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <span>{balanceError}</span>
            </div>
          ) : null}

          <div className="wallet-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleAirdrop()}
              disabled={!address || airdropStatus === 'loading'}
            >
              {airdropStatus === 'loading' ? (
                <span className="spinner" />
              ) : (
                <Icon name="download" className="btn-icon" />
              )}
              Request Devnet SOL
            </button>
            {!address ? (
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() => void handleCreateWallet()}
                disabled={walletStatus === 'loading'}
              >
                {walletStatus === 'loading' ? <span className="spinner" /> : null}
                Create Solana wallet
              </button>
            ) : null}
          </div>

          {airdropMessage ? (
            <div
              className={`notice ${airdropStatus === 'error' ? 'error' : 'success'}`}
              style={{ marginTop: 12 }}
            >
              <Icon name={airdropStatus === 'error' ? 'alert' : 'check'} />
              <span>{airdropMessage}</span>
            </div>
          ) : null}

          {walletMessage ? (
            <div className="notice error" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <span>{walletMessage}</span>
            </div>
          ) : null}

          <p className="market-note">
            Devnet only. SOL is used for network fees; test-USDC is required to take
            a market position.
          </p>
        </div>

        <div className="card positions-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Positions</div>
              <div className="panel-sub">
                {positions.length > 0
                  ? `${positions.length} opened market position${positions.length === 1 ? '' : 's'}`
                  : 'Your market history'}
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setPositionsNonce((value) => value + 1)}
              disabled={!address || positionsStatus === 'loading'}
              aria-label="Refresh positions"
            >
              <Icon name="rewind" />
            </button>
          </div>

          {positionsStatus === 'error' ? (
            <div className="notice error">
              <Icon name="alert" />
              <span>{positionsError ?? 'Positions are unavailable right now.'}</span>
            </div>
          ) : null}

          {positionsStatus === 'loading' ? (
            <div className="position-list">
              {[0, 1, 2].map((index) => (
                <div className="position-row" key={index} aria-hidden="true">
                  <div className="skeleton" style={{ width: 46, height: 20 }} />
                  <div className="position-main">
                    <div className="skeleton" style={{ height: 13, width: '60%' }} />
                    <div
                      className="skeleton"
                      style={{ height: 10, width: '40%', marginTop: 6 }}
                    />
                  </div>
                  <div className="skeleton" style={{ width: 52, height: 28 }} />
                </div>
              ))}
            </div>
          ) : null}

          {positionsStatus !== 'loading' &&
          positionsStatus !== 'error' &&
          positions.length === 0 ? (
            <div className="empty" style={{ padding: '38px 12px' }}>
              <span className="empty-icon">
                <Icon name="target" />
              </span>
              <h3>No positions yet</h3>
              <p>Take a position in the arena and it will appear here.</p>
              <Link to="/arena" className="btn btn-secondary btn-sm">
                Open arena
              </Link>
            </div>
          ) : null}

          {positions.length > 0 ? (
            <div className="position-list">
              {positions.map((position) => (
                <div className="position-row" key={position.id}>
                  <span className={`outcome-tag ${position.outcome.toLowerCase()}`}>
                    {position.outcome}
                  </span>
                  <div className="position-main">
                    <div className="position-title">{position.matchTitle}</div>
                    <div className="position-meta">
                      <span>{position.selectedAgentName}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(position.placedAt)}</span>
                      <span>·</span>
                      <span>{position.status}</span>
                    </div>
                  </div>
                  <div className="position-side">
                    <div className="position-stake">{formatUsdc(position.stakeUsdc)}</div>
                    <div
                      className={`position-return${position.status === 'WON' ? ' won' : ''}`}
                    >
                      {position.status === 'WON'
                        ? formatUsdc(position.estimatedReturnUsdc)
                        : formatMultiplier(position.estimatedMultiplier)}
                    </div>
                  </div>
                  {position.receipt.explorerUrl ? (
                    <a
                      className="icon-btn"
                      href={position.receipt.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View position transaction"
                    >
                      <Icon name="external" />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card profile-foot">
        <span>Devnet preview · Positions are non-custodial and settle on-chain.</span>
        <a
          className="link"
          href="https://explorer.solana.com/?cluster=devnet"
          target="_blank"
          rel="noreferrer"
        >
          Solana Explorer
        </a>
      </div>
    </div>
  );
}
