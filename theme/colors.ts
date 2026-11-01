/**
 * Apple Human Interface Guidelines - System Color Palette (Dark Mode First)
 * Designed for iOS-forward native feel, calm confidence, and high legibility.
 */

export const AppleColors = {
  // Base System Backgrounds (Minimalist Obsidian Slate)
  background: '#08090A',                  // Pure Dark Obsidian background
  secondaryBackground: '#121316',         // Minimalist Card & Grouped Secondary
  tertiaryBackground: '#1A1C22',          // Elevated containers & subtle sheets
  elevatedBackground: '#242730',          // Elevated cards & popovers
  glassSurface: 'rgba(18, 19, 22, 0.85)', // Frosted material
  glassSurfaceLight: 'rgba(26, 28, 34, 0.70)',

  // Brand & High-Precision Accents (Matching Landing Page)
  brandEmerald: '#10B981',                // Live badge, winning positions, positive yield
  brandEmeraldSoft: 'rgba(16, 185, 129, 0.12)',
  brandCyan: '#06B6D4',                   // Solana / Feras Secondary Accent
  brandCyanSoft: 'rgba(6, 182, 212, 0.12)',

  // Apple System Accents
  systemBlue: '#0A84FF',                  // Primary iOS Accent (Action, Selection)
  systemGreen: '#10B981',                 // Win, Favorable Odds, Positive PnL
  systemRed: '#EF4444',                   // Loss, Unfavorable Odds, Check Warning
  systemOrange: '#F59E0B',                // In-Progress, Warning
  systemYellow: '#FBBF24',                // Highlight, Rating, Star
  systemPurple: '#A855F7',                // Grandmaster / Neural Tier
  systemIndigo: '#6366F1',                // Engine / Deep Analysis
  systemTeal: '#06B6D4',                  // Experimental Tier
  systemMint: '#10B981',                  // Bot Speed / Sub-second Latency

  // System Text / Labels
  labelPrimary: '#FFFFFF',                // Primary Text
  labelSecondary: '#8E8E93',              // Secondary Subheadings
  labelTertiary: '#636366',               // Footnotes & De-emphasized
  labelQuaternary: '#48484A',             // Disabled / Ghost Text

  // Separators & Borders
  separator: 'rgba(84, 84, 88, 0.45)',    // Subtle list separator
  separatorOpaque: '#38383A',             // Non-transparent divider
  cardBorder: 'rgba(255, 255, 255, 0.08)',// Crisp Apple border outline
  accentBorder: 'rgba(10, 132, 255, 0.3)',// Focused border

  // Fills & Controls
  fill: 'rgba(120, 120, 128, 0.24)',      // Inset inputs & pill backgrounds
  fillSecondary: 'rgba(120, 120, 128, 0.16)',
  fillTertiary: 'rgba(118, 118, 128, 0.12)',

  // Chessboard Cupertino Themes
  boardLight: '#ECEED2',
  boardDark: '#769656',
  boardSlateLight: '#DFE3E8',
  boardSlateDark: '#5E7083',
  boardDarkLight: '#32363E',
  boardDarkDark: '#1E2228',
  squareHighlight: 'rgba(10, 132, 255, 0.38)',
  squareLastMove: 'rgba(255, 214, 10, 0.35)',
  squareCheckRing: '#FF453A',
} as const;

export type AppleColorToken = keyof typeof AppleColors;
