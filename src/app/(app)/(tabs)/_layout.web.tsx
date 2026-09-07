import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function WebHeaderNav({ active }: { active: 'stock' | 'household' }) {
  const theme = useTheme();

  return (
    <View style={styles.nav}>
      <Link href="/(app)/(tabs)" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ selected: active === 'stock' }}
          style={({ pressed }) => [
            styles.navItem,
            {
              backgroundColor:
                active === 'stock' ? theme.backgroundSelected : theme.backgroundElement,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText type="smallBold">Stock</ThemedText>
        </Pressable>
      </Link>
      <Link href="/(app)/(tabs)/household" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ selected: active === 'household' }}
          style={({ pressed }) => [
            styles.navItem,
            {
              backgroundColor:
                active === 'household' ? theme.backgroundSelected : theme.backgroundElement,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText type="smallBold">Household</ThemedText>
        </Pressable>
      </Link>
    </View>
  );
}

/**
 * Web: Stock ↔ Household in the header (no native tab bar).
 * Scan/join are sibling Stack screens on the parent `(app)` layout.
 */
export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        title: 'Zero waste',
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Stock',
          headerTitle: 'Zero waste',
          headerRight: () => <WebHeaderNav active="stock" />,
        }}
      />
      <Stack.Screen
        name="household"
        options={{
          title: 'Household',
          headerTitle: 'Zero waste',
          headerRight: () => <WebHeaderNav active="household" />,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginRight: Spacing.two,
  },
  navItem: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    minHeight: 32,
    justifyContent: 'center',
  },
});
