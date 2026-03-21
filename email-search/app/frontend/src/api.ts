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

export interface SearchResult {
  rank: number;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
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
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  action?: string;
  deadline_text?: string;
  deadline_date?: string;
}

export interface TodoBuckets {
  next_24h: TodoItem[];
  next_week: TodoItem[];
  undated: TodoItem[];
  total: number;
}

export async function getMe(): Promise<{ authenticated: false } | { authenticated: true; user: User }> {
  const r = await fetch('/auth/me');
  return r.json();
}

export async function getStats(inboxIds?: string): Promise<Stats> {
  const url = inboxIds ? `/stats?inbox_ids=${encodeURIComponent(inboxIds)}` : '/stats';
  const r = await fetch(url);
  if (!r.ok) throw new Error('Failed to load stats');
  return r.json();
}

export async function getIndexStatus(): Promise<IndexStatus> {
  const r = await fetch('/index/status');
  return r.json();
}

export async function triggerIndex(maxEmails: number, inboxId?: string): Promise<{ status: string; inbox_id?: string }> {
  const params = new URLSearchParams({ max_emails: String(maxEmails) });
  if (inboxId) params.set('inbox_id', inboxId);
  const r = await fetch(`/index?${params}`, { method: 'POST' });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? `Index failed (${r.status})`);
  }
  return r.json();
}

export async function searchEmails(q: string, k: number, inboxIds?: string): Promise<{ query: string; results: SearchResult[] }> {
  const params = new URLSearchParams({ q, k: String(k) });
  if (inboxIds) params.set('inbox_ids', inboxIds);
  const r = await fetch(`/search?${params}`);
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.detail ?? 'Search failed');
  }
  return r.json();
}

export async function getTodos(days: number, inboxIds?: string): Promise<TodoBuckets> {
  const params = new URLSearchParams({ days: String(days) });
  if (inboxIds) params.set('inbox_ids', inboxIds);
  const r = await fetch(`/todos?${params}`);
  if (r.status === 401) throw Object.assign(new Error('Unauthenticated'), { status: 401 });
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.detail ?? 'Failed to load todos');
  }
  return r.json();
}

export async function getInboxes(): Promise<{ inboxes: Inbox[] }> {
  const r = await fetch('/inboxes');
  if (!r.ok) throw new Error('Failed to load inboxes');
  return r.json();
}

export async function removeInbox(inboxId: string): Promise<void> {
  await fetch(`/inboxes/${encodeURIComponent(inboxId)}`, { method: 'DELETE' });
}

export async function setPrimaryInbox(inboxId: string): Promise<void> {
  await fetch(`/inboxes/${encodeURIComponent(inboxId)}/primary`, { method: 'POST' });
}
