export interface User {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export interface Inbox {
  id: string;
  email: string;
  name: string;
  picture: string;
  is_primary: boolean;
  added_at: string;
}
export interface SearchFilters {
  from: string;
  hasAttachment: boolean;
  smartFilter: boolean;
}

export interface SearchResult {
  rank: number;
  thread_id: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  has_attachment: boolean;
  score: number;
  inbox_id?: string;
  inbox_email?: string;
}

export interface IndexStatus {
  running: boolean;
  result: { new: number } | null;
  error: string | null;
}

export interface Stats {
  indexed_count: number;
  last_sync: string | null;
}

export interface TodoItem {
  gmail_message_id: string;
  title: string;
  details: string;
  due_date: string | null;
  location: string | null;
  priority: 'high' | 'medium' | 'low';
  sender: string;
  date: string;
  gmail_url: string | null;
  done: boolean;
}

export async function getMe(): Promise<{ authenticated: false } | { authenticated: true; user: User }> {
  const r = await fetch('/auth/me');
  return r.json();
}

export async function getStats(inboxIds?: string): Promise<Stats> {
  const url = inboxIds ? `/api/stats?inbox_ids=${encodeURIComponent(inboxIds)}` : '/api/stats';
  const r = await fetch(url);
  if (!r.ok) throw new Error('Failed to load stats');
  return r.json();
}

export async function getIndexStatus(): Promise<IndexStatus> {
  const r = await fetch('/api/index/status');
  return r.json();
}

export async function triggerIndex(maxEmails: number, inboxId?: string): Promise<{ status: string; inbox_id?: string }> {
  const params = new URLSearchParams({ max_emails: String(maxEmails) });
  if (inboxId) params.set('inbox_id', inboxId);
  const r = await fetch(`/api/index?${params}`, { method: 'POST' });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `Index failed (${r.status})`);
  }
  return r.json();
}

export async function searchEmails(
  q: string,
  k: number,
  filters: SearchFilters,
  inboxIds?: string,
  page?: number,
): Promise<{ query: string; results: SearchResult[]; total: number; page: number; k: number }> {
  const params = new URLSearchParams({ q, k: String(k) });
  if (page) params.set('page', String(page));
  if (filters.from) params.set('from_filter', filters.from);
  if (filters.hasAttachment) params.set('has_attachment', 'true');
  if (!filters.smartFilter) params.set('smart_filter', 'false');
  if (inboxIds) params.set('inbox_ids', inboxIds);
  const r = await fetch(`/api/search?${params}`);
  if (!r.ok) {
    const err = await r.json();
    throw new Error((err as any).detail ?? 'Search failed');
  }
  return r.json();
}

export async function markTodoDone(gmailMessageId: string): Promise<void> {
  const r = await fetch(`/api/todos/${encodeURIComponent(gmailMessageId)}/done`, { method: 'POST' });
  if (!r.ok) {
    const err = await r.json();
    throw new Error((err as any).detail ?? 'Failed to mark todo as done');
  }
}

export async function getTodos(n: number, inboxIds?: string): Promise<{ items: TodoItem[] }> {
  const params = new URLSearchParams({ n: String(n) });
  if (inboxIds) params.set('inbox_ids', inboxIds);
  const r = await fetch(`/api/todos?${params}`);
  if (r.status === 401) throw Object.assign(new Error('Unauthenticated'), { status: 401 });
  if (!r.ok) {
    const err = await r.json();
    throw new Error((err as any).detail ?? 'Failed to load todos');
  }
  return r.json();
}

export async function getInboxes(): Promise<{ inboxes: Inbox[] }> {
  const r = await fetch('/api/inboxes');
  if (!r.ok) throw new Error('Failed to load inboxes');
  return r.json();
}

export async function removeInbox(inboxId: string): Promise<void> {
  await fetch(`/api/inboxes/${encodeURIComponent(inboxId)}`, { method: 'DELETE' });
}

export async function setPrimaryInbox(inboxId: string): Promise<void> {
  await fetch(`/api/inboxes/${encodeURIComponent(inboxId)}/primary`, { method: 'POST' });
}
