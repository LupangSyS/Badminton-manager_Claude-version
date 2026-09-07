# Badminton Queue Manager — Project Context

## What this is
A single-page web app for managing badminton court queues, matchmaking, timers,
and stats for a club/group. Plain HTML/CSS/JavaScript (no build tools, no
frameworks, no npm) + Firebase (Firestore for data sync, Storage for player
photos). Deployed as static files on GitHub Pages.

## Files
- `index.html` — main app shell (lobby + court/queue UI)
- `app.js` — core app logic (rooms, courts, queue, UI rendering)
- `matchmaker.js` — matchmaking/team-building algorithm
- `state.js` — shared global state variables
- `firebase-sync.js` — Firebase config + save/load/sync functions
- `database.html` — "Hall of Fame" player profile/photo page
- `history.html` — match history & partner-stats analytics page
- `style.css` — all styling

## About me (the person you're working with)
I have no coding background — I can't read a diff and judge if it's safe on my
own, and I can't debug JS errors myself. Please:
- Explain what you're changing and why, in plain language, before making changes.
- Prefer small, testable changes over large rewrites. Tell me how to test each
  one before moving to the next.
- Point out anything risky or irreversible before doing it.
- I keep my own GitHub backups, but please still be careful — treat this like
  production code for a group of real people who show up to play badminton.

## Recent history (already done — don't redo or contradict these)
- Fixed an anti-starvation matchmaking bug (a skipped player could get
  skipped twice; now guaranteed a seat within 2 tries).
- Replaced the old "Anti Deja-vu" toggle in All-Out mode with an always-on
  teammate-rotation cooldown (see `getCooldownViolations` in matchmaker.js):
  teammates can't repeat next round, can't share a court 2 rounds later.
  Shows a confirmation popup with Yes/No when no violation-free team exists,
  unless there are exactly 4 people waiting (no alternative anyway).
- **Fixed a serious multiplayer bug:** every browser tab (including
  spectators) used to run the auto-fill/auto-start timers and write to
  Firebase. Now only host/admin tabs do — spectators are read-only.
- Removed dead duplicate `createRoom()`/`joinRoom()` functions that were
  silently shadowing each other between `app.js` and `firebase-sync.js`, and
  fixed a call to a function (`startRealtimeSync`) that never existed.
- Replaced a hardcoded ImgBB API key (visible in page source) with Firebase
  Storage for player photo uploads.
- Added HTML-escaping for player names in several places that inserted them
  unescaped (XSS risk), and switched name-in-onclick-handler cases to
  encode/decode so names with apostrophes (e.g. "O'Brien") don't break buttons.
- Added a "🔜 Next Pick" badge in the queue for players guaranteed the next
  seat.

## Known open items / next steps
- Prediction panel (`updateNextMatchPanel`) predicts using one global game
  mode for every court — needs to predict per-court using each court's own
  rule and currently-seated players.
- "Divided Money Program" — a bill-splitting feature, explicitly not in scope
  yet (there's unused scaffolding in `history.html`: `saveBillToFirebase`).
  Leave it alone unless I ask for it.
- Firestore/Storage Security Rules aren't managed in code — I need to check
  these in the Firebase Console (no Firebase Auth is set up, so rules are
  currently permissive by necessity).
- No automated tests exist. Manual testing only (host tab + spectator tab).

## How I like to work
Step by step, one feature or fix at a time, with a plain-language explanation
and a way to test before we move on. Ask me before any change that touches
multiple files at once or changes how data is stored.
