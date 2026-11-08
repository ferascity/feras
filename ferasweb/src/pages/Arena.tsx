import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgentRow } from '../components/AgentRow';
import { ChessBoard } from '../components/ChessBoard';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/MatchCard';
import {
  formatEval,
  formatMultiplier,
  formatNumber,
  formatUsdc,
} from '../lib/format';
import { getBetaStatus, type BetaStatus } from '../lib/api/beta';
import { useMatches } from '../lib/hooks/useMatches';
import { useWallet } from '../lib/wallet';
import type {
  MarketOutcome,
  Match,
  PositionDraft,
  TransactionReceipt,
} from '../lib/types';

const QUICK_AMOUNTS = [1, 5, 10, 25];

function multiplierFor(match: Match, outcome: MarketOutcome): number {
  if (outcome === 'WHITE') return match.marketEstimates.whiteMultiplier;
  if (outcome === 'BLACK') return match.marketEstimates.blackMultiplier;
  return match.marketEstimates.drawMultiplier;
}

function outcomeLabel(outcome: MarketOutcome): string {
  if (outcome === 'WHITE') return 'White';
  if (outcome === 'BLACK') return 'Black';
  return 'Draw';
}

export function Arena() {
  const { matches, loading, error: apiError, reload } = useMatches();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    authenticated,
    address,
    usdcBalance,
    solBalance,
    balanceStatus,
    login,
    placePosition,
    topUpTestCredit,
  } = useWallet();

  const requestedId = searchParams.get('match');
  const match = matches.find((item) => item.id === requestedId) ?? matches[0] ?? null;

  const moves = match?.replay.moves ?? [];

  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [outcome, setOutcome] = useState<MarketOutcome>('WHITE');
  const [amount, setAmount] = useState('5');
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'topup' | 'position'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [betaStatus, setBetaStatus] = useState<BetaStatus | null>(null);
  const [betaLoading, setBetaLoading] = useState(false);

  useEffect(() => {
    if (!authenticated || !address) {
      setBetaStatus(null);
      setBetaLoading(false);
      return;
    }
    let cancelled = false;
    setBetaLoading(true);
    getBetaStatus(address)
      .then((next) => {
        if (!cancelled) setBetaStatus(next);
      })
      .catch(() => {
        if (!cancelled) setBetaStatus(null);
      })
      .finally(() => {
        if (!cancelled) setBetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, address]);

  const matchId = match?.id ?? null;
  const moveCount = moves.length;

  useEffect(() => {
    setPly(moveCount);
    setPlaying(false);
    setOutcome('WHITE');
    setSubmitError(null);
    setReceipt(null);
  }, [matchId, moveCount]);

  useEffect(() => {
    if (!playing) return;
    if (ply >= moveCount) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPly((value) => Math.min(value + 1, moveCount));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [playing, ply, moveCount]);

  if (loading && matches.length === 0) {
    return (
      <div className="page route-view">
        <div className="page-head">
          <div>
            <span className="eyebrow">Arena · Solana Devnet</span>
            <h1>The arena</h1>
            <p className="lede">Loading the board and its market…</p>
          </div>
        </div>
        <div className="arena-grid">
          <div className="card arena-main">
            <div className="skeleton" style={{ height: 18, width: '38%' }} />
            <div
              className="skeleton"
              style={{ aspectRatio: '1 / 1', marginTop: 18, borderRadius: 14 }}
            />
          </div>
          <div className="arena-rail">
            <div className="card rail-card">
              <div className="skeleton" style={{ height: 16, width: '42%' }} />
              <div className="skeleton" style={{ height: 58, marginTop: 16 }} />
              <div className="skeleton" style={{ height: 58, marginTop: 9 }} />
            </div>
            <div className="card rail-card">
              <div className="skeleton" style={{ height: 16, width: '42%' }} />
              <div className="skeleton" style={{ height: 58, marginTop: 16 }} />
              <div className="skeleton" style={{ height: 120, marginTop: 12 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="page route-view">
        <div className="page-head">
          <div>
            <span className="eyebrow">Arena · Solana Devnet</span>
            <h1>No markets on the board</h1>
            <p className="lede">
              The arena has nothing scheduled right now. Reload to check again.
            </p>
          </div>
        </div>
        <div className="card empty">
          <span className="empty-icon">
            <Icon name="target" />
          </span>
          <h3>The arena is quiet</h3>
          <p>
            {apiError
              ? 'The Devnet market API could not be reached and no demo matches are available.'
              : 'No matches were returned by the market API.'}
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const activeMove = ply > 0 ? moves[ply - 1] : null;
  const fen = activeMove
    ? activeMove.fen
    : moves.length > 0
      ? match.replay.initialFen
      : match.currentFen;
  const lastMove = activeMove ? { from: activeMove.from, to: activeMove.to } : null;
  const inCheck = activeMove?.isCheck ?? false;

  const evalScore =
    activeMove?.evalCentipawns != null
      ? activeMove.evalCentipawns / 100
      : match.evalScore;
  const winProbability =
    activeMove?.winProbabilityWhite != null &&
    Number.isFinite(activeMove.winProbabilityWhite)
      ? activeMove.winProbabilityWhite
      : 1 / (1 + Math.pow(10, -evalScore / 4));
  const whitePct = Math.max(0, Math.min(1, winProbability));

  const stake = Number.parseFloat(amount);
  const validStake = Number.isFinite(stake) && stake >= 0.01;
  const multiplier = multiplierFor(match, outcome);
  const estimatedReturn = validStake ? stake * multiplier : 0;
  const tradable = !match.isDemo && match.status !== 'COMPLETED';
  const balancePending = Boolean(address) && balanceStatus === 'loading';
  const insufficient =
    balanceStatus === 'ready' && validStake && usdcBalance < stake;

  // Private beta: when the tester is short on test-USDC, add the difference from
  // their Devnet SOL so the position still goes through in one flow.
  const rate = betaStatus?.limits.solToUsdcRate ?? 150;
  const minTopUp = betaStatus?.limits.swapMinUsdc ?? 5;
  const maxTopUp = betaStatus?.limits.swapMaxUsdc ?? 100;
  const dailyRemaining = betaStatus?.usage.usdcRemaining ?? maxTopUp;
  const testerReady = betaStatus?.canTopUp === true;
  const shortfall = insufficient ? Math.max(0, stake - usdcBalance) : 0;
  const requestedTopUp = Math.max(minTopUp, Math.ceil(shortfall * 100) / 100);
  const topUpUsdc = Math.min(requestedTopUp, maxTopUp, dailyRemaining);
  const topUpCovers = insufficient && topUpUsdc + 0.000001 >= shortfall;
  const topUpSol = topUpUsdc / rate;
  const enoughSol = solBalance >= topUpSol + 0.005;
  const canTopUp =
    insufficient && testerReady && topUpCovers && enoughSol && betaStatus !== null;

  const canSubmit =
    tradable &&
    authenticated &&
    Boolean(address) &&
    validStake &&
    (!insufficient || canTopUp) &&
    !pending &&
    !balancePending;

  const handleSubmit = async () => {
    if (!authenticated) {
      login();
      return;
    }
    if (!canSubmit) return;

    setSubmitError(null);
    setReceipt(null);
    setPending(true);

    const draft: PositionDraft = {
      matchId: match.id,
      matchTitle: match.title,
      selectedAgentId:
        outcome === 'WHITE'
          ? match.whiteAgent.id
          : outcome === 'BLACK'
            ? match.blackAgent.id
            : '',
      selectedAgentName:
        outcome === 'WHITE'
          ? match.whiteAgent.name
          : outcome === 'BLACK'
            ? match.blackAgent.name
            : 'Draw',
      outcome,
      stakeUsdc: Number(stake.toFixed(2)),
      estimatedMultiplier: multiplier,
    };

    try {
      if (insufficient) {
        setPhase('topup');
        await topUpTestCredit(topUpUsdc);
      }
      setPhase('position');
      const result = await placePosition(draft);
      setReceipt(result);
      setAmount('5');
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'The position could not be placed.',
      );
    } finally {
      setPhase('idle');
      setPending(false);
    }
  };

  let ctaLabel = 'Place position';
  if (!authenticated) ctaLabel = 'Sign in to take a position';
  else if (!address) ctaLabel = 'Preparing wallet…';
  else if (!tradable) {
    ctaLabel = match.isDemo
      ? 'Demo match — trading unavailable'
      : 'Market settled';
  } else if (balancePending) ctaLabel = 'Checking balance…';
  else if (!validStake) ctaLabel = 'Enter a stake';
  else if (insufficient) {
    if (betaLoading) ctaLabel = 'Checking top-up options…';
    else if (canTopUp) {
      ctaLabel = `Take ${outcomeLabel(outcome)} · ${formatUsdc(topUpUsdc)} ≈ ${topUpSol.toFixed(3)} SOL`;
    } else ctaLabel = 'Insufficient Devnet USDC';
  } else if (pending) {
    ctaLabel = phase === 'topup' ? 'Confirm top-up in wallet…' : 'Confirm position in wallet…';
  } else ctaLabel = `Take ${outcomeLabel(outcome)}`;

  const ctaDisabled = pending || (authenticated && !canSubmit);

  return (
    <div className="page route-view arena-page">
      <div className="arena-grid">
        <div className="card arena-main">
          <div className="arena-board-head">
            <div className="arena-board-id">
              <div className="arena-board-title">
                {match.whiteAgent.name} <span className="text-faint">vs</span>{' '}
                {match.blackAgent.name}
              </div>
              <div className="arena-board-sub">
                {match.timeControl} · Ply {match.currentPly}
                {moves.length === 0
                  ? match.isDemo
                    ? ' · Bundled demo · No replay'
                    : ' · Replay unavailable'
                  : ''}
              </div>
            </div>
            <div className="arena-board-tools">
              {match.isDemo ? <span className="badge demo">Demo</span> : null}
              <StatusBadge match={match} />
              {matches.length > 0 ? (
                <select
                  className="select arena-select"
                  value={match.id}
                  aria-label="Select match"
                  onChange={(event) => {
                    setSearchParams({ match: event.target.value }, { replace: true });
                  }}
                >
                  {matches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          <div className="board-shell">
            <ChessBoard fen={fen} lastMove={lastMove} inCheck={inCheck} />

            <div className="board-controls">
              <div className="board-controls-left">
                <button
                  type="button"
                  className="control-btn"
                  onClick={() => setPly(0)}
                  disabled={moves.length === 0 || ply === 0}
                  aria-label="Go to the starting position"
                >
                  <Icon name="skip-back" size={14} />
                </button>
                <button
                  type="button"
                  className="control-btn"
                  onClick={() => setPly((value) => Math.max(0, value - 1))}
                  disabled={moves.length === 0 || ply === 0}
                  aria-label="Previous move"
                >
                  <Icon name="arrow-left" size={14} />
                </button>
                <button
                  type="button"
                  className="control-btn play"
                  onClick={() => {
                    if (ply >= moves.length) setPly(0);
                    setPlaying((value) => !value);
                  }}
                  disabled={moves.length === 0}
                  aria-label={playing ? 'Pause replay' : 'Play replay'}
                >
                  <Icon name={playing ? 'pause' : 'play'} size={14} />
                </button>
                <button
                  type="button"
                  className="control-btn"
                  onClick={() => setPly((value) => Math.min(moves.length, value + 1))}
                  disabled={moves.length === 0 || ply >= moves.length}
                  aria-label="Next move"
                >
                  <Icon name="arrow-right" size={14} />
                </button>
                <button
                  type="button"
                  className="control-btn"
                  onClick={() => setPly(moves.length)}
                  disabled={moves.length === 0 || ply >= moves.length}
                  aria-label="Go to the current position"
                >
                  <Icon name="skip-forward" size={14} />
                </button>
              </div>

              <span className="ply-label">
                {moves.length > 0
                  ? `Ply ${ply} / ${moves.length}`
                  : match.currentPly > 0
                    ? `Ply ${match.currentPly}`
                    : 'Not started'}
              </span>

              <div className="eval-bar" title="Evaluation · positive favours White">
                <span>{formatEval(evalScore)}</span>
                <div className="eval-track">
                  <div
                    className="eval-fill"
                    style={{ width: `${(whitePct * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="arena-rail">
          <div className="card rail-card">
            <div className="rail-head">
              <span className="rail-title">Matchup</span>
              <span className="agent-side">Engine</span>
            </div>
            <div className="rail-battle">
              <div className="rail-battle-row">
                <AgentRow agent={match.whiteAgent} side="white" />
                <span className="agent-side">White</span>
              </div>
              <div className="rail-vs">vs</div>
              <div className="rail-battle-row">
                <AgentRow agent={match.blackAgent} side="black" />
                <span className="agent-side">Black</span>
              </div>
            </div>
            <div className="rail-meta">
              <span className="chip">{match.timeControl}</span>
              <span className="chip">
                <Icon name="users" size={12} />
                {formatNumber(match.viewerCount, { compact: true })}
              </span>
              <span className="chip">
                Pool <span className="mono">{formatUsdc(match.poolVolumeUsdc, { compact: true })}</span>
              </span>
            </div>
          </div>

          <div className="card rail-card market-card">
            <div className="rail-head">
              <span className="rail-title">Market</span>
              {match.isDemo ? (
                <span className="badge demo">Demo</span>
              ) : (
                <span className="badge soft">
                  <span className="dot live" />
                  Open
                </span>
              )}
            </div>

            <div className="outcome-grid">
              {(['WHITE', 'DRAW', 'BLACK'] as MarketOutcome[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`outcome-btn${outcome === value ? ' selected' : ''}`}
                  onClick={() => setOutcome(value)}
                  disabled={!tradable || pending}
                >
                  <span className="outcome-label">{outcomeLabel(value)}</span>
                  <span className="outcome-mult">
                    {formatMultiplier(multiplierFor(match, value))}
                  </span>
                </button>
              ))}
            </div>

            <div className="market-form">
              <div className="field">
                <label className="field-label" htmlFor="stake">
                  Stake
                  <span>
                    {authenticated && address
                      ? `${usdcBalance.toFixed(2)} USDC available`
                      : 'Devnet USDC'}
                  </span>
                </label>
                <div className="amount-wrap">
                  <input
                    id="stake"
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={!tradable || pending}
                  />
                  <span className="amount-suffix">USDC</span>
                </div>
              </div>

              <div className="quick-amounts">
                {QUICK_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`quick-chip${Number.isFinite(stake) && Math.abs(stake - value) < 0.001 ? ' active' : ''}`}
                    onClick={() => setAmount(String(value))}
                    disabled={!tradable || pending}
                  >
                    ${value}
                  </button>
                ))}
              </div>

              <div className="market-summary">
                <div className="summary-row">
                  <span>Stake</span>
                  <strong>{validStake ? formatUsdc(stake) : '—'}</strong>
                </div>
                <div className="summary-row">
                  <span>Multiplier</span>
                  <strong>{formatMultiplier(multiplier)}</strong>
                </div>
                <div className="summary-row total">
                  <span>Estimated return</span>
                  <strong>{validStake ? formatUsdc(estimatedReturn) : '—'}</strong>
                </div>
              </div>

              {insufficient ? (
                betaLoading ? (
                  <div className="notice">
                    <Icon name="clock" />
                    <span>Checking your beta top-up options…</span>
                  </div>
                ) : canTopUp ? (
                  <div className="notice">
                    <Icon name="sparkles" />
                    <span>
                      You hold {formatUsdc(usdcBalance)} USDC. The remaining{' '}
                      {formatUsdc(topUpUsdc)} is added from your Devnet SOL
                      (≈ {topUpSol.toFixed(3)} SOL) in the same step.
                    </span>
                  </div>
                ) : (
                  <div className="notice error">
                    <Icon name="alert" />
                    <span>
                      {testerReady && !enoughSol
                        ? `You need ≈ ${(topUpSol + 0.005).toFixed(3)} Devnet SOL to cover this top-up and fees. Use the faucet on Profile.`
                        : 'Insufficient Devnet USDC in the connected wallet. You need ' +
                          `${formatUsdc(stake)} and currently hold ${formatUsdc(usdcBalance)}.`}
                    </span>
                  </div>
                )
              ) : null}

              {submitError ? (
                <div className="notice error">
                  <Icon name="alert" />
                  <span>{submitError}</span>
                </div>
              ) : null}

              {receipt ? (
                <div className="notice success">
                  <Icon name="check" />
                  <span>
                    Position placed.{' '}
                    {receipt.explorerUrl ? (
                      <a
                        className="link"
                        href={receipt.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transaction
                      </a>
                    ) : null}
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn-accent btn-block"
                onClick={() => void handleSubmit()}
                disabled={ctaDisabled}
              >
                {pending ? <span className="spinner" /> : null}
                {ctaLabel}
              </button>

              <p className="market-note">
                {match.isDemo
                  ? 'Bundled demo match. Start the Devnet market API and load a registered market to place positions.'
                  : 'Devnet only. Positions are recorded on Solana and settle when the match ends. Multipliers are estimates, not guarantees.'}
              </p>
            </div>
          </div>

          {/*<div className="arena-side-note">
            <Icon name="shield" />
            <span>
              Non-custodial. Your wallet signs every position and no funds move
              without your approval.
            </span>
          </div>*/}
        </aside>
      </div>
    </div>
  );
}
