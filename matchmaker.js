// ===============================================================
// 🧠 Core AI: ฟังก์ชันดึงคิวอัจฉริยะ
// ===============================================================
// useCooldownLogic: pass true only from All-Out mode (court.rule === 'normal')
// when filling a fresh, fully-empty court (4 needed, 0 existing). This replaces
// the old "Anti Deja-vu" toggle — it is now always-on for All-Out mode, no switch.
function getSmartDraft(count, excludeIds = new Set(), existingPlayers = [], isForce = false, rankFilter = null, useCooldownLogic = false) {
    let pool = players.filter(p => p.status === 'waiting' && !p.isResting && !excludeIds.has(p.id));
    
    if (rankFilter) {
        const minIdx = RANK_LEVELS.indexOf(rankFilter.min);
        const maxIdx = RANK_LEVELS.indexOf(rankFilter.max);
        pool = pool.filter(p => {
            const pLevel = p.level || 'BG';
            const pIdx = RANK_LEVELS.indexOf(pLevel);
            return pIdx >= minIdx && pIdx <= maxIdx;
        });
    }

    pool.sort((a, b) => a.joinedQueueAt - b.joinedQueueAt); 
    if (pool.length === 0) return [];

    let targetScore = null, targetMMR = null;
    if (existingPlayers.length > 0) {
        targetScore = existingPlayers.reduce((sum, p) => sum + (RANK_SCORES[p.level||'BG']||1), 0);
        targetMMR = existingPlayers.reduce((sum, p) => sum + (p.mmr || 0), 0);
    }

    const head = pool[0];

    // Also force a seat if the head of the queue has simply been waiting too
    // long in real time (see MAX_FAIR_WAIT_MS), even if this happens to be
    // their very first miss — a slow stretch of the queue shouldn't need to
    // cost someone a full extra "skip" before the guarantee kicks in.
    const headWaitedTooLong = head && typeof MAX_FAIR_WAIT_MS !== 'undefined'
        && (Date.now() - (head.joinedQueueAt || Date.now())) >= MAX_FAIR_WAIT_MS;

    // 🚨 Anti-Starvation: if the head of the queue has already been skipped once
    // (skipCount >= 1) OR has been waiting too long, guarantee them a seat now.
    // Try politely first, then force it through (bypassing soft rules like
    // gender-pairing preference) if needed. If even forcing fails, there simply
    // aren't enough eligible players right now — that's not an unfair skip, so
    // we mark it as unresolved instead of punishing them.
    if (head && (head.skipCount >= 1 || headWaitedTooLong) && !isForce) {
        let team = tryBuildTeam(head, pool, count, existingPlayers, true, targetScore, false, targetMMR);
        if (team.length === count) return team;

        team = tryBuildTeam(head, pool, count, existingPlayers, true, targetScore, true, targetMMR);
        if (team.length === count) return team;

        head._unresolvedSkip = true;
    }

    // ⚖️ MMR Mode (unchanged)
    if (typeof isMMRMode !== 'undefined' && isMMRMode && !isForce) {
        let captain = pool[0];
        let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, false, targetMMR);
        if (team.length === count) return team;
        return [];
    }

    // 🔄 All-Out mode cooldown-aware draft (replaces the old Anti Deja-vu toggle).
    // Searches combinations from the front of the queue, scoring by how badly each
    // combination violates the teammate-rotation cooldown, and picks the least-bad one.
    if (useCooldownLogic && existingPlayers.length === 0 && count === 4 && !isForce) {

        let poolSize = Math.min(pool.length, 8); // widen the funnel a bit
        let draftPool = pool.slice(0, poolSize);
        let starvedPlayers = draftPool.filter(p => p.skipCount >= 1);

        if (draftPool.length >= 4) {
            let bestTeam = null;
            let minPenalty = Infinity;

            for (let i = 0; i < draftPool.length - 3; i++) {
                for (let j = i + 1; j < draftPool.length - 2; j++) {
                    for (let k = j + 1; k < draftPool.length - 1; k++) {
                        for (let l = k + 1; l < draftPool.length; l++) {
                            let candidateTeam = [draftPool[i], draftPool[j], draftPool[k], draftPool[l]];
                            let penaltyScore = 0;

                            // Rule: a team must include anyone who's already been skipped once
                            let missingStarved = 0;
                            starvedPlayers.forEach(sp => {
                                if (!candidateTeam.some(p => p.id === sp.id)) missingStarved++;
                            });
                            penaltyScore += (missingStarved * 100000);

                            // Never split a booked pair/group
                            let hasBrokenBooking = false;
                            candidateTeam.forEach(p => {
                                if (p.bookingId) {
                                    let inTeam = candidateTeam.filter(x => x.bookingId === p.bookingId).length;
                                    let inPool = pool.filter(x => x.bookingId === p.bookingId).length;
                                    if (inTeam < inPool) hasBrokenBooking = true;
                                }
                            });
                            if (hasBrokenBooking) penaltyScore += 9999999;

                            let combo = autoBalanceTeam(candidateTeam);

                            // 🔄 Cooldown penalty: heavily penalize combos that break the
                            // teammate-rotation rule, worse for the "can't even share a court" tier
                            let violations = getCooldownViolations(combo);
                            violations.forEach(v => {
                                penaltyScore += (v.type === 'anycourt-forbidden') ? 2000000 : 800000;
                            });

                            // Repeat-teammate / repeat-OPPONENT history beyond the 1-2 round
                            // cooldown window above. Without this, this search has no memory
                            // of match history at all past 2 rounds ago — if two players'
                            // queue timing happened to sync up, nothing here stopped them
                            // from landing on opposite teams almost every single round.
                            const cbT1 = [combo[0], combo[1]], cbT2 = [combo[2], combo[3]];
                            const teammateRepeatPenalty = (a, b) => {
                                const n = getPairCount(a.id, b.id);
                                return n * n * 500000;
                            };
                            penaltyScore += teammateRepeatPenalty(cbT1[0], cbT1[1]) + teammateRepeatPenalty(cbT2[0], cbT2[1]);
                            penaltyScore += opponentConflictPenalty(cbT1[0], cbT2[0]) + opponentConflictPenalty(cbT1[0], cbT2[1])
                                          + opponentConflictPenalty(cbT1[1], cbT2[0]) + opponentConflictPenalty(cbT1[1], cbT2[1]);

                            // Rank/MMR balance (unchanged)
                            if (typeof isMMRMode !== 'undefined' && isMMRMode) {
                                let t1 = [combo[0], combo[1]], t2 = [combo[2], combo[3]];
                                let diff = Math.abs(((t1[0].mmr||0)+(t1[1].mmr||0)) - ((t2[0].mmr||0)+(t2[1].mmr||0)));
                                penaltyScore += diff * 10;
                            } else if (typeof isRankedMode !== 'undefined' && isRankedMode) {
                                let t1 = [combo[0], combo[1]], t2 = [combo[2], combo[3]];
                                let score1 = (RANK_SCORES[t1[0].level||'BG']||1) + (RANK_SCORES[t1[1].level||'BG']||1);
                                let score2 = (RANK_SCORES[t2[0].level||'BG']||1) + (RANK_SCORES[t2[1].level||'BG']||1);
                                penaltyScore += Math.abs(score1 - score2) * 100;
                            }

                            // Prefer people who've waited longer
                            penaltyScore += (i + j + k + l) * 5;

                            if (penaltyScore < minPenalty) {
                                minPenalty = penaltyScore;
                                bestTeam = combo;
                            }
                        }
                    }
                }
            }
            if (bestTeam) return bestTeam;
        }
    }

    // --- Normal mode (queue order, fallback for everything else) ---
    for (let i = 0; i < pool.length; i++) {
        let captain = pool[i];
        if (!isForce && typeof isRankedMode !== 'undefined' && isRankedMode && existingPlayers.length > 0) {
             const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
             let isCompatible = true;
             for(let ex of existingPlayers) {
                 const exScore = RANK_SCORES[ex.level || 'BG'] || 1;
                 if (Math.abs(capScore - exScore) >= 2) { isCompatible = false; break; }
             }
             if (!isCompatible) continue; 
        }
        let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, isForce, targetMMR); 
        if (team.length === count) {
            if (count === 4 && !isForce) return autoBalanceTeam(team);
            return team;
        }
    }
    return [];
}

function tryBuildTeam(captain, currentPool, targetCount, existingPlayers = [], isPity = false, targetScore = null, isForce = false, targetMMR = null) {
    let selected = []; let usedIds = new Set();
    if (captain.bookingId) {
        const group = currentPool.filter(x => x.bookingId === captain.bookingId);
        if (group.length > targetCount) return [];
        group.sort((a, b) => (a.bookingTeam || 0) - (b.bookingTeam || 0));
        group.forEach(p => { selected.push(p); usedIds.add(p.id); });
    } else {
        selected.push(captain); usedIds.add(captain.id);
    }

    while (selected.length < targetCount) {
        let nextPlayer = null;
        if (selected.length % 2 !== 0 && !selected[selected.length-1].bookingId) {
            let currentSolo = selected[selected.length - 1];
            // When currentSolo is the FIRST opponent (not the original captain),
            // this pick is that opponent's own teammate — i.e. the SECOND opponent
            // relative to the original team. Without opponentTeam, this call only
            // avoided repeat-TEAMMATE pairing with currentSolo and had no idea it
            // was also picking someone's opponent, so the second opponent slot could
            // land on someone who'd already faced the first team many times over.
            const opponentTeam = selected.length >= 3 ? selected.slice(0, 2) : [];
            nextPlayer = findBestPartnerInfinite(currentSolo, currentPool, usedIds, existingPlayers, isPity, targetScore, isForce, targetMMR, opponentTeam);
        } else {
            let currentTeamMMR = selected.reduce((s, p) => s + (p.mmr||0), 0);
            const effectiveTeam = [...selected, ...existingPlayers];
            nextPlayer = findBestOpponentInfinite(effectiveTeam, currentPool, usedIds, currentTeamMMR);
        }
        if (nextPlayer) { selected.push(nextPlayer); usedIds.add(nextPlayer.id); } else break; 
    }
    return selected;
}

function findBestPartnerInfinite(captain, fullPool, usedIds, rankCheckList = [], isPity = false, targetScore = null, isForce = false, targetMMR = null, opponentTeam = []) {
    let best = null; let minScore = Infinity;
    const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
    const capMMR = captain.mmr || 0;

    for (let i = 0; i < fullPool.length; i++) {
        const c = fullPool[i];
        if (c.id === captain.id || usedIds.has(c.id) || c.bookingId) continue;
        let finalScore = 0;

        if (isMMRMode && !isForce) {
            const queueCost = i * 100; 
            let mmrCost = 0;
            const partnerMMR = c.mmr || 0;
            if (targetMMR !== null) {
                const ourTeamMMR = capMMR + partnerMMR;
                mmrCost = Math.abs(ourTeamMMR - targetMMR) * 100;
            } else {
                mmrCost = Math.abs(capMMR - partnerMMR) * 100;
            }
            const pairCost = getPairCount(captain.id, c.id) * 1000000;
            finalScore = queueCost + mmrCost + pairCost;
        } else if (isForce) {
             const queueCost = i * 1000; 
             let balanceCost = 0;
             if (targetScore !== null) {
                const myTeamScore = capScore + (RANK_SCORES[c.level||'BG']||1);
                balanceCost = Math.abs(myTeamScore - targetScore) * 2500; 
             }
             const pairCost = getPairCount(captain.id, c.id) * 3000; 
             finalScore = queueCost + balanceCost + pairCost;
        } else {
             if (isPity && targetScore !== null) {
                 const cScore = RANK_SCORES[c.level || 'BG'] || 1;
                 const ourTeamSum = capScore + cScore;
                 finalScore = (getPairCount(captain.id, c.id) * 1000000) + (Math.abs(ourTeamSum - targetScore) * 1000) + i;
            } else {
                const pairPenalty = (getPairCount(captain.id, c.id) >= 2) ? 999999999 : getPairCount(captain.id, c.id) * 1000000;
                let rankPenalty = 0;
                if (isRankedMode) {
                    const cScore = RANK_SCORES[c.level || 'BG'] || 1;
                    const diffCap = Math.abs(capScore - cScore);
                    if (diffCap === 1) rankPenalty += 5;
                    if (diffCap >= 2) rankPenalty += 500;
                    for(let existing of rankCheckList) {
                        const exScore = RANK_SCORES[existing.level || 'BG'] || 1;
                        const diffEx = Math.abs(cScore - exScore);
                        if (diffEx === 1) rankPenalty += 5; else if (diffEx >= 2) rankPenalty += 500;
                    }
                }
                finalScore = pairPenalty + rankPenalty + i;
            }
        }

        // Picking someone's teammate also picks the OTHER team's second opponent —
        // apply the same repeat-opponent penalty against the first team here too,
        // or this slot would only ever avoid repeat teammates, never repeat rivals.
        opponentTeam.forEach(opp => { finalScore += opponentConflictPenalty(opp, c); });

        if (finalScore < minScore) {
            minScore = finalScore; 
            best = c; 
            if (finalScore === i) break; 
        }
    }
    return best;
}

// Once facing the same specific rival would make up more than 1-in-this-many
// of either player's games so far this session, treat it as near-forbidden
// rather than just "expensive" (user-requested rule: facing someone more than
// N times while you've only played 3N games total is too many). Not checked
// until a player has at least this many games, so it doesn't misfire on
// someone's very first couple of matches.
const RIVAL_GAME_RATIO_CAP = 3;

// Shared by findBestOpponentInfinite (picking the 1st opponent) AND
// findBestPartnerInfinite (which also ends up picking the 2ND opponent, when
// it's finding a teammate for someone who is themselves an opponent — see
// tryBuildTeam's opponentTeam argument). Without sharing this, the 2nd
// opponent slot only ever avoided repeat TEAMMATES, never repeat RIVALS,
// which is how two players could get "locked in" facing each other almost
// every round even after the 1st-opponent slot started avoiding it.
function opponentConflictPenalty(member, candidate) {
    const opCount = getOpponentCount(member.id, candidate.id);
    // Escalating penalty: each additional repeat costs more than the last
    // (1st repeat 2,000,000 / 2nd 8,000,000 / 3rd 18,000,000 ...) instead of
    // flattening out at a flat cap after the 2nd — a flat cap meant a 3rd,
    // 8th, or 12th repeat all scored identically, so once two players'
    // queue timing happened to sync up there was no growing pressure to
    // split them apart again.
    let penalty = opCount * opCount * 2000000;

    // How far OVER the 1-in-N cap this pick would go — not just whether it's
    // over — so that when every available candidate is already over the cap
    // (a small live waiting pool can force that), the algorithm still reaches
    // for whoever is closest to compliant instead of treating "1 over" and
    // "5 over" as equally bad.
    const projectedCount = opCount + 1;
    const overageFor = (games) => {
        if (games < RIVAL_GAME_RATIO_CAP) return 0;
        const allowed = Math.floor((games + 1) / RIVAL_GAME_RATIO_CAP);
        return Math.max(0, projectedCount - allowed);
    };
    const overage = Math.max(overageFor(member.gamesPlayed || 0), overageFor(candidate.gamesPlayed || 0));
    if (overage > 0) penalty += 500000000 * overage;
    return penalty;
}

function findBestOpponentInfinite(currentTeam, fullPool, usedIds, targetMMR = null) {
    let best = null; let minScore = Infinity;

    for (let i = 0; i < fullPool.length; i++) {
        const c = fullPool[i];
        if (usedIds.has(c.id) || c.bookingId) continue;
        let conflictScore = 0;

        currentTeam.forEach(member => {
            conflictScore += opponentConflictPenalty(member, c);
        });

        let extraScore = 0;
        let rankPenalty = 0;

        if (isMMRMode) {
            if (targetMMR !== null) {
                const myMMR = c.mmr || 0;
                const projectedTeam2MMR = myMMR * 2; 
                extraScore = Math.abs(projectedTeam2MMR - targetMMR) * 100;
            }
        } else if (isRankedMode) {
            const cScore = RANK_SCORES[c.level || 'BG'] || 1;
            let maxDiff = 0;
            currentTeam.forEach(member => {
                const mScore = RANK_SCORES[member.level || 'BG'] || 1;
                const diff = Math.abs(mScore - cScore);
                if (diff > maxDiff) maxDiff = diff;
            });
            if (maxDiff === 1) rankPenalty = 5;
            else if (maxDiff >= 2) rankPenalty = 500;
        }
        const totalScore = conflictScore + extraScore + rankPenalty + i;
        if (totalScore < minScore) { 
            minScore = totalScore; 
            best = c; 
            if (totalScore === i) break; 
        }
    }
    return best;
}

const autoBalanceTeam = (candidates) => {
    if (candidates.some(p => p.bookingId) || candidates.length !== 4) return candidates;

    const combinations = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
    let bestCombo = combinations[0];
    let minDiffScore = Infinity;

    combinations.forEach(combo => {
        const p1 = candidates[combo[0]]; const p2 = candidates[combo[1]];
        const p3 = candidates[combo[2]]; const p4 = candidates[combo[3]];

        const team1Power = getPlayerPower(p1) + getPlayerPower(p2);
        const team2Power = getPlayerPower(p3) + getPlayerPower(p4);
        const powerDiff = Math.abs(team1Power - team2Power) * 1000; 

        const team1WinRate = getWinRate(p1) + getWinRate(p2);
        const team2WinRate = getWinRate(p3) + getWinRate(p4);
        const winRateDiff = Math.abs(team1WinRate - team2WinRate);

        let repeatPenalty = 0;
        if (getPairCount(p1.id, p2.id) > 0) repeatPenalty += 500;
        if (getPairCount(p3.id, p4.id) > 0) repeatPenalty += 500;

        const totalBadness = powerDiff + repeatPenalty + winRateDiff;

        if (totalBadness < minDiffScore) {
            minDiffScore = totalBadness;
            bestCombo = combo;
        }
    });

    return [candidates[bestCombo[0]], candidates[bestCombo[1]], candidates[bestCombo[2]], candidates[bestCombo[3]]];
};

function getPlayerPower(p) {
    const baseScore = RANK_SCORES[p.level || 'BG'] || 1;
    const streakPenalty = (p.winStreak >= 3) ? 0.5 : 0;
    return baseScore + streakPenalty;
}

// ===============================================================
// 🔄 Cooldown rule (replaces the old Anti Deja-vu toggle)
// If A & B were teammates in the last recorded All-Out round:
//   - exactly 1 round later -> forbidden to be teammates again (opponents OK)
//   - exactly 2 rounds later -> forbidden to even share a court
// team = [p0, p1, p2, p3] where [p0,p1] is one side and [p2,p3] is the other.
// Returns an array of violation objects: { a, b, type }
// type is 'teammate-forbidden' or 'anycourt-forbidden'.
// ===============================================================
function getCooldownViolations(team) {
    if (!team || team.length !== 4) return [];
    const t1 = [team[0], team[1]];
    const t2 = [team[2], team[3]];
    const violations = [];
    const nextRound = roundCounter + 1; // this proposed team would become "this" round if confirmed

    const checkPair = (a, b, isTeammatePairing) => {
        const key = getPairKey(a.id, b.id);
        const last = lastTeammateRound[key];
        if (last === undefined) return;
        const gap = nextRound - last;
        if (gap === 1 && isTeammatePairing) {
            violations.push({ a, b, type: 'teammate-forbidden' });
        } else if (gap === 2) {
            violations.push({ a, b, type: 'anycourt-forbidden' });
        }
    };

    checkPair(t1[0], t1[1], true);
    checkPair(t2[0], t2[1], true);
    checkPair(t1[0], t2[0], false);
    checkPair(t1[0], t2[1], false);
    checkPair(t1[1], t2[0], false);
    checkPair(t1[1], t2[1], false);

    return violations;
}
