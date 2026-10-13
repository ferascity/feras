import { PieceType, PieceColor } from '@/types/chess';

export interface BoardSquare {
  square: string; // e.g. "e4"
  piece: {
    type: PieceType;
    color: PieceColor;
  } | null;
  file: string; // 'a'-'h'
  rank: number; // 1-8
  isLight: boolean;
}

export function parseFen(fen: string): BoardSquare[][] {
  const parts = fen.split(' ');
  const piecePlacement = parts[0];
  const rows = piecePlacement.split('/');

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const board: BoardSquare[][] = [];

  for (let r = 0; r < 8; r++) {
    const rankNum = 8 - r;
    const rowStr = rows[r] || '8';
    const row: BoardSquare[] = [];
    let fileIdx = 0;

    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char >= '1' && char <= '8') {
        const emptyCount = parseInt(char, 10);
        for (let e = 0; e < emptyCount; e++) {
          const fileChar = files[fileIdx];
          const isLight = (r + fileIdx) % 2 === 0;
          row.push({
            square: `${fileChar}${rankNum}`,
            piece: null,
            file: fileChar,
            rank: rankNum,
            isLight,
          });
          fileIdx++;
        }
      } else {
        const fileChar = files[fileIdx];
        const isLight = (r + fileIdx) % 2 === 0;
        const color: PieceColor = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toLowerCase() as PieceType;

        row.push({
          square: `${fileChar}${rankNum}`,
          piece: { type, color },
          file: fileChar,
          rank: rankNum,
          isLight,
        });
        fileIdx++;
      }
    }
    board.push(row);
  }

  return board;
}
