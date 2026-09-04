import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { useHousehold } from '@/hooks/use-household';
import { AuthProvider } from '@/providers/auth-provider';
import { HouseholdProvider } from '@/providers/household-provider';

void SplashScreen.preventAutoHideAsync();

function SplashScreenController() {
  const { session, isReady: isAuthReady } = useAuth();
  const { isMembershipReady } = useHousehold();

  const isReady = isAuthReady && (!session || isMembershipReady);

  useEffect(() => {
    if (isReady) {
      void SplashScreen.hideAsync();
    }
  }, [isReady]);

  return null;
}

function RootNavigator() {
  const { session } = useAuth();
  const { membership, isMembershipReady } = useHousehold();

  const hasSession = !!session;
  const hasMembership = !!membership;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={hasSession && hasMembership}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={hasSession && !hasMembership && isMembershipReady}>
        <Stack.Screen name="bootstrap-household" />
      </Stack.Protected>

      <Stack.Protected guard={!hasSession}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <HouseholdProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SplashScreenController />
          <RootNavigator />
        </ThemeProvider>
      </HouseholdProvider>
    </AuthProvider>
  );
}
