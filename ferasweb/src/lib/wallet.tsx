import { usePrivy } from '@privy-io/react-auth';
import {
  useCreateWallet,
  useSignMessage,
  useSignTransaction,
  useWallets,
} from '@privy-io/react-auth/solana';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { requestPositionTransaction } from './api/positions';
import {
  buildSwapMessage,
  prepareBetaSwap,
  submitBetaSwap,
  toUsdcBaseUnits,
  type BetaSwapResult,
} from './api/beta';
import { CONFIG, EXPLORER_URL } from './config';
import { shortAddress } from './format';
import type { PositionDraft, TransactionReceipt } from './types';

type BalanceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface WalletContextValue {
  ready: boolean;
  authDelayed: boolean;
  authenticated: boolean;
  address: string | null;
  walletName: string | null;
  userLabel: string | null;
  solBalance: number;
  usdcBalance: number;
  balanceStatus: BalanceStatus;
  balanceError: string | null;
  refreshBalances: () => void;
  login: () => void;
  logout: () => Promise<void>;
  createWallet: () => Promise<void>;
  placePosition: (draft: PositionDraft) => Promise<TransactionReceipt>;
  requestDevnetSol: () => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  topUpTestCredit: (usdc: number) => Promise<BetaSwapResult>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const { ready: privyReady, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { signMessage: privySignMessage } = useSignMessage();
  const { createWallet: createSolanaWallet } = useCreateWallet();

  const connection = useMemo(
    () => new Connection(CONFIG.rpcUrl, { commitment: 'confirmed' }),
    [],
  );

  // Prefer the Privy embedded wallet so the web experience matches the mobile
  // app. External Solana wallets remain available as a fallback.
  const solanaWallet =
    wallets.find((wallet) => /privy/i.test(wallet.standardWallet.name)) ??
    wallets[0] ??
    null;
  const address = solanaWallet?.address ?? null;
  const walletName = solanaWallet?.standardWallet?.name ?? null;

  // Privy initializes through an iframe. If the current origin is not in the
  // app's allowed origins, initialization can wait forever; after a generous
  // timeout, fall back to a usable signed-out UI with an explanatory notice.
  const [authDelayed, setAuthDelayed] = useState(false);
  useEffect(() => {
    if (privyReady) {
      setAuthDelayed(false);
      return;
    }
    const timer = window.setTimeout(() => setAuthDelayed(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [privyReady]);
  const fallbackReady = authDelayed && !privyReady;

  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('idle');
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceNonce, setBalanceNonce] = useState(0);

  useEffect(() => {
    if (!address) {
      setSolBalance(0);
      setUsdcBalance(0);
      setBalanceStatus('idle');
      setBalanceError(null);
      return;
    }

    let cancelled = false;
    const owner = new PublicKey(address);

    setBalanceStatus('loading');
    setBalanceError(null);

    const load = async () => {
      try {
        const [lamports, tokenAccounts] = await Promise.all([
          connection.getBalance(owner),
          connection.getParsedTokenAccountsByOwner(owner, {
            mint: new PublicKey(CONFIG.usdcMint),
          }),
        ]);

        if (cancelled) return;

        let usdc = 0;
        for (const item of tokenAccounts.value) {
          const amount = item.account.data.parsed?.info?.tokenAmount?.uiAmount;
          if (typeof amount === 'number') usdc += amount;
        }

        setSolBalance(lamports / LAMPORTS_PER_SOL);
        setUsdcBalance(Number(usdc.toFixed(2)));
        setBalanceStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setBalanceStatus('error');
        setBalanceError(
          describeError(error, 'Balances are unavailable right now.'),
        );
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, balanceNonce, connection]);

  const refreshBalances = useCallback(() => {
    setBalanceNonce((value) => value + 1);
  }, []);

  const createWallet = useCallback(async () => {
    await createSolanaWallet();
    setBalanceNonce((value) => value + 1);
  }, [createSolanaWallet]);

  const placePosition = useCallback(
    async (draft: PositionDraft): Promise<TransactionReceipt> => {
      if (!address || !solanaWallet) {
        throw new Error('Connect a Solana wallet to take a position.');
      }

      try {
        const { instructions } = await requestPositionTransaction(draft, address);

        const transaction = new Transaction();
        transaction.add(...instructions);
        transaction.feePayer = new PublicKey(address);

        const latest = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = latest.blockhash;

        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });

        const { signedTransaction } = await signTransaction({
          transaction: new Uint8Array(serialized),
          wallet: solanaWallet,
          chain: 'solana:devnet',
        });

        const signature = await connection.sendRawTransaction(signedTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });

        const confirmation = await connection.confirmTransaction(
          {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          'confirmed',
        );

        if (confirmation.value.err) {
          throw new Error(
            'The position transaction failed on-chain. No funds were taken.',
          );
        }

        setBalanceNonce((value) => value + 1);

        return {
          signature,
          explorerUrl: `${EXPLORER_URL}/tx/${signature}?cluster=devnet`,
          cluster: 'devnet',
        };
      } catch (error) {
        const message = describeError(error, 'The position could not be placed.');
        if (/reject|cancel|denied/i.test(message)) {
          throw new Error('Signature request cancelled.');
        }
        throw new Error(message);
      }
    },
    [address, solanaWallet, connection, signTransaction],
  );

  const requestDevnetSol = useCallback(async (): Promise<string> => {
    if (!address) throw new Error('No Solana wallet is connected.');
    try {
      const signature = await connection.requestAirdrop(
        new PublicKey(address),
        LAMPORTS_PER_SOL,
      );
      const latest = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed',
      );
      setBalanceNonce((value) => value + 1);
      return signature;
    } catch (error) {
      const message = describeError(
        error,
        'The Devnet faucet is rate-limited right now. Try again later.',
      );
      throw new Error(message);
    }
  }, [address, connection]);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!address || !solanaWallet) {
        throw new Error('Connect a Solana wallet before signing.');
      }
      const { signature } = await privySignMessage({
        message: new TextEncoder().encode(message),
        wallet: solanaWallet,
      });
      return toBase64(signature);
    },
    [address, solanaWallet, privySignMessage],
  );

  /**
   * Add test credit by paying with Devnet SOL. The backend prepares a
   * transaction the float has already signed; the wallet adds its signature and
   * the server verifies and submits it. One approval, atomic settlement.
   */
  const topUpTestCredit = useCallback(
    async (usdc: number): Promise<BetaSwapResult> => {
      if (!address || !solanaWallet) {
        throw new Error('Connect a Solana wallet to add test credit.');
      }
      const rounded = Math.round(usdc * 100) / 100;
      if (!(rounded > 0)) throw new Error('Choose how much test credit to add.');

      try {
        const issuedAt = Date.now();
        const message = buildSwapMessage({
          wallet: address,
          usdcBaseUnits: toUsdcBaseUnits(rounded),
          issuedAt,
        });
        const signature = await signMessage(message);

        const quote = await prepareBetaSwap({
          wallet: address,
          usdc: rounded,
          issuedAt,
          signature,
        });

        // Build the same transaction the server prepared, sign it with the
        // tester's wallet, and let the server verify and co-sign it.
        const latest = await connection.getLatestBlockhash('confirmed');
        const transaction = new Transaction();
        transaction.feePayer = new PublicKey(address);
        transaction.recentBlockhash = latest.blockhash;
        for (const instruction of quote.instructions) {
          transaction.add(
            new TransactionInstruction({
              programId: new PublicKey(instruction.programId),
              keys: instruction.keys.map((key) => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
              })),
              // The runtime accepts a Uint8Array; the published type only allows
              // Buffer, which is a Uint8Array subclass.
              data: fromBase64(instruction.data) as unknown as Buffer,
            }),
          );
        }

        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });

        const { signedTransaction } = await signTransaction({
          transaction: new Uint8Array(serialized),
          wallet: solanaWallet,
          chain: 'solana:devnet',
        });

        const result = await submitBetaSwap({
          swapId: quote.swapId,
          wallet: address,
          transaction: toBase64(new Uint8Array(signedTransaction)),
        });

        setBalanceNonce((value) => value + 1);
        return result;
      } catch (error) {
        const message = describeError(error, 'The test credit could not be added.');
        if (/reject|cancel|denied/i.test(message)) {
          throw new Error('Signature request cancelled.');
        }
        throw new Error(message);
      }
    },
    [address, solanaWallet, signMessage, signTransaction],
  );

  const email = user?.email?.address ?? user?.google?.email ?? null;
  const userLabel = email ?? (address ? shortAddress(address, 6) : null);

  const value: WalletContextValue = {
    // Readiness is about Privy's auth session, not the Solana wallet list.
    // The Solana wallets hook can stay unready indefinitely when the Privy
    // iframe is blocked or no wallet proxy is available; blocking the UI on it
    // left the navbar without a Sign in button and Profile stuck on skeletons.
    ready: privyReady || fallbackReady,
    authDelayed: fallbackReady,
    authenticated,
    address,
    walletName,
    userLabel,
    solBalance,
    usdcBalance,
    balanceStatus,
    balanceError,
    refreshBalances,
    login,
    logout,
    createWallet,
    placePosition,
    requestDevnetSol,
    signMessage,
    topUpTestCredit,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used inside a WalletProvider.');
  }
  return context;
}
