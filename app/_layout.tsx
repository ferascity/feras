import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toast } from '@/components/ui/Toast';
import { MarketPositionSheet } from '@/components/betting/MarketPositionSheet';
import { AppleColors } from '@/theme/colors';
import { useFerasStore } from '@/store/useFerasStore';
import { WalletRuntimeProvider } from '@/components/wallet/WalletRuntimeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30, // 30s
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    useFerasStore.getState().hydrateAppState().catch(() => {
      useFerasStore.getState().showToast({
        type: 'error',
        title: 'App State Unavailable',
        message: 'Feras could not restore preferences and wallet state.',
      });
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <WalletRuntimeProvider>
          <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: AppleColors.background,
            },
            headerTintColor: AppleColors.labelPrimary,
            headerTitleStyle: {
              fontWeight: '600',
            },
            contentStyle: {
              backgroundColor: AppleColors.background,
            },
            animation: 'default',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="match/[id]"
            options={{
              title: 'Live Match',
              headerBackTitle: 'Arena',
            }}
          />
          <Stack.Screen
            name="agent/[id]"
            options={{
              title: 'Agent Profile',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="agent/submit"
            options={{
              title: 'Deploy Agent',
              presentation: 'modal',
              headerBackTitle: 'Cancel',
            }}
          />
          <Stack.Screen
            name="agent/[id]/sandbox"
            options={{
              title: 'Agent Sandbox',
              headerBackTitle: 'Agent',
            }}
          />
          <Stack.Screen
            name="(onboarding)/welcome"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="(onboarding)/connect-wallet"
            options={{
              presentation: 'modal',
              title: 'Connect Wallet',
            }}
          />
        </Stack>

          <Toast />
          <MarketPositionSheet />
          </QueryClientProvider>
        </WalletRuntimeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
