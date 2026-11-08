import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import {
  buildClaimMessage,
  claimBetaCredits,
  getBetaStatus,
  normalizeInviteCode,
  type BetaStatus,
} from '../lib/api/beta';
import { clearInviteCode, readInviteCode, saveInviteCode } from '../lib/betaInvite';
import { shortAddress } from '../lib/format';
import { useWallet } from '../lib/wallet';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type ClaimState = 'idle' | 'signing' | 'sending' | 'done';
type TopUpState = 'idle' | 'signing' | 'sending' | 'done';

export function BetaCreditsCard() {
  const { address, authenticated, usdcBalance, refreshBalances, signMessage, topUpTestCredit } =
    useWallet();

  const [status, setStatus] = useState<BetaStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(() => readInviteCode() ?? '');
  const [claimState, setClaimState] = useState<ClaimState>('idle');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimedSignature, setClaimedSignature] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState(10);
  const [topUpState, setTopUpState] = useState<TopUpState>('idle');
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [topUpSignature, setTopUpSignature] = useState<string | null>(null);

  const load = useCallback(
    async (wallet: string) => {
      setLoadState('loading');
      setError(null);
      try {
        const next = await getBetaStatus(wallet);
        setStatus(next);
        setLoadState('ready');
        setCode((current) => current || next.tester?.inviteCode || '');
      } catch (loadError) {
        setLoadState('error');
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Beta credits are unavailable right now.',
        );
      }
    },
    [],
  );

  useEffect(() => {
    if (!authenticated || !address) {
      setStatus(null);
      setLoadState('idle');
      return;
    }
    void load(address);
  }, [authenticated, address, load]);

  const handleClaim = async () => {
    if (!address || claimState === 'signing' || claimState === 'sending') return;
    const inviteCode = normalizeInviteCode(code);
    if (!inviteCode) {
      setClaimError('Enter your invite code to claim beta credits.');
      return;
    }

    setClaimError(null);
    setClaimState('signing');
    try {
      const issuedAt = Date.now();
      const message = buildClaimMessage({ wallet: address, code: inviteCode, issuedAt });
      const signature = await signMessage(message);
      saveInviteCode(inviteCode);

      setClaimState('sending');
      const result = await claimBetaCredits({
        code: inviteCode,
        wallet: address,
        issuedAt,
        signature,
      });

      setClaimedSignature(result.signature ?? null);
      clearInviteCode();
      setClaimState('done');
      refreshBalances();
      await load(address);
    } catch (claimFailure) {
      setClaimState('idle');
      const message =
        claimFailure instanceof Error
          ? claimFailure.message
          : 'The claim could not be completed.';
      setClaimError(
        /reject|cancel|denied/i.test(message) ? 'Signature request cancelled.' : message,
      );
    }
  };

  if (!authenticated) return null;

  const grant = status?.grant ?? null;
  const confirmed = grant?.status === 'CONFIRMED';
  const pending = grant?.status === 'PENDING';
  const blocked = status?.tester?.blocked === true;
  const disabled = status ? !status.enabled : false;
  const busy = claimState === 'signing' || claimState === 'sending';
  const explorerUrl =
    grant?.explorerUrl ??
    (claimedSignature
      ? `https://explorer.solana.com/tx/${claimedSignature}?cluster=devnet`
      : null);

  const rate = status?.limits.solToUsdcRate ?? 150;
  const minTopUp = status?.limits.swapMinUsdc ?? 5;
  const maxTopUp = status?.limits.swapMaxUsdc ?? 100;
  const remaining = status?.usage.usdcRemaining ?? maxTopUp;
  const maxAllowed = Math.min(maxTopUp, remaining);
  const topUpOptions = [5, 10, 25].filter((value) => value <= maxAllowed);
  const effectiveTopUp = Math.min(topUpAmount, maxAllowed);
  const topUpBusy = topUpState === 'signing' || topUpState === 'sending';
  const canTopUp = confirmed && status?.canTopUp === true && maxAllowed >= minTopUp;
  const topUpExplorer = topUpSignature
    ? `https://explorer.solana.com/tx/${topUpSignature}?cluster=devnet`
    : null;

  const handleTopUp = async () => {
    if (!address || !canTopUp || topUpBusy) return;
    setTopUpError(null);
    setTopUpState('signing');
    try {
      const result = await topUpTestCredit(effectiveTopUp);
      setTopUpState('sending');
      setTopUpSignature(result.signature);
      setTopUpState('done');
      refreshBalances();
      await load(address);
    } catch (topUpFailure) {
      setTopUpState('idle');
      const message =
        topUpFailure instanceof Error
          ? topUpFailure.message
          : 'The test credit could not be added.';
      setTopUpError(
        /reject|cancel|denied/i.test(message) ? 'Signature request cancelled.' : message,
      );
    }
  };

  let body;
  if (!address) {
    body = (
      <p className="beta-copy">
        Create your Solana wallet above, then claim your private beta credits.
      </p>
    );
  } else if (loadState === 'loading' && !status) {
    body = (
      <div className="beta-skeleton" aria-hidden="true">
        <span className="skeleton" style={{ height: 34, width: '52%' }} />
        <span className="skeleton" style={{ height: 12, width: '70%' }} />
      </div>
    );
  } else if (loadState === 'error') {
    body = (
      <>
        <div className="notice error">
          <Icon name="alert" />
          <span>{error ?? 'Beta credits are unavailable right now.'}</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => address && void load(address)}
        >
          Try again
        </button>
      </>
    );
  } else if (disabled) {
    body = (
      <p className="beta-copy">
        Beta credit claims are paused. Your existing test-USDC still works in the
        arena.
      </p>
    );
  } else if (blocked) {
    body = (
      <div className="notice error">
        <Icon name="alert" />
        <span>This wallet is not eligible for beta credits.</span>
      </div>
    );
  } else if (confirmed) {
    body = (
      <>
        <div className="notice success">
          <Icon name="check" />
          <span>
            Funded{status ? ` with ${status.limits.starterUsdc} test-USDC + ${status.limits.starterSol} SOL` : ''}.
            Open the arena and take your first position.
          </span>
        </div>
        <div className="beta-meta">
          <span className="mono">{address ? shortAddress(address, 6) : ''}</span>
          <span className="mono">{usdcBalance.toFixed(2)} test-USDC in wallet</span>
          {explorerUrl ? (
            <a className="link" href={explorerUrl} target="_blank" rel="noreferrer">
              View grant transaction
            </a>
          ) : null}
        </div>

        {disabled ? null : canTopUp ? (
          <div className="beta-topup">
            <div className="beta-topup-head">
              <span>Need more test credit?</span>
              <span className="beta-topup-remaining">
                {remaining.toFixed(2)} USDC left today
              </span>
            </div>
            <div className="beta-form">
              {topUpOptions.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`quick-chip${effectiveTopUp === value ? ' active' : ''}`}
                  onClick={() => setTopUpAmount(value)}
                  disabled={topUpBusy}
                >
                  +{value}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handleTopUp()}
                disabled={topUpBusy || effectiveTopUp < minTopUp}
              >
                {topUpBusy ? <span className="spinner" /> : null}
                {topUpState === 'signing'
                  ? 'Confirm in wallet'
                  : topUpState === 'sending'
                    ? 'Adding credit'
                    : `Add ${effectiveTopUp.toFixed(2)} test-USDC · ≈ ${(effectiveTopUp / rate).toFixed(3)} SOL`}
              </button>
            </div>
            <p className="beta-hint">
              Paid from your Devnet SOL in a single step. One signature, no
              separate conversion.
            </p>
            {topUpExplorer ? (
              <div className="beta-meta">
                <span>Test credit added.</span>
                <a className="link" href={topUpExplorer} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              </div>
            ) : null}
            {topUpError ? (
              <div className="notice error" style={{ marginTop: 10 }}>
                <Icon name="alert" />
                <span>{topUpError}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="beta-hint">
            {status && remaining < minTopUp
              ? 'Daily top-up limit reached. Try again tomorrow.'
              : 'Top-ups are unavailable while the beta float is being refilled.'}
          </p>
        )}
      </>
    );
  } else if (pending) {
    body = (
      <>
        <div className="notice">
          <Icon name="clock" />
          <span>Your grant is being confirmed on Devnet. This usually takes a few seconds.</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => address && void load(address)}
        >
          Refresh
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="beta-copy">
          Private beta, invite only. One claim per wallet — you will sign a short
          message to prove the wallet is yours.
        </p>
        <div className="beta-form">
          <input
            className="input mono"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="FERAS-BETA-XXXXXXXX"
            aria-label="Beta invite code"
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={() => void handleClaim()}
            disabled={busy || !code.trim() || !status?.canClaim}
          >
            {busy ? <span className="spinner" /> : null}
            {claimState === 'signing'
              ? 'Confirm in wallet'
              : claimState === 'sending'
                ? 'Funding wallet'
                : status
                  ? `Claim ${status.limits.starterUsdc} test-USDC + ${status.limits.starterSol} SOL`
                  : 'Claim beta credits'}
          </button>
        </div>
        {status && !status.canClaim ? (
          <p className="beta-hint">
            {grant ? 'This wallet already has a grant in progress.' : 'The beta float is temporarily empty — try again in a few minutes.'}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section className="card beta-card">
      <div className="panel-head">
        <div>
          <div className="panel-title">Beta credits</div>
          <div className="panel-sub">
            Private beta · Devnet test credit · no monetary value
          </div>
        </div>
        <span className={`chip${confirmed ? ' beta-chip-done' : ''}`}>
          {confirmed ? (
            <>
              <Icon name="check" className="chip-icon" /> Claimed
            </>
          ) : (
            'Invite only'
          )}
        </span>
      </div>

      {body}

      {claimError ? (
        <div className="notice error" style={{ marginTop: 12 }}>
          <Icon name="alert" />
          <span>{claimError}</span>
        </div>
      ) : null}
    </section>
  );
}
