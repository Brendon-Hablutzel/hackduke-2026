# Email Semantic Search

A local, self-hosted web app that lets users sign in with Google, index their Gmail inbox as vector embeddings, and search with natural language queries.

**Stack:** FastAPI · ChromaDB · Gmail OAuth 2.0 · Sentence Transformers (`all-MiniLM-L6-v2`) · Docker Compose

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose)
- A Google Cloud project with the Gmail API enabled and an OAuth 2.0 client ID downloaded as `credentials.json`
- Python 3.11+ (only needed for the CLI when running outside Docker)

---

## Getting `credentials.json` from Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create or select a project.

2. **Enable the Gmail API:**
   Navigate to **APIs & Services → Library**, search for "Gmail API", and click **Enable**.

3. **Configure the OAuth consent screen:**
   Go to **APIs & Services → OAuth consent screen**.
   - Select **External** (or Internal if you have a Workspace account).
   - Fill in the required App name and support email fields.
   - Under **Scopes**, add `https://www.googleapis.com/auth/gmail.readonly`.
   - Add your own Gmail address under **Test users**.
   - Save and continue.

4. **Create OAuth 2.0 credentials:**
   Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Give it a name (e.g. "Email Search").
   - Under **Authorized redirect URIs**, add: `http://localhost:8000/auth/callback`
   - Click **Create**.

5. **Download the JSON file:**
   Click the download icon next to the new credential.
   Rename the file to `credentials.json` and place it in the `./credentials/` folder of this project.

---

## First-time Setup

```bash
# 1. Clone / navigate into the project
cd email-search

# 2. Copy and configure the env file
cp .env.example .env
# Set a strong SECRET_KEY — used to sign user sessions:
#   SECRET_KEY=some-long-random-string

# 3. Place your credentials.json
cp ~/Downloads/credentials.json ./credentials/

# 4. Start the services
docker compose up -d --build
```

The `app` container pre-downloads the `all-MiniLM-L6-v2` model at build time so there's no runtime delay.

### Sign in

Open [http://localhost:8000](http://localhost:8000) in your browser. Click **Sign in with Google**, complete the OAuth consent flow, and you'll be redirected back to the app. OAuth tokens are saved server-side in `./data/tokens/` and refreshed automatically.

---

## Indexing Emails

### Via Web UI (recommended)
Open [http://localhost:8000](http://localhost:8000), sign in, and click **↻ Re-index**. Indexing runs in the background; the status updates in real time.

### Via API (must be signed in; session cookie required)
```bash
curl -X POST "http://localhost:8000/index?max_emails=500" --cookie "session=<your-session-cookie>"
```

Indexing is incremental — emails already in ChromaDB are skipped on re-runs.

---

## Searching

### Via CLI
```bash
python cli.py search "someone asked me for budget approval"
python cli.py search "flight confirmation" -k 5
python cli.py search "quarterly report" --json   # raw JSON output
```

### Via API
```bash
curl "http://localhost:8000/search?q=budget+approval&k=10"
```

### Via Web UI
Open [http://localhost:8000](http://localhost:8000), type your query, and press **Search**.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Web UI |
| GET | `/health` | Health check + indexed count |
| GET | `/stats` | Indexed count + last sync time |
| POST | `/index?max_emails=500` | Trigger background indexing |
| GET | `/index/status` | Check indexing progress |
| GET | `/search?q=...&k=10` | Semantic search |

---

## Re-indexing / Syncing New Emails

Re-running the index command is safe and incremental:

```bash
python cli.py index --max 500
```

Only emails not already in the vector database will be fetched and embedded. Run this on a schedule (e.g. a cron job) to keep the index fresh.

---

## Project Structure

```
email-search/
├── docker-compose.yml        # ChromaDB + app services
├── Dockerfile                # App image (model pre-baked)
├── .env.example              # Config template
├── requirements.txt
├── README.md
├── cli.py                    # Click CLI (index / search / stats)
├── credentials/              # credentials.json + token.json (gitignored)
├── data/                     # stats.json (gitignored)
└── app/
    ├── main.py               # FastAPI app
    ├── config.py             # Settings from env
    ├── gmail.py              # Gmail API client + OAuth
    ├── embeddings.py         # Sentence Transformers singleton
    ├── vectordb.py           # ChromaDB client
    ├── preprocessor.py       # Strip HTML / signatures / quoted replies
    ├── indexer.py            # Indexing pipeline
    ├── search.py             # Hybrid search (vector + BM25)
    └── static/
        └── index.html        # Web UI
```

---

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_EMAILS` | `500` | Max emails to fetch per index run |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence Transformers model name |
| `CHROMA_HOST` | `chromadb` | ChromaDB hostname (use `localhost` for local dev) |
| `CHROMA_PORT` | `8000` | ChromaDB port |
| `CHROMA_COLLECTION` | `emails` | Collection name |
| `CREDENTIALS_PATH` | `/app/credentials/credentials.json` | Path to OAuth credentials |
| `TOKEN_PATH` | `/app/credentials/token.json` | Path to saved OAuth token |
| `DATA_DIR` | `/app/data` | Directory for stats file |
| `LOG_LEVEL` | `INFO` | Python logging level |

---

## Troubleshooting

**`credentials.json not found`** — Make sure you placed it in `./credentials/credentials.json`.

**ChromaDB unreachable** — Run `docker compose ps` to check that the `chromadb` service is healthy. It may take a few seconds on first start.

**OAuth browser doesn't open inside Docker** — Run `python cli.py index` locally for the first time to generate `token.json`, then use Docker for subsequent runs.

**Rate limit errors** — The Gmail client retries with exponential backoff automatically. Large inboxes may take a few minutes.

---

## Security Notes

- `credentials/` and `data/` are mounted as volumes and should be added to `.gitignore`.
- The Gmail scope is read-only (`gmail.readonly`). No emails are modified or sent.
- All embeddings are computed locally — no data leaves your machine.
