import { useMemo } from 'react';

interface ChessBoardProps {
  fen: string;
  lastMove?: { from: string; to: string } | null;
  inCheck?: boolean;
}

interface BoardPiece {
  color: 'w' | 'b';
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function parseFen(fen: string): {
  squares: (BoardPiece | null)[][];
  turn: 'w' | 'b';
} {
  const safe = typeof fen === 'string' && fen.includes('/') ? fen : INITIAL_FEN;
  const [placement, turnRaw] = safe.split(' ');
  const rows = placement.split('/');
  const squares: (BoardPiece | null)[][] = [];

  for (let row = 0; row < 8; row += 1) {
    const line = rows[row] ?? '8';
    const rank: (BoardPiece | null)[] = [];
    for (const char of line) {
      if (/[1-8]/.test(char)) {
        const empty = Number(char);
        for (let i = 0; i < empty; i += 1) rank.push(null);
      } else if (/[prnbqkPRNBQK]/.test(char)) {
        rank.push({
          color: char === char.toUpperCase() ? 'w' : 'b',
          type: char.toLowerCase() as BoardPiece['type'],
        });
      }
    }
    while (rank.length < 8) rank.push(null);
    squares.push(rank.slice(0, 8));
  }

  return { squares, turn: turnRaw === 'b' ? 'b' : 'w' };
}

export function ChessBoard({ fen, lastMove = null, inCheck = false }: ChessBoardProps) {
  const { squares, turn } = useMemo(() => parseFen(fen), [fen]);

  let checkSquare: string | null = null;
  if (inCheck) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = squares[row][col];
        if (piece?.type === 'k' && piece.color === turn) {
          checkSquare = `${FILES[col]}${8 - row}`;
        }
      }
    }
  }

  return (
    <div className="board-frame">
      <div className="board" role="img" aria-label={`Chess position. ${turn === 'w' ? 'White' : 'Black'} to move.`}>
        {squares.map((rank, row) =>
          rank.map((piece, col) => {
            const file = FILES[col];
            const rankNumber = 8 - row;
            const square = `${file}${rankNumber}`;
            const isLight = (row + col) % 2 === 0;
            const isLast = lastMove?.from === square || lastMove?.to === square;
            const isCheck = checkSquare === square;

            return (
              <div
                key={square}
                className={[
                  'square',
                  isLight ? 'light' : 'dark',
                  isLast ? 'last' : '',
                  isCheck ? 'check' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-square={square}
              >
                {col === 0 ? (
                  <span className="coord rank">{rankNumber}</span>
                ) : null}
                {row === 7 ? <span className="coord file">{file}</span> : null}
                {piece ? (
                  <img
                    className="piece"
                    src={`/chess/${piece.color}${piece.type}.png`}
                    alt=""
                    draggable={false}
                  />
                ) : null}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
