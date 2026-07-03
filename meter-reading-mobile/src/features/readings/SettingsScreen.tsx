import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getApiBaseUrl } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { AppButton } from '../../components/AppButton';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';

export function SettingsScreen() {
  const { profile, signOut } = useAuth();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Signed in as {profile?.user.full_name || profile?.user.username}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{profile?.role_display || profile?.role || '-'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Backend API</Text>
        <Text style={styles.value}>{getApiBaseUrl()}</Text>
      </View>

      <View style={styles.actions}>
        <AppButton label="Sign Out" onPress={signOut} variant="danger" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  actions: {
    marginTop: 28,
  },
});
