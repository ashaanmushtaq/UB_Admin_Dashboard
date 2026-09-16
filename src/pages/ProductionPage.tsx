import { useState, useEffect, type FormEvent } from 'react';
import {
  fetchProductionOrders, fetchOrderStageHistory, fetchOrderFabricUsage,
  createProductionOrder, advanceOrderStage, linkOrderFabric,
  PRODUCTION_STAGES, STAGE_LABELS, STAGE_ICONS, STAGE_COLORS,
  type ProductionOrderSummary, type OrderStageHistory, type OrderFabricUsage, type ProductionStage,
} from '../lib/production';
import { fetchEmployees, ROLE_LABELS, type Employee } from '../lib/employees';
import { fetchSuppliers, fetchFabricPurchaseSummaries, type FabricPurchaseSummary } from '../lib/fabric';
import { formatDate } from '../lib/fabric';
import './ProductionPage.css';

type Modal = 'none' | 'create-order' | 'advance-stage' | 'link-fabric';
type ViewMode = 'kanban' | 'list';

export function ProductionPage() {
  const [orders, setOrders] = useState<ProductionOrderSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fabricPurchases, setFabricPurchases] = useState<FabricPurchaseSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrderSummary | null>(null);
  const [stageHistory, setStageHistory] = useState<OrderStageHistory[]>([]);
  const [fabricUsage, setFabricUsage] = useState<OrderFabricUsage[]>([]);

  const [modal, setModal] = useState<Modal>('none');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [o, e] = await Promise.all([
        fetchProductionOrders(),
        fetchEmployees(),
      ]);
      setOrders(o);
      setEmployees(e);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load production orders');
    } finally {
      setLoading(false);
    }
  }

  async function selectOrder(o: ProductionOrderSummary) {
    setSelectedOrder(o);
    setDetailLoading(true);
    try {
      const [h, f] = await Promise.all([
        fetchOrderStageHistory(o.order_id),
        fetchOrderFabricUsage(o.order_id),
      ]);
      setStageHistory(h);
      setFabricUsage(f);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load order history');
    } finally {
      setDetailLoading(false);
    }
  }

  async function afterAction() {
    setModal('none');
    await loadData();
    if (selectedOrder) {
      const updated = orders.find(o => o.order_id === selectedOrder.order_id);
      if (updated) await selectOrder(updated);
    }
  }

  async function openFabricModal() {
    try {
      const suppliers = await fetchSuppliers();
      const allPurchases = await Promise.all(
        suppliers.map(s => fetchFabricPurchaseSummaries(s.id))
      );
      setFabricPurchases(allPurchases.flat());
      setModal('link-fabric');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch fabric batches');
    }
  }

  const filteredOrders = orders.filter(o =>
    o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.suit_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const urgentCount = orders.filter(o => o.is_urgent && o.current_stage !== 'delivered').length;
  const inProgressCount = orders.filter(o => o.current_stage !== 'delivered' && o.current_stage !== 'order_received').length;
  const totalPieces = orders.reduce((s, o) => s + (o.current_stage !== 'delivered' ? o.total_quantity : 0), 0);

  return (
    <div className="prod-root">
      {/* ── Header ── */}
      <div className="prod-header">
        <div>
          <h1 className="prod-title">⚙️ Production Stage Tracking</h1>
          <p className="prod-subtitle">Track bulk order pipeline: Cutting → Tailoring → Ironing → Kaj → Packing → Dispatch</p>
        </div>
        <div className="prod-header-actions">
          <div className="prod-view-toggle">
            <button
              className={`prod-toggle-btn${viewMode === 'kanban' ? ' prod-toggle-btn--active' : ''}`}
              onClick={() => setViewMode('kanban')}
            >
              📊 Pipeline Kanban
            </button>
            <button
              className={`prod-toggle-btn${viewMode === 'list' ? ' prod-toggle-btn--active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📑 Order List
            </button>
          </div>
          <button id="btn-create-order" className="prod-btn prod-btn--primary" onClick={() => setModal('create-order')}>
            + New Production Order
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="prod-stats">
        <div className="prod-stat">
          <span className="prod-stat-label">Active Orders</span>
          <span className="prod-stat-value">{orders.filter(o => o.current_stage !== 'delivered').length}</span>
        </div>
        <div className="prod-stat">
          <span className="prod-stat-label">In Production</span>
          <span className="prod-stat-value prod-stat-value--blue">{inProgressCount}</span>
        </div>
        <div className="prod-stat">
          <span className="prod-stat-label">Pieces in Pipeline</span>
          <span className="prod-stat-value prod-stat-value--purple">{totalPieces} pcs</span>
        </div>
        <div className={`prod-stat ${urgentCount > 0 ? 'prod-stat--urgent' : ''}`}>
          <span className="prod-stat-label">Urgent Orders</span>
          <span className={`prod-stat-value ${urgentCount > 0 ? 'prod-stat-value--red' : ''}`}>{urgentCount}</span>
        </div>
      </div>

      {error && <div className="prod-error" role="alert">⚠️ {error}</div>}

      {/* ── Filter / Search Bar ── */}
      <div className="prod-toolbar">
        <input
          id="order-search"
          type="search"
          className="prod-search"
          placeholder="Search order #, customer, suit type…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ── Body Views ── */}
      {loading ? (
        <div className="prod-loading"><span className="prod-spinner" />Loading production orders…</div>
      ) : viewMode === 'kanban' ? (
        <div className="prod-kanban-board">
          {PRODUCTION_STAGES.map(stage => {
            const stageOrders = filteredOrders.filter(o => o.current_stage === stage);
            return (
              <div key={stage} className="prod-kanban-col">
                <div className="prod-kanban-col-header" style={{ borderTopColor: STAGE_COLORS[stage] }}>
                  <span className="prod-kanban-col-icon">{STAGE_ICONS[stage]}</span>
                  <span className="prod-kanban-col-title">{STAGE_LABELS[stage].replace(/^\d+\.\s*/, '')}</span>
                  <span className="prod-kanban-col-count">{stageOrders.length}</span>
                </div>

                <div className="prod-kanban-col-cards">
                  {stageOrders.length === 0 ? (
                    <div className="prod-kanban-empty">No orders</div>
                  ) : (
                    stageOrders.map(o => (
                      <div
                        key={o.order_id}
                        id={`order-card-${o.order_id}`}
                        className={`prod-order-card${selectedOrder?.order_id === o.order_id ? ' prod-order-card--selected' : ''}${o.is_urgent ? ' prod-order-card--urgent' : ''}`}
                        onClick={() => selectOrder(o)}
                      >
                        <div className="prod-card-top">
                          <span className="prod-card-num">#{o.order_number}</span>
                          {o.is_urgent && <span className="prod-card-urgent-badge">URGENT</span>}
                        </div>
                        <div className="prod-card-cust">{o.customer_name}</div>
                        <div className="prod-card-meta">
                          <span>{o.suit_type}</span>
                          <span className="prod-card-qty">{o.total_quantity} pcs</span>
                        </div>
                        {o.target_delivery_date && (
                          <div className="prod-card-date">📅 Due: {formatDate(o.target_delivery_date)}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="prod-table-wrap">
          <table className="prod-table" aria-label="Production orders">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Suit Type</th>
                <th className="prod-th-num">Qty</th>
                <th>Current Stage</th>
                <th>Urgency</th>
                <th>Target Date</th>
                <th>Fabric Used</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(o => (
                <tr key={o.order_id} className={o.is_urgent ? 'prod-tr--urgent' : ''}>
                  <td><strong>#{o.order_number}</strong></td>
                  <td>{o.customer_name}</td>
                  <td>{o.suit_type}</td>
                  <td className="prod-td-num">{o.total_quantity} pcs</td>
                  <td>
                    <span className="prod-stage-badge" style={{ backgroundColor: `${STAGE_COLORS[o.current_stage]}20`, color: STAGE_COLORS[o.current_stage], borderColor: `${STAGE_COLORS[o.current_stage]}40` }}>
                      {STAGE_ICONS[o.current_stage]} {STAGE_LABELS[o.current_stage]}
                    </span>
                  </td>
                  <td>
                    {o.is_urgent ? <span className="prod-urgent-tag">🔥 URGENT</span> : <span className="prod-normal-tag">Normal</span>}
                  </td>
                  <td>{o.target_delivery_date ? formatDate(o.target_delivery_date) : '—'}</td>
                  <td>{o.total_meters_used > 0 ? `${o.total_meters_used.toFixed(1)}m` : 'Unassigned'}</td>
                  <td>
                    <button className="prod-btn prod-btn--sm prod-btn--secondary" onClick={() => selectOrder(o)}>
                      View Timeline →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Order Detail Modal / Sidebar ── */}
      {selectedOrder && (
        <div className="prod-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setSelectedOrder(null); }}>
          <div className="prod-detail-modal">
            <div className="prod-detail-header">
              <div>
                <div className="prod-detail-title">
                  Order #{selectedOrder.order_number}
                  {selectedOrder.is_urgent && <span className="prod-card-urgent-badge">URGENT</span>}
                </div>
                <div className="prod-detail-sub">{selectedOrder.customer_name} · {selectedOrder.suit_type} ({selectedOrder.total_quantity} pcs)</div>
              </div>
              <div className="prod-detail-actions">
                {selectedOrder.current_stage !== 'delivered' && (
                  <button id="btn-advance-stage" className="prod-btn prod-btn--primary" onClick={() => setModal('advance-stage')}>
                    Advance Stage →
                  </button>
                )}
                <button id="btn-link-fabric" className="prod-btn prod-btn--secondary" onClick={openFabricModal}>
                  + Link Fabric
                </button>
                <button className="prod-close-btn" onClick={() => setSelectedOrder(null)}>✕</button>
              </div>
            </div>

            <div className="prod-detail-body">
              {detailLoading ? (
                <div className="prod-loading"><span className="prod-spinner" />Loading order details…</div>
              ) : (
                <>
                  {/* Stage Progress Bar */}
                  <div className="prod-timeline-track">
                    {PRODUCTION_STAGES.map((s, idx) => {
                      const isCurrent = selectedOrder.current_stage === s;
                      const isPassed = PRODUCTION_STAGES.indexOf(selectedOrder.current_stage) > idx;
                      return (
                        <div key={s} className={`prod-track-step${isCurrent ? ' prod-track-step--current' : isPassed ? ' prod-track-step--passed' : ''}`}>
                          <div className="prod-track-icon" style={{ borderColor: isCurrent || isPassed ? STAGE_COLORS[s] : undefined }}>
                            {STAGE_ICONS[s]}
                          </div>
                          <div className="prod-track-label">{s.replace('_', ' ')}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fabric Linked Info */}
                  <div className="prod-detail-section">
                    <h3 className="prod-section-title">🧵 Fabric Consumption Batch Links</h3>
                    {fabricUsage.length === 0 ? (
                      <p className="prod-text-muted">No fabric batches linked to this order yet.</p>
                    ) : (
                      <div className="prod-fabric-list">
                        {fabricUsage.map(f => (
                          <div key={f.link_id} className="prod-fabric-item">
                            <div>
                              <strong>{f.fabric_name}</strong> ({f.supplier_name})
                              {f.invoice_no && <span className="prod-td-ref"> INV: {f.invoice_no}</span>}
                            </div>
                            <div className="prod-fabric-qty">{f.meters_used.toFixed(1)} meters used</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stage Logs History & Chain of Custody */}
                  <div className="prod-detail-section">
                    <div className="prod-custody-banner">
                      <div className="prod-custody-header">
                        <span className="prod-custody-tag">🔗 CHAIN OF CUSTODY</span>
                        <span className="prod-custody-state">
                          {selectedOrder.current_stage === 'delivered'
                            ? '✅ Final Delivery Complete'
                            : selectedOrder.current_stage === 'ready_for_dispatch'
                            ? '🚚 Awaiting Dispatch & Driver'
                            : '⚡ Active Floor Production'}
                        </span>
                      </div>
                      <div className="prod-custody-info">
                        <div>
                          <span className="prod-custody-label">Current Custodian: </span>
                          <strong className="prod-custody-val">
                            {stageHistory.length > 0 && stageHistory[stageHistory.length - 1].assigned_employee_name
                              ? `👤 ${stageHistory[stageHistory.length - 1].assigned_employee_name} (${ROLE_LABELS[stageHistory[stageHistory.length - 1].assigned_employee_role as keyof typeof ROLE_LABELS] || stageHistory[stageHistory.length - 1].assigned_employee_role})`
                              : '⚠️ Unassigned Stage Pool'}
                          </strong>
                        </div>
                        {stageHistory.length > 1 && stageHistory[stageHistory.length - 1].handed_off_by_name && (
                          <div className="prod-custody-handoff">
                            <span className="prod-custody-label">Handed off by: </span>
                            <span>
                              🤝 {stageHistory[stageHistory.length - 1].handed_off_by_name} ({ROLE_LABELS[stageHistory[stageHistory.length - 1].handed_off_by_role as keyof typeof ROLE_LABELS] || stageHistory[stageHistory.length - 1].handed_off_by_role})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <h3 className="prod-section-title">⏱️ Custody History & Stage Transitions</h3>
                    <div className="prod-history-list">
                      {stageHistory.map(h => (
                        <div key={h.log_id} className="prod-history-item">
                          <div className="prod-history-left">
                            <span className="prod-history-icon">{STAGE_ICONS[h.stage]}</span>
                            <div>
                              <div className="prod-history-stage">{STAGE_LABELS[h.stage]}</div>
                              <div className="prod-history-emp">
                                👤 {h.assigned_employee_name ? `${h.assigned_employee_name} (${ROLE_LABELS[h.assigned_employee_role as keyof typeof ROLE_LABELS] || h.assigned_employee_role})` : 'Unassigned'}
                              </div>
                              {h.handed_off_by_name && (
                                <div className="prod-history-handoff-by">
                                  🤝 Handed off by: <strong>{h.handed_off_by_name}</strong> ({ROLE_LABELS[h.handed_off_by_role as keyof typeof ROLE_LABELS] || h.handed_off_by_role})
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="prod-history-right">
                            <div className="prod-history-qty">
                              Qty: <strong>{h.quantity_completed}</strong> / {h.quantity_in} completed ({h.quantity_pending} pending)
                            </div>
                            <div className="prod-history-time">
                              In: {new Date(h.started_at).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {h.completed_at && ` → Out: ${new Date(h.completed_at).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                            {h.notes && <div className="prod-history-notes">Note: {h.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {modal === 'create-order' && (
        <CreateOrderModal employees={employees} onClose={() => setModal('none')} onSuccess={afterAction} />
      )}
      {modal === 'advance-stage' && selectedOrder && (
        <AdvanceStageModal order={selectedOrder} employees={employees} onClose={() => setModal('none')} onSuccess={afterAction} />
      )}
      {modal === 'link-fabric' && selectedOrder && (
        <LinkFabricModal order={selectedOrder} purchases={fabricPurchases} onClose={() => setModal('none')} onSuccess={afterAction} />
      )}
    </div>
  );
}

/* ─── Create Order Modal ─────────────────────────────────────────────────── */
function CreateOrderModal({ employees, onClose, onSuccess }: { employees: Employee[]; onClose: () => void; onSuccess: () => void }) {
  const cuttingMasters = employees.filter(e => e.role === 'cutting_master');

  const [form, setForm] = useState({
    order_number: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
    customer_name: '',
    customer_phone: '',
    suit_type: '2-Piece Suit',
    total_quantity: '10',
    is_urgent: false,
    target_delivery_date: '',
    notes: '',
    assigned_cutting_master_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await createProductionOrder({
        order_number: form.order_number.trim(),
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone || undefined,
        suit_type: form.suit_type,
        total_quantity: parseInt(form.total_quantity, 10),
        is_urgent: form.is_urgent,
        target_delivery_date: form.target_delivery_date || undefined,
        notes: form.notes || undefined,
        assigned_cutting_master_id: form.assigned_cutting_master_id || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="New Production Order" onClose={onClose}>
      <form id="form-create-order" onSubmit={handleSubmit}>
        {error && <div className="prod-modal-error">⚠️ {error}</div>}
        <div className="prod-field-grid">
          <div className="prod-field">
            <label htmlFor="ord-num" className="prod-label">Order # *</label>
            <input id="ord-num" className="prod-input" required value={form.order_number} onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))} />
          </div>
          <div className="prod-field">
            <label htmlFor="ord-cust" className="prod-label">Customer Name *</label>
            <input id="ord-cust" className="prod-input" required value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="e.g. Malik Wholesale Traders" />
          </div>
          <div className="prod-field">
            <label htmlFor="ord-phone" className="prod-label">Customer Phone</label>
            <input id="ord-phone" className="prod-input" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="03xx-xxxxxxx" />
          </div>
          <div className="prod-field">
            <label htmlFor="ord-suit" className="prod-label">Suit Type</label>
            <select id="ord-suit" className="prod-input" value={form.suit_type} onChange={e => setForm(f => ({ ...f, suit_type: e.target.value }))}>
              <option value="2-Piece Suit">2-Piece Suit</option>
              <option value="3-Piece Suit">3-Piece Suit</option>
              <option value="Sherwani">Sherwani</option>
              <option value="Kurta Pajama">Kurta Pajama</option>
              <option value="Waistcoat">Waistcoat</option>
            </select>
          </div>
          <div className="prod-field">
            <label htmlFor="ord-qty" className="prod-label">Total Quantity (Suits/Pcs) *</label>
            <input id="ord-qty" className="prod-input" type="number" min="1" required value={form.total_quantity} onChange={e => setForm(f => ({ ...f, total_quantity: e.target.value }))} />
          </div>
          <div className="prod-field">
            <label htmlFor="ord-date" className="prod-label">Target Delivery Date</label>
            <input id="ord-date" className="prod-input" type="date" value={form.target_delivery_date} onChange={e => setForm(f => ({ ...f, target_delivery_date: e.target.value }))} />
          </div>
          <div className="prod-field prod-field--full">
            <label htmlFor="ord-cutting-master" className="prod-label">✂️ Assign Cutting Master (Optional)</label>
            <select
              id="ord-cutting-master"
              className="prod-input"
              value={form.assigned_cutting_master_id}
              onChange={e => setForm(f => ({ ...f, assigned_cutting_master_id: e.target.value }))}
            >
              <option value="">— Unassigned (assign later) —</option>
              {cuttingMasters.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
            {form.assigned_cutting_master_id && (
              <p className="prod-field-hint">📲 A push notification will be sent to this worker when the order is created.</p>
            )}
          </div>
          <div className="prod-field prod-field--full" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input id="ord-urgent" type="checkbox" checked={form.is_urgent} onChange={e => setForm(f => ({ ...f, is_urgent: e.target.checked }))} />
            <label htmlFor="ord-urgent" className="prod-label" style={{ margin: 0, cursor: 'pointer' }}>Mark as URGENT Order 🔥</label>
          </div>
          <div className="prod-field prod-field--full">
            <label htmlFor="ord-notes" className="prod-label">Order Notes / Specifications</label>
            <textarea id="ord-notes" className="prod-input prod-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Size specs, stitching requirements, fabric color details…" />
          </div>
        </div>
        <div className="prod-modal-footer">
          <button type="button" className="prod-btn prod-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-create-order" type="submit" className="prod-btn prod-btn--primary" disabled={loading || !form.order_number || !form.customer_name}>
            {loading ? <><span className="prod-spinner prod-spinner--sm" /> Creating…</> : 'Create Order'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Advance Stage Modal ────────────────────────────────────────────────── */
function AdvanceStageModal({ order, employees, onClose, onSuccess }: {
  order: ProductionOrderSummary;
  employees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const currentIdx = PRODUCTION_STAGES.indexOf(order.current_stage);
  const defaultNext = PRODUCTION_STAGES[Math.min(currentIdx + 1, PRODUCTION_STAGES.length - 1)];

  const [form, setForm] = useState({
    next_stage: defaultNext,
    assigned_employee_id: '',
    quantity_in: order.total_quantity.toString(),
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await advanceOrderStage({
        order_id: order.order_id,
        next_stage: form.next_stage,
        assigned_employee_id: form.assigned_employee_id || undefined,
        quantity_in: parseInt(form.quantity_in, 10),
        notes: form.notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to advance stage');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`Advance Order #${order.order_number} Stage`} onClose={onClose}>
      <form id="form-advance-stage" onSubmit={handleSubmit}>
        {error && <div className="prod-modal-error">⚠️ {error}</div>}
        <div className="prod-field-grid">
          <div className="prod-field prod-field--full">
            <label htmlFor="adv-stage" className="prod-label">Target Stage *</label>
            <select id="adv-stage" className="prod-input" value={form.next_stage} onChange={e => setForm(f => ({ ...f, next_stage: e.target.value as ProductionStage }))}>
              {PRODUCTION_STAGES.map(s => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="prod-field prod-field--full">
            <label htmlFor="adv-emp" className="prod-label">Assigned Employee (Handler)</label>
            <select id="adv-emp" className="prod-input" value={form.assigned_employee_id} onChange={e => setForm(f => ({ ...f, assigned_employee_id: e.target.value }))}>
              <option value="">— Unassigned —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({ROLE_LABELS[e.role]})</option>
              ))}
            </select>
          </div>
          <div className="prod-field">
            <label htmlFor="adv-qty" className="prod-label">Quantity Entering Stage</label>
            <input id="adv-qty" className="prod-input" type="number" min="1" max={order.total_quantity} value={form.quantity_in} onChange={e => setForm(f => ({ ...f, quantity_in: e.target.value }))} />
          </div>
          <div className="prod-field prod-field--full">
            <label htmlFor="adv-notes" className="prod-label">Stage Handover Notes</label>
            <textarea id="adv-notes" className="prod-input prod-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any specific instructions for worker…" />
          </div>
        </div>
        <div className="prod-modal-footer">
          <button type="button" className="prod-btn prod-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-advance-stage" type="submit" className="prod-btn prod-btn--primary" disabled={loading}>
            {loading ? <><span className="prod-spinner prod-spinner--sm" /> Advancing…</> : 'Transition Stage'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Link Fabric Modal ──────────────────────────────────────────────────── */
function LinkFabricModal({ order, purchases, onClose, onSuccess }: {
  order: ProductionOrderSummary;
  purchases: FabricPurchaseSummary[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    fabric_purchase_id: '',
    meters_used: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await linkOrderFabric({
        order_id: order.order_id,
        fabric_purchase_id: form.fabric_purchase_id,
        meters_used: parseFloat(form.meters_used),
        notes: form.notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to link fabric');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`Link Fabric to Order #${order.order_number}`} onClose={onClose}>
      <form id="form-link-fabric" onSubmit={handleSubmit}>
        {error && <div className="prod-modal-error">⚠️ {error}</div>}
        <div className="prod-field-grid">
          <div className="prod-field prod-field--full">
            <label htmlFor="fab-batch" className="prod-label">Select Fabric Batch *</label>
            <select id="fab-batch" className="prod-input" required value={form.fabric_purchase_id} onChange={e => setForm(f => ({ ...f, fabric_purchase_id: e.target.value }))}>
              <option value="">— Select Purchased Fabric Batch —</option>
              {purchases.map(p => (
                <option key={p.purchase_id} value={p.purchase_id}>
                  {p.fabric_name} ({p.supplier_name}) — Qty: {p.quantity_meters}m @ ₨{p.unit_cost}/m
                </option>
              ))}
            </select>
          </div>
          <div className="prod-field">
            <label htmlFor="fab-meters" className="prod-label">Meters Consumed *</label>
            <input id="fab-meters" className="prod-input" type="number" step="0.1" min="0.1" required value={form.meters_used} onChange={e => setForm(f => ({ ...f, meters_used: e.target.value }))} placeholder="e.g. 25.5" />
          </div>
          <div className="prod-field prod-field--full">
            <label htmlFor="fab-notes" className="prod-label">Notes (optional)</label>
            <input id="fab-notes" className="prod-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Used for coats cutting" />
          </div>
        </div>
        <div className="prod-modal-footer">
          <button type="button" className="prod-btn prod-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-link-fabric" type="submit" className="prod-btn prod-btn--primary" disabled={loading || !form.fabric_purchase_id || !form.meters_used}>
            {loading ? <><span className="prod-spinner prod-spinner--sm" /> Linking…</> : 'Link Fabric Batch'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Modal Shell ────────────────────────────────────────────────────────── */
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="prod-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="prod-modal-box">
        <div className="prod-modal-header">
          <h2 className="prod-modal-title">{title}</h2>
          <button className="prod-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
