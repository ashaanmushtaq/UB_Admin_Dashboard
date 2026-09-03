import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import {
  fetchStageOrdersForRole, advanceMobileOrderStage,
  type MobileOrderTask, type StaffRole, type ProductionStage, ROLE_STAGE_MAP,
} from '../lib/mobileService';

interface Props {
  role: StaffRole;
}

const NEXT_STAGE_MAP: Record<ProductionStage, ProductionStage> = {
  order_received:     'cutting',
  cutting:            'tailoring',
  tailoring:          'ironing',
  ironing:            'kaj_overlock',
  kaj_overlock:       'packing',
  packing:            'ready_for_dispatch',
  ready_for_dispatch: 'delivered',
  delivered:          'delivered',
};

export function StageTaskScreen({ role }: Props) {
  const [tasks, setTasks] = useState<MobileOrderTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTask, setSelectedTask] = useState<MobileOrderTask | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const stage = ROLE_STAGE_MAP[role] || 'cutting';

  useEffect(() => {
    loadTasks();
  }, [role]);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetchStageOrdersForRole(role);
      setTasks(res);
    } catch (err: any) {
      console.warn('Error loading tasks:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleCompleteStage() {
    if (!selectedTask) return;
    const nextStage = NEXT_STAGE_MAP[selectedTask.current_stage];
    setSubmitting(true);
    try {
      await advanceMobileOrderStage(selectedTask.order_id, nextStage, undefined, notes);
      Alert.alert('Done! ✅', `Order #${selectedTask.order_number} passed to ${nextStage.replace('_', ' ').toUpperCase()}.`);
      setSelectedTask(null);
      setNotes('');
      await loadTasks();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update order stage.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* High-Contrast Factory Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚙️ {stage.toUpperCase().replace('_', ' ')} FLOOR</Text>
        <Text style={styles.headerSub}>Tap any order card to record progress</Text>
      </View>

      {/* Task List */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>Loading floor orders…</Text>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyText}>ALL DONE! No pending orders at {stage.replace('_', ' ')} station.</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={item => item.order_id}
          onRefresh={() => { setRefreshing(true); loadTasks(); }}
          refreshing={refreshing}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.is_urgent && styles.urgentCard]}
              onPress={() => setSelectedTask(item)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.orderNum}>ORDER #{item.order_number}</Text>
                {item.is_urgent ? (
                  <View style={styles.urgentBadge}>
                    <Text style={styles.urgentBadgeText}>URGENT 🔥</Text>
                  </View>
                ) : (
                  <View style={styles.normalBadge}>
                    <Text style={styles.normalBadgeText}>NORMAL</Text>
                  </View>
                )}
              </View>

              <Text style={styles.custName}>{item.customer_name}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.suitType}>{item.suit_type.toUpperCase()}</Text>
                <Text style={styles.qtyText}>{item.total_quantity} SUITS</Text>
              </View>

              {/* Large Factory Floor Action Button */}
              <View style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>TAP TO UPDATE & ADVANCE →</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Large Touch Modal */}
      {selectedTask && (
        <Modal transparent animationType="slide" visible={!!selectedTask}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>ORDER #{selectedTask.order_number}</Text>
              <Text style={styles.modalSub}>{selectedTask.customer_name} · {selectedTask.total_quantity} SUITS ({selectedTask.suit_type})</Text>

              <Text style={styles.inputLabel}>Floor Note (Optional):</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 20 Pcs completed and checked"
                placeholderTextColor="#64748b"
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.btnDisabled]}
                onPress={handleCompleteStage}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="large" />
                ) : (
                  <Text style={styles.submitBtnText}>✓ MARK DONE & PASS STAGE</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSelectedTask(null)}
              >
                <Text style={styles.cancelBtnText}>Close / Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1329' },
  header: { padding: 18, backgroundColor: '#0f1a38', borderBottomWidth: 2, borderColor: '#1e2f5e' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#f59e0b', letterSpacing: 0.5 },
  headerSub: { fontSize: 13, color: '#94a3b8', marginTop: 4, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 16, fontWeight: 'bold' },
  emptyIcon: { fontSize: 50, marginBottom: 12 },
  emptyText: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  listPadding: { padding: 14 },
  card: {
    backgroundColor: '#152247', borderRadius: 14, padding: 18, marginBottom: 14,
    borderWidth: 2, borderColor: '#1e2f5e', shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  urgentCard: { borderColor: '#ef4444', borderWidth: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNum: { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
  urgentBadge: { backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  urgentBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  normalBadge: { backgroundColor: '#1e2d5a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  normalBadgeText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  custName: { fontSize: 16, color: '#f8fafc', fontWeight: '800', marginBottom: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  suitType: { fontSize: 14, color: '#94a3b8', fontWeight: '700' },
  qtyText: { fontSize: 18, fontWeight: '900', color: '#f59e0b' },
  actionBtn: {
    minHeight: 52, backgroundColor: '#2563eb', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  actionBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#152247', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, borderWidth: 2, borderColor: '#1e2f5e' },
  modalTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  modalSub: { fontSize: 15, color: '#94a3b8', marginBottom: 20, fontWeight: '600' },
  inputLabel: { fontSize: 14, color: '#f8fafc', fontWeight: '700', marginBottom: 8 },
  textInput: { backgroundColor: '#0b1329', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, minHeight: 80, textAlignVertical: 'top', marginBottom: 20, borderWidth: 2, borderColor: '#1e2f5e' },
  submitBtn: { minHeight: 60, backgroundColor: '#10b981', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  submitBtnText: { color: '#ffffff', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  btnDisabled: { opacity: 0.5 },
  cancelBtn: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: 'bold' },
});
