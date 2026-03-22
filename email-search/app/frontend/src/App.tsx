import { useState, useEffect, useCallback } from 'react';
import type { User, Inbox, SearchResult, IndexStatus, Stats, TodoItem } from './api';
import { getMe, getStats, getIndexStatus, triggerIndex, searchEmails, getTodos, getInboxes } from './api';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import type { SearchFilters } from './api';
import { markTodoDone } from './api';
import Header from './components/Header';
import Landing from './components/Landing';
import SearchSection from './components/SearchSection';
import Results from './components/Results';
import TodoPage from './components/TodoPage';

function Layout({ user, inboxes, selectedInboxIds, onInboxSelectionChange, onInboxesChanged }: {
  user: User;
  inboxes: Inbox[];
  selectedInboxIds: Set<string>;
  onInboxSelectionChange: (ids: Set<string>) => void;
  onInboxesChanged: () => void;
}) {
  return (
    <>
      <Header
        user={user}
        inboxes={inboxes}
        selectedInboxIds={selectedInboxIds}
        onInboxSelectionChange={onInboxSelectionChange}
        onInboxesChanged={onInboxesChanged}
      />
      <Outlet />
    </>
  );
}

function inboxIdsParam(inboxes: Inbox[], selected: Set<string>): string | undefined {
  if (selected.size === 0 || selected.size === inboxes.length) return undefined;
  return [...selected].join(',');
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [selectedInboxIds, setSelectedInboxIds] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ from: '', hasAttachment: false });
  const [k, setK] = useState(10);
  const [maxEmails, setMaxEmails] = useState(500);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  const [stats, setStats] = useState<Stats | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);

  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState<string | null>(null);
  const [todoN, setTodoN] = useState(10);

  const fetchStats = useCallback(async (ids?: string) => {
    try {
      setStats(await getStats(ids));
    } catch {
      // non-critical
    }
  }, []);

  const pollIndexStatus = useCallback(async () => {
    try {
      const raw = await getIndexStatus();
      // getIndexStatus may return a single status or dict keyed by inbox_id
      // Normalize to a single IndexStatus
      let status: IndexStatus;
      if (typeof (raw as any).running === 'boolean') {
        status = raw as IndexStatus;
      } else {
        const entries = Object.values(raw as unknown as Record<string, IndexStatus>);
        status = entries.find(e => e.running) ?? entries.find(e => e.error) ?? entries.find(e => e.result) ?? { running: false, result: null, error: null };
      }
      setIndexStatus(status);
      if (status.running) {
        setTimeout(pollIndexStatus, 3000);
      } else if (status.result) {
        fetchStats();
      }
    } catch {
      setIndexStatus(null);
    }
  }, [fetchStats]);

  const fetchInboxes = useCallback(async () => {
    try {
      const data = await getInboxes();
      setInboxes(data.inboxes);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    getMe().then(data => {
      if (data.authenticated) {
        setUser(data.user);
        fetchStats();
        pollIndexStatus();
        fetchInboxes();
      }
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, [fetchStats, pollIndexStatus, fetchInboxes]);

  const getIds = useCallback(() => inboxIdsParam(inboxes, selectedInboxIds), [inboxes, selectedInboxIds]);

  const loadTodos = useCallback(async (n: number, ids?: string) => {
    setTodosLoading(true);
    setTodosError(null);
    try {
      const data = await getTodos(n, ids);
      setTodos(data.items);
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        setUser(null);
      } else {
        setTodosError(err.message);
      }
    } finally {
      setTodosLoading(false);
    }
  }, []);

  const handleMarkDone = useCallback(async (gmailMessageId: string) => {
    setTodos(prev => prev ? prev.map(t => t.gmail_message_id === gmailMessageId ? { ...t, done: true } : t) : prev);
    try {
      await markTodoDone(gmailMessageId);
    } catch {
      loadTodos(todoN, getIds());
    }
  }, [loadTodos, todoN, getIds]);

  const handleTodoNChange = (n: number) => {
    setTodoN(n);
    loadTodos(n, getIds());
  };

  const handleInboxSelectionChange = (ids: Set<string>) => {
    setSelectedInboxIds(ids);
    const param = inboxIdsParam(inboxes, ids);
    fetchStats(param);
    if (results !== null && lastQuery) {
      doSearchWith(lastQuery, param);
    }
  };

  const handleInboxesChanged = async () => {
    await fetchInboxes();
    fetchStats(getIds());
  };

  const handleReindex = async () => {
    setIndexStatus(prev => ({ ...prev ?? { result: null, error: null }, running: true }));
    const settled = await Promise.allSettled(inboxes.map(inbox => triggerIndex(maxEmails, inbox.id)));
    const failed = settled.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) {
      setIndexStatus({ running: false, result: null, error: (failed.reason as Error).message });
    } else {
      pollIndexStatus();
    }
  };

  async function doSearchWith(q: string, inboxIds?: string, page = 0) {
    setSearching(true);
    setSearchError(null);
    setLastQuery(q);
    setSearchPage(page);
    try {
      const data = await searchEmails(q, k, filters, inboxIds, page);
      setResults(data.results);
      setSearchTotal(data.total);
    } catch (e: unknown) {
      setResults([]);
      setSearchTotal(0);
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearchPage(0);
    doSearchWith(q, getIds(), 0);
  };

  const handlePageChange = (newPage: number) => {
    doSearchWith(lastQuery, getIds(), newPage);
  };

  if (!authChecked) return null;

  if (!user) return (
    <>
      <Header
        user={null}
        inboxes={[]}
        selectedInboxIds={new Set()}
        onInboxSelectionChange={() => {}}
        onInboxesChanged={() => {}}
      />
      <Landing />
    </>
  );

  return (
    <Routes>
      <Route element={
        <Layout
          user={user}
          inboxes={inboxes}
          selectedInboxIds={selectedInboxIds}
          onInboxSelectionChange={handleInboxSelectionChange}
          onInboxesChanged={handleInboxesChanged}
        />
      }>
        <Route path="/" element={
          <div className="main-content">
            <SearchSection
              query={query}
              onQueryChange={setQuery}
              onSearch={doSearch}
              searching={searching}
              k={k}
              onKChange={setK}
              maxEmails={maxEmails}
              onMaxEmailsChange={setMaxEmails}
              onReindex={handleReindex}
              stats={stats}
              indexStatus={indexStatus}
              filters={filters}
              onFiltersChange={setFilters}
            />
            <Results results={results} query={lastQuery} error={searchError} multiInbox={inboxes.length > 1} total={searchTotal} page={searchPage} pageSize={k} onPageChange={handlePageChange} />
          </div>
        } />
        <Route path="/todos" element={
          <TodoPage
            todos={todos}
            loading={todosLoading}
            error={todosError}
            todoN={todoN}
            onTodoNChange={handleTodoNChange}
            onRefresh={() => loadTodos(todoN, getIds())}
            onMount={() => { if (todos === null) loadTodos(todoN, getIds()); }}
            onMarkDone={handleMarkDone}
          />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
