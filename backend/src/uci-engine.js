const { spawn } = require('node:child_process');

function parseInfo(line) {
  if (!line.startsWith('info ')) return null;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
  const multiPv = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
  const cp = line.match(/\bscore cp (-?\d+)/)?.[1];
  const mate = line.match(/\bscore mate (-?\d+)/)?.[1];
  const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/) || [];
  if (!depth || (!cp && !mate) || !pv.length) return null;
  return { depth, multiPv, scoreCp: cp === undefined ? null : Number(cp), scoreMate: mate === undefined ? null : Number(mate), principalVariation: pv };
}

class UciEngine {
  constructor({ path = process.env.FERAS_STOCKFISH_PATH || '/usr/games/stockfish', options = {} } = {}) {
    this.path = path;
    this.options = options;
    this.process = null;
    this.buffer = '';
    this.waiters = [];
  }

  async start() {
    if (this.process) return;
    this.process = spawn(this.path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.process.stdout.setEncoding('utf8');
    this.process.stdout.on('data', (chunk) => this._read(chunk));
    this.process.on('error', (error) => this._fail(error));
    await this.commandUntil('uci', (line) => line === 'uciok');
    for (const [name, value] of Object.entries(this.options)) this.write(`setoption name ${name} value ${value}`);
    await this.commandUntil('isready', (line) => line === 'readyok');
  }

  write(command) {
    if (!this.process?.stdin.writable) throw new Error('Stockfish process is not running');
    this.process.stdin.write(`${command}\n`);
  }

  commandUntil(command, predicate, timeoutMs = 10_000, onLine = null) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Stockfish timed out waiting for ${command}`)), timeoutMs);
      this.waiters.push({ predicate, onLine, resolve: (line) => { clearTimeout(timeout); resolve(line); }, reject });
      this.write(command);
    });
  }

  _read(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop();
    for (const line of lines) {
      for (const item of this.waiters) item.onLine?.(line);
      const waiter = this.waiters.find((item) => item.predicate(line));
      if (waiter) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(line);
      }
    }
  }

  _fail(error) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  async bestMove({ fen, moveTimeMs }) {
    return (await this.bestMoveWithAnalysis({ fen, moveTimeMs })).uci;
  }

  async bestMoveWithAnalysis({ fen, moveTimeMs, multiPv = 1 }) {
    await this.start();
    if (multiPv > 1) this.write(`setoption name MultiPV value ${multiPv}`);
    this.write(`position fen ${fen}`);
    const lines = new Map();
    const line = await this.commandUntil(
      `go movetime ${moveTimeMs}`,
      (candidate) => candidate.startsWith('bestmove '),
      moveTimeMs + 15_000,
      (candidate) => {
        const info = parseInfo(candidate);
        if (info) lines.set(info.multiPv, info);
      },
    );
    const move = line.split(/\s+/)[1];
    if (!move || move === '(none)') throw new Error('Stockfish returned no legal move');
    return { uci: move, analysis: [...lines.values()].sort((a, b) => a.multiPv - b.multiPv) };
  }

  async stop() {
    if (!this.process) return;
    this.write('quit');
    this.process.kill();
    this.process = null;
  }
}

module.exports = { UciEngine, parseInfo };
