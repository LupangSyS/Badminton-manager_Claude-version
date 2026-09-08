// ==========================================
// 🛡️ ระบบป้องกันการโดนแฮกผ่านการพิมพ์ชื่อ (XSS)
// ==========================================
function sanitizeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

// --- Persistence & State Management ---
const STORAGE_KEY = 'BADMINTON_MANAGER_V7_DATA';


// ==========================================
// 🚪 ระบบ Lobby
// ==========================================
// ✅ FIX: these used to be declared a SECOND time in firebase-sync.js. Since
// app.js loads last, its versions silently won — but they called a function
// (startRealtimeSync) that never existed anywhere, so real-time sync never
// actually started. This is now the one and only version, and it correctly
// calls syncFromFirebase(). Also: only HOST/ADMIN browsers call init() —
// that's what starts the auto-fill/auto-start timers. Spectator browsers
// must never run those, or every open viewer tab ends up independently
// writing to the shared Firebase document at the same time as the host.

function generateRoomCode() {
    const d = new Date();
    const datePart = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${datePart}-${randomPart}`;
}

// 👑 1. สร้างห้องใหม่ (Host)
function createRoom() {
    currentRoomId = generateRoomCode();
    isHost = true;

    sessionStorage.setItem('ROOM_ID', currentRoomId);
    sessionStorage.setItem('IS_HOST', 'true');

    const landing = document.getElementById('landing-page');
    const app = document.getElementById('app-container');
    if (landing) landing.style.display = 'none';
    if (app) app.style.display = 'block';

    const roomDisp = document.getElementById('display-room-id');
    const roleDisp = document.getElementById('display-role');
    if (roomDisp) roomDisp.innerText = currentRoomId;
    if (roleDisp) {
        roleDisp.innerText = "👑 HOST (คนคุม)";
        roleDisp.style.background = "#e74c3c";
    }

    init(); // host only: starts local auto-fill / timer intervals
    if (typeof syncFromFirebase === 'function') syncFromFirebase();
    if (typeof triggerSave === 'function') triggerSave(); // push initial state so joiners have something to read

    alert(`✅ สร้างห้องสำเร็จ! รหัสห้องคือ: ${currentRoomId}`);
}

// 📱 2. เข้าดูคิว (คนดู) — read-only, must NOT run local game-logic intervals
function joinRoom() {
    const input = document.getElementById('room-code-input');
    const roomInput = input ? input.value.trim().toUpperCase() : '';
    if (!roomInput) { alert("ใส่รหัสห้องมาก่อนดิเว้ย!"); return; }

    currentRoomId = roomInput;
    isHost = false;

    sessionStorage.setItem('ROOM_ID', currentRoomId);
    sessionStorage.setItem('IS_HOST', 'false');

    document.body.classList.add('view-mode');
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    document.getElementById('display-room-id').innerText = currentRoomId;
    document.getElementById('display-role').innerText = "📱 SPECTATOR (คนดู)";
    document.getElementById('display-role').style.background = "#7f8c8d";

    const controlPanel = document.querySelector('.control-sidebar-container');
    if (controlPanel) controlPanel.style.display = 'none';

    if (typeof syncFromFirebase === 'function') syncFromFirebase();
}

// 🛠️ 3. เข้าห้องแอดมิน (คุมคิวผ่านมือถือ)
function joinRoomAdmin() {
    const input = document.getElementById('room-code-input');
    const roomInput = input ? input.value.trim().toUpperCase() : '';
    if (!roomInput) { alert("ใส่รหัสห้องมาก่อนดิเว้ย!"); return; }

    currentRoomId = roomInput;
    isHost = true;

    sessionStorage.setItem('ROOM_ID', currentRoomId);
    sessionStorage.setItem('IS_HOST', 'true');

    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    document.getElementById('display-room-id').innerText = currentRoomId;
    document.getElementById('display-role').innerText = "🛠️ ADMIN (คนคุมคิว)";
    document.getElementById('display-role').style.background = "#d35400";

    const controlPanel = document.querySelector('.control-sidebar-container');
    if (controlPanel) controlPanel.style.display = 'block';

    init(); // admin controls the queue too, so local intervals are needed
    if (typeof syncFromFirebase === 'function') syncFromFirebase();
}


// --- ฟังก์ชันเช็คว่าเปิดหน้าต่างค้างอยู่มั้ย ---
function isModalOpen() {
    const booking = document.getElementById('booking-modal');
    const winner = document.getElementById('winner-modal');
    const cooldown = document.getElementById('cooldown-confirm-overlay');
    return (booking && booking.style.display === 'flex')
        || (winner && winner.style.display === 'flex')
        || (cooldown && cooldown.style.display === 'flex');
}


const countRealPlayers = (court) => {
    return court.players.filter(p => p !== null && p !== undefined).length;
};


const toggleLevel = (id) => {
    const p = players.find(x => x.id === id);
    if (!p) return;
    const levels = ['BG', 'N', 'S', 'P'];
    const currentIdx = levels.indexOf(p.level || 'BG');
    p.level = levels[(currentIdx + 1) % levels.length];
    updateQueueDisplay();
    savePlayerProfileToCloud(p);
};

const toggleGender = (id) => {
    const p = players.find(x => x.id === id);
    if (!p) return;
    p.gender = (p.gender === 'F') ? 'M' : 'F';
    updateQueueDisplay();
    triggerSave();
    savePlayerProfileToCloud(p);
};


function getWinRate(p) {
    return p.gamesPlayed > 0 ? (p.wins / p.gamesPlayed) : 0;
}


const addPlayerToCourt = (court, player) => {
    let emptyIdx = court.players.findIndex(p => p === null || p === undefined);
    if (emptyIdx !== -1) {
        court.players[emptyIdx] = player;
        const activeCount = court.players.filter(p => p !== null).length;
        if (activeCount === 4) court.gameStartTime = Date.now();
    } else {
        if (court.players.length < 4) court.players.push(player);
        else console.error("สนามเต็มแล้ว ยัดไม่เข้า!");
    }
};



// --- Init ---
// Only ever called for HOST/ADMIN browsers (see createRoom/joinRoomAdmin/window.onload).
function init() {
    renderCourts();
    updateQueueDisplay();
    updateCustomHoursInputs();

    if (loadData()) {
        console.log("📂 Loaded data from LocalStorage");
    }

    renderCourts();
    updateQueueDisplay();

    setInterval(() => {
        if (!isModalOpen()) autoFillCourts();
    }, 1000);

    setInterval(() => {
        courts.forEach((c, idx) => {
            if (c.state === 'playing' && c.gameStartTime) {
                const diffSec = Math.floor((Date.now() - c.gameStartTime) / 1000);
                c.timer = diffSec;
                const el = document.getElementById(`timer-${idx}`);
                if (el) el.innerText = formatTime(diffSec);
            }
        });
    }, 1000);

    setInterval(() => {
        if (!isModalOpen()) updateQueueDisplay();
    }, 60000);

    updateCustomHoursInputs();
}

function toggleView(viewName) {
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('overview-view').classList.add('hidden');
    if(viewName === 'main') {
        document.getElementById('main-view').classList.remove('hidden');
    } else {
        document.getElementById('overview-view').classList.remove('hidden');
        renderOverview();
    }
}

function toggleRankedMode() {
    const checkbox = document.getElementById('ranked-mode-toggle');
    isRankedMode = checkbox.checked;

    // ✨ ถ้าเปิด Rank ให้ปิด MMR อัตโนมัติ (สลับขั้วกัน)
    if (isRankedMode) {
        const mmrCB = document.getElementById('mmr-mode-toggle');
        if(mmrCB) mmrCB.checked = false;
        isMMRMode = false;

        alert('🏆 เปิดโหมดจัดอันดับ! \n(ปิดโหมด MMR แล้ว)');
    } else {
        alert('👌 ปิดโหมดจัดอันดับ');
    }
    updateNextMatchPanel();
    triggerSave();
}

function toggleMMRMode() {
    const checkbox = document.getElementById('mmr-mode-toggle');
    isMMRMode = checkbox.checked;
    if (isMMRMode) {
        const rankCB = document.getElementById('ranked-mode-toggle');
        if(rankCB) rankCB.checked = false;
        isRankedMode = false;
        alert('⚖️ เปิดโหมด MMR!');
    } else {
        alert('👌 ปิดโหมด MMR');
    }
    updateNextMatchPanel();
    triggerSave();
}

// ✅ FIX: the "Anti Deja-vu" toggle is gone — All-Out mode always applies the
// teammate-rotation cooldown now (see matchmaker.js: getCooldownViolations),
// so there's no separate on/off switch or handler needed anymore.

function getPairKey(id1, id2) { return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`; }
function recordPairing(id1, id2) {
    const key = getPairKey(id1, id2);
    if (!pairingHistory[key]) pairingHistory[key] = 0;
    pairingHistory[key]++;
}
function getPairCount(id1, id2) { return pairingHistory[getPairKey(id1, id2)] || 0; }

function recordOpponent(id1, id2) {
    const key = getPairKey(id1, id2);
    if (!opponentHistory[key]) opponentHistory[key] = 0;
    opponentHistory[key]++;
}
function getOpponentCount(id1, id2) { return opponentHistory[getPairKey(id1, id2)] || 0; }

async function addPlayers() {
    const input = document.getElementById('new-players');
    const rawText = input.value.trim();
    if (!rawText) return;
    const names = rawText.split('\n').map(n => n.trim()).filter(n => n);
    const uniqueNames = [...new Set(names)];

    let maxGamesInSystem = 0;
    players.forEach(p => {
        if((p.todayGames || 0) > maxGamesInSystem) maxGamesInSystem = (p.todayGames || 0);
    });

    for (let name of uniqueNames) {
        let cleanName = name.replace(/^[\d]+\.[\s]*/, '');
        if (!cleanName) continue;

        let joinTime = Date.now();
        let isFastPass = false;

        if (maxGamesInSystem > 2) {
            joinTime = Date.now() - (60 * 60 * 1000);
            isFastPass = true;
        }

        let profile = {
            id: Date.now() + Math.random(),
            name: cleanName,
            level: 'BG',
            gender: 'M',
            gamesPlayed: 0,
            wins: 0,
            todayGames: 0,
            todayWins: 0,
            status: 'waiting',
            joinedQueueAt: joinTime,
            bookingId: null,
            winStreak: 0,
            sessionGames: 0,
            isFastPass: isFastPass,
            checkInTime: new Date().toISOString(),
            isResting: false,
            mmr: 100
        };

        if (typeof db !== 'undefined') {
            try {
                const doc = await db.collection('players_profile').doc(cleanName).get();
                if (doc.exists) {
                    const cloudData = doc.data();
                    profile.level = cloudData.level || 'BG';
                    profile.avatarUrl = cloudData.avatarUrl || null;
                    profile.gender = cloudData.gender || 'M';
                    profile.gamesPlayed = cloudData.gamesPlayed || 0;
                    profile.wins = cloudData.wins || 0;
                    profile.mmr = typeof cloudData.mmr !== 'undefined' ? cloudData.mmr : 100;
                    console.log(`🎯 ดึงโปรไฟล์ ${cleanName} จาก Cloud สำเร็จ`);
                } else {
                    await db.collection('players_profile').doc(cleanName).set({
                        name: cleanName,
                        level: 'BG',
                        gender: 'M',
                        gamesPlayed: 0,
                        wins: 0,
                        mmr: 100
                    });
                    console.log(`🆕 สร้างโปรไฟล์ใหม่ให้ ${cleanName} ลง Cloud`);
                }
            } catch (err) {
                console.error("Firebase Profile Error:", err);
            }
        }
        players.push(profile);
    }
    input.value = '';
    updateQueueDisplay();
    triggerSave();
}

const removePlayer = (id) => {
    const p = players.find(x => x.id === id);
    if (!p) return;
    if(p.status === 'playing') { alert('เล่นอยู่ ลบไม่ได้ครับ'); return; }

    if (p.bookingId) {
        const others = players.filter(x => x.bookingId === p.bookingId && x.id !== id);
        if (others.length > 0) {
            if(!confirm(`⚠️ ${p.name} ติดจองอยู่ ลบทั้งกลุ่มไหม?`)) return;
            players.forEach(x => {
                if(x.bookingId === p.bookingId) { x.bookingId = null; x.bookingTeam = null; }
            });
        }
    } else {
        if(!confirm(`ต้องการลบ ${p.name} ใช่ไหม?`)) return;
    }
    players = players.filter(p => p.id !== id);
    updateQueueDisplay();
    triggerSave();
};

function resetStatsOnly() {
    if(!confirm('รีเซ็ตสถิติ? (สำหรับเริ่มเซสชันใหม่)')) return;
    players.forEach(p => {
        p.todayGames = 0;
        p.todayWins = 0;
        p.sessionGames = 0;

        p.status = 'waiting';
        p.joinedQueueAt = Date.now();
        p.bookingId = null;
        p.isFastPass = false;
    });
    pairingHistory = {}; opponentHistory = {}; matchLogs = [];
    roundCounter = 0; lastTeammateRound = {};
    renderMatchLog(); resetCourtsState(); updateQueueDisplay();
}

function resetAll() {
    if(!confirm('⚠️ ล้างข้อมูลทั้งหมดใช่ไหม?')) return;
    if(!confirm('⚠️ ยืนยันครั้งที่ 2?')) return;
    players = []; pairingHistory = {}; opponentHistory = {}; matchLogs = [];
    roundCounter = 0; lastTeammateRound = {};
    courts.forEach(c => { clearInterval(c.interval); c.players = []; c.state = 'empty'; c.timer = 0; });
    localStorage.removeItem(STORAGE_KEY);
    renderMatchLog(); renderCourts(); updateQueueDisplay();
}

function resetCourtsState() {
    courts.forEach(c => {
        clearInterval(c.interval);
        c.players = []; c.state = 'empty'; c.timer = 0; c.isOpened = false; c.autoStartTarget = null;
    });
    renderCourts();
}

// Stops every court WITHOUT recording a finished game — used when ending the
// session for the day, since a court still "playing" (or stuck at the
// "who won?" popup) hasn't actually finished and shouldn't count as a scored
// match, get MMR changes, or be left marked "playing" in Firebase forever.
function stopAllCourtsWithoutScoring() {
    // If the "who won?" popup is open, stopGame() already added this game to
    // everyone's count in anticipation of picking a winner — undo that first,
    // the same way "↩ ยกเลิก (กดผิด)" would.
    if (activeGameResolveCourtId !== null) {
        const pendingCourt = courts[activeGameResolveCourtId];
        pendingCourt.players.forEach(p => {
            const pl = players.find(x => x.id === p.id);
            if (pl) {
                pl.gamesPlayed = Math.max(0, pl.gamesPlayed - 1);
                pl.sessionGames = Math.max(0, pl.sessionGames - 1);
                pl.todayGames = Math.max(0, (pl.todayGames || 0) - 1);
            }
        });
        const modal = document.getElementById('winner-modal');
        if (modal) modal.style.display = 'none';
        activeGameResolveCourtId = null;
    }

    courts.forEach(c => {
        clearInterval(c.interval);
        c.players.forEach(p => { if (p) sendToQueue(p.id); });
        c.players = [];
        c.state = 'empty';
        c.timer = 0;
        c.gameStartTime = null;
        c.isOpened = false;
        c.autoStartTarget = null;
    });
    renderCourts();
}

function updateCourts(change) {
    const newCount = courtCount + change;
    if (newCount < 1) return;
    courtCount = newCount;
    document.getElementById('court-count').innerText = courtCount;
    document.getElementById('calc-court-count').value = courtCount;
    updateCustomHoursInputs();
    renderCourts();
}

function setCourtRule(courtIdx, newRule) {
    courts[courtIdx].rule = newRule;
    renderCourts();
    updateQueueDisplay();
    triggerSave();
}
function toggleRankFilter(idx) {
    courts[idx].isRankFilterOn = !courts[idx].isRankFilterOn;
    renderCourts(); triggerSave();
}

function setCourtRankMin(idx, val) {
    courts[idx].minRank = val;
    renderCourts(); triggerSave();
}

function setCourtRankMax(idx, val) {
    courts[idx].maxRank = val;
    renderCourts(); triggerSave();
}

// ==========================================
// 🏟️ Court rendering — UNCHANGED from your original, on purpose.
// ==========================================
function renderCourts() {
    const container = document.getElementById('courts-container');
    if (courts.length < courtCount) {
        for (let i = courts.length; i < courtCount; i++) {
            courts.push({ id: i, players: [], state: 'empty', timer: 0, interval: null, isOpened: false, autoStartTarget: null, rule: 'normal', isRankFilterOn: false, minRank: 'BG', maxRank: 'P' });
        }
    } else if (courts.length > courtCount) {
        const removed = courts.pop();
        if (removed.players.length > 0) {
            removed.players.forEach(p => {
                const pl = players.find(x => x.id === p.id);
                if(pl) { pl.status = 'waiting'; pl.joinedQueueAt = Date.now(); pl.sessionGames = 0; }
            });
        }
    }
    container.innerHTML = '';
    courts.forEach((court, index) => {
        if (!court.rule) court.rule = 'normal';
        if (typeof court.isRankFilterOn === 'undefined') court.isRankFilterOn = false;
        if (!court.minRank) court.minRank = 'BG';
        if (!court.maxRank) court.maxRank = 'P';

        let overlayHTML = '';
        if (court.state === 'post_game') {
            overlayHTML = `<div class="court-overlay"><button class="btn-overlay btn-call" onclick="triggerFill(${index})">📢 เรียกคนลง</button><button class="btn-overlay btn-rest" onclick="closeAndRest(${index})">🔴 พักคอร์ท</button></div>`;
        } else if (!court.isOpened) {
            overlayHTML = `<div class="court-overlay"><button class="btn-overlay btn-open" onclick="openCourt(${index})">🔔 เปิดสนาม</button></div>`;
        }
        const displayName = court.customName || `#${index + 1}`;

        const rankOptions = RANK_LEVELS.map(r => `<option value="${r}">${r}</option>`).join('');
        const rankFilterHTML = `
            <div class="rank-filter-container" onclick="event.stopPropagation()">
                <input type="checkbox" class="rank-checkbox" ${court.isRankFilterOn ? 'checked' : ''} onchange="toggleRankFilter(${index})" title="บังคับ Rank">
                <span style="font-weight:bold; color:${court.isRankFilterOn ? '#c0392b' : '#aaa'};">Rank</span>
                <select class="rank-select" onchange="setCourtRankMin(${index}, this.value)" ${!court.isRankFilterOn?'disabled':''}>${RANK_LEVELS.map(r => `<option value="${r}" ${court.minRank===r?'selected':''}>${r}</option>`).join('')}</select>
                to
                <select class="rank-select" onchange="setCourtRankMax(${index}, this.value)" ${!court.isRankFilterOn?'disabled':''}>${RANK_LEVELS.map(r => `<option value="${r}" ${court.maxRank===r?'selected':''}>${r}</option>`).join('')}</select>
            </div>
        `;

        const ruleSelectHTML = `
            <select class="court-rule-select" onchange="setCourtRule(${index}, this.value)" onclick="event.stopPropagation()">
                <option value="normal" ${court.rule === 'normal' ? 'selected' : ''}>⛔ ออกหมด</option>
                <option value="winner_stay" ${court.rule === 'winner_stay' ? 'selected' : ''}>👑 ครบ 2 เด้ง</option>
            </select>`;

        container.innerHTML += `
            <div class="court ${court.state === 'playing' ? 'is-playing' : ''}" id="court-${index}">
              <div class="court-header">
                <span onclick="editCourtName(${index})" style="cursor:pointer; white-space:nowrap;">${displayName} ✏️</span>
                ${rankFilterHTML}
                ${ruleSelectHTML}
              </div>

              <div class="court-surface" style="position: relative;">
                <div class="court-net"></div>
                <div class="court-center-h"></div>
                <div class="court-vs-badge">VS</div>
                <div class="team team-pink">${renderPlayerOnCourt(court.players[0], index, 0)}${renderPlayerOnCourt(court.players[1], index, 1)}</div>
                <div class="team team-blue">${renderPlayerOnCourt(court.players[2], index, 2)}${renderPlayerOnCourt(court.players[3], index, 3)}</div>
                ${overlayHTML}
              </div>

              <div class="court-footer">
                <div class="timer" id="timer-${index}">${formatTime(court.timer)}</div>${renderCourtButtons(court, index)}
              </div>
            </div>`;
    });
    updateQueueDisplay();
    updateDashboard();
    updateHeaderStats();
}

function updateHeaderStats() {
    const courtStatusEl = document.getElementById('header-court-status');
    const queueCountEl = document.getElementById('header-queue-count');
    const completedCountEl = document.getElementById('header-completed-count');
    if (!courtStatusEl) return;
    const activeCourts = courts.filter(c => c.state === 'playing').length;
    courtStatusEl.innerText = `${activeCourts} กำลังแข่ง / ${courts.length} คอร์ททั้งหมด`;
    queueCountEl.innerText = `${players.filter(p => p.status === 'waiting').length} คน`;
    completedCountEl.innerText = `${matchLogs.length} แมตช์`;
}

function openCourt(idx) { courts[idx].isOpened = true; renderCourts(); }
function triggerFill(idx) { courts[idx].state = 'empty'; renderCourts(); }
function closeAndRest(idx) {
    courts[idx].players.forEach(p => sendToQueue(p.id));
    courts[idx].players = []; courts[idx].state = 'empty'; courts[idx].isOpened = false; courts[idx].timer = 0;
    renderCourts();
}

function renderPlayerOnCourt(player, courtIdx, slotIdx) {
    if (!player) return `<div class="court-slot empty" onclick="openManualAddModal(${courtIdx})" title="จิ้มเพื่อเลือกคนลง">+ ว่าง</div>`;

    const pl = players.find(x => x.id === player.id) || player;

    const rule = courts[courtIdx].rule || 'normal';
    let badge = (rule === 'winner_stay') ? `<span class="quota-badge" style="background:${pl.sessionGames >= 1 ? '#e67e22' : '#27ae60'}">G: ${pl.sessionGames + 1}/2</span>` : '';
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(pl.name)}&background=random&color=fff`;
    const avatarImg = pl.avatarUrl ? pl.avatarUrl : defaultAvatar;

    return `<div class="player-on-court court-slot" title="เปลี่ยนตัว" onclick="kickPlayer(${courtIdx}, ${slotIdx})">
        <div class="court-slot-avatar"><img src="${avatarImg}"></div>
        <div class="court-slot-info">
            <div class="court-slot-name">${sanitizeHTML(pl.name)}</div>
            <div class="court-slot-meta"><span>${pl.todayGames || 0}P</span>${badge}</div>
        </div>
    </div>`;
}

function renderCourtButtons(court, idx) {
    if (!court.isOpened || court.state === 'post_game') return `<button class="secondary" style="width:100%;" disabled>...</button>`;
    if (court.state === 'playing') return `<button class="danger" style="width:100%;" onclick="stopGame(${idx})">จบเกม</button>`;

    const realCount = countRealPlayers(court);
    if (realCount === 4) {
        if (court.autoStartTarget) {
            const remaining = Math.ceil((court.autoStartTarget - Date.now()) / 1000);
            if (remaining > 0) return `<button class="success btn-auto-start" style="width:100%;" onclick="startGame(${idx})">เริ่ม (Auto ${remaining}s)</button>`;
        }
        return `<button class="success" style="width:100%;" onclick="startGame(${idx})">เริ่มเกม</button>`;
    }
    const waiting = players.filter(p => p.status === 'waiting').sort((a,b) => a.joinedQueueAt - b.joinedQueueAt);
    const head = waiting.length > 0 ? waiting[0] : null;
    const needed = 4 - realCount;
    let isBookingPair = false, isBookingFour = false, bookingSize = 0;

    if (head && head.bookingId) {
        const group = players.filter(p => p.bookingId === head.bookingId && p.status === 'waiting');
        bookingSize = group.length;
        if (bookingSize <= needed) {
            if (bookingSize === 2) isBookingPair = true;
            if (bookingSize === 4) isBookingFour = true;
        }
    }
    const disabledStyle = "background:#e2e8f0; color:#94a3b8; cursor:not-allowed; box-shadow:none;";
    const activePairStyle = "background:#a855f7; color:white;";
    const activeFourStyle = "background:#7e22ce; color:white;";

    return `
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
            <div style="display:flex; gap:4px;">
                <button class="secondary" style="flex:1; font-size:0.85em; padding:6px;" onclick="fillCourtSmart(${idx})">🎲 สุ่ม</button>
                <button class="dark" style="flex:1; font-size:0.85em; padding:6px;" onclick="fillCourtQueue(${idx})">⏩ ตามคิว</button>
            </div>
            <div style="display:flex; gap:4px;">
                <button style="flex:1; font-size:0.78em; padding:5px; border-radius:10px; ${isBookingPair ? activePairStyle : disabledStyle}" ${isBookingPair ? `onclick="fillCourtSmart(${idx})"` : 'disabled'}>👥 จองคู่ ${isBookingPair ? '✅' : ''}</button>
                <button style="flex:1; font-size:0.78em; padding:5px; border-radius:10px; ${isBookingFour ? activeFourStyle : disabledStyle}" ${isBookingFour ? `onclick="fillCourtSmart(${idx})"` : 'disabled'}>⚔️ จอง 4 ${isBookingFour ? '✅' : ''}</button>
            </div>
        </div>`;
}

const autoFillCourts = () => {
    courts.forEach((court, idx) => {
        if (!court.isOpened || court.state === 'playing' || court.state === 'post_game') return;
        if (countRealPlayers(court) === 4) {
            if (!court.autoStartTarget) {
                court.autoStartTarget = Date.now() + (AUTO_START_DELAY * 1000);
                renderCourts();
            } else if (Date.now() >= court.autoStartTarget) {
                startGame(idx);
            } else {
                const btn = document.querySelector(`#court-${idx} .btn-auto-start`);
                if (btn) btn.innerHTML = `เริ่ม (Auto ${Math.ceil((court.autoStartTarget - Date.now()) / 1000)}s)`;
            }
        } else {
             court.autoStartTarget = null;
        }
    });
};

// ==========================================
// 🎲 Smart fill — now cooldown-aware for All-Out mode
// ==========================================
const fillCourtSmart = (courtIdx) => {
    const court = courts[courtIdx];
    const existingPlayers = court.players.filter(p => p !== null && p !== undefined);
    const needed = 4 - existingPlayers.length;
    const waiting = players.filter(p => p.status === 'waiting' && !p.isResting && !p.bookingId).sort((a, b) => a.joinedQueueAt - b.joinedQueueAt);
    const headOfQueue = waiting.length > 0 ? waiting[0] : null;

    let rankFilter = null;
    if (court.isRankFilterOn) {
        rankFilter = { min: court.minRank || 'BG', max: court.maxRank || 'P' };
    }

    // Cooldown logic only applies to All-Out mode filling a fully empty court
    const useCooldown = (court.rule !== 'winner_stay' && needed === 4 && existingPlayers.length === 0);

    let candidates = getSmartDraft(needed, new Set(), existingPlayers, false, rankFilter, useCooldown);
    if (candidates.length === 0 && waiting.length >= needed) {
        candidates = getSmartDraft(needed, new Set(), existingPlayers, true, rankFilter, useCooldown);
    }

    if (candidates.length === 0) {
        alert('❌ คนในคิว (ที่ตรงตามเงื่อนไข Rank) ไม่พอครับ');
        return;
    }

    if (candidates.length === 4) candidates = autoBalanceTeam(candidates);

    // Anti-starvation skip tracking for the head of queue
    if (headOfQueue) {
        const isHeadPicked = candidates.some(c => c.id === headOfQueue.id);
        if (!isHeadPicked) {
            if (!headOfQueue._unresolvedSkip) {
                headOfQueue.skipCount = (headOfQueue.skipCount || 0) + 1;
            }
        } else {
            headOfQueue.skipCount = 0;
        }
        headOfQueue._unresolvedSkip = false;
    }

    if (useCooldown) {
        const violations = getCooldownViolations(candidates);
        // Only ask for confirmation if there WAS another option — with exactly
        // `needed` people waiting, there's no alternative combination anyway.
        if (violations.length > 0 && waiting.length > needed) {
            showCooldownConfirm(courtIdx, candidates, violations);
            return; // wait for the user's Yes/No
        }
    }

    assignTeamToCourt(courtIdx, candidates);
};

function assignTeamToCourt(courtIdx, candidates) {
    const court = courts[courtIdx];
    candidates.forEach(p => {
        p.status = 'playing'; p.sessionGames = 0;
        if (p.isFastPass) p.isFastPass = false;
        p.bookingId = null; p.bookingTeam = null;
        addPlayerToCourt(court, p);
    });
    renderCourts();
    triggerSave();
}

let pendingCooldownTeam = null;

function showCooldownConfirm(courtIdx, team, violations) {
    pendingCooldownTeam = { courtIdx, team };
    const t1 = [team[0], team[1]];
    const t2 = [team[2], team[3]];

    const seen = new Set();
    let msgLines = [];
    violations.forEach(v => {
        const key = v.a.id < v.b.id ? `${v.a.id}-${v.b.id}` : `${v.b.id}-${v.a.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        const pc = getPairCount(v.a.id, v.b.id);
        const oc = getOpponentCount(v.a.id, v.b.id);
        msgLines.push(`${sanitizeHTML(v.a.name)} เจอกับ ${sanitizeHTML(v.b.name)}: จับคู่มาแล้ว ${pc} ครั้ง, เจอกันเป็นคู่แข่ง ${oc} ครั้ง`);
    });

    let overlay = document.getElementById('cooldown-confirm-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'cooldown-confirm-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div style="background:white;padding:22px;border-radius:16px;width:340px;max-width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 10px;color:#2c3e50;">⚠️ หาคอมโบที่เลี่ยงคนหน้าเดิมไม่ได้ครบ</h3>
            <p style="font-size:0.85em;color:#555;">${msgLines.join('<br>')}</p>
            <div style="display:flex;gap:8px;margin:14px 0;">
                <div style="flex:1;background:#ffebee;border-radius:8px;padding:8px;text-align:center;">
                    <div style="font-weight:bold;color:#c62828;">${sanitizeHTML(t1[0].name)}</div>
                    <div style="font-weight:bold;color:#c62828;">${sanitizeHTML(t1[1].name)}</div>
                </div>
                <div style="align-self:center;font-weight:bold;">VS</div>
                <div style="flex:1;background:#e3f2fd;border-radius:8px;padding:8px;text-align:center;">
                    <div style="font-weight:bold;color:#1565c0;">${sanitizeHTML(t2[0].name)}</div>
                    <div style="font-weight:bold;color:#1565c0;">${sanitizeHTML(t2[1].name)}</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="resolveCooldownConfirm(false)" style="flex:1;padding:10px;border-radius:8px;border:none;background:#e0e0e0;cursor:pointer;">❌ No</button>
                <button onclick="resolveCooldownConfirm(true)" style="flex:1;padding:10px;border-radius:8px;border:none;background:#27ae60;color:white;cursor:pointer;">✅ Yes</button>
            </div>
        </div>`;
    overlay.style.display = 'flex';
}

function resolveCooldownConfirm(accepted) {
    const overlay = document.getElementById('cooldown-confirm-overlay');
    if (overlay) overlay.style.display = 'none';
    if (!pendingCooldownTeam) return;
    const { courtIdx, team } = pendingCooldownTeam;
    pendingCooldownTeam = null;
    if (accepted) {
        assignTeamToCourt(courtIdx, team);
    }
    // "No" does nothing to player state — they were never removed from the
    // queue, so they stay exactly where they were (top of queue).
    renderCourts(); updateQueueDisplay();
}

const fillCourtQueue = (courtIdx) => {
    const court = courts[courtIdx];
    const needed = 4 - countRealPlayers(court);
    const waiting = players.filter(p => p.status === 'waiting'&& !p.isResting).sort((a, b) => a.joinedQueueAt - b.joinedQueueAt);

    if (waiting.length === 0) { alert('ไม่มีคนรอคิวครับ'); return; }
    const firstP = waiting[0];
    let candidates = [];

    if (firstP.bookingId) {
        const group = waiting.filter(p => p.bookingId === firstP.bookingId);
        group.sort((a, b) => (a.bookingTeam || 0) - (b.bookingTeam || 0));
        if (group.length > needed) { alert(`⚠️ ลงไม่ได้! ติด Booking`); return; }
        candidates = group;
    } else {
        for (let i = 0; i < waiting.length; i++) {
            if (candidates.length >= needed) break;
            const p = waiting[i];
            if (p.bookingId) break;
            candidates.push(p);
        }
    }

    if (candidates.length > 0) {
        if (candidates.length === 4) candidates = autoBalanceTeam(candidates);
        candidates.forEach(p => {
            p.status = 'playing'; p.sessionGames = 0;
            if(p.isFastPass) p.isFastPass = false;
            addPlayerToCourt(court, p);
        });
        renderCourts();
    }
};


function startGame(courtIdx) {
    const court = courts[courtIdx];
    court.state = 'playing'; court.gameStartTime = Date.now(); court.timer = 0; court.autoStartTarget = null;
    if(court.players[0] && court.players[1]) recordPairing(court.players[0].id, court.players[1].id);
    if(court.players[2] && court.players[3]) recordPairing(court.players[2].id, court.players[3].id);
    const p0 = court.players[0]; const p1 = court.players[1];
    const p2 = court.players[2]; const p3 = court.players[3];
    if (p0 && p2) recordOpponent(p0.id, p2.id); if (p0 && p3) recordOpponent(p0.id, p3.id);
    if (p1 && p2) recordOpponent(p1.id, p2.id); if (p1 && p3) recordOpponent(p1.id, p3.id);

    // 🔄 Cooldown tracking — only meaningful for All-Out mode
    if (court.rule !== 'winner_stay') {
        roundCounter++;
        if (p0 && p1) lastTeammateRound[getPairKey(p0.id, p1.id)] = roundCounter;
        if (p2 && p3) lastTeammateRound[getPairKey(p2.id, p3.id)] = roundCounter;
    }

    renderCourts(); triggerSave();
}

function stopGame(courtIdx) {
    const court = courts[courtIdx]; clearInterval(court.interval);
    court.players.forEach(p => { const pl = players.find(x => x.id === p.id);
                                if(pl) {    pl.gamesPlayed++;
                                            pl.sessionGames++;
                                            pl.todayGames = (pl.todayGames || 0) + 1;} });
    activeGameResolveCourtId = courtIdx; document.getElementById('winner-modal').style.display = 'flex';
}

function cancelStopGame() {
    const court = courts[activeGameResolveCourtId];
    court.players.forEach(p => { const pl = players.find(x => x.id === p.id);
                                if(pl) {pl.gamesPlayed--;
                                        pl.sessionGames--;
                                        pl.todayGames = Math.max(0, (pl.todayGames || 0) - 1);} });
    court.interval = setInterval(() => { court.timer++; document.getElementById(`timer-${activeGameResolveCourtId}`).innerText = formatTime(court.timer); }, 1000);
    document.getElementById('winner-modal').style.display = 'none'; activeGameResolveCourtId = null; renderCourts();
}

function resolveGame(winningTeamIdx) {
    const court = courts[activeGameResolveCourtId];
    document.getElementById('winner-modal').style.display = 'none';

    if (winningTeamIdx === -1) {
        court.players.forEach(p => sendToQueue(p.id));
        court.players = []; court.state = 'post_game';
    } else {
        const t1 = [court.players[0], court.players[1]];
        const t2 = [court.players[2], court.players[3]];
        let winners = (winningTeamIdx === 0) ? t1 : t2;
        let losers = (winningTeamIdx === 0) ? t2 : t1;

        if (court.gameStartTime) {
            const durationMs = Date.now() - court.gameStartTime;
            const durationMins = Math.round(durationMs / 60000);
            if (durationMins >= 2) {
                completedGameTimes.push(durationMins);
                if (completedGameTimes.length > 5) completedGameTimes.shift();
            }
        }

        const newLog = {
            time: new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}),
            court: activeGameResolveCourtId+1,
            winners: winners.map(p=>sanitizeHTML(p.name)).join(', '),
            losers: losers.map(p=>sanitizeHTML(p.name)).join(', '),
            duration: formatTime(court.timer),
        };
        matchLogs.unshift(newLog);

        court.gameStartTime = null;
        renderMatchLog();
       // -----------------------------------------
        // ⚖️ ระบบคำนวณแต้ม MMR แบบ Elo Rating
        // -----------------------------------------
        const getAvgMMR = (team) => {
            if (team.length === 0) return 100;
            let sum = 0, count = 0;
            team.forEach(p => {
                const pl = players.find(x => x.id === p.id);
                if(pl) { sum += (pl.mmr !== undefined ? pl.mmr : 100); count++; }
            });
            return count > 0 ? sum / count : 100;
        };

        const t1AvgMMR = getAvgMMR(t1);
        const t2AvgMMR = getAvgMMR(t2);

        const K = 40;
        const winnerAvgMMR = (winningTeamIdx === 0) ? t1AvgMMR : t2AvgMMR;
        const loserAvgMMR = (winningTeamIdx === 0) ? t2AvgMMR : t1AvgMMR;

        const expectedWinProb = 1 / (1 + Math.pow(10, (loserAvgMMR - winnerAvgMMR) / 400));

       let mmrChange = Math.round(K * (1 - expectedWinProb));
        const winnerGain = Math.max(5, mmrChange);
        const loserDrop = mmrChange;

        console.log(`⚖️ [Elo] ชนะได้: +${winnerGain} | แพ้เสีย: -${loserDrop}`);

        winners.forEach(p => {
            const pl = players.find(x => x.id === p.id);
            if(pl) {
                pl.wins++; pl.winStreak = (pl.winStreak || 0) + 1; pl.todayWins = (pl.todayWins || 0) + 1;
                pl.mmr = (pl.mmr !== undefined ? pl.mmr : 100) + winnerGain;
                savePlayerProfileToCloud(pl);
            }
        });

        losers.forEach(p => {
            const pl = players.find(x => x.id === p.id);
            if(pl) {
                pl.winStreak = 0;
                pl.mmr = (pl.mmr !== undefined ? pl.mmr : 100) - loserDrop;
                if (pl.mmr < 0) pl.mmr = 0;
                savePlayerProfileToCloud(pl);
            }
        });
        // -----------------------------------------

        let stayers = [], leavers = [];
        const rule = court.rule || 'normal';

        if (rule === 'normal') {
            leavers.push(...t1, ...t2);
        } else if (rule === 'winner_stay') {
            const hasVeteran = court.players.some(p => {
                const pl = players.find(x => x.id === p.id);
                return pl && pl.sessionGames >= 2;
            });

            if (!hasVeteran) {
                if (winningTeamIdx === 0) {
                    stayers.push(...t1); leavers.push(...t2);
                } else {
                    stayers.push(...t2); leavers.push(...t1);
                }
            } else {
                court.players.forEach(p => {
                    const pl = players.find(x => x.id === p.id);
                    if (pl && pl.sessionGames >= 2) {
                        leavers.push(p);
                    } else {
                        stayers.push(p);
                    }
                });
            }
        }
        leavers.forEach(p => sendToQueue(p.id));
        court.players = [...stayers];
        court.state = 'post_game';
    }
    court.timer = 0;
    renderCourts();
    triggerSave();
}

function sendToQueue(playerId) {
  const pl = players.find(x => x.id === playerId);
   if(pl) { pl.status = 'waiting'; pl.joinedQueueAt = Date.now(); pl.sessionGames = 0; pl.lastFinishedAt = Date.now(); }
}

const kickPlayer = (courtIdx, slotIdx) => {
    const court = courts[courtIdx]; const player = court.players[slotIdx];
    if (!player) return;
    if (!confirm(`ต้องการเปลี่ยนตัว ${player.name} ออกใช่ไหม?`)) return;
    sendToQueue(player.id);
    court.players[slotIdx] = null;
    if (court.state === 'playing') { clearInterval(court.interval); court.state = 'empty'; }
    court.autoStartTarget = null;
    renderCourts();
};

function renderMatchLog() {
    const tbody = document.getElementById('match-log-body');
    if (matchLogs.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="color:gray;">-</td></tr>'; return; }
    tbody.innerHTML = matchLogs.map(log => `<tr><td>${log.time}</td><td>${log.court}</td><td class="log-winner">${log.winners}</td><td class="log-loser">${log.losers}</td><td>${log.duration}</td></tr>`).join('');
}

function updateDashboard() {
    const tbody = document.getElementById('stats-body');
    const sortType = document.getElementById('sort-select').value;
    const scope = document.getElementById('scope-select') ? document.getElementById('scope-select').value : 'today';

    let sorted = [...players].sort((a, b) => {
        let valA = 0;
        let valB = 0;

        if (scope === 'today') {
            if (sortType === 'games_desc' || sortType === 'games_asc') {
                valA = a.todayGames || 0; valB = b.todayGames || 0;
            } else if (sortType === 'wins_desc') {
                valA = a.todayWins || 0; valB = b.todayWins || 0;
            }
        } else {
            if (sortType === 'games_desc' || sortType === 'games_asc') {
                valA = a.gamesPlayed || 0; valB = b.gamesPlayed || 0;
            } else if (sortType === 'wins_desc') {
                valA = a.wins || 0; valB = b.wins || 0;
            }
        }

        if (sortType === 'games_asc') return valA - valB;
        return valB - valA;
    });

    tbody.innerHTML = sorted.map((p, index) => {
        let rank = index + 1;
        let medal = (rank === 1) ? '🥇' : (rank === 2) ? '🥈' : (rank === 3) ? '🥉' : '';

        const displayGames = scope === 'today' ? (p.todayGames || 0) : (p.gamesPlayed || 0);
        const displayWins = scope === 'today' ? (p.todayWins || 0) : (p.wins || 0);
        const rate = displayGames > 0 ? Math.round((displayWins / displayGames) * 100) : 0;
        const lv = p.level || 'BG';
        const tierBadge = `<span class="tier-badge tier-${lv}">${lv}</span>`;

        let statusHTML = `<span class="status-pill status-resting">พัก</span>`;
        if (p.status === 'playing') statusHTML = `<span class="status-pill status-playing">🏸 แข่งอยู่</span>`;
        else if (p.status === 'waiting') statusHTML = p.isResting ? `<span class="status-pill status-resting">💤 พัก</span>` : `<span class="status-pill status-queue">⏳ รอคิว</span>`;

        return `<tr><td>${medal} ${rank}</td><td>${sanitizeHTML(p.name)}</td><td>${tierBadge}</td><td style="font-weight:bold; color:#2980b9;">${p.mmr || 0}</td><td>${displayGames}</td><td>${displayWins}</td><td>${rate}%</td><td>${statusHTML}</td></tr>`;
    }).join('');
}

function renderOverview(skipUpdateCost = false) {
    const statsBody = document.getElementById('overview-stats-body');
    const repeatBody = document.getElementById('overview-repeat-body');
    statsBody.innerHTML = players.map(p => {
        let time = p.checkInTime ? new Date(p.checkInTime).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : '-';
        let costShow = p.calculatedCost ? Math.ceil(p.calculatedCost) : 0;
        // ✅ FIX: was inserting p.name into innerHTML unescaped
        return `<tr><td style="text-align:left">${sanitizeHTML(p.name)}</td><td>${time}</td><td>${p.todayGames || 0}</td><td>${p.todayWins || 0}</td><td style="font-weight:bold; color:#27ae60;">${costShow} ฿</td></tr>`;
    }).join('');

    let repeats = [];
    for (const [key, count] of Object.entries(pairingHistory)) {
        if (count > 1) {
            const [id1, id2] = key.split('-');
            const p1 = players.find(p => p.id == id1); const p2 = players.find(p => p.id == id2);
            if (p1 && p2) repeats.push({ name: `${sanitizeHTML(p1.name)} + ${sanitizeHTML(p2.name)}`, count: count });
        }
    }
    repeats.sort((a, b) => b.count - a.count);
    repeatBody.innerHTML = repeats.length === 0 ? '<tr><td colspan="2" style="color:green;">ไม่มีคู่ซ้ำ</td></tr>' : repeats.map(s => `<tr><td style="text-align:left;">${s.name}</td><td style="color:#e65100; font-weight:bold;">${s.count}</td></tr>`).join('');
    if (!skipUpdateCost) updateCost();
}

let isCustomHours = false;
function toggleCustomHours() {
    isCustomHours = !isCustomHours;
    document.getElementById('custom-hours-area').style.display = isCustomHours ? 'block' : 'none';
    document.getElementById('std-hours-group').style.display = isCustomHours ? 'none' : 'flex';
    updateCustomHoursInputs(); updateCost();
}

function updateCustomHoursInputs() {
    const area = document.getElementById('custom-hours-area');
    area.innerHTML = '';
    for(let i=0; i<courtCount; i++) {
        area.innerHTML += `<div style="display:flex; justify-content:space-between; margin-bottom:5px;"><label>คอร์ท ${i+1}:</label><input type="number" class="court-hr-input" value="2" style="width:50px;" onchange="updateCost()"> ชม.</div>`;
    }
}

function updateCost() {
    const pricePerHr = parseFloat(document.getElementById('calc-court-price').value) || 0;
    let totalHours = 0;
    if (isCustomHours) document.querySelectorAll('.court-hr-input').forEach(inp => totalHours += parseFloat(inp.value) || 0);
    else totalHours = (parseFloat(document.getElementById('calc-hours').value) || 0) * (parseFloat(document.getElementById('calc-court-count').value) || 0);

    const shuttleTotal = (parseFloat(document.getElementById('calc-shuttle-price').value) || 0) / 12 * (parseFloat(document.getElementById('calc-shuttle-used').value) || 0);
    const grandTotal = (totalHours * pricePerHr) + shuttleTotal;
    document.getElementById('total-cost-display').innerText = grandTotal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});

    const now = new Date(); let totalMinutesAllPlayers = 0;
    players.forEach(p => {
        if (p.checkInTime) {
            const diffMs = now - new Date(p.checkInTime);
            p.minutesPresent = Math.max(1, Math.floor(diffMs / 60000));
        } else p.minutesPresent = 0;
        totalMinutesAllPlayers += p.minutesPresent;
    });
    players.forEach(p => {
        if (totalMinutesAllPlayers > 0 && grandTotal > 0) p.calculatedCost = (p.minutesPresent / totalMinutesAllPlayers) * grandTotal;
        else p.calculatedCost = 0;
    });
    renderOverview(true);
}

async function endSession() {
    const anyCourtActive = courts.some(c => countRealPlayers(c) > 0);
    if (anyCourtActive) {
        if (!confirm('⚠️ ยังมีคอร์ทที่เล่นอยู่! ถ้าจบตอนนี้ทุกคอร์ทจะถูกหยุดทันที (เกมที่ค้างอยู่จะไม่ถูกนับเป็นเกมที่จบ) ต้องการดำเนินการต่อไหม?')) return;
        stopAllCourtsWithoutScoring();
    }

    // Save right now instead of waiting for the usual debounced triggerSave()
    // — we're about to reload the page, so a delayed save would never fire.
    saveData();

    const element = document.getElementById("summary-capture-area");
    html2canvas(element).then(canvas => {
        const link = document.createElement('a');
        link.download = 'badminton-summary.png';
        link.href = canvas.toDataURL();
        link.click();
    });
    sessionStorage.removeItem('ROOM_ID');
    sessionStorage.removeItem('IS_HOST');
    localStorage.removeItem('BADMINTON_HISTORY_CACHE');
    alert("✅ จบการตีแบดวันนี้! ปิดระบบที่เครื่องนี้เรียบร้อย");
    window.location.reload();
}

let currentBookingType = '';
const openBookingModal = (type) => {
    currentBookingType = type;
    const candidates = players.filter(p => !p.bookingId && !p.isResting).sort((a,b) => a.joinedQueueAt - b.joinedQueueAt);
    const options = candidates.map(p => `<option value="${p.id}">${sanitizeHTML(p.name)}${p.status === 'playing' ? ' (กำลังเล่น)' : ''}</option>`).join('');
    let html = '';
    if (type === 'pair') {
        html += `<h4>👥 จองคู่</h4><label>คนแรก:</label><select id="b-p1" style="width:100%; margin-bottom:10px;">${options}</select><label>คนที่สอง:</label><select id="b-p2" style="width:100%; margin-bottom:10px;">${options}</select>`;
    } else {
        html += `<h4>⚔️ จอง 4</h4><strong style="color:#b71c1c;">T1:</strong><select id="b-p1" style="width:100%;">${options}</select><select id="b-p2" style="width:100%;">${options}</select><br><strong style="color:#0d47a1;">T2:</strong><select id="b-p3" style="width:100%;">${options}</select><select id="b-p4" style="width:100%;">${options}</select>`;
    }
    document.getElementById('booking-inputs').innerHTML = html;
    const actions = document.querySelector('#booking-modal .modal-actions');
    if (actions) { actions.style.display = 'flex'; actions.innerHTML = `<button class="secondary" onclick="closeModal('booking-modal')">ยกเลิก</button><button class="success" onclick="confirmBooking()">ยืนยัน</button>`; }
    document.getElementById('booking-modal').style.display = 'flex';
};

const confirmBooking = () => {
    const ids = [];
    if (currentBookingType === 'pair') {
        ids.push({id: document.getElementById('b-p1').value, team: 1});
        ids.push({id: document.getElementById('b-p2').value, team: 1});
    } else {
        ids.push({id: document.getElementById('b-p1').value, team: 1}); ids.push({id: document.getElementById('b-p2').value, team: 1});
        ids.push({id: document.getElementById('b-p3').value, team: 2}); ids.push({id: document.getElementById('b-p4').value, team: 2});
    }
    const unique = new Set(ids.map(x => x.id));
    if (unique.size !== ids.length) { alert('❌ ห้ามเลือกชื่อซ้ำ'); return; }
    const bId = 'book-' + (++bookingCounter);
    ids.forEach(x => { const p = players.find(pl => pl.id == x.id); if (p) { p.bookingId = bId; p.bookingTeam = x.team; } });
    closeModal('booking-modal'); updateQueueDisplay(); renderCourts(); triggerSave();
};

function updateQueueDisplay() {
    const list = document.getElementById('player-queue');
    const waiting = players.filter(p => p.status === 'waiting').sort((a, b) => a.joinedQueueAt - b.joinedQueueAt);
    document.getElementById('queue-count').innerText = waiting.length;

    list.innerHTML = waiting.map((p, index) => {
        const estimatedWaitMins = getWaitTimeForQueue(index);
        let badgeClass = 'wait-green'; let badgeText = `< ${estimatedWaitMins}m`;
        if (estimatedWaitMins > 20) { badgeClass = 'wait-red'; badgeText = `~${estimatedWaitMins}m`; }
        else if (estimatedWaitMins > 10) { badgeClass = 'wait-orange'; badgeText = `~${estimatedWaitMins}m`; }
        else if (estimatedWaitMins > 5) { badgeText = `~${estimatedWaitMins}m`; }
        else if (estimatedWaitMins > 0) { badgeText = `< ${estimatedWaitMins}m`; }
        else { badgeText = 'เร็วๆ นี้'; }

        const isSkipped = !p.isResting && (p.skipCount || 0) >= 1;
        const itemClass = p.isResting ? 'player-item resting' : `player-item ${p.bookingId ? 'booked' : ''} ${p.isFastPass ? 'fastpass' : ''} ${isSkipped ? 'skipped' : ''}`;
        const opacityStyle = p.isResting ? 'opacity: 0.6; background: #ddd;' : '';
        const namePrefix = p.isResting ? '💤 ' : (p.isFastPass ? '🚀 ' : '');
        const lv = p.level || 'BG';
        const tierBadge = `<span class="tier-badge tier-${lv}" onclick="toggleLevel(${p.id})" style="cursor:pointer;" title="คลิกเปลี่ยนระดับ">${lv}</span>`;

        const genderIcon = (p.gender === 'F') ? '👩' : '👨';
        const genderBadge = `<span onclick="toggleGender(${p.id})" style="cursor:pointer; font-size:1.1em; margin-right:5px; background:rgba(255,255,255,0.5); border-radius:50%; padding:0 2px;" title="คลิกสลับเพศ">${genderIcon}</span>`;

        const waitBadge = !p.isResting ? `<span class="wait-badge ${badgeClass}">${badgeText}</span>` : '<small style="color:gray;">(พัก)</small>';
        // Anti-starvation pity rule: this player is guaranteed the next seat.
        const skipAlertBadge = isSkipped ? `<span class="skip-alert-badge">🔥 ต้องได้ลงแล้ว!</span>` : '';
        const mmrLabel = `<span style="font-size:0.72em; color:#94a3b8; font-family:monospace;">MMR ${p.mmr || 100}</span>`;
        const indexBadge = `<span class="queue-index-badge">${index + 1}</span>`;

        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random&color=fff`;
        const avatarImg = p.avatarUrl ? p.avatarUrl : defaultAvatar;

        const safeName = sanitizeHTML(p.name);
        // ✅ FIX: name passed into the onclick is now URL-encoded, not the raw or
        // HTML-escaped name — a name containing a quote (e.g. "O'Brien") used to
        // break this onclick handler. showBigImage() decodes it back for display.
        const avatarHtml = `<img src="${avatarImg}" class="mini-avatar" style="margin-right: 5px; cursor: zoom-in;" onclick="event.stopPropagation(); showBigImage('${avatarImg}', '${encodeURIComponent(p.name)}')">`;

        return `<li class="${itemClass}" style="${opacityStyle}"><div class="player-info">${indexBadge}${!p.isResting ? tierBadge + genderBadge : ''}${avatarHtml}<strong>${namePrefix}${safeName}</strong>${p.bookingId ? `<small onclick="cancelBooking('${p.bookingId}')" style="cursor:pointer;">🔒</small>` : ''}${skipAlertBadge}${!p.isResting ? mmrLabel : ''}${waitBadge}</div><button class="mini-btn ${p.isResting ? 'success' : 'secondary'}" style="margin-right:5px;" onclick="toggleRest(${p.id})">${p.isResting ? 'ตื่น' : '💤'}</button><button class="mini-btn danger" onclick="removePlayer(${p.id})">×</button></li>`;
    }).join('');

    updateNextMatchPanel();
    updateHeaderStats();
}

function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

const cancelBooking = (bId) => {
    const group = players.filter(p => p.bookingId === bId);
    if(group.length === 0) return;
    if(!confirm(`ยกเลิกจองกลุ่มนี้?`)) return;
    players.forEach(p => { if(p.bookingId === bId) { p.bookingId = null; p.bookingTeam = null; } });
    updateQueueDisplay(); triggerSave();
};

const toggleRest = (id) => { const p = players.find(x => x.id === id); if (p) { p.isResting = !p.isResting; updateQueueDisplay(); renderCourts(); } };

let currentManualAddCourtIdx = null;
const openManualAddModal = (courtIdx) => {
    if (countRealPlayers(courts[courtIdx]) >= 4) { alert('สนามเต็มแล้วเพื่อน!'); return; }
    currentManualAddCourtIdx = courtIdx;
    const waiting = players.filter(p => p.status === 'waiting' && !p.isResting).sort((a,b) => a.joinedQueueAt - b.joinedQueueAt);
    if (waiting.length === 0) { alert('ไม่มีคนรอคิวเลยว่ะ!'); return; }
    let html = `<h4>👇 เลือกคนลง คอร์ท ${courtIdx + 1}</h4><div style="display:flex; flex-direction:column; gap:5px;">`;
    waiting.forEach(p => {
        let label = p.bookingId ? `🔒 ${sanitizeHTML(p.name)} (Team)` : sanitizeHTML(p.name);
        html += `<button class="secondary" style="text-align:left;" onclick="confirmManualAdd(${p.id})">${p.isFastPass?'🚀 ':''}${label}</button>`;
    });
    html += `</div>`;
    document.getElementById('booking-inputs').innerHTML = html;
    const modalActions = document.querySelector('#booking-modal .modal-actions');
    const oldActions = modalActions.innerHTML;
    modalActions.innerHTML = `<button class="secondary" onclick="closeModal('booking-modal'); restoreModal('${escape(oldActions)}');">ยกเลิก</button>`;
    document.getElementById('booking-modal').style.display = 'flex';
};

window.restoreModal = (oldContent) => { document.querySelector('#booking-modal .modal-actions').innerHTML = unescape(oldContent); };

const confirmManualAdd = (playerId) => {
    const court = courts[currentManualAddCourtIdx];
    const p = players.find(x => x.id === playerId);
    if (!p) return;
    if (countRealPlayers(court) >= 4) { alert('ช้าไป! สนามเต็มแล้ว'); return; }
    p.status = 'playing'; p.sessionGames = 0; if(p.isFastPass) p.isFastPass = false;
    p.bookingId = null; p.bookingTeam = null;
    addPlayerToCourt(court, p);
    closeModal('booking-modal');
    const actions = document.querySelector('#booking-modal .modal-actions');
    if (actions) actions.innerHTML = `<button class="secondary" onclick="closeModal('booking-modal')">ยกเลิก</button><button class="success" onclick="confirmBooking()">ยืนยัน</button>`;
    renderCourts();
};

function updateNextMatchPanel() {
    const container = document.getElementById('next-match-list');
    if (!container) return;
    const ruleEl = document.getElementById('game-rule');
    const rule = ruleEl ? ruleEl.value : 'normal';
    const needed = (rule === 'winner_stay') ? 2 : 4;
    let html = ''; let excludeIds = new Set();
    const matchesToShow = Math.min(courtCount, 4);

    for (let i = 0; i < matchesToShow; i++) {
        const candidates = getSmartDraft(needed, excludeIds);
        if (candidates.length < needed) {
            if (i === 0) html += `<div style="text-align:center; width:100%; color: #ccc;">⏳ รอคนครบทีม ...</div>`;
            break;
        }
        candidates.forEach(p => excludeIds.add(p.id));
        const nameTag = (p) => `${p.isFastPass ? '🚀' : ''}${p.bookingId ? '🔒' : ''}${sanitizeHTML(p.name)}`;
        html += `<div style="background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2);">
            <div style="font-size:0.72em; color:#cbd5e1; margin-bottom:3px;">📢 Match ${i + 1}</div>
            <div class="next-match-chip">`;
        if (needed === 4) {
            html += `<span class="side-a">${nameTag(candidates[0])} & ${nameTag(candidates[1])}</span><span class="vs-tag">VS</span><span class="side-b">${nameTag(candidates[2])} & ${nameTag(candidates[3])}</span>`;
        } else {
            html += `<span class="side-a">${nameTag(candidates[0])} & ${nameTag(candidates[1])}</span>`;
        }
        html += `</div></div>`;
    }
    container.innerHTML = html;
}

function editCourtName(idx) {
    const currentName = courts[idx].customName || `#${idx + 1}`;
    const newName = prompt(`ตั้งชื่อคอร์ทที่ ${idx + 1} ใหม่`, currentName);
    if (newName && newName.trim() !== "") { courts[idx].customName = newName.trim(); renderCourts(); }
}

function getAverageGameTime() {
    if (completedGameTimes.length === 0) return DEFAULT_GAME_TIME;
    const sum = completedGameTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / completedGameTimes.length);
}

function getWaitTimeForQueue(queueIndex) {
    const avgTime = getAverageGameTime();
    const now = Date.now();
    const gameRuleSelect = document.getElementById('game-rule');
    const isWinnerStay = gameRuleSelect && (gameRuleSelect.value.includes('2') || gameRuleSelect.value.includes('stay'));
    const spotsPerCourt = isWinnerStay ? 2 : 4;
    let availableSlots = [];

    courts.forEach(c => {
        const rule = c.rule || 'normal';
        const isWinnerStay = (rule === 'winner_stay');
        const spots = isWinnerStay ? 2 : 4;
        let freeAt = now;
        if (c.gameStartTime) {
            let expected = c.gameStartTime + (avgTime * 60000);
            if (expected < now) expected = now + 30000;
            freeAt = expected;
        }
        for (let k = 0; k < spots; k++) availableSlots.push(freeAt);
    });
    availableSlots.sort((a, b) => a - b);

    if (queueIndex < availableSlots.length) {
        const mySlotTime = availableSlots[queueIndex];
        return Math.max(0, Math.round((mySlotTime - now) / 60000));
    } else {
        const totalCapacity = availableSlots.length || 4;
        const cycles = Math.floor(queueIndex / totalCapacity);
        const remainder = queueIndex % totalCapacity;
        const baseSlotTime = availableSlots[remainder] || now;
        const waitMs = (baseSlotTime - now) + (cycles * avgTime * 60000);
        return Math.max(0, Math.round(waitMs / 60000));
    }
}


function restoreState(json) {
    if (isModalOpen() || !json) return;
    const state = JSON.parse(json);
    players = state.players;
    if (state.courtCount) { courtCount = state.courtCount; document.getElementById('calc-court-count').value = courtCount; }
    courts = state.courts.map(c => { c.interval = null; return c; });
    renderCourts(); updateQueueDisplay(); updateNextMatchPanel();
}

function showShareLinkModal() {
    const baseUrl = (typeof APP_URL !== 'undefined' && APP_URL) ? APP_URL : window.location.href.split('?')[0];
    const viewerUrl = baseUrl + '?mode=viewer';
    const html = `<div style="text-align:center;"><h3>📡 ลิงก์สำหรับเพื่อน</h3><input type="text" value="${viewerUrl}" id="share-link-input" style="width:100%; padding:10px;"><button class="success" onclick="copyShareLink()">📋 Copy</button><button class="secondary" onclick="closeModal('booking-modal')">ปิด</button></div>`;
    document.getElementById('booking-inputs').innerHTML = html;
    document.getElementById('booking-modal').style.display = 'flex';
    document.querySelector('#booking-modal .modal-actions').style.display = 'none';
}

function copyShareLink() {
    const copyText = document.getElementById("share-link-input");
    copyText.select(); document.execCommand("copy"); alert("ก๊อปปี้แล้ว!");
}

function savePlayerProfileToCloud(player) {
    if (typeof db === 'undefined' || !player) return;
    db.collection('players_profile').doc(player.name).set({
        name: player.name,
        level: player.level || 'BG',
        gender: player.gender || 'M',
        gamesPlayed: player.gamesPlayed || 0,
        wins: player.wins || 0,
        mmr: typeof player.mmr !== 'undefined' ? player.mmr : 100
    }, { merge: true })
    .then(() => console.log(`💾 ซิงค์โปรไฟล์ของ ${player.name} ลง Cloud`))
    .catch(err => console.error("Error saving profile:", err));
}

// ✅ FIX: this used to also live as a stray top-level `init();` call at the very
// end of this file, which ran for EVERY visitor (host, admin, AND spectator)
// immediately on page load — before any role was even chosen. That meant every
// spectator's browser was independently running the auto-fill/auto-start timers
// and pushing writes to Firebase, racing against the host. Now init() only runs
// from createRoom()/joinRoomAdmin() (above) and here, for a HOST resuming a
// session after a page refresh. Spectators never call init().
window.onload = function() {
    const savedRoomId = sessionStorage.getItem('ROOM_ID');
    const savedIsHost = sessionStorage.getItem('IS_HOST');

    if (savedRoomId) {
        currentRoomId = savedRoomId;
        isHost = (savedIsHost === 'true');
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        document.getElementById('display-room-id').innerText = currentRoomId;

        if (isHost) {
            document.getElementById('display-role').innerText = "👑 HOST (คนคุม)";
            document.getElementById('display-role').style.background = "#e74c3c";
            init(); // resuming as host/admin: restart local intervals
        } else {
            document.body.classList.add('view-mode');
            document.getElementById('display-role').innerText = "📱 VIEWER (ดูอย่างเดียว)";
            document.getElementById('display-role').style.background = "#7f8c8d";
        }
        if (typeof syncFromFirebase === 'function') syncFromFirebase();
        console.log("🔄 กู้ชีพสำเร็จ! กลับเข้าห้อง:", currentRoomId, "สถานะ Host:", isHost);
    }
    // No savedRoomId: still on the landing page. init() will run once the
    // user actually creates or joins a room.
};

// ==========================================
// 📖 ระบบจิ้มชื่อจาก Database
// ==========================================
let cloudPlayersCache = [];

function openDbSelector() {
    document.getElementById('dbModal').style.display = 'flex';
    document.getElementById('dbSearch').value = '';
    const listDiv = document.getElementById('dbPlayerList');
    listDiv.innerHTML = '<div style="padding:20px; text-align:center;">กำลังโหลดข้อมูล... ⏳</div>';

    if (typeof db === 'undefined') return;
    db.collection('players_profile').get().then(snapshot => {
        cloudPlayersCache = [];
        snapshot.forEach(doc => cloudPlayersCache.push(doc.data()));
        cloudPlayersCache.sort((a, b) => (b.mmr || 0) - (a.mmr || 0));
        renderDbPlayers(cloudPlayersCache);
    }).catch(err => {
        listDiv.innerHTML = '<div style="color:red; text-align:center;">โหลดพลาดว่ะ! เช็คเน็ตดิ๊</div>';
    });
}

function closeDbSelector() {
    document.getElementById('dbModal').style.display = 'none';
}

function renderDbPlayers(playerList) {
    const listDiv = document.getElementById('dbPlayerList');
    listDiv.innerHTML = '';

    playerList.forEach(p => {
        const isAlreadyInQueue = players.some(activeP => activeP.name === p.name);

        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random&color=fff`;
        const avatar = p.avatarUrl || defaultAvatar;
        const safeName = sanitizeHTML(p.name);
        const encName = encodeURIComponent(p.name); // safe for the onclick argument

        listDiv.innerHTML += `
            <div class="db-player-item" ${isAlreadyInQueue ? 'style="opacity:0.5; background:#eee;"' : ''}>
                <div style="display:flex; align-items:center;">
                    <img src="${avatar}" class="mini-avatar" style="width:35px; height:35px; margin-right:10px;">
                    <div>
                        <strong style="font-size:1.1em;">${safeName}</strong><br>
                        <span style="font-size:0.8em; color:#7f8c8d;">MMR: ${p.mmr || 100}</span>
                    </div>
                </div>
                ${isAlreadyInQueue
                    ? `<span style="font-size:0.8em; color:#c0392b; font-weight:bold;">มีในคิวแล้ว</span>`
                    : `<button class="db-add-btn" onclick="addSinglePlayerFromDb('${encName}')">+ แอดลงคอร์ท</button>`
                }
            </div>
        `;
    });
}

function filterDbPlayers() {
    const keyword = document.getElementById('dbSearch').value.toLowerCase();
    const filtered = cloudPlayersCache.filter(p => p.name.toLowerCase().includes(keyword));
    renderDbPlayers(filtered);
}

async function addSinglePlayerFromDb(encodedName) {
    const name = decodeURIComponent(encodedName);
    if (players.some(p => p.name === name)) {
        alert("มึงแอดคนนี้ไปแล้ว จะแอดซ้ำทำไม!"); return;
    }

    const tempBox = document.createElement('textarea');
    tempBox.value = name;

    const realBox = document.getElementById('new-players');
    realBox.id = 'temp-hidden-box';
    tempBox.id = 'new-players';
    document.body.appendChild(tempBox);

    await addPlayers();

    tempBox.remove();
    realBox.id = 'new-players';

    renderDbPlayers(cloudPlayersCache);
}
// ==========================================
// 🖼️ ระบบซูมดูรูปโปรไฟล์ใหญ่
// ==========================================
function showBigImage(url, encodedName) {
    document.getElementById('big-image-name').innerText = decodeURIComponent(encodedName);
    document.getElementById('big-image-view').src = url;
    document.getElementById('image-modal').style.display = 'flex';
}

function closeBigImage() {
    document.getElementById('image-modal').style.display = 'none';
}
// ✅ FIX: removed the stray top-level `init();` that used to be here — see the
// window.onload comment above for why.
