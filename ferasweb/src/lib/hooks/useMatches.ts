import { useCallback, useEffect, useState } from 'react';
import { loadMatches, type MatchesResult } from '../api/matches';
import type { MatchStatus } from '../types';

interface MatchesState extends MatchesResult {
  loading: boolean;
}

const initialState: MatchesState = {
  matches: [],
  source: 'demo',
  error: null,
  loading: true,
};

export function useMatches(status?: MatchStatus) {
  const [state, setState] = useState<MatchesState>(initialState);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));

    loadMatches(status)
      .then((result) => {
        if (!cancelled) setState({ ...result, loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          matches: [],
          source: 'demo',
          error:
            error instanceof Error
              ? error.message
              : 'The market API could not be reached.',
          loading: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [status, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { ...state, reload };
}
