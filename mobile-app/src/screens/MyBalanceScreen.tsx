import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import {
  fetchMyEmployeeBalance, type EmployeeBalanceStatement,
} from '../lib/mobileService';

interface Props {
  employeeId?: string;
}

export function MyBalanceScreen({ employeeId }: Props) {
  const [balance, setBalance] = useState<EmployeeBalanceStatement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBalance();
  }, []);

  async function loadBalance() {
    setLoading(true);
    try {
      const b = await fetchMyEmployeeBalance(employeeId);
      setBalance(b);
    } catch (err: any) {
      console.warn('Balance fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💳 MY WAGES & PAYMENTS</Text>
        <Text style={styles.headerSub}>Personal earned wages, advances & balance statement (Read-Only)</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : !balance ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Employee account statement unavailable.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{balance.full_name[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.nameText}>{balance.full_name}</Text>
              <Text style={styles.roleText}>{balance.role.toUpperCase().replace('_', ' ')} · {balance.employment_type}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Total Wages Earned:</Text>
            <Text style={styles.earnedVal}>PKR ₨{balance.total_earned.toLocaleString()}</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Total Payments Received:</Text>
            <Text style={styles.paidVal}>PKR ₨{balance.total_paid.toLocaleString()}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>REMAINING BALANCE DUE TO YOU</Text>
            <Text style={[styles.balanceVal, balance.remaining_balance > 0 ? styles.dueVal : styles.settledVal]}>
              PKR ₨{balance.remaining_balance.toLocaleString()}
            </Text>
          </View>

          <TouchableOpacity style={styles.refreshBtn} onPress={loadBalance}>
            <Text style={styles.refreshBtnText}>🔄 Refresh Statement</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  header: { padding: 16, backgroundColor: '#0f172a', borderBottomWidth: 1, borderColor: '#1e293b' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#a78bfa' },
  headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  card: { margin: 16, backgroundColor: '#1e293b', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#334155' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0284c7', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  nameText: { fontSize: 16, fontWeight: 'bold', color: '#f1f5f9' },
  roleText: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 12 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  metricLabel: { fontSize: 13, color: '#cbd5e1' },
  earnedVal: { fontSize: 14, fontWeight: 'bold', color: '#38bdf8' },
  paidVal: { fontSize: 14, fontWeight: 'bold', color: '#34d399' },
  balanceBox: { backgroundColor: '#090d16', padding: 16, borderRadius: 10, alignItems: 'center', marginVertical: 10, borderWidth: 1, borderColor: '#334155' },
  balanceLabel: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', letterSpacing: 0.5, marginBottom: 4 },
  balanceVal: { fontSize: 22, fontWeight: '900' },
  dueVal: { color: '#fbbf24' },
  settledVal: { color: '#34d399' },
  refreshBtn: { marginTop: 10, padding: 12, borderRadius: 8, backgroundColor: '#334155', alignItems: 'center' },
  refreshBtnText: { color: '#f1f5f9', fontSize: 13, fontWeight: '600' },
});
