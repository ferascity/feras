import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keypair } from '@solana/web3.js';
// @ts-expect-error bs58 lacks bundled TypeScript definitions
import bs58 from 'bs58';

export interface StoredEmbeddedAccount {
  address: string;
  secretKeyBase58: string;
  email: string;
  provider: 'google' | 'apple' | 'email';
  createdAt: string;
}

const STORAGE_PREFIX = '@feras_embedded_wallet_';
const ACTIVE_PROVIDER_KEY = '@feras_embedded_active_provider';

/**
 * Retrieves an existing self-custodial Solana keypair or generates a brand new
 * cryptographic ed25519 Solana Keypair for the authenticated user.
 */
export async function getOrCreateEmbeddedWallet(
  provider: 'google' | 'apple' | 'email',
  emailInput?: string
): Promise<{ address: string; email: string; keypair: Keypair }> {
  const storageKey = `${STORAGE_PREFIX}${provider}`;

  try {
    const existingJson = await AsyncStorage.getItem(storageKey);
    if (existingJson) {
      const stored: StoredEmbeddedAccount = JSON.parse(existingJson);
      const secretKey = bs58.decode(stored.secretKeyBase58);
      const keypair = Keypair.fromSecretKey(secretKey);

      await AsyncStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
      return {
        address: keypair.publicKey.toBase58(),
        email: stored.email,
        keypair,
      };
    }
  } catch (error) {
    // If stored payload is corrupt, fall through to regenerate a fresh keypair
  }

  // Generate a real cryptographic Solana Keypair
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const secretKeyBase58 = bs58.encode(keypair.secretKey);
  const email =
    emailInput ||
    (provider === 'google'
      ? 'player@gmail.com'
      : provider === 'apple'
      ? 'player@icloud.com'
      : 'player@feras.app');

  const accountData: StoredEmbeddedAccount = {
    address,
    secretKeyBase58,
    email,
    provider,
    createdAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(storageKey, JSON.stringify(accountData));
  await AsyncStorage.setItem(ACTIVE_PROVIDER_KEY, provider);

  return {
    address,
    email,
    keypair,
  };
}

/**
 * Returns the currently active stored embedded keypair, if any.
 */
export async function getActiveEmbeddedKeypair(): Promise<Keypair | null> {
  try {
    const activeProvider = await AsyncStorage.getItem(ACTIVE_PROVIDER_KEY);
    if (!activeProvider) return null;

    const storageKey = `${STORAGE_PREFIX}${activeProvider}`;
    const dataJson = await AsyncStorage.getItem(storageKey);
    if (!dataJson) return null;

    const stored: StoredEmbeddedAccount = JSON.parse(dataJson);
    const secretKey = bs58.decode(stored.secretKeyBase58);
    return Keypair.fromSecretKey(secretKey);
  } catch {
    return null;
  }
}

/**
 * Returns the active stored embedded account metadata without secret key.
 */
export async function getActiveEmbeddedAccount(): Promise<{
  address: string;
  email: string;
  provider: 'google' | 'apple' | 'email';
} | null> {
  try {
    const activeProvider = (await AsyncStorage.getItem(
      ACTIVE_PROVIDER_KEY
    )) as 'google' | 'apple' | 'email' | null;
    if (!activeProvider) return null;

    const storageKey = `${STORAGE_PREFIX}${activeProvider}`;
    const dataJson = await AsyncStorage.getItem(storageKey);
    if (!dataJson) return null;

    const stored: StoredEmbeddedAccount = JSON.parse(dataJson);
    return {
      address: stored.address,
      email: stored.email,
      provider: stored.provider,
    };
  } catch {
    return null;
  }
}

/**
 * Clears the active session.
 */
export async function clearEmbeddedSession(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_PROVIDER_KEY);
}

