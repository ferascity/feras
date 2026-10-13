import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieceType, PieceColor } from '@/types/chess';

interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  size?: number;
}

// Elegant Unicode chess glyphs with custom typography and drop styling
const PIECE_GLYPHS: Record<PieceColor, Record<PieceType, string>> = {
  w: {
    k: '♔',
    q: '♕',
    r: '♖',
    b: '♗',
    n: '♘',
    p: '♙',
  },
  b: {
    k: '♚',
    q: '♛',
    r: '♜',
    b: '♝',
    n: '♞',
    p: '♟',
  },
};

export const ChessPiece: React.FC<ChessPieceProps> = ({
  type,
  color,
  size = 32,
}) => {
  const glyph = PIECE_GLYPHS[color]?.[type] || '';
  const isWhite = color === 'w';

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Text
        style={[
          styles.glyph,
          {
            fontSize: size * 0.88,
            color: isWhite ? '#FFFFFF' : '#121214',
            textShadowColor: isWhite ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)',
            textShadowOffset: { width: 0, height: 1.5 },
            textShadowRadius: isWhite ? 2 : 1,
          },
        ]}
      >
        {glyph}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});
