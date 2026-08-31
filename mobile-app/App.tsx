import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ActivityIndicator } from 'react-native';
import { checkSupabaseConnection } from './src/lib/supabase';

export default function App() {
  const [status, setStatus] = useState<{ loading: boolean; connected: boolean; message: string }>({
    loading: true,
    connected: false,
    message: 'Testing Supabase connection from React Native...'
  });

  useEffect(() => {
    checkSupabaseConnection().then(res => {
      setStatus({
        loading: false,
        connected: res.connected,
        message: res.message
      });
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.headerTitle}>UB Collection</Text>
        <Text style={styles.subTitle}>Production Staff Mobile App</Text>

        <View style={styles.statusBadge}>
          {status.loading ? (
            <ActivityIndicator size="small" color="#38bdf8" />
          ) : (
            <View style={[styles.dot, { backgroundColor: status.connected ? '#10b981' : '#ef4444' }]} />
          )}
          <Text style={[styles.statusText, { color: status.connected ? '#34d399' : '#f87171' }]}>
            {status.loading ? 'Checking Supabase...' : status.connected ? 'Supabase Connected' : 'Supabase Config Ready'}
          </Text>
        </View>

        <Text style={styles.messageText}>{status.message}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Mobile App Scaffolding Complete</Text>
          <Text style={styles.infoDesc}>
            Configured for cutting masters, tailors, iron pressers, and packing staff work order updates.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#38bdf8',
  },
  subTitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#475569',
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  messageText: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#090d16',
    borderRadius: 8,
    padding: 12,
  },
  infoTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  infoDesc: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
