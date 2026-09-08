import { StyleSheet, TextInput } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StockSearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
};

/** Case-insensitive barcode or name prefix filter input (filtering done by parent). */
export function StockSearchField({ value, onChangeText }: StockSearchFieldProps) {
  const theme = useTheme();

  return (
    <TextInput
      accessibilityLabel="Search stock by barcode or name"
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      placeholder="Search by barcode or name"
      placeholderTextColor={theme.textSecondary}
      value={value}
      onChangeText={onChangeText}
      style={[
        styles.input,
        {
          color: theme.text,
          backgroundColor: theme.background,
          borderColor: theme.backgroundSelected,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
});
