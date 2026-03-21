import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import type { User, SearchResult, IndexStatus, Stats, TodoItem, SearchFilters } from './api';
import { getMe, getStats, getIndexStatus, triggerIndex, searchEmails, getTodos, markTodoDone } from './api';
import Header from './components/Header';
import Landing from './components/Landing';
import SearchSection from './components/SearchSection';
import Results from './components/Results';
import TodoPage from './components/TodoPage';

function Layout({ user }: { user: User }) {
  return (
    <>
      <Header user={user} />
      <Outlet />
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ from: '', hasAttachment: false });
  const [k, setK] = useState(10);
  const [maxEmails, setMaxEmails] = useState(500);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  const [stats, setStats] = useState<Stats | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);

  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState<string | null>(null);
  const [todoN, setTodoN] = useState(20);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getStats());
    } catch {
      // non-critical
    }
  }, []);

  const pollIndexStatus = useCallback(async () => {
    try {
      const status = await getIndexStatus();
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

  useEffect(() => {
    getMe().then(data => {
      if (data.authenticated) {
        setUser(data.user);
        fetchStats();
        pollIndexStatus();
      }
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, [fetchStats, pollIndexStatus]);

  const loadTodos = useCallback(async (n: number) => {
    setTodosLoading(true);
    setTodosError(null);
    try {
      const data = await getTodos(n);
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
      loadTodos(todoN);
    }
  }, [loadTodos, todoN]);

  const handleTodoNChange = (n: number) => {
    setTodoN(n);
    loadTodos(n);
  };

  const handleReindex = async () => {
    setIndexStatus(prev => ({ ...prev ?? { result: null, error: null }, running: true }));
    try {
      const data = await triggerIndex(maxEmails);
      if (data.status === 'started' || data.status === 'already_running') {
        pollIndexStatus();
      }
    } catch (e: unknown) {
      const err = e as Error;
      setIndexStatus({ running: false, result: null, error: err.message ?? 'Failed to start indexing' });
    }
  };

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setLastQuery(q);
    try {
      const data = await searchEmails(q, k, filters);
      setResults(data.results);
    } catch (e: unknown) {
      setResults([]);
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  if (!authChecked) return null;

  if (!user) return (
    <>
      <Header user={null} />
      <Landing />
    </>
  );

  return (
    <Routes>
      <Route element={<Layout user={user} />}>
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
            <Results results={results} query={lastQuery} error={searchError} />
          </div>
        } />
        <Route path="/todos" element={
          <TodoPage
            todos={todos}
            loading={todosLoading}
            error={todosError}
            todoN={todoN}
            onTodoNChange={handleTodoNChange}
            onRefresh={() => loadTodos(todoN)}
            onMount={() => { if (todos === null) loadTodos(todoN); }}
            onMarkDone={handleMarkDone}
          />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
