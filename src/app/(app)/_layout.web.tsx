import { Stack } from 'expo-router';

/**
 * Web app shell: Stack instead of expo-router/ui Tabs.
 * TabTrigger hrefs like "/(app)/index" were resolving to +not-found after the
 * Protected route group move, so post-signup UI never showed the household screen.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        title: 'Household',
      }}>
      <Stack.Screen name="index" options={{ title: 'Household' }} />
      <Stack.Screen name="join" options={{ title: 'Join household' }} />
      <Stack.Screen name="explore" options={{ title: 'Explore' }} />
    </Stack>
  );
}
