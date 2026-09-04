import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AuthForm } from '@/components/auth/auth-form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

export default function SignInScreen() {
  const { signIn } = useAuth();

  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={async (email, password) => {
        const { error } = await signIn(email, password);
        if (error) {
          throw error;
        }
      }}
      footer={
        <Link href="/(auth)/sign-up" style={styles.link}>
          <ThemedText type="linkPrimary">Create an account</ThemedText>
        </Link>
      }
    />
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    marginTop: Spacing.two,
  },
});
