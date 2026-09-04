import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AuthForm } from '@/components/auth/auth-form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

export default function SignUpScreen() {
  const { signUp } = useAuth();

  return (
    <AuthForm
      title="Create account"
      submitLabel="Sign up"
      onSubmit={async (email, password) => {
        const { error } = await signUp(email, password);
        if (error) {
          throw error;
        }
      }}
      footer={
        <Link href="/(auth)/sign-in" style={styles.link}>
          <ThemedText type="linkPrimary">Already have an account? Sign in</ThemedText>
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
