import { useState, useEffect } from 'react';
import { fetchSystemNotifications, markAllNotificationsAsRead, type SystemNotification } from '../lib/finance';
import { markNotificationRead } from '../lib/employees';
import { formatDate } from '../lib/fabric';
import './NotificationsInboxPage.css';

export function NotificationsInboxPage() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSystemNotifications();
      setNotifications(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkOneRead(id: string) {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.warn('Mark read error:', err);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.warn('Mark all read error:', err);
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered = notifications.filter(n => filter === 'all' || !n.is_read);

  return (
    <div className="notif-inbox-root">
      {/* ── Header ── */}
      <div className="notif-inbox-header">
        <div>
          <h1 className="notif-inbox-title">🔔 System Notifications Inbox</h1>
          <p className="notif-inbox-subtitle">Employee Payment Alerts, Customer Due Reminders & System Events</p>
        </div>
        <div className="notif-inbox-actions">
          {unreadCount > 0 && (
            <button className="notif-btn notif-btn--primary" onClick={handleMarkAllRead}>
              ✓ Mark All as Read ({unreadCount})
            </button>
          )}
          <button className="notif-btn notif-btn--secondary" onClick={loadNotifications}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── Tabs / Filters ── */}
      <div className="notif-inbox-toolbar">
        <div className="notif-tabs">
          <button
            className={`notif-tab${filter === 'all' ? ' notif-tab--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Notifications ({notifications.length})
          </button>
          <button
            className={`notif-tab${filter === 'unread' ? ' notif-tab--active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </div>

      {error && <div className="notif-error" role="alert">⚠️ {error}</div>}

      {/* ── Notifications List ── */}
      {loading ? (
        <div className="notif-loading"><span className="notif-spinner" /> Loading notifications inbox…</div>
      ) : filtered.length === 0 ? (
        <div className="notif-empty">
          {filter === 'unread' ? '🎉 No unread notifications!' : 'No notifications in your inbox yet.'}
        </div>
      ) : (
        <div className="notif-list">
          {filtered.map(n => (
            <div key={n.id} className={`notif-card${n.is_read ? ' notif-card--read' : ' notif-card--unread'}`}>
              <div className="notif-card-header">
                <span className="notif-card-title">{n.title}</span>
                <span className="notif-card-time">{formatDate(n.created_at)}</span>
              </div>
              <p className="notif-card-message">{n.message}</p>
              
              {n.metadata?.whatsapp_integration_note && (
                <div className="notif-hook-badge">
                  📱 WhatsApp / SMS Dispatch Hook Enabled
                </div>
              )}

              {!n.is_read && (
                <div className="notif-card-footer">
                  <button className="notif-mark-btn" onClick={() => handleMarkOneRead(n.id)}>
                    Mark as read
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
