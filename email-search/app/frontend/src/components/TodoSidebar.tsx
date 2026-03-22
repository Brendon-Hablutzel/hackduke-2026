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

function fmtDate(str: string | null): string {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return str.slice(0, 11);
  }
}

export default function TodoSidebar({ open, onClose, todos, loading, error, todoN, onTodoNChange, onRefresh }: Props) {
  const hasItems = todos && todos.length > 0;

  return (
    <aside className={`todo-sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <span className="sidebar-title">☑ Action Needed</span>
          <button className="sidebar-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="sidebar-controls">
          <span>Show:</span>
          <select value={todoN} onChange={e => onTodoNChange(Number(e.target.value))}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
          <button className="sidebar-refresh" onClick={onRefresh}>↻ Refresh</button>
        </div>
      </div>
      <div className="sidebar-body">
        {loading && (
          <div className="sidebar-loading"><span className="spinner" /> Parsing emails…</div>
        )}
        {!loading && error && (
          <div className="sidebar-empty">Error: {error}</div>
        )}
        {!loading && !error && !hasItems && (
          <div className="sidebar-empty">No action items found.<br /><br />Try indexing more emails first.</div>
        )}
        {!loading && !error && todos && todos.map((item, i) => (
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
    </aside>
  );
}
