import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import {
  clockInStaff, clockOutStaff, fetchTodayAttendance,
  type StaffAttendanceRecord,
} from '../lib/mobileService';

interface Props {
  employeeId?: string;
}

export function AttendanceScreen({ employeeId = 'demo-emp-id' }: Props) {
  const [attendance, setAttendance] = useState<StaffAttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAttendance();
  }, []);

  async function loadAttendance() {
    setLoading(true);
    try {
      const rec = await fetchTodayAttendance(employeeId);
      setAttendance(rec);
    } catch (err: any) {
      console.warn('Attendance fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleClockIn() {
    setSubmitting(true);
    try {
      await clockInStaff(employeeId, 'Clock-in via Mobile App');
      Alert.alert('Clocked In! ⏰', 'Your attendance for today has been logged.');
      await loadAttendance();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to clock in');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClockOut() {
    if (!attendance) return;
    setSubmitting(true);
    try {
      await clockOutStaff(attendance.id);
      Alert.alert('Clocked Out! 👋', 'Have a good rest!');
      await loadAttendance();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to clock out');
    } finally {
      setSubmitting(false);
    }
  }

  const isClockedIn = !!attendance && !attendance.clock_out;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⏰ STAFF ATTENDANCE & SHIFT CLOCK</Text>
        <Text style={styles.headerSub}>Daily work shift attendance tracking</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.todayText}>Today: {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Shift Status:</Text>
            <Text style={[styles.statusValue, isClockedIn ? styles.statusActive : styles.statusInactive]}>
              {isClockedIn ? 'ON DUTY 🟢' : attendance?.clock_out ? 'SHIFT COMPLETED 🏁' : 'NOT CLOCKED IN ⚪'}
            </Text>
          </View>

          {attendance && (
            <View style={styles.timeBox}>
              <Text style={styles.timeText}>Clocked In: {new Date(attendance.clock_in).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</Text>
              {attendance.clock_out && (
                <Text style={styles.timeText}>Clocked Out: {new Date(attendance.clock_out).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</Text>
              )}
            </View>
          )}

          {!isClockedIn && !attendance?.clock_out ? (
            <TouchableOpacity
              style={[styles.clockBtn, styles.clockInBtn, submitting && styles.btnDisabled]}
              onPress={handleClockIn}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.clockBtnText}>⏰ CLOCK IN TO SHIFT</Text>}
            </TouchableOpacity>
          ) : isClockedIn ? (
            <TouchableOpacity
              style={[styles.clockBtn, styles.clockOutBtn, submitting && styles.btnDisabled]}
              onPress={handleClockOut}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.clockBtnText}>👋 CLOCK OUT FROM SHIFT</Text>}
            </TouchableOpacity>
          ) : (
            <View style={styles.completedBox}>
              <Text style={styles.completedText}>✅ Attendance Shift Logged for Today</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  header: { padding: 16, backgroundColor: '#0f172a', borderBottomWidth: 1, borderColor: '#1e293b' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#34d399' },
  headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { margin: 16, backgroundColor: '#1e293b', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#334155' },
  todayText: { fontSize: 13, color: '#94a3b8', fontWeight: '600', marginBottom: 16 },
  statusBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#090d16', padding: 14, borderRadius: 8, marginBottom: 16 },
  statusLabel: { fontSize: 13, color: '#cbd5e1', fontWeight: '600' },
  statusValue: { fontSize: 14, fontWeight: 'bold' },
  statusActive: { color: '#34d399' },
  statusInactive: { color: '#fbbf24' },
  timeBox: { backgroundColor: '#090d16', padding: 12, borderRadius: 8, marginBottom: 16 },
  timeText: { fontSize: 13, color: '#38bdf8', marginVertical: 2 },
  clockBtn: { borderRadius: 10, padding: 16, alignItems: 'center' },
  clockInBtn: { backgroundColor: '#0284c7' },
  clockOutBtn: { backgroundColor: '#ef4444' },
  clockBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.5 },
  completedBox: { backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 14, borderRadius: 8, alignItems: 'center' },
  completedText: { color: '#34d399', fontSize: 13, fontWeight: 'bold' },
});
