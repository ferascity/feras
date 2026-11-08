import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { MobileGate } from './components/MobileGate';
import { captureInviteFromLocation } from './lib/betaInvite';
import { FerasPrivyProvider } from './lib/privy';
import { useMediaQuery } from './lib/useMediaQuery';
import { WalletProvider } from './lib/wallet';
import { Arena } from './pages/Arena';
import { Overview } from './pages/Overview';
import { Profile } from './pages/Profile';
import { Train } from './pages/Train';

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 1000px)');

  // Invite links arrive as /profile?invite=CODE. Capture once so the code
  // survives sign-in and navigation before the tester claims.
  useEffect(() => {
    captureInviteFromLocation();
  }, []);

  if (!isDesktop) {
    return <MobileGate />;
  }

  return (
    <FerasPrivyProvider>
      <WalletProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Overview />} />
            <Route path="arena" element={<Arena />} />
            <Route path="train" element={<Train />} />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </WalletProvider>
    </FerasPrivyProvider>
  );
}
