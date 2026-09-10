// --- Data ---
let currentRoomId = '';
let isHost = false;
let players = [];
let courts = [];  
let courtCount = 2;
let bookingCounter = 0;
let activeGameResolveCourtId = null;
let pairingHistory = {};
let opponentHistory = {};
let matchLogs = [];
let isRankedMode = false;
let isMMRMode = false;
let completedGameTimes = [];
const DEFAULT_GAME_TIME = 15;
const AUTO_START_DELAY = 30;
// Nobody should sit out longer than about one game's worth of time before
// being force-seated — see the anti-starvation check in matchmaker.js.
const MAX_FAIR_WAIT_MS = 10 * 60 * 1000;

// A real badminton game just doesn't take this long. A court still stuck on
// "playing" this long is almost always a bug (host forgot to click "จบเกม",
// or stale state got carried over from a previous day) rather than a real
// match — see the auto-abort check in app.js's init() timer.
const MAX_GAME_DURATION_MS = 30 * 60 * 1000;

// --- ⏳ Cooldown Tracking (All-Out mode teammate rotation) ---
// roundCounter: ticks up by 1 every time a real All-Out (rule:'normal') match STARTS.
// lastTeammateRound: key = pair key (see getPairKey), value = the roundCounter at the
// moment that pair was last on the same team. Used to enforce:
//   - gap 1 round since teammates  -> forbidden to be teammates again
//   - gap 2 rounds since teammates -> forbidden to even share a court
let roundCounter = 0;
let lastTeammateRound = {};

// --- LEVEL & BALANCING SYSTEM ---
const LEVEL_WEIGHTS = { 'BG': 1, 'N': 2, 'S': 3, 'P': 4 };
const RANK_LEVELS = ['BG', 'N', 'S', 'P'];
const LEVEL_COLORS = { 'BG': '#bdbdbd', 'N': '#66bb6a', 'S': '#ffa726', 'P': '#ef5350' };
const RANK_SCORES = { 'P': 4, 'S': 3, 'N': 2, 'BG': 1 };
