import { useEffect } from 'react';
import type { TodoItem } from '../api';

interface Props {
  todos: TodoItem[] | null;
  loading: boolean;
  error: string | null;
  todoN: number;
  onTodoNChange: (n: number) => void;
  onRefresh: () => void;
  onMount: () => void;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortedTodos(items: import('../api').TodoItem[]) {
  return [...items].sort((a, b) => {
    const pd = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    if (pd !== 0) return pd;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
}

function fmtDate(str: string | null): string {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return str.slice(0, 11);
  }
}

export default function TodoPage({ todos, loading, error, todoN, onTodoNChange, onRefresh, onMount }: Props) {
  useEffect(() => { onMount(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="todo-page">
      <div className="todo-page-header">
        <h2 className="todo-page-title">☑ Action Needed</h2>
        <div className="todo-page-controls">
          <span>From latest</span>
          <select value={todoN} onChange={e => onTodoNChange(Number(e.target.value))}>
            <option value={10}>10 emails</option>
            <option value={20}>20 emails</option>
            <option value={50}>50 emails</option>
            <option value={100}>100 emails</option>
          </select>
          <button className="btn-secondary" onClick={onRefresh}>↻ Refresh</button>
        </div>
      </div>
      <div className="todo-page-body">
        {loading && (
          <div className="todo-page-empty"><span className="spinner" /> Parsing emails…</div>
        )}
        {!loading && error && (
          <div className="todo-page-empty">Error: {error}</div>
        )}
        {!loading && !error && todos !== null && todos.length === 0 && (
          <div className="todo-page-empty">
            No action items found in these emails.<br /><br />
            Try indexing more emails first.
          </div>
        )}
        {!loading && !error && todos && (
          <div className="todo-page-list">
            {sortedTodos(todos).map((item, i) => (
              <div className="todo-item" key={i}>
                <span className={`todo-score ${item.priority}`}>{item.priority} priority</span>
                <div className="todo-subject">{item.title}</div>
                <div className="todo-snippet">{item.details}</div>
                {(item.due_date || item.location) && (
                  <div className="todo-meta">
                    {item.due_date && <span>📅 {fmtDate(item.due_date)}</span>}
                    {item.due_date && item.location && <span> &nbsp;·&nbsp; </span>}
                    {item.location && <span>📍 {item.location}</span>}
                  </div>
                )}
                <div className="todo-meta">
                  ✉ {item.sender}{item.date ? ` · ${fmtDate(item.date)}` : ''}
                  {item.gmail_url && (
                    <> &nbsp;·&nbsp; <a href={item.gmail_url} target="_blank" rel="noopener noreferrer">Open in Gmail ↗</a></>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
