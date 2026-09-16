import { useState, useEffect } from 'react';
import { 
  fetchAnnouncements, 
  publishAnnouncement, 
  deactivateAnnouncement, 
  isAnnouncementActive, 
  type Announcement 
} from '../lib/announcements';
import './AnnouncementsPage.css';

interface AnnouncementsPageProps {
  authorProfileId?: string;
}

export function AnnouncementsPage({ authorProfileId = '' }: AnnouncementsPageProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  async function loadAnnouncements() {
    setLoading(true);
    try {
      const data = await fetchAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error('Failed to load announcements', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setPublishing(true);
    try {
      await publishAnnouncement(content.trim(), authorProfileId);
      setContent('');
      await loadAnnouncements();
      alert('Announcement broadcasted to all workers! It will be pinned on their app home screen for 24 hours.');
    } catch (err: any) {
      alert('Failed to broadcast announcement: ' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Deactivate and hide this announcement from worker home screens?')) return;
    try {
      await deactivateAnnouncement(id);
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_active: false } : a));
    } catch (err: any) {
      alert('Failed to deactivate: ' + err.message);
    }
  }

  return (
    <div className="announcements-page">
      <header className="announcements-header">
        <h1 className="announcements-title">📢 Broadcast Announcements</h1>
        <p className="announcements-sub">
          Send immediate updates, shift notices, or policy changes to factory-floor workers. Pinned at top of the mobile app.
        </p>
      </header>

      {/* Compose Box */}
      <div className="announcement-compose-card">
        <h2 className="announcement-compose-title">
          <span>📣</span> Broadcast New Message
        </h2>
        <form onSubmit={handlePublish}>
          <textarea
            className="announcement-textarea"
            placeholder="Type your message for factory workers (e.g. 'Fabric shipment for Lot 45 has arrived. Cutting starts at 2:00 PM today. Please assemble at Station 1.')..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              ⏱️ Pinned automatically on all worker devices for <strong>24 hours</strong>.
            </div>
            <button 
              type="submit" 
              className="tax-primary-btn"
              disabled={publishing || !content.trim()}
              style={{ background: '#2563eb' }}
            >
              {publishing ? 'Broadcasting...' : '🚀 Publish to All Workers'}
            </button>
          </div>
        </form>
      </div>

      {/* History List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Announcement Feed & History</h2>
        <button className="tax-action-btn" onClick={loadAnnouncements}>
          🔄 Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading announcements...</div>
      ) : announcements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
          No announcements published yet. Write a message above to notify all factory staff.
        </div>
      ) : (
        announcements.map((ann) => {
          const active = isAnnouncementActive(ann);
          return (
            <div 
              key={ann.id} 
              className={`announcement-card ${active ? 'active-announcement' : 'expired-announcement'}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <span className={`tax-status-badge ${active ? 'issued' : 'cancelled'}`}>
                  {active ? '🟢 ACTIVE & PINNED' : '⚪ EXPIRED'}
                </span>
                {active && (
                  <button 
                    className="tax-action-btn"
                    style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                    onClick={() => handleDeactivate(ann.id)}
                  >
                    Deactivate
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.95rem', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {ann.content}
              </div>
              <div className="announcement-meta">
                <div>
                  Published: {new Date(ann.published_at).toLocaleString()}
                </div>
                <div>
                  Expires: {new Date(ann.expires_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
