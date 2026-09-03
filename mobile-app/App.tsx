import React, { useState } from 'react';
import {
  StyleSheet, Text, View, SafeAreaView, TouchableOpacity, StatusBar,
} from 'react-native';
import { StageTaskScreen } from './src/screens/StageTaskScreen';
import { DriverDispatchScreen } from './src/screens/DriverDispatchScreen';
import { AttendanceScreen } from './src/screens/AttendanceScreen';
import { MyBalanceScreen } from './src/screens/MyBalanceScreen';
import type { StaffRole } from './src/lib/mobileService';

type Tab = 'tasks' | 'attendance' | 'driver' | 'balance';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [staffRole, setStaffRole] = useState<StaffRole>('cutting_master');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Role Picker Bar (Demo Staff Switcher) */}
      <View style={styles.roleBar}>
        <Text style={styles.roleBarLabel}>Worker Role:</Text>
        <View style={styles.roleChips}>
          {(['cutting_master', 'tailor', 'iron_presser', 'packing_staff', 'driver'] as StaffRole[]).map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.roleChip, staffRole === r && styles.roleChipActive]}
              onPress={() => {
                setStaffRole(r);
                if (r === 'driver') setActiveTab('driver');
                else if (activeTab === 'driver') setActiveTab('tasks');
              }}
            >
              <Text style={[styles.roleChipText, staffRole === r && styles.roleChipTextActive]}>
                {r.split('_')[0].toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Main Screen Content */}
      <View style={styles.content}>
        {activeTab === 'tasks' && <StageTaskScreen role={staffRole} />}
        {activeTab === 'attendance' && <AttendanceScreen />}
        {activeTab === 'driver' && <DriverDispatchScreen />}
        {activeTab === 'balance' && <MyBalanceScreen />}
      </View>

      {/* Bottom Tab Bar Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'tasks' && styles.tabItemActive]}
          onPress={() => setActiveTab('tasks')}
        >
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === 'tasks' && styles.tabLabelActive]}>Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'attendance' && styles.tabItemActive]}
          onPress={() => setActiveTab('attendance')}
        >
          <Text style={styles.tabIcon}>⏰</Text>
          <Text style={[styles.tabLabel, activeTab === 'attendance' && styles.tabLabelActive]}>Shift</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'driver' && styles.tabItemActive]}
          onPress={() => setActiveTab('driver')}
        >
          <Text style={styles.tabIcon}>🚚</Text>
          <Text style={[styles.tabLabel, activeTab === 'driver' && styles.tabLabelActive]}>Dispatch</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'balance' && styles.tabItemActive]}
          onPress={() => setActiveTab('balance')}
        >
          <Text style={styles.tabIcon}>💳</Text>
          <Text style={[styles.tabLabel, activeTab === 'balance' && styles.tabLabelActive]}>My Dues</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  roleBar: {
    backgroundColor: '#0f172a', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderColor: '#1e293b', flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  roleBarLabel: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8' },
  roleChips: { flexDirection: 'row', gap: 4, flex: 1 },
  roleChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  roleChipActive: { backgroundColor: '#0284c7', borderColor: '#38bdf8' },
  roleChipText: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold' },
  roleChipTextActive: { color: '#fff' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#0f172a', borderTopWidth: 1, borderColor: '#1e293b', paddingVertical: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  tabItemActive: { opacity: 1 },
  tabIcon: { fontSize: 18, marginBottom: 2 },
  tabLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  tabLabelActive: { color: '#38bdf8', fontWeight: 'bold' },
});
