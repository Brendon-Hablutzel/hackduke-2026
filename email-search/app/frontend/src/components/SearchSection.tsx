import type { Stats, IndexStatus, SearchFilters } from '../api';

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
  k: number;
  onKChange: (v: number) => void;
  maxEmails: number;
  onMaxEmailsChange: (v: number) => void;
  onReindex: () => void;
  stats: Stats | null;
  indexStatus: IndexStatus | null;
  filters: SearchFilters;
  onFiltersChange: (f: SearchFilters) => void;
}

function statusDotClass(status: IndexStatus | null): string {
  if (!status) return 'status-dot';
  if (status.running) return 'status-dot indexing';
  if (status.error) return 'status-dot error';
  return 'status-dot ok';
}

function statusLabel(status: IndexStatus | null): string {
  if (!status) return '–';
  if (status.running) return 'Indexing…';
  if (status.error) return `Error: ${status.error}`;
  if (status.result) return `Done · +${status.result.new} new`;
  return 'Ready';
}

function fmtStats(stats: Stats | null): string {
  if (!stats) return 'Loading…';
  const count = stats.indexed_count ?? 0;
  const sync = stats.last_sync ? ' · synced ' + new Date(stats.last_sync).toLocaleString() : '';
  return `${count} email${count !== 1 ? 's' : ''} indexed${sync}`;
}

export default function SearchSection({
  query, onQueryChange, onSearch, searching,
  k, onKChange, maxEmails, onMaxEmailsChange, onReindex,
  stats, indexStatus, filters, onFiltersChange,
}: Props) {
  const hasActiveFilters = filters.from !== '' || filters.hasAttachment;

  return (
    <div className="search-section">
      <div className="search-row">
        <input
          className="query-input"
          type="text"
          placeholder='e.g. "budget approval" or "flight confirmation"'
          autoComplete="off"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch()}
        />
        <button className="btn-primary" onClick={onSearch} disabled={searching}>
          {searching ? <><span className="spinner" />Searching…</> : 'Search'}
        </button>
        <select
          className="inline-select"
          value={maxEmails}
          onChange={e => onMaxEmailsChange(Number(e.target.value))}
          title="Emails to index"
        >
          <option value={100}>100 emails</option>
          <option value={250}>250 emails</option>
          <option value={500}>500 emails</option>
          <option value={1000}>1,000 emails</option>
          <option value={2000}>2,000 emails</option>
        </select>
        <button className="btn-secondary" onClick={onReindex} disabled={indexStatus?.running}>
          ↻ Re-index
        </button>
      </div>

      <div className="filter-bar">
        <span className="filter-bar-label">Filters</span>
        <div className="filter-bar-item">
          <label className="filter-bar-fieldlabel" htmlFor="filter-from">From</label>
          <input
            id="filter-from"
            className="filter-bar-input"
            type="text"
            placeholder="sender name or email"
            value={filters.from}
            onChange={e => onFiltersChange({ ...filters, from: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
          />
        </div>
        <div className="filter-bar-item">
          <label className="filter-bar-checkbox">
            <input
              type="checkbox"
              checked={filters.hasAttachment}
              onChange={e => onFiltersChange({ ...filters, hasAttachment: e.target.checked })}
            />
            Has attachment
          </label>
        </div>
        {hasActiveFilters && (
          <button
            className="filter-bar-clear"
            onClick={() => onFiltersChange({ from: '', hasAttachment: false })}
          >
            Clear
          </button>
        )}
      </div>

      <div className="meta-row">
        <span>
          Results:{' '}
          <select value={k} onChange={e => onKChange(Number(e.target.value))}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </span>
        <span>{fmtStats(stats)}</span>
        <span>
          <span className={statusDotClass(indexStatus)} />
          {statusLabel(indexStatus)}
        </span>
      </div>
      {indexStatus?.running && (
        <div className="index-banner">
          <span className="spinner" /> Indexing your emails in the background…
        </div>
      )}
    </div>
  );
}
