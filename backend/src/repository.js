const { Pool } = require('pg');
const { GENESIS_HASH } = require('./canonical');

class MatchRepository {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString, max: Number(process.env.FERAS_DB_POOL_SIZE || 10) });
  }

  async close() { await this.pool.end(); }

  async createMatch(match) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO matches (id, title, category, status, white_profile, black_profile, engine_settings, initial_fen, current_fen, white_clock_ms, black_clock_ms, increment_ms, market_lock_time, transcript_hash)
         VALUES ($1,$2,$3,'SCHEDULED',$4,$5,$6,$7,$7,$8,$8,$9,$10,$11)`,
        [match.id, match.title, match.category, match.whiteProfile, match.blackProfile, match.engineSettings, match.initialFen, match.baseTimeMs, match.incrementMs, match.marketLockTime, match.initialHash],
      );
      await this._appendEvent(client, match.id, 1, 'MATCH_CREATED', { type: 'MATCH_CREATED', matchId: match.id, initialFen: match.initialFen }, GENESIS_HASH, match.initialHash);
      await this.enqueueMarketCommand(client, match.id, 'CREATE', `market:create:${match.id}`, { matchId: match.id, lockTime: match.marketLockTime });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async claimNextRunnableMatch(leaseSeconds = 30) {
    const { rows } = await this.pool.query(
      `WITH candidate AS (
         SELECT id FROM matches
         WHERE status = 'LIVE' AND (runner_lease_expires_at IS NULL OR runner_lease_expires_at < NOW())
         ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE matches SET status = 'LIVE', runner_lease_expires_at = NOW() + ($1 * INTERVAL '1 second'), updated_at = NOW()
       WHERE id IN (SELECT id FROM candidate) RETURNING *`, [leaseSeconds],
    );
    return rows[0] || null;
  }

  async recordMove({ matchId, expectedPly, move, event, eventHash, complete, result, terminationReason }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
      const match = rows[0];
      if (!match) throw new Error('Match not found');
      if (match.current_ply !== expectedPly) throw new Error('Stale worker lease: match ply changed');
      const sequence = expectedPly + 2;
      const analysisJson = JSON.stringify(move.analysis || []);
      await client.query(
        `INSERT INTO match_moves (match_id, ply, uci, san, fen, pgn, color, piece, captured, promotion, is_check, is_checkmate, time_spent_ms, white_clock_ms, black_clock_ms, eval_centipawns, analysis)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [matchId, move.ply, move.uci, move.san, move.fen, move.pgn, move.color, move.piece, move.captured, move.promotion, move.isCheck, move.isCheckmate, move.timeSpentMs, move.whiteClockMs, move.blackClockMs, move.evalCentipawns, analysisJson],
      );
      await this._appendEvent(client, matchId, sequence, 'MOVE', event, match.transcript_hash || GENESIS_HASH, eventHash);
      await client.query(
        `UPDATE matches SET current_ply=$2, current_fen=$3, pgn=$4, white_clock_ms=$5, black_clock_ms=$6, transcript_hash=$7,
          current_eval_centipawns=$8, current_analysis=$9, status=CASE WHEN $10 THEN 'COMPLETED' ELSE 'LIVE' END, result=$11, termination_reason=$12,
          completed_at=CASE WHEN $10 THEN NOW() ELSE completed_at END, runner_lease_expires_at=NULL, updated_at=NOW() WHERE id=$1`,
        [matchId, move.ply, move.fen, move.pgn, move.whiteClockMs, move.blackClockMs, eventHash, move.evalCentipawns, analysisJson, complete, result, terminationReason],
      );
      if (complete) await this.enqueueMarketCommand(client, matchId, 'SETTLE', `market:settle:${matchId}`, { matchId, result, transcriptHash: eventHash });
      await client.query('COMMIT');
      return { ...match, current_ply: move.ply, current_fen: move.fen, transcript_hash: eventHash };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async completeMatch({ matchId, result, terminationReason, event, eventHash }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
      const match = rows[0];
      if (!match) throw new Error('Match not found');
      if (match.status === 'COMPLETED') return match;
      await this._appendEvent(client, matchId, Number(match.current_ply) + 2, 'GAME_COMPLETED', event, match.transcript_hash || GENESIS_HASH, eventHash);
      await client.query(`UPDATE matches SET status='COMPLETED', result=$2, termination_reason=$3, transcript_hash=$4, completed_at=NOW(), runner_lease_expires_at=NULL, updated_at=NOW() WHERE id=$1`, [matchId, result, terminationReason, eventHash]);
      await this.enqueueMarketCommand(client, matchId, 'SETTLE', `market:settle:${matchId}`, { matchId, result, transcriptHash: eventHash });
      await client.query('COMMIT');
      return { ...match, result, transcript_hash: eventHash };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async enqueueMarketCommand(client, matchId, commandType, idempotencyKey, payload) {
    await client.query(
      `INSERT INTO market_commands (match_id, command_type, idempotency_key, payload)
       VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING`,
      [matchId, commandType, idempotencyKey, payload],
    );
  }

  async _appendEvent(client, matchId, sequence, eventType, payload, previousHash, eventHash) {
    await client.query(
      'INSERT INTO match_events (match_id, sequence, event_type, payload, previous_hash, event_hash) VALUES ($1,$2,$3,$4,$5,$6)',
      [matchId, sequence, eventType, payload, previousHash, eventHash],
    );
  }

  async listMatches(status) {
    const { rows } = await this.pool.query(`SELECT * FROM matches ${status ? 'WHERE status = $1' : ''} ORDER BY started_at DESC`, status ? [status] : []);
    return rows;
  }
  async getMatch(id) { return (await this.pool.query('SELECT * FROM matches WHERE id=$1', [id])).rows[0] || null; }
  async getMoves(id) { return (await this.pool.query('SELECT * FROM match_moves WHERE match_id=$1 ORDER BY ply', [id])).rows; }
  async getEvents(id, after = 0) { return (await this.pool.query('SELECT * FROM match_events WHERE match_id=$1 AND sequence > $2 ORDER BY sequence', [id, after])).rows; }
  async ping() { await this.pool.query('SELECT 1'); }

  async enqueueDueLocks() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT id FROM matches WHERE market_address IS NOT NULL AND status IN ('SCHEDULED','LIVE') AND market_lock_time <= NOW() FOR UPDATE SKIP LOCKED`);
      for (const { id } of rows) await this.enqueueMarketCommand(client, id, 'LOCK', `market:lock:${id}`, { matchId: id });
      await client.query('COMMIT');
      return rows.length;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async claimNextMarketCommand() {
    const { rows } = await this.pool.query(
      `WITH candidate AS (
        SELECT id FROM market_commands WHERE status = 'PENDING' AND available_at <= NOW()
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE market_commands SET attempts = attempts + 1, updated_at=NOW()
      WHERE id IN (SELECT id FROM candidate) RETURNING *`,
    );
    return rows[0] || null;
  }

  async updateMarketCommand(id, status, { signature = null, error = null } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('UPDATE market_commands SET status=$2, transaction_signature=$3, error=$4, updated_at=NOW() WHERE id=$1 RETURNING match_id, command_type', [id, status, signature, error]);
      const command = rows[0];
      if (command && status === 'CONFIRMED' && command.command_type === 'LOCK') {
        await client.query("UPDATE matches SET status='LIVE', started_at=COALESCE(started_at, NOW()), updated_at=NOW() WHERE id=$1 AND status='SCHEDULED'", [command.match_id]);
      }
      if (command && status === 'CONFIRMED' && command.command_type === 'CANCEL') {
        await client.query("UPDATE matches SET status='ABORTED', termination_reason='Market cancelled', updated_at=NOW() WHERE id=$1 AND status <> 'COMPLETED'", [command.match_id]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async attachMarket(matchId, { marketAddress, vaultAddress }) {
    await this.pool.query('UPDATE matches SET market_address=$2, vault_address=$3, updated_at=NOW() WHERE id=$1', [matchId, marketAddress, vaultAddress]);
  }

  async confirmMarketCommand(matchId, commandType, signature) {
    const result = await this.pool.query(
      `UPDATE market_commands SET status='CONFIRMED', transaction_signature=$3, error=NULL, updated_at=NOW()
       WHERE match_id=$1 AND command_type=$2 AND status IN ('PENDING', 'AWAITING_SIGNATURE', 'SUBMITTED')
       RETURNING id`,
      [matchId, commandType, signature],
    );
    if (result.rowCount !== 1) throw new Error(`Expected exactly one pending ${commandType} command for ${matchId}`);
    if (commandType === 'LOCK') {
      await this.pool.query("UPDATE matches SET status='LIVE', started_at=COALESCE(started_at, NOW()), updated_at=NOW() WHERE id=$1 AND status='SCHEDULED'", [matchId]);
    }
  }
}

module.exports = { MatchRepository };
