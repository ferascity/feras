import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Match } from '@/types/match';
import { walletService } from '@/services/wallet';
import { MarketOutcome, WalletName, WalletState } from '@/services/wallet/IWalletService';

export type BoardThemeName = 'cupertino' | 'slate' | 'dark';
const PREFERENCES_KEY = 'feras.preferences.v1';

interface PersistedPreferences {
  boardTheme: BoardThemeName;
  playbackSpeed: 1 | 2 | 4;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

const isBoardTheme = (value: unknown): value is BoardThemeName =>
  value === 'cupertino' || value === 'slate' || value === 'dark';

const isPlaybackSpeed = (value: unknown): value is 1 | 2 | 4 =>
  value === 1 || value === 2 || value === 4;

async function persistPreferences(state: PersistedPreferences): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(state));
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'error';
  title: string;
  message?: string;
}

interface FerasStore {
  isHydrated: boolean;
  hydrateAppState: () => Promise<void>;

  // Wallet
  wallet: WalletState;
  connectWallet: (name?: WalletName) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshWallet: () => Promise<void>;

  // Market Position Sheet
  isPositionSheetOpen: boolean;
  positionMatch: Match | null;
  positionAgentId: string | null;
  positionAgentName: string | null;
  positionOutcome: MarketOutcome;
  positionEstimatedMultiplier: number;
  positionStakeUsdc: number;
  openPositionSheet: (params: {
    match: Match;
    agentId: string;
    agentName: string;
    outcome: MarketOutcome;
    estimatedMultiplier: number;
  }) => void;
  closePositionSheet: () => void;
  setPositionStakeUsdc: (stake: number) => void;

  // Preferences
  boardTheme: BoardThemeName;
  setBoardTheme: (theme: BoardThemeName) => void;
  playbackSpeed: 1 | 2 | 4;
  setPlaybackSpeed: (speed: 1 | 2 | 4) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  hapticsEnabled: boolean;
  toggleHaptics: () => void;

  // In-app Toast / Notification
  currentToast: ToastMessage | null;
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  clearToast: () => void;
}

export const useFerasStore = create<FerasStore>((set, get) => ({
  isHydrated: false,
  hydrateAppState: async () => {
    const [wallet, storedPreferences] = await Promise.all([
      walletService.getState(),
      AsyncStorage.getItem(PREFERENCES_KEY),
    ]);

    const nextState: Partial<FerasStore> = { wallet, isHydrated: true };
    if (storedPreferences) {
      try {
        const parsed = JSON.parse(storedPreferences) as Partial<PersistedPreferences>;
        if (isBoardTheme(parsed.boardTheme)) nextState.boardTheme = parsed.boardTheme;
        if (isPlaybackSpeed(parsed.playbackSpeed)) {
          nextState.playbackSpeed = parsed.playbackSpeed;
        }
        if (typeof parsed.soundEnabled === 'boolean') {
          nextState.soundEnabled = parsed.soundEnabled;
        }
        if (typeof parsed.hapticsEnabled === 'boolean') {
          nextState.hapticsEnabled = parsed.hapticsEnabled;
        }
      } catch {
        await AsyncStorage.removeItem(PREFERENCES_KEY);
      }
    }

    set(nextState);
  },

  wallet: {
    isConnected: false,
    address: null,
    solBalance: 0,
    usdcBalance: 0,
    walletName: null,
    mode: 'unavailable',
    cluster: 'devnet',
    capabilities: {
      canSignTransactions: false,
      canCreateMarketPositions: false,
    },
  },

  connectWallet: async (name) => {
    const state = await walletService.connect(name);
    set({ wallet: state });
    get().showToast({
      type: 'success',
      title: 'Wallet Connected',
      message: `${name || 'MWA'} connected: ${state.address}`,
    });
  },

  disconnectWallet: async () => {
    await walletService.disconnect();
    const state = await walletService.getState();
    set({ wallet: state });
    get().showToast({
      type: 'info',
      title: 'Wallet Disconnected',
    });
  },

  refreshWallet: async () => {
    const state = await walletService.getState();
    set({ wallet: state });
  },

  // Market Position Sheet
  isPositionSheetOpen: false,
  positionMatch: null,
  positionAgentId: null,
  positionAgentName: null,
  positionOutcome: 'WHITE',
  positionEstimatedMultiplier: 2,
  positionStakeUsdc: 25,

  openPositionSheet: (params) => {
    set({
      isPositionSheetOpen: true,
      positionMatch: params.match,
      positionAgentId: params.agentId,
      positionAgentName: params.agentName,
      positionOutcome: params.outcome,
      positionEstimatedMultiplier: params.estimatedMultiplier,
      positionStakeUsdc: 25,
    });
  },

  closePositionSheet: () => {
    set({ isPositionSheetOpen: false });
  },

  setPositionStakeUsdc: (stake) => {
    set({ positionStakeUsdc: stake });
  },

  // Settings
  boardTheme: 'cupertino',
  setBoardTheme: (boardTheme) => {
    set({ boardTheme });
    void persistPreferences({
      boardTheme,
      playbackSpeed: get().playbackSpeed,
      soundEnabled: get().soundEnabled,
      hapticsEnabled: get().hapticsEnabled,
    });
  },
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => {
    set({ playbackSpeed });
    void persistPreferences({
      boardTheme: get().boardTheme,
      playbackSpeed,
      soundEnabled: get().soundEnabled,
      hapticsEnabled: get().hapticsEnabled,
    });
  },
  soundEnabled: true,
  toggleSound: () => {
    set((state) => ({ soundEnabled: !state.soundEnabled }));
    void persistPreferences({
      boardTheme: get().boardTheme,
      playbackSpeed: get().playbackSpeed,
      soundEnabled: get().soundEnabled,
      hapticsEnabled: get().hapticsEnabled,
    });
  },
  hapticsEnabled: true,
  toggleHaptics: () => {
    set((state) => ({ hapticsEnabled: !state.hapticsEnabled }));
    void persistPreferences({
      boardTheme: get().boardTheme,
      playbackSpeed: get().playbackSpeed,
      soundEnabled: get().soundEnabled,
      hapticsEnabled: get().hapticsEnabled,
    });
  },

  // Toasts
  currentToast: null,
  showToast: (toast) => {
    const id = Math.random().toString();
    set({ currentToast: { ...toast, id } });
    setTimeout(() => {
      if (get().currentToast?.id === id) {
        set({ currentToast: null });
      }
    }, 3200);
  },
  clearToast: () => set({ currentToast: null }),
}));
