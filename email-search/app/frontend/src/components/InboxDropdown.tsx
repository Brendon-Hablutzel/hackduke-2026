import { useState, useEffect, useRef } from 'react';
import type { Inbox } from '../api';
import { removeInbox, setPrimaryInbox } from '../api';

interface Props {
  inboxes: Inbox[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onInboxesChanged: () => void;
}

export default function InboxDropdown({ inboxes, selectedIds, onSelectionChange, onInboxesChanged }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function isChecked(id: string) {
    return selectedIds.size === 0 || selectedIds.has(id);
  }

  function toggleInbox(id: string) {
    const next = new Set(selectedIds);
    if (isChecked(id)) {
      // Uncheck — but don't let user uncheck the last one
      if (next.size === 0) {
        // Currently all selected — switch to "all except this one"
        inboxes.forEach(i => { if (i.id !== id) next.add(i.id); });
      } else {
        next.delete(id);
        if (next.size === inboxes.length) next.clear(); // all = empty set
      }
    } else {
      next.add(id);
      if (next.size === inboxes.length) next.clear();
    }
    onSelectionChange(next);
  }

  async function handleSetPrimary(id: string) {
    await setPrimaryInbox(id);
    onInboxesChanged();
  }

  async function handleRemove(id: string, email: string) {
    if (!confirm(`Remove ${email}?`)) return;
    const next = new Set(selectedIds);
    next.delete(id);
    onSelectionChange(next);
    await removeInbox(id);
    onInboxesChanged();
  }

  const checkedCount = selectedIds.size === 0 ? inboxes.length : selectedIds.size;
  const label = inboxes.length <= 1
    ? '📥 Inboxes'
    : `📥 Inboxes (${checkedCount}/${inboxes.length})`;

  return (
    <div className="inbox-dropdown-wrap" ref={ref}>
      <button className="btn-ghost" onClick={() => setOpen(o => !o)}>
        {label}
      </button>
      {open && (
        <div className="inbox-dropdown-panel">
          <div className="inbox-dropdown-header">Connected Inboxes</div>
          <div className="inbox-list">
            {inboxes.map(inbox => (
              <div className="inbox-row" key={inbox.id}>
                <input
                  type="checkbox"
                  checked={isChecked(inbox.id)}
                  onChange={() => toggleInbox(inbox.id)}
                />
                <div className="inbox-avatar">
                  {inbox.picture
                    ? <img src="/auth/avatar" alt="" />
                    : inbox.email.charAt(0).toUpperCase()}
                </div>
                <div className="inbox-info">
                  <div className="inbox-email">{inbox.email}</div>
                  <div className="inbox-label">{inbox.is_primary ? 'Primary' : 'Connected'}</div>
                </div>
                <div className="inbox-actions">
                  <button
                    className={`inbox-action-btn star${inbox.is_primary ? ' is-primary' : ''}`}
                    title={inbox.is_primary ? 'Primary inbox' : 'Set as primary'}
                    onClick={() => !inbox.is_primary && handleSetPrimary(inbox.id)}
                  >★</button>
                  {!inbox.is_primary && (
                    <button
                      className="inbox-action-btn remove"
                      title="Remove inbox"
                      onClick={() => handleRemove(inbox.id, inbox.email)}
                    >✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="inbox-dropdown-footer">
            <a href="/auth/add_inbox">+ Add inbox</a>
          </div>
        </div>
      )}
    </div>
  );
}
