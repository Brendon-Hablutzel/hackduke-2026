import { useState, useEffect, useCallback } from 'react';
import type { User, Inbox, SearchResult, IndexStatus, Stats, TodoBuckets } from './api';
import { getMe, getStats, getIndexStatus, triggerIndex, searchEmails, getTodos, getInboxes } from './api';
import Header from './components/Header';
import Landing from './components/Landing';
import SearchSection from './components/SearchSection';
import Results from './components/Results';
import TodoSidebar from './components/TodoSidebar';

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
  const [k, setK] = useState(10);
  const [maxEmails, setMaxEmails] = useState(500);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  const [stats, setStats] = useState<Stats | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [todoBuckets, setTodoBuckets] = useState<TodoBuckets | null>(null);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState<string | null>(null);
  const [todoDays, setTodoDays] = useState(7);

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

  const loadTodos = useCallback(async (days: number, ids?: string) => {
    setTodosLoading(true);
    setTodosError(null);
    try {
      const data = await getTodos(days, ids);
      setTodoBuckets(data);
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

  const getIds = useCallback(() => inboxIdsParam(inboxes, selectedInboxIds), [inboxes, selectedInboxIds]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => {
      const next = !prev;
      if (next) loadTodos(todoDays, inboxIdsParam(inboxes, selectedInboxIds));
      return next;
    });
  }, [loadTodos, todoDays, inboxes, selectedInboxIds]);

  const handleTodoDaysChange = (days: number) => {
    setTodoDays(days);
    loadTodos(days, getIds());
  };

  const handleInboxSelectionChange = (ids: Set<string>) => {
    setSelectedInboxIds(ids);
    const param = inboxIdsParam(inboxes, ids);
    fetchStats(param);
    if (sidebarOpen) loadTodos(todoDays, param);
    // Re-run search if there are results
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
    const results = await Promise.allSettled(inboxes.map(inbox => triggerIndex(maxEmails, inbox.id)));
    const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) {
      setIndexStatus({ running: false, result: null, error: (failed.reason as Error).message });
    } else {
      pollIndexStatus();
    }
  };

  async function doSearchWith(q: string, inboxIds?: string) {
    setSearching(true);
    setSearchError(null);
    setLastQuery(q);
    try {
      const data = await searchEmails(q, k, inboxIds);
      setResults(data.results);
    } catch (e: unknown) {
      setResults([]);
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    doSearchWith(q, getIds());
  };

  if (!authChecked) return null;

  if (!user) return (
    <>
      <Header
        user={null}
        onTodoToggle={toggleSidebar}
        sidebarOpen={sidebarOpen}
        inboxes={[]}
        selectedInboxIds={new Set()}
        onInboxSelectionChange={() => {}}
        onInboxesChanged={() => {}}
      />
      <Landing />
    </>
  );

  return (
    <>
      <Header
        user={user}
        onTodoToggle={toggleSidebar}
        sidebarOpen={sidebarOpen}
        inboxes={inboxes}
        selectedInboxIds={selectedInboxIds}
        onInboxSelectionChange={handleInboxSelectionChange}
        onInboxesChanged={handleInboxesChanged}
      />
      <div className="app-body">
        <div className={`main-content${sidebarOpen ? ' sidebar-open' : ''}`}>
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
          />
          <Results
            results={results}
            query={lastQuery}
            error={searchError}
            multiInbox={inboxes.length > 1}
          />
        </div>
        <TodoSidebar
          open={sidebarOpen}
          onClose={toggleSidebar}
          buckets={todoBuckets}
          loading={todosLoading}
          error={todosError}
          todoDays={todoDays}
          onTodoDaysChange={handleTodoDaysChange}
          onRefresh={() => loadTodos(todoDays, getIds())}
        />
      </div>
    </>
  );
}
