import type { SearchResult } from '../api';

interface Props {
  results: SearchResult[] | null;
  query: string;
  error: string | null;
}

function scoreClass(s: number): string {
  return s >= 0.6 ? 'score-high' : s >= 0.35 ? 'score-mid' : 'score-low';
}

function fmtDate(str: string): string {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return str.slice(0, 11);
  }
}

export default function Results({ results, query, error }: Props) {
  if (error) {
    return (
      <div className="results-section">
        <div className="empty-state"><h2>Error</h2><p>{error}</p></div>
      </div>
    );
  }

  if (results === null) {
    return (
      <div className="results-section">
        <div className="empty-state">
          <h2>Ready to search</h2>
          <p>Type a natural language query above, or click <strong>↻ Re-index</strong> to fetch your latest emails.</p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="results-section">
        <div className="empty-state"><h2>No results found</h2><p>Try a different query or index more emails.</p></div>
      </div>
    );
  }

  return (
    <div className="results-section">
      <div className="results-header">
        {results.length} results for <strong>"{query}"</strong>
      </div>
      {results.map(r => (
        <a
          className="card"
          key={r.rank}
          href={r.thread_id ? `https://mail.google.com/mail/u/0/#all/${r.thread_id}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="card-top">
            <div className="card-subject">
              <span className="rank-chip">#{r.rank}</span>
              {r.subject || '(no subject)'}
            </div>
            <span className={`score-badge ${scoreClass(r.score)}`}>
              {(r.score * 100).toFixed(0)}%
            </span>
          </div>
          <div className="card-meta">
            <span>✉ {r.sender}</span>
            <span>📅 {fmtDate(r.date)}</span>
          </div>
          <div className="card-snippet">{r.snippet}</div>
        </a>
      ))}
    </div>
  );
}
