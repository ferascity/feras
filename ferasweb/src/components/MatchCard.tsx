import { Link } from 'react-router-dom';
import type { Match } from '../lib/types';
import { formatMultiplier, formatNumber } from '../lib/format';
import { AgentRow } from './AgentRow';
import { Icon } from './Icon';

export function StatusBadge({ match }: { match: Match }) {
  if (match.status === 'LIVE') {
    return (
      <span className="badge live">
        <span className="dot live" />
        Live
      </span>
    );
  }
  if (match.status === 'UPCOMING') {
    return <span className="badge upcoming">Upcoming</span>;
  }
  return <span className="badge completed">Final</span>;
}

export function MatchCard({ match }: { match: Match }) {
  const completed = match.status === 'COMPLETED';

  return (
    <Link
      to={`/arena?match=${encodeURIComponent(match.id)}`}
      className="card card-hover match-card"
      aria-label={`Open ${match.title}`}
    >
      <div className="match-card-top">
        <div style={{ minWidth: 0 }}>
          <h3 className="match-card-title">{match.title}</h3>
          <p className="match-card-meta">
            {match.timeControl}
            {match.viewerCount > 0 ? ` · ${formatNumber(match.viewerCount, { compact: true })} watching` : ''}
          </p>
        </div>
        <StatusBadge match={match} />
      </div>

      <div className="match-pair">
        <AgentRow agent={match.whiteAgent} side="white" />
        <div className="match-vs">vs</div>
        <AgentRow agent={match.blackAgent} side="black" />
      </div>

      <div className="match-card-foot">
        {completed && match.result ? (
          <div className="match-card-market">
            <span>Result</span>
            <b>{match.result}</b>
          </div>
        ) : (
          <div className="match-card-market" aria-label="Market multipliers">
            <span title="White">
              <b>W</b> {formatMultiplier(match.marketEstimates.whiteMultiplier)}
            </span>
            <span title="Draw">
              <b>D</b> {formatMultiplier(match.marketEstimates.drawMultiplier)}
            </span>
            <span title="Black">
              <b>B</b> {formatMultiplier(match.marketEstimates.blackMultiplier)}
            </span>
          </div>
        )}
        <span className="match-card-arrow">
          <Icon name="arrow-up-right" />
        </span>
      </div>
    </Link>
  );
}
