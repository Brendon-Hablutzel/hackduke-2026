import { useEffect, useState } from 'react';
import type { TodoItem } from '../api';

interface Props {
  todos: TodoItem[] | null;
  loading: boolean;
  error: string | null;
  todoN: number;
  onTodoNChange: (n: number) => void;
  onRefresh: () => void;
  onMount: () => void;
  onMarkDone: (gmailMessageId: string) => void;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortedTodos(items: TodoItem[]) {
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

function TodoCard({ item, showMarkDone, onMarkDone }: { item: TodoItem; showMarkDone: boolean; onMarkDone: (id: string) => void }) {
  return (
    <div className={`todo-item${item.done ? ' todo-item-done' : ''}`}>
      <div className="todo-item-header">
        <span className={`todo-score ${item.priority}`}>{item.priority} priority</span>
        {showMarkDone && item.gmail_message_id && (
          <button className="btn-mark-done" onClick={() => onMarkDone(item.gmail_message_id)}>
            Mark as done
          </button>
        )}
      </div>
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
  );
}

export default function TodoPage({ todos, loading, error, todoN, onTodoNChange, onRefresh, onMount, onMarkDone }: Props) {
  useEffect(() => { onMount(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<'todo' | 'done'>('todo');

  const active = todos ? sortedTodos(todos.filter(t => !t.done)) : [];
  const done = todos ? todos.filter(t => t.done) : [];

  return (
    <div className="todo-page">
      <div className="todo-page-header">
        <div className="todo-tabs">
          <button className={`todo-tab${tab === 'todo' ? ' active' : ''}`} onClick={() => setTab('todo')}>
            To do {todos && <span className="todo-tab-count">{active.length}</span>}
          </button>
          <button className={`todo-tab${tab === 'done' ? ' active' : ''}`} onClick={() => setTab('done')}>
            Done {todos && <span className="todo-tab-count">{done.length}</span>}
          </button>
        </div>
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
        {!loading && !error && todos !== null && tab === 'todo' && active.length === 0 && (
          <div className="todo-page-empty">
            No action items found in these emails.<br /><br />
            Try indexing more emails first.
          </div>
        )}
        {!loading && !error && todos !== null && tab === 'done' && done.length === 0 && (
          <div className="todo-page-empty">No completed items yet.</div>
        )}
        {!loading && !error && todos && (
          <div className="todo-page-list">
            {tab === 'todo'
              ? active.map((item, i) => (
                  <TodoCard key={i} item={item} showMarkDone onMarkDone={onMarkDone} />
                ))
              : done.map((item, i) => (
                  <TodoCard key={i} item={item} showMarkDone={false} onMarkDone={onMarkDone} />
                ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
