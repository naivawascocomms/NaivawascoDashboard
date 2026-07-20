import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { TextField } from '../../components/TextField';
import { colors } from '../../theme/colors';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../api/errors';
import { getApiBaseUrl } from '../../api/client';

function loginErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Invalid Django username or password.';
    if (error.status === 404) return `Backend endpoint not found at ${getApiBaseUrl()}.`;
    if (typeof error.payload === 'object' && error.payload !== null) {
      return JSON.stringify(error.payload);
    }
    return String(error.payload || `Login failed with status ${error.status}.`);
  }
  return `Cannot reach backend at ${getApiBaseUrl()}. Check Wi-Fi and Windows Firewall.`;
}

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!username.trim() || !password) {
      setError('Enter username and password.');
      return;
    }
    try {
      setIsSubmitting(true);
      await signIn(username.trim(), password);
    } catch (error) {
      setError(loginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      style={styles.safe}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.wrapper}>
          <View style={styles.header}>
            <Text style={styles.brand}>NAIVAWASCO</Text>
            <Text style={styles.title}>Meter Reading</Text>
            <Text style={styles.subtitle}>Daily field readings for assigned water and energy meters.</Text>
          </View>

          <View style={styles.card}>
            <TextField label="Username" value={username} onChangeText={setUsername} placeholder="operator username" autoCapitalize="none" />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              secureTextEntry
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton label="Sign In" onPress={handleLogin} loading={isSubmitting} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  wrapper: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 24,
    paddingBottom: Platform.OS === 'android' ? 40 : 32,
    paddingTop: 24,
  },
  header: {
    gap: 8,
  },
  brand: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
});
