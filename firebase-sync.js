// 👇 วาง Config ทิ้งไว้บนสุดเลย
// Note: this apiKey is safe to be public — Firebase web config is designed to be
// client-visible. Real access control lives in Firestore Security Rules
// (configured in the Firebase Console, not in this file).
const firebaseConfig = {
  apiKey: "AIzaSyCnrkEbVOM3i7f59rAnWN9mgPC9iekEuIA",
  authDomain: "badminton-manager-e77bb.firebaseapp.com",
  projectId: "badminton-manager-e77bb",
  storageBucket: "badminton-manager-e77bb.firebasestorage.app",
  messagingSenderId: "402072472322",
  appId: "1:402072472322:web:a212ed6eaff7ec10fbd01b",
  measurementId: "G-2EFE485QTK"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log("Firebase is ready to use");

// 👇 เซ็ตระบบ Save แบบ Debounce
let saveTimeout = null;

function triggerSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveData();
    }, 1500);
}

function saveData() {
    const ruleEl = document.getElementById('game-rule');
    const ruleValue = ruleEl ? ruleEl.value : 'normal';

    const data = {
        players: players,
        courts: courts.map(c => ({...c, interval: null})),
        courtCount: courtCount,
        pairingHistory: pairingHistory,
        opponentHistory: opponentHistory,
        matchLogs: matchLogs,
        bookingCounter: bookingCounter,
        gameRule: ruleValue,
        rankedMode: isRankedMode,
        mmrMode: isMMRMode,
        completedGameTimes: completedGameTimes,
        roundCounter: roundCounter,
        lastTeammateRound: lastTeammateRound,
        lastUpdated: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    if (typeof db !== 'undefined') {
        const roomIdToSave = currentRoomId ? currentRoomId : 'main-court';
        db.collection('rooms').doc(roomIdToSave).set(data)
          .then(() => console.log("☁️ Synced to Room:", roomIdToSave))
          .catch((error) => console.error("❌ Firebase Error: ", error));
    }
}

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    try {
        const data = JSON.parse(raw);
        players = data.players || [];
        courtCount = data.courtCount || 2;
        pairingHistory = data.pairingHistory || {};
        opponentHistory = data.opponentHistory || {};
        matchLogs = data.matchLogs || [];
        bookingCounter = data.bookingCounter || 0;
        roundCounter = data.roundCounter || 0;
        lastTeammateRound = data.lastTeammateRound || {};

        if (typeof data.rankedMode !== 'undefined') {
            isRankedMode = data.rankedMode;
            const cb = document.getElementById('ranked-mode-toggle');
            if (cb) cb.checked = isRankedMode;
        }

        if (data.courts) {
            courts = data.courts.map((c, index) => {
                c.interval = null;
                if (!c.rule) c.rule = 'normal';
                return c;
            });
        }

        if (data.gameRule) {
            const ruleSelect = document.getElementById('game-rule');
            if(ruleSelect) ruleSelect.value = data.gameRule;
        }
        if (data.completedGameTimes) completedGameTimes = data.completedGameTimes;

        if (typeof data.mmrMode !== 'undefined') {
            isMMRMode = data.mmrMode;
            const cb = document.getElementById('mmr-mode-toggle');
            if (cb) cb.checked = isMMRMode;
        }

        // 🔥 ถ้าเปิดทั้งคู่ ให้ปิด Rank ทิ้ง (ถือว่า MMR ใหญ่กว่า)
        if (isRankedMode && isMMRMode) {
            console.log("⚠️ เจอเปิดซ้อนกัน! สั่งปิด Rank อัตโนมัติ");
            isRankedMode = false;
            const rankCB = document.getElementById('ranked-mode-toggle');
            if(rankCB) rankCB.checked = false;
        }

        return true;
    } catch (e) {
        console.error("Load Data Error:", e);
        return false;
    }
}

// ✅ FIX: createRoom() and joinRoom() used to be declared here TOO (duplicating
// app.js), and app.js's versions silently won because it loads later — except
// app.js's versions called a function that didn't exist (startRealtimeSync),
// so real-time sync never actually started. Those functions now live only in
// app.js, and correctly call syncFromFirebase() below.

function syncFromFirebase() {
    if (typeof db === 'undefined') return;

    db.collection('rooms').doc(currentRoomId).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();

            players = data.players || [];
            courtCount = data.courtCount || 2;

            if (data.courts) {
                courts = data.courts;
            } else if (typeof courts !== 'undefined' && courts.length === 0) {
                for(let i=0; i<courtCount; i++) courts.push({ players: [], startTime: null });
            }

            pairingHistory = data.pairingHistory || {};
            opponentHistory = data.opponentHistory || {};
            completedGameTimes = data.completedGameTimes || [];
            roundCounter = data.roundCounter || 0;
            lastTeammateRound = data.lastTeammateRound || {};

            renderCourts();
            updateQueueDisplay();
            updateDashboard();

            console.log("📡 ข้อมูล Sync จาก Firebase เรียบร้อย!");
        }
    });
}
