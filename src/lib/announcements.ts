import { supabase } from './supabase';

export interface Announcement {
  id: string;
  tenant_id: string;
  author_profile_id: string | null;
  content: string;
  published_at: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('published_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function publishAnnouncement(
  content: string,
  authorProfileId: string
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('announcements').insert({
    content,
    author_profile_id: authorProfileId,
    published_at: now.toISOString(),
    expires_at: expiresAt,
    is_active: true,
  });
  if (error) throw error;
}

export async function deactivateAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export function isAnnouncementActive(a: Announcement): boolean {
  return new Date(a.expires_at) > new Date() && a.is_active;
}
