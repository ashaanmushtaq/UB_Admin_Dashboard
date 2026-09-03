import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import {
  fetchDriverOrders, advanceMobileOrderStage,
  type MobileOrderTask,
} from '../lib/mobileService';

export function DriverDispatchScreen() {
  const [orders, setOrders] = useState<MobileOrderTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadDriverOrders();
  }, []);

  async function loadDriverOrders() {
    setLoading(true);
    try {
      const res = await fetchDriverOrders();
      setOrders(res);
    } catch (err: any) {
      console.warn('Error loading driver orders:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleMarkDelivered(order: MobileOrderTask) {
    Alert.alert(
      'Confirm Delivery',
      `Mark order #${order.order_number} for ${order.customer_name} as DELIVERED?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '✓ Confirm Delivery',
          onPress: async () => {
            setUpdatingId(order.order_id);
            try {
              await advanceMobileOrderStage(order.order_id, 'delivered', undefined, 'Delivered by Driver');
              Alert.alert('Success! 🎉', `Order #${order.order_number} marked as Delivered!`);
              await loadDriverOrders();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update delivery');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🚚 DRIVER DISPATCH & DELIVERIES</Text>
        <Text style={styles.headerSub}>Orders ready for dispatch & delivery tracking</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Loading dispatch orders…</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyText}>No orders currently awaiting dispatch.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.order_id}
          onRefresh={() => { setRefreshing(true); loadDriverOrders(); }}
          refreshing={refreshing}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => {
            const isDelivered = item.current_stage === 'delivered';
            const isUpdating = updatingId === item.order_id;
            return (
              <View style={[styles.card, isDelivered && styles.deliveredCard]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.orderNum}>#{item.order_number}</Text>
                  <Text style={[styles.stageTag, isDelivered ? styles.deliveredTag : styles.readyTag]}>
                    {isDelivered ? 'DELIVERED ✅' : 'READY FOR DISPATCH 🚚'}
                  </Text>
                </View>

                <Text style={styles.custName}>{item.customer_name}</Text>
                {item.customer_phone && <Text style={styles.phoneText}>📞 {item.customer_phone}</Text>}
                
                <View style={styles.metaRow}>
                  <Text style={styles.suitType}>{item.suit_type}</Text>
                  <Text style={styles.qtyText}>{item.total_quantity} Suits</Text>
                </View>

                {!isDelivered && (
                  <TouchableOpacity
                    style={[styles.deliverBtn, isUpdating && styles.btnDisabled]}
                    onPress={() => handleMarkDelivered(item)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.deliverBtnText}>✓ Mark as Delivered</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  header: { padding: 16, backgroundColor: '#0f172a', borderBottomWidth: 1, borderColor: '#1e293b' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#e8b84b' },
  headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { color: '#94a3b8', marginTop: 10, fontSize: 14 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  listPadding: { padding: 12 },
  card: { backgroundColor: '#1e293b', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  deliveredCard: { opacity: 0.65, borderColor: '#10b981' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNum: { fontSize: 16, fontWeight: 'bold', color: '#f1f5f9' },
  stageTag: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  readyTag: { backgroundColor: 'rgba(232, 184, 75, 0.2)', color: '#e8b84b' },
  deliveredTag: { backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399' },
  custName: { fontSize: 14, color: '#cbd5e1', fontWeight: '600' },
  phoneText: { fontSize: 12, color: '#38bdf8', marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  suitType: { fontSize: 12, color: '#94a3b8' },
  qtyText: { fontSize: 13, fontWeight: 'bold', color: '#34d399' },
  deliverBtn: { marginTop: 10, backgroundColor: '#10b981', borderRadius: 8, padding: 12, alignItems: 'center' },
  deliverBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.5 },
});
