import type { User, Inbox } from '../api';
import InboxDropdown from './InboxDropdown';

interface Props {
  user: User | null;
  onTodoToggle: () => void;
  sidebarOpen: boolean;
  inboxes: Inbox[];
  selectedInboxIds: Set<string>;
  onInboxSelectionChange: (ids: Set<string>) => void;
  onInboxesChanged: () => void;
}

export default function Header({ user, onTodoToggle, sidebarOpen, inboxes, selectedInboxIds, onInboxSelectionChange, onInboxesChanged }: Props) {
  return (
    <header>
      <div className="header-left">
        <h1>Email Semantic Search</h1>
        <span className="badge">local</span>
      </div>
      <div className="header-right">
        {user && (
          <>
            <button
              className="btn-ghost"
              onClick={onTodoToggle}
              style={{ opacity: sidebarOpen ? 0.6 : 1 }}
            >
              ☑ To-do
            </button>
            <InboxDropdown
              inboxes={inboxes}
              selectedIds={selectedInboxIds}
              onSelectionChange={onInboxSelectionChange}
              onInboxesChanged={onInboxesChanged}
            />
            <div className="user-chip">
              {user.picture && <img src="/auth/avatar" alt="" />}
              <span>{user.name || user.email}</span>
              <a href="/auth/logout" className="btn-ghost">Sign out</a>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
