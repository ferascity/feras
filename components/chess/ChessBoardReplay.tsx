import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Image,
  ImageSourcePropType,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import { Chess, type Square } from 'chess.js';
import { GameReplay, MoveStep } from '@/types/chess';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';
import { useFerasStore, BoardThemeName } from '@/store/useFerasStore';

interface ChessBoardReplayProps {
  replay: GameReplay;
  initialPly?: number;
  autoPlay?: boolean;
  onMoveChange?: (currentMove: MoveStep | null, ply: number) => void;
  showEvalBar?: boolean;
}

const BOARD_PADDING = 16;

const PIECE_IMAGES: Record<string, ImageSourcePropType> = {
  wp: require('../../assets/chess/wp.png'),
  wn: require('../../assets/chess/wn.png'),
  wb: require('../../assets/chess/wb.png'),
  wr: require('../../assets/chess/wr.png'),
  wq: require('../../assets/chess/wq.png'),
  wk: require('../../assets/chess/wk.png'),
  bp: require('../../assets/chess/bp.png'),
  bn: require('../../assets/chess/bn.png'),
  bb: require('../../assets/chess/bb.png'),
  br: require('../../assets/chess/br.png'),
  bq: require('../../assets/chess/bq.png'),
  bk: require('../../assets/chess/bk.png'),
};

// Expo Go currently fails to decode the package's Skia atlas on iOS. Keep the
// package's board and replay engine, but render its atlas transparent and place
// the same piece artwork through React Native's reliable Image pipeline.
const TRANSPARENT_SPRITE = require('../../assets/chess/transparent-sprite.png');

export const ChessBoardReplay: React.FC<ChessBoardReplayProps> = ({
  replay,
  initialPly = 0,
  autoPlay = false,
  onMoveChange,
  showEvalBar = true,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const boardWidth = Math.min(
    Math.floor((screenWidth - BOARD_PADDING * 2) / 8) * 8,
    400,
  );
  const boardRef = useRef<ChessboardRef>(null);
  const [currentPly, setCurrentPly] = useState(initialPly);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const theme = useFerasStore((state) => state.boardTheme);
  const speed = useFerasStore((state) => state.playbackSpeed);
  const setSpeed = useFerasStore((state) => state.setPlaybackSpeed);

  const moves = replay?.moves || [];
  const currentMove: MoveStep | null = currentPly > 0 ? moves[currentPly - 1] : null;
  const currentFen = currentMove?.fen || replay?.initialFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const pieceSize = boardWidth / 8;
  const renderedPieces = useMemo(
    () =>
      new Chess(currentFen)
        .board()
        .flatMap((rank, row) =>
          rank.flatMap((piece, column) =>
            piece
              ? [{
                  key: `${piece.color}${piece.type}-${row}-${column}`,
                  source: PIECE_IMAGES[`${piece.color}${piece.type}`],
                  row,
                  column,
                }]
              : [],
          ),
        ),
    [currentFen],
  );

  // Trigger haptic
  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
  };

  // Replay interval timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isPlaying) {
      const delay = Math.max(400, 1600 / speed);
      interval = setInterval(() => {
        setCurrentPly((prev) => {
          if (prev >= moves.length) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          triggerHaptic();
          return next;
        });
      }, delay);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, moves.length, speed]);

  useEffect(() => {
    if (onMoveChange) {
      onMoveChange(currentMove, currentPly);
    }
  }, [currentPly, currentMove, onMoveChange]);

  useEffect(() => {
    boardRef.current?.resetBoard(currentFen, {
      slide: currentMove
        ? {
            from: currentMove.from as Square,
            to: currentMove.to as Square,
          }
        : undefined,
      lastMove: currentMove
        ? {
            from: currentMove.from as Square,
            to: currentMove.to as Square,
          }
        : null,
    });
  }, [currentFen, currentMove]);

  const handleStepNext = () => {
    if (currentPly < moves.length) {
      triggerHaptic();
      setCurrentPly((prev) => prev + 1);
    }
  };

  const handleStepPrev = () => {
    if (currentPly > 0) {
      triggerHaptic();
      setCurrentPly((prev) => prev - 1);
    }
  };

  const handleReset = () => {
    triggerHaptic();
    setIsPlaying(false);
    setCurrentPly(0);
  };

  const handleJumpToEnd = () => {
    triggerHaptic();
    setIsPlaying(false);
    setCurrentPly(moves.length);
  };

  const togglePlay = () => {
    triggerHaptic();
    if (currentPly >= moves.length) {
      setCurrentPly(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  const cycleSpeed = () => {
    triggerHaptic();
    const nextSpeed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    setSpeed(nextSpeed);
  };

  // Board colors based on theme
  const getSquareColors = (themeName: BoardThemeName) => {
    switch (themeName) {
      case 'slate':
        return { light: AppleColors.boardSlateLight, dark: AppleColors.boardSlateDark };
      case 'dark':
        return { light: AppleColors.boardDarkLight, dark: AppleColors.boardDarkDark };
      case 'cupertino':
      default:
        return { light: AppleColors.boardLight, dark: AppleColors.boardDark };
    }
  };

  const squareColors = getSquareColors(theme);

  // Compute evaluation stats
  const winProbWhite = currentMove?.winProbabilityWhite ?? 0.5;
  const evalScoreText = currentMove?.evalCentipawns
    ? currentMove.evalCentipawns > 0
      ? `+${(currentMove.evalCentipawns / 100).toFixed(1)}`
      : `${(currentMove.evalCentipawns / 100).toFixed(1)}`
    : '0.0';

  return (
    <View style={styles.container}>
      {/* Evaluation bar & live evaluation header */}
      {showEvalBar && (
        <View style={[styles.evalContainer, { width: boardWidth }]}>
          <View style={styles.evalBarWrapper}>
            <View
              style={[
                styles.evalBarWhite,
                { width: `${Math.round(winProbWhite * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.evalLabelsRow}>
            <Text style={styles.evalLabel}>
              White {Math.round(winProbWhite * 100)}% ({evalScoreText})
            </Text>
            <Text style={styles.evalLabel}>
              Black {Math.round((1 - winProbWhite) * 100)}%
            </Text>
          </View>
        </View>
      )}

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          currentMove
            ? `Chess position after ${currentMove.san}, ply ${currentPly} of ${moves.length}`
            : `Opening chess position, ply 0 of ${moves.length}`
        }
        style={[
          styles.boardFrame,
          { width: boardWidth, height: boardWidth },
        ]}
      >
        <Chessboard
          key={replay.matchId}
          ref={boardRef}
          fen={replay.initialFen}
          boardSize={boardWidth}
          spriteSource={TRANSPARENT_SPRITE}
          gestureEnabled={false}
          withLetters
          withNumbers
          durations={{ move: 220 }}
          colors={{
            white: squareColors.light,
            black: squareColors.dark,
            lastMoveHighlight: AppleColors.squareHighlight,
            checkmateHighlight: AppleColors.systemRed,
            promotionPieceButton: AppleColors.systemBlue,
          }}
        />
        <View pointerEvents="none" style={styles.pieceLayer}>
          {renderedPieces.map((piece) => (
            <Image
              key={piece.key}
              source={piece.source}
              resizeMode="contain"
              style={[
                styles.pieceImage,
                {
                  width: pieceSize,
                  height: pieceSize,
                  left: piece.column * pieceSize,
                  top: piece.row * pieceSize,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Move Commentary & Notation Capsule */}
      <View style={[styles.commentaryCard, { width: boardWidth }]}>
        <View style={styles.commentaryHeader}>
          <View style={styles.plyBadge}>
            <Text style={styles.plyText}>
              Ply {currentPly} / {moves.length}
            </Text>
          </View>
          {currentMove?.san && (
            <Text style={styles.sanText}>
              {Math.ceil(currentPly / 2)}. {currentMove.san}
            </Text>
          )}
          {currentMove?.timeSpentSec && (
            <Text style={styles.timeSpentText}>
              {currentMove.timeSpentSec}s think
            </Text>
          )}
        </View>

        <Text style={styles.commentaryBody} numberOfLines={2}>
          {currentMove?.commentary ||
            (currentPly === 0
              ? 'Opening position. Match awaiting next move.'
              : replay.terminationReason)}
        </Text>
      </View>

      {/* Playback Controls Toolbar */}
      <View style={[styles.controlsRow, { width: boardWidth }]}>
        <TouchableOpacity
          onPress={handleReset}
          style={styles.controlBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="play-skip-back" size={18} color={AppleColors.labelSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleStepPrev}
          disabled={currentPly === 0}
          style={[styles.controlBtn, currentPly === 0 && styles.disabledBtn]}
        >
          <Ionicons name="chevron-back" size={22} color={AppleColors.labelPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePlay}
          style={styles.playPrimaryBtn}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={22}
            color="#FFFFFF"
            style={isPlaying ? null : { marginLeft: 2 }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleStepNext}
          disabled={currentPly >= moves.length}
          style={[styles.controlBtn, currentPly >= moves.length && styles.disabledBtn]}
        >
          <Ionicons name="chevron-forward" size={22} color={AppleColors.labelPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleJumpToEnd}
          style={styles.controlBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="play-skip-forward" size={18} color={AppleColors.labelSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={cycleSpeed}
          style={styles.speedPill}
        >
          <Text style={styles.speedText}>{speed}x</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  evalContainer: {
    marginBottom: Spacing.sm,
  },
  evalBarWrapper: {
    height: 6,
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  evalBarWhite: {
    height: '100%',
    backgroundColor: AppleColors.systemBlue,
  },
  evalLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  evalLabel: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    fontWeight: '500',
  },
  boardFrame: {
    borderRadius: Radii.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: AppleColors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  pieceLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2,
  },
  pieceImage: {
    position: 'absolute',
  },
  commentaryCard: {
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  },
  commentaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  plyBadge: {
    backgroundColor: AppleColors.fillSecondary,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radii.xs,
  },
  plyText: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    fontWeight: '600',
  },
  sanText: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
  },
  timeSpentText: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  commentaryBody: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    lineHeight: 17,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: Radii.pill,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.3,
  },
  playPrimaryBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppleColors.systemBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppleColors.systemBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  speedPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radii.xs,
    backgroundColor: AppleColors.fillSecondary,
  },
  speedText: {
    ...Typography.caption2,
    fontWeight: '700',
    color: AppleColors.labelPrimary,
  },
});
