import { NavLink } from 'react-router-dom';
import type { User } from '../api';

interface Props {
  user: User | null;
}

export default function Header({ user }: Props) {
  return (
    <header>
      <div className="header-left">
        <NavLink to="/" className="header-logo">Email Semantic Search</NavLink>
        <span className="badge">local</span>
      </div>
      <div className="header-right">
        {user && (
          <>
            <NavLink to="/" end className="btn-ghost" style={({ isActive }) => ({ opacity: isActive ? 0.6 : 1 })}>
              Search
            </NavLink>
            <NavLink to="/todos" className="btn-ghost" style={({ isActive }) => ({ opacity: isActive ? 0.6 : 1 })}>
              ☑ To-do
            </NavLink>
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
