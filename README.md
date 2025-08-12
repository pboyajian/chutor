## Chutor

Personalized chess improvement tool for Lichess game data. Chutor fetches or imports your games, analyzes mistakes, and presents actionable patterns with an interactive board and charts.
<img width="1080" height="883" alt="image" src="https://github.com/user-attachments/assets/438fd1aa-c06e-4824-a4e1-5d589ab4d6f9" />
<img width="1144" height="934" alt="image" src="https://github.com/user-attachments/assets/4c60c1df-a9a5-4fd3-b81f-34b05654bb17" />
<img width="1912" height="352" alt="image" src="https://github.com/user-attachments/assets/b6f2830d-a5b6-4e91-8202-0c8e2ed87c4f" />


### Highlights

- Analyze Lichess games or upload PGN files
- Auto-detects your username from games (no typing required)
- Filters to show only your inaccuracies, mistakes, and blunders
- Sort mistakes by recurrence or by move order (earlier first)
- Paginated list to explore beyond the top 10
- Shows “played” vs “best” move when available
- Recurring mistake patterns by opening and move (e.g., “Bf4 in Englund Gambit”)
- Fast, responsive UI:
  - Heavy summary analysis runs on a Node.js backend using Worker Threads (parallel)
  - Blunder-detail prep (SAN, per-ply FEN, recurring groups) runs in a frontend Web Worker
- Debug panel with live logs and minimize toggle

---

## Tech Stack

- Frontend: React + TypeScript, Vite, Tailwind CSS
- Chess: `chess.js` (logic), `chessboard.jsx` (board)
- Charts: Recharts
- Backend: Node.js (Express), TypeScript, Worker Threads

---

## Quick Start

### 1) Backend (Analysis server)

Important: Always start from the `server` directory.

```bash
cd server
npm install

# build TypeScript once to produce dist/analysis.js for the worker thread
npm run build

# start the server (ts-node)
npm run dev
# Server runs on http://localhost:3001
```

Notes:
- Re-run `npm run build` whenever you change files under `server/src/analysis.ts`.

### 2) Frontend (App)

From the project root:

```bash
npm install
npm run dev
# App runs on http://localhost:5173
```

---

## Using the App

1. Start the backend and frontend as above.
2. In the app:
   - Enter a Lichess username to fetch games, or
   - Upload a PGN file (auto-analysis will run and auto-detect your username).
3. Click items in the Top Mistakes list to jump the board to that position.
4. Switch sorting between “By recurrence” and “By move number”.
5. Use the opening filter to narrow the dataset. The menu lists only openings present in the loaded games.
6. Toggle the debug panel to see backend timing and status logs.

---

## Project Structure

```text
chutor/
  src/
    components/
      Dashboard.tsx            # Main charts + MistakeList + board
      MistakeList.tsx          # Blunders list, uses a Web Worker for prep
      UsernameForm.tsx         # Username input + PGN upload
      ChessboardDisplay.tsx    # Board UI (chessboard.jsx)
      Spinner.tsx              # Small loader
    lib/
      analysis.ts              # Types and lightweight client-side helpers
      lichess.ts               # Game fetching/types
      api.ts                   # Frontend API client (calls backend)
    workers/
      mistakeDetails.worker.ts # Precomputes SAN, FENs, recurring patterns
  server/
    src/
      index.ts                 # Express server, /api/analyze endpoint
      analysis.ts              # Heavy analysis (migrated from frontend)
      worker-thread.js         # Worker Thread wrapper (uses dist/analysis.js)
    tsconfig.json
    package.json
```

---

## How It Works

- Frontend gathers games (via Lichess API or PGN upload), auto-detects the user, and sends games to the backend.
- Backend splits the workload across Worker Threads to compute the high-level summary:
  - Totals by mistake type
  - Blunders by opening
  - Top blunders (with move numbers, ply, side, Δcp)
- Frontend displays charts immediately, then offloads the per-blunder heavy details to a dedicated Web Worker:
  - Parses PGNs once per game (verbose SAN list)
  - Builds per‑ply FENs for board jumps
  - Derives “played” vs “best” SAN where possible
  - Computes recurring patterns grouped by opening + played move

This keeps the UI responsive while still delivering rich details quickly.

---

## API

### POST `/api/analyze`

Request body:

```json
{
  "games": [ /* array of Lichess game objects */ ],
  "options": {
    "onlyForUsername": "optional-username-lowercased"
  }
}
```

Response:

```json
{
  "success": true,
  "summary": {
    "total": { "inaccuracies": 0, "mistakes": 0, "blunders": 0 },
    "mistakesByOpening": { "Opening Name": 3 },
    "blundersByOpening": { "Opening Name": 2 },
    "topBlunders": [
      { "gameId": "abc123", "moveNumber": 12, "ply": 23, "side": "white", "centipawnLoss": 347 }
    ]
  },
  "processingTime": 126,
  "gameCount": 500,
  "detectedUsername": "optional"
}
```

Caching:
- The server computes a content-addressed key from dataset + options. If present in cache, responses are returned quickly.
- Append `?force=true` to bypass cache for debugging.
- Basic cache metrics are available at `GET /api/cache/info` (DEV only): entries, size, hit/miss.

Notes:
- The backend focuses on the summary. The frontend worker derives “played/best SAN”, per‑ply FEN and recurring groups using the summary and PGNs.

---

## Development Tips

- Backend logs will show parallel worker progress and merged stats.
- If the server starts but the worker throws “Cannot find module '../dist/analysis.js'”, run:
  - `cd server && npm run build`
- CORS is open to `http://localhost:5173` in development.
- For very large PGNs, the UI will show “Preparing blunder details…” while the worker finishes; the board and charts remain responsive.

---

## Roadmap

- Persist analysis snapshots
- Export/share reports
- Deeper engine-backed “best move” extraction
- More filters (time control, rating range, date windows)

---

## License

MIT.
