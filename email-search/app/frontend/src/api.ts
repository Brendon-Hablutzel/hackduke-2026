export interface User {
  sub: string;
  email: string;
  name: string;
  picture: string;
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
  thread_id: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  score: number;
}

export async function getMe(): Promise<{ authenticated: false } | { authenticated: true; user: User }> {
  const r = await fetch('/auth/me');
  return r.json();
}

export async function getStats(): Promise<Stats> {
  const r = await fetch('/stats');
  if (!r.ok) throw new Error('Failed to load stats');
  return r.json();
}

export async function getIndexStatus(): Promise<IndexStatus> {
  const r = await fetch('/index/status');
  return r.json();
}

export async function triggerIndex(maxEmails: number): Promise<{ status: string }> {
  const r = await fetch(`/index?max_emails=${maxEmails}`, { method: 'POST' });
  return r.json();
}

export async function searchEmails(
  q: string,
  k: number,
  filters: SearchFilters,
): Promise<{ query: string; results: SearchResult[] }> {
  const params = new URLSearchParams({ q, k: String(k) });
  if (filters.from) params.set('from_filter', filters.from);
  if (filters.hasAttachment) params.set('has_attachment', 'true');
  if (!filters.smartFilter) params.set('smart_filter', 'false');
  const r = await fetch(`/search?${params}`);
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.detail ?? 'Search failed');
  }
  return r.json();
}

export async function getTodos(n: number): Promise<{ items: TodoItem[] }> {
  const r = await fetch(`/todos?n=${n}`);
  if (r.status === 401) throw Object.assign(new Error('Unauthenticated'), { status: 401 });
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.detail ?? 'Failed to load todos');
  }
  return r.json();
}
