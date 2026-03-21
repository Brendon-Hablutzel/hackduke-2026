import type { TodoBuckets, TodoItem } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  buckets: TodoBuckets | null;
  loading: boolean;
  error: string | null;
  todoDays: number;
  onTodoDaysChange: (days: number) => void;
  onRefresh: () => void;
}

function fmtDate(str: string): string {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return str.slice(0, 11);
  }
}

function TodoItemCard({ item }: { item: TodoItem }) {
  return (
    <div className="todo-item">
      {item.deadline_text && (
        <div className="todo-deadline">📅 {item.deadline_text}</div>
      )}
      {item.action && (
        <div className="todo-action">{item.action}</div>
      )}
      <div className="todo-subject">{item.subject || '(no subject)'}</div>
      <div className="todo-meta">
        ✉ {item.sender}{item.date ? ` · ${fmtDate(item.date)}` : ''}
      </div>
      {item.snippet && <div className="todo-snippet">{item.snippet}</div>}
    </div>
  );
}

export default function TodoSidebar({ open, onClose, buckets, loading, error, todoDays, onTodoDaysChange, onRefresh }: Props) {
  const hasItems = buckets && (
    buckets.next_24h.length + buckets.next_week.length + buckets.undated.length > 0
  );

  return (
    <aside className={`todo-sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <span className="sidebar-title">☑ To-do</span>
          <button className="sidebar-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="sidebar-controls">
          <span>Window:</span>
          <select value={todoDays} onChange={e => onTodoDaysChange(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
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
        {!loading && !error && buckets !== null && !hasItems && (
          <div className="sidebar-empty">
            {buckets.total === 0
              ? <>No action items found.<br /><br />Try indexing more emails first.</>
              : 'No upcoming action items in this window.'}
          </div>
        )}
        {!loading && !error && hasItems && (
          <>
            {buckets!.next_24h.length > 0 && (
              <>
                <div className="todo-bucket-label">⚡ Due in 24 hours</div>
                {buckets!.next_24h.map((item, i) => <TodoItemCard key={i} item={item} />)}
              </>
            )}
            {buckets!.next_week.length > 0 && (
              <>
                <div className="todo-bucket-label">📅 This week</div>
                {buckets!.next_week.map((item, i) => <TodoItemCard key={i} item={item} />)}
              </>
            )}
            {buckets!.undated.length > 0 && (
              <>
                <div className="todo-bucket-label">📝 No Deadline</div>
                {buckets!.undated.map((item, i) => <TodoItemCard key={i} item={item} />)}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
