const STORAGE_KEY = 'ferasweb.beta.invite.v1';

/**
 * Invite links look like `/profile?invite=FERAS-BETA-XXXX`. The code is kept in
 * local storage so it survives a page refresh or a Privy sign-in round trip.
 */
export function captureInviteFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (!code || !code.trim()) return readInviteCode();
    const normalized = code.trim().toUpperCase();
    window.localStorage.setItem(STORAGE_KEY, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export function readInviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export function saveInviteCode(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());
  } catch {
    // The code still works for this session through component state.
  }
}

export function clearInviteCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
