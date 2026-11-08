import type { Agent } from '../lib/types';
import { formatNumber } from '../lib/format';

interface AgentRowProps {
  agent: Agent;
  side: 'white' | 'black';
  size?: 'md' | 'lg';
  showRating?: boolean;
}

export function AgentRow({ agent, side, size = 'md', showRating = true }: AgentRowProps) {
  const initial = agent.name.trim().charAt(0).toUpperCase() || (side === 'white' ? 'W' : 'B');

  return (
    <div className={`agent-row ${side}`}>
      <span className={`agent-avatar ${side === 'black' ? 'black' : ''} ${size === 'lg' ? 'lg' : ''}`}>
        {initial}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="agent-name">{agent.name}</div>
        <div className="agent-meta">
          {showRating
            ? `Elo ${formatNumber(agent.stats.elo)}${agent.stats.winRate > 0 ? ` · ${agent.stats.winRate.toFixed(1)}% win` : ''}`
            : agent.architecture.baseModel}
        </div>
      </div>
    </div>
  );
}
