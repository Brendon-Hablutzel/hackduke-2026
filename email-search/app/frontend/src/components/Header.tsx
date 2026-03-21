import type { User } from '../api';

interface Props {
  user: User | null;
  onTodoToggle: () => void;
  sidebarOpen: boolean;
}

export default function Header({ user, onTodoToggle, sidebarOpen }: Props) {
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
            <div className="user-chip">
              {user.picture && <img src={user.picture} alt="" />}
              <span>{user.name || user.email}</span>
              <a href="/auth/logout" className="btn-ghost">Sign out</a>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
