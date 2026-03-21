import type { TodoItem } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  todos: TodoItem[] | null;
  loading: boolean;
  error: string | null;
  todoN: number;
  onTodoNChange: (n: number) => void;
  onRefresh: () => void;
}

function todoScoreClass(s: number): string {
  return s >= 0.6 ? 'high' : s >= 0.25 ? 'mid' : 'low';
}

function todoScoreLabel(s: number): string {
  return s >= 0.6 ? 'high priority' : s >= 0.25 ? 'action needed' : 'low priority';
}

function fmtDate(str: string): string {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return str.slice(0, 11);
  }
}

export default function TodoSidebar({ open, onClose, todos, loading, error, todoN, onTodoNChange, onRefresh }: Props) {
  return (
    <aside className={`todo-sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <span className="sidebar-title">☑ To-do</span>
          <button className="sidebar-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="sidebar-controls">
          <span>From latest</span>
          <select value={todoN} onChange={e => onTodoNChange(Number(e.target.value))}>
            <option value={10}>10 emails</option>
            <option value={20}>20 emails</option>
            <option value={50}>50 emails</option>
            <option value={100}>100 emails</option>
          </select>
          <button className="sidebar-refresh" onClick={onRefresh}>↻ Refresh</button>
        </div>
      </div>
      <div className="sidebar-body">
        {loading && (
          <div className="sidebar-loading"><span className="spinner" /> Loading…</div>
        )}
        {!loading && error && (
          <div className="sidebar-empty">Error: {error}</div>
        )}
        {!loading && !error && todos !== null && todos.length === 0 && (
          <div className="sidebar-empty">
            No action items found in these emails.<br /><br />
            Try indexing more emails first.
          </div>
        )}
        {!loading && !error && todos && todos.map((item, i) => (
          <a
            className="todo-item"
            key={i}
            href={item.thread_id ? `https://mail.google.com/mail/u/0/#all/${item.thread_id}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={`todo-score ${todoScoreClass(item.score)}`}>{todoScoreLabel(item.score)}</span>
            <div className="todo-subject">{item.subject}</div>
            <div className="todo-meta">✉ {item.sender} &nbsp;·&nbsp; {fmtDate(item.date)}</div>
            <div className="todo-snippet">{item.snippet}</div>
          </a>
        ))}
      </div>
    </aside>
  );
}
