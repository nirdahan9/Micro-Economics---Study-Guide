// ════════════════════════════════════════════════════════════════
//  👥  MULTIPLAYER MODE  —  Real-time, 2–6 players via Firebase
//
//  זרימת משחק (זהה למצב דו-קרב, אבל לN שחקנים):
//  1. שחקנים בחדר ההמתנה → כולם לוחצים "אני מוכן"
//  2. ספירה 3-2-1 → שאלה (timeout מסונכרן לפי Firebase timestamp)
//  3. כולם ענו / נגמר זמן → מסך פידבק עם ניקוד מדורג
//  4. כולם לוחצים "הבאה" → ספירה → שאלה הבאה
//  5. אחרי N שאלות → לוח תוצאות סופי עם דירוג
// ════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG_MP = {
  apiKey:            "AIzaSyCyazG1L4p2qqbSQOZ5lRiO4QMrtyYb-lY",
  authDomain:        "study-guide-duel-mode.firebaseapp.com",
  databaseURL:       "https://study-guide-duel-mode-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "study-guide-duel-mode",
  storageBucket:     "study-guide-duel-mode.firebasestorage.app",
  messagingSenderId: "418263522242",
  appId:             "1:418263522242:web:6f8b90c0ade9f2b7d4145b",
};

// ── קבועים ──────────────────────────────────────────────────────
const MAX_POINTS_MP   = 100;
const MAX_PLAYERS_MP  = 6;
const MP_ROOMS_PATH   = 'rooms';
const MP_THEME_KEY    = 'micro-study-theme';

// ── State ────────────────────────────────────────────────────────
const ms = {
  db:                  null,
  roomRef:             null,
  roomListener:        null,
  waitingListener:     null,
  playerId:            null,
  role:                null,    // 'host' | 'player'
  playerName:          '',
  opponents:           {},      // { [id]: { name, totalScore, answeredIndex, roundScore, nextConfirmed, finished, connected } }
  allQuestions:        [],
  lectures:            [],
  selectedQuestions:   [],
  displayedChoices:    {},
  currentCorrectLabel: '',
  currentIndex:        0,
  questionCount:       8,
  questionTimeSec:     30,
  questionStartTime:   0,
  firebaseTimeDelta:   0,
  timerInterval:       null,
  answered:            false,
  myAnswerTime:        null,
  totalScore:          0,
  myRoundScore:        0,
  selfFinished:        false,
  countingNext:        false,
  roomId:              null,
  lectureIds:          [],
  waitingPlayerCount:  0,
};

// ── Element References ───────────────────────────────────────────
const mu = {
  status:             document.getElementById('mp-status'),
  themeToggle:        document.getElementById('theme-toggle'),

  // Lobby
  lobbySection:       document.getElementById('mp-lobby-section'),
  playerName:         document.getElementById('mp-player-name'),
  numQuestionsInput:  document.getElementById('mp-num-questions'),
  timeLimitInput:     document.getElementById('mp-time-limit'),
  lectureFilters:     document.getElementById('mp-lecture-filters'),
  createRoomBtn:      document.getElementById('mp-create-room-btn'),
  roomCodeInput:      document.getElementById('mp-room-code-input'),
  joinRoomBtn:        document.getElementById('mp-join-room-btn'),
  lobbyError:         document.getElementById('mp-lobby-error'),

  // Waiting room
  waitingSection:     document.getElementById('mp-waiting-section'),
  roomCodeDisplay:    document.getElementById('mp-room-code-display'),
  copyCodeBtn:        document.getElementById('mp-copy-code-btn'),
  whatsappShareBtn:   document.getElementById('mp-whatsapp-share-btn'),
  playerList:         document.getElementById('mp-player-list'),
  playerCount:        document.getElementById('mp-player-count'),
  readyBtn:           document.getElementById('mp-ready-btn'),
  waitingReadyMsg:    document.getElementById('mp-waiting-ready-msg'),

  // Countdown
  countdownSection:   document.getElementById('mp-countdown-section'),
  countdownNumber:    document.getElementById('mp-countdown-number'),
  countdownPlayers:   document.getElementById('mp-countdown-players'),

  // Quiz
  quizSection:        document.getElementById('mp-quiz-section'),
  timerArc:           document.getElementById('mp-timer-arc'),
  timerText:          document.getElementById('mp-timer-text'),
  liveLeaderboard:    document.getElementById('mp-live-leaderboard'),
  othersAnsweredBadge:document.getElementById('mp-others-answered-badge'),
  progressBar:        document.getElementById('mp-progress-bar'),
  questionNum:        document.getElementById('mp-question-num'),
  questionMeta:       document.getElementById('mp-question-meta'),
  questionText:       document.getElementById('mp-question-text'),
  answersForm:        document.getElementById('mp-answers-form'),
  submitBtn:          document.getElementById('mp-submit-btn'),
  feedback:           document.getElementById('mp-feedback'),
  waitingOthersMsg:   document.getElementById('mp-waiting-others-msg'),

  // Feedback between questions
  feedbackSection:    document.getElementById('mp-feedback-section'),
  fbSectionTitle:     document.getElementById('mp-fb-section-title'),
  fbResult:           document.getElementById('mp-fb-result'),
  fbExplanation:      document.getElementById('mp-fb-explanation'),
  fbRoundScores:      document.getElementById('mp-fb-round-scores'),
  nextConfirmBtn:     document.getElementById('mp-next-confirm-btn'),
  waitingNextMsg:     document.getElementById('mp-waiting-next-msg'),

  // Results
  resultSection:      document.getElementById('mp-result-section'),
  winnerBanner:       document.getElementById('mp-winner-banner'),
  finalRanking:       document.getElementById('mp-final-ranking'),
  resultDetails:      document.getElementById('mp-result-details'),
  playAgainBtn:       document.getElementById('mp-play-again-btn'),
};

// ── Section helpers ──────────────────────────────────────────────
const MP_ALL_SECTIONS = () => [
  mu.lobbySection, mu.waitingSection, mu.countdownSection,
  mu.quizSection, mu.feedbackSection, mu.resultSection,
];

function mpShowSection(section) {
  MP_ALL_SECTIONS().forEach(s => s?.classList.add('hidden'));
  section?.classList.remove('hidden');
}

function mpSetStatus(msg) {
  if (mu.status) mu.status.textContent = msg;
}

function mpShowError(msg) {
  if (mu.lobbyError) {
    mu.lobbyError.textContent = msg;
    mu.lobbyError.classList.remove('hidden');
  }
}

function mpClearError() { mu.lobbyError?.classList.add('hidden'); }

function mpShowToast(msg, type = 'info', durationMs = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast-out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, durationMs);
}

// ── Utility helpers ───────────────────────────────────────────────
function mpGenerateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function mpGetOrCreatePlayerId() {
  let id = sessionStorage.getItem('mp-player-id');
  if (!id) {
    id = `mp_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('mp-player-id', id);
  }
  return id;
}

function mpShuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mpCalcPoints(answerTimeMs, timeLimitMs) {
  if (answerTimeMs <= 0) return MAX_POINTS_MP;
  const ratio = Math.max(0, 1 - answerTimeMs / timeLimitMs);
  return Math.max(10, Math.round(MAX_POINTS_MP * (0.1 + 0.9 * ratio)));
}

// ── SVG Timer ────────────────────────────────────────────────────
const MP_TIMER_CIRCUMFERENCE = 2 * Math.PI * 40; // r=40

function mpSetTimerArc(fraction) {
  if (!mu.timerArc) return;
  const offset = MP_TIMER_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
  mu.timerArc.style.strokeDashoffset = offset;
  if (fraction > 0.5)       mu.timerArc.style.stroke = '#22c55e';
  else if (fraction > 0.25) mu.timerArc.style.stroke = '#f59e0b';
  else                      mu.timerArc.style.stroke = '#ef4444';
}

function mpStartQuestionTimer() {
  clearInterval(ms.timerInterval);
  const totalMs = ms.questionTimeSec * 1000;
  mpSetTimerArc(1);
  if (mu.timerText) mu.timerText.textContent = ms.questionTimeSec;

  ms.timerInterval = setInterval(() => {
    const elapsed   = Date.now() - ms.questionStartTime;
    const remaining = Math.max(0, totalMs - elapsed);
    mpSetTimerArc(remaining / totalMs);
    if (mu.timerText) mu.timerText.textContent = Math.ceil(remaining / 1000);
    if (remaining <= 0) { clearInterval(ms.timerInterval); if (!ms.answered) mpTimeoutAnswer(); }
  }, 100);
}

function mpStopTimer() {
  clearInterval(ms.timerInterval);
  ms.timerInterval = null;
}

// ── Theme ─────────────────────────────────────────────────────────
function mpApplyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem(MP_THEME_KEY, theme);
  if (mu.themeToggle) {
    mu.themeToggle.textContent = theme === 'dark' ? '☀️ מצב בהיר' : '🌙 מצב כהה';
  }
}

function mpInitTheme() {
  const saved = localStorage.getItem(MP_THEME_KEY);
  if (saved === 'dark' || saved === 'light') { mpApplyTheme(saved); return; }
  mpApplyTheme(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

// ── Question Parsing (identical logic to duel.js) ────────────────
function mpCleanQuotedValue(raw) {
  if (!raw) return '';
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function mpParseQuestionsText(text) {
  const allQuestions = [];
  const lecturesMap  = new Map();
  const lines = text.split(/\r?\n/);
  let currentLectureId = '', currentLectureTitle = '', seq = 0, cur = null, inChoices = false;

  function flush() {
    if (!cur) return;
    if (cur.text && Object.keys(cur.choices).length >= 2 && cur.correct && cur.explanation) allQuestions.push(cur);
    cur = null; inChoices = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m1 = line.match(/^LECTURE_ID:\s*(.+)$/);
    if (m1) { flush(); currentLectureId = mpCleanQuotedValue(m1[1]); if (!lecturesMap.has(currentLectureId)) lecturesMap.set(currentLectureId, { lectureId: currentLectureId, lectureTitle: '' }); continue; }
    const m2 = line.match(/^LECTURE_TITLE:\s*(.+)$/);
    if (m2) { currentLectureTitle = mpCleanQuotedValue(m2[1]); if (currentLectureId) lecturesMap.set(currentLectureId, { lectureId: currentLectureId, lectureTitle: currentLectureTitle }); continue; }
    const m3 = line.match(/^(Q\d+_\d+):$/);
    if (m3) { flush(); seq++; cur = { uniqueId: `${m3[1]}__${currentLectureId}__${seq}`, questionId: m3[1], lectureId: currentLectureId, lectureTitle: currentLectureTitle, text: '', choices: {}, correct: '', explanation: '' }; inChoices = false; continue; }
    if (!cur) continue;
    if (line.startsWith('question:'))    { cur.text        = mpCleanQuotedValue(line.slice(9));  inChoices = false; continue; }
    if (line === 'choices:')             { inChoices = true; continue; }
    if (line.startsWith('correct:'))     { cur.correct      = mpCleanQuotedValue(line.slice(8));  inChoices = false; continue; }
    if (line.startsWith('explanation:')) { cur.explanation  = mpCleanQuotedValue(line.slice(12)); inChoices = false; continue; }
    if (inChoices) { const cm = line.match(/^([A-D]):\s*(.+)$/); if (cm) cur.choices[cm[1]] = mpCleanQuotedValue(cm[2]); }
  }
  flush();
  const lectures = [...lecturesMap.values()].sort((a, b) => Number(a.lectureId) - Number(b.lectureId));
  return { allQuestions, lectures };
}

// ── Lecture Filters ──────────────────────────────────────────────
function mpRenderLectureFilters() {
  if (!mu.lectureFilters) return;
  mu.lectureFilters.innerHTML = '';
  ms.lectures.forEach(lecture => {
    const lbl = document.createElement('label');
    lbl.className = 'lecture-item';
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.value = lecture.lectureId; inp.checked = true;
    const span = document.createElement('span');
    span.textContent = `שיעור ${Number(lecture.lectureId)} — ${lecture.lectureTitle}`;
    lbl.appendChild(inp); lbl.appendChild(span);
    mu.lectureFilters.appendChild(lbl);
  });
}

function mpGetSelectedLectureIds() {
  return [...mu.lectureFilters.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
}

// ── Firebase ─────────────────────────────────────────────────────
function mpInitFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG_MP);
    ms.db = firebase.database();
    return true;
  } catch (e) { console.error('Firebase init error:', e); return false; }
}

// ── Waiting Room: Player List UI ──────────────────────────────────
function mpRenderWaitingPlayerList(players) {
  if (!mu.playerList) return;
  mu.playerList.innerHTML = '';
  const entries = Object.entries(players || {}).filter(([, p]) => p.connected !== false);

  entries.forEach(([id, p]) => {
    const isMe   = id === ms.playerId;
    const isHost = p.role === 'host';
    const div    = document.createElement('div');
    div.className = 'mp-player-item' + (isMe ? ' mp-player-me' : '');
    div.innerHTML = `
      <span class="mp-player-item-name">
        ${p.name || 'שחקן'}${isMe ? ' <span class="mp-me-tag">(אתה)</span>' : ''}${isHost ? ' 👑' : ''}
      </span>
      <span class="duel-player-badge ${p.readyConfirmed ? 'badge-ready' : 'badge-waiting'}">
        ${p.readyConfirmed ? '✅ מוכן' : '⏳ ממתין'}
      </span>`;
    mu.playerList.appendChild(div);
  });

  const count = entries.length;
  ms.waitingPlayerCount = count;
  if (mu.playerCount) {
    mu.playerCount.textContent = `${count} שחקן${count !== 1 ? 'ים' : ''} בחדר (מקסימום ${MAX_PLAYERS_MP})`;
  }

  // הפעל/נטרל כפתור "מוכן" לפי מספר שחקנים (רק אם השחקן טרם אישר)
  const myData = entries.find(([id]) => id === ms.playerId)?.[1];
  if (mu.readyBtn && !myData?.readyConfirmed) {
    if (count < 2) {
      mu.readyBtn.disabled = true;
      mu.readyBtn.textContent = '⏳ ממתין לשחקנים נוספים...';
    } else {
      mu.readyBtn.disabled = false;
      mu.readyBtn.textContent = '✅ אני מוכן!';
    }
  }
}

// ── Live Leaderboard (during quiz) ───────────────────────────────
function mpRenderLiveLeaderboard() {
  if (!mu.liveLeaderboard) return;
  const all = [
    {
      name: ms.playerName,
      score: ms.totalScore,
      isMe: true,
      answered: ms.answered,
      connected: true,
    },
    ...Object.values(ms.opponents).map(o => ({
      name: o.name,
      score: o.totalScore || 0,
      isMe: false,
      answered: (o.answeredIndex ?? -1) >= ms.currentIndex,
      connected: o.connected !== false,
    })),
  ].sort((a, b) => b.score - a.score);

  mu.liveLeaderboard.innerHTML = all.map((p, i) => {
    let statusTag = '';
    if (!p.connected) {
      statusTag = ' <span style="font-size:11px; opacity:0.6;">(התנתק)</span>';
    } else if (p.answered) {
      statusTag = ' <span style="font-size:12px;">✅</span>';
    } else {
      statusTag = ' <span style="font-size:12px; opacity:0.5;">⏳</span>';
    }
    return `
    <div class="mp-lb-row ${p.isMe ? 'mp-lb-me' : ''}${!p.connected ? ' mp-lb-disconnected' : ''}">
      <span class="mp-lb-rank">${i + 1}</span>
      <span class="mp-lb-name">${p.name}${p.isMe ? ' ★' : ''}${statusTag}</span>
      <span class="mp-lb-score">${p.score}</span>
    </div>`;
  }).join('');
}

// ── Create Room ──────────────────────────────────────────────────
async function mpCreateRoom() {
  mpClearError();
  const name = mu.playerName?.value.trim();
  if (!name) { mpShowError('אנא הכנס שם לפני יצירת חדר.'); return; }

  const numQ    = Math.round(Number(mu.numQuestionsInput?.value) || 8);
  const timeSec = Math.round(Number(mu.timeLimitInput?.value)    || 30);
  if (numQ < 3 || numQ > 20)    { mpShowError('מספר השאלות חייב להיות בין 3 ל-20.'); return; }
  if (timeSec < 15 || timeSec > 120) { mpShowError('הזמן לשאלה חייב להיות בין 15 ל-120 שניות.'); return; }

  const lectureIds = mpGetSelectedLectureIds();
  if (!lectureIds.length) { mpShowError('אנא בחר לפחות שיעור אחד.'); return; }

  const pool = mpShuffle(ms.allQuestions.filter(q => lectureIds.includes(q.lectureId)));
  if (pool.length < numQ) { mpShowError(`צריך לפחות ${numQ} שאלות. מצאנו ${pool.length} — בחר יותר שיעורים.`); return; }

  const selected        = pool.slice(0, numQ);
  ms.playerName         = name;
  ms.role               = 'host';
  ms.selectedQuestions  = selected;
  ms.questionCount      = numQ;
  ms.questionTimeSec    = timeSec;
  ms.lectureIds         = lectureIds;

  const roomId = mpGenerateRoomId();
  ms.roomId    = roomId;
  ms.roomRef   = ms.db.ref(`${MP_ROOMS_PATH}/${roomId}`);

  try {
    await ms.roomRef.set({
      status:          'waiting',
      hostId:          ms.playerId,
      maxPlayers:      MAX_PLAYERS_MP,
      questionCount:   numQ,
      questionTimeSec: timeSec,
      lectureIds,
      questionIds:     selected.map(q => q.uniqueId),
      players: {
        [ms.playerId]: {
          name, role: 'host',
          totalScore: 0, currentIndex: 0,
          answeredIndex: -1, answerTimeMs: null, roundScore: null,
          finished: false, connected: true,
          readyConfirmed: false, nextConfirmed: false,
        },
      },
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
  } catch (e) { mpShowError('שגיאה ביצירת החדר: ' + (e?.message || e?.code || JSON.stringify(e))); console.error(e); return; }

  ms.roomRef.child(`players/${ms.playerId}/connected`).onDisconnect().set(false);
  // Auto-delete after 60 minutes
  setTimeout(() => ms.roomRef?.remove().catch(() => {}), 60 * 60 * 1000);

  mpSetupWaitingRoomUI(roomId);
  mpRenderWaitingPlayerList({ [ms.playerId]: { name, role: 'host', readyConfirmed: false, connected: true } });
  mpShowSection(mu.waitingSection);
  mpSetStatus(`חדר ${roomId} נוצר — שתף את הקוד עם החברים`);
  mpShowToast(`חדר ${roomId} נוצר בהצלחה ✔`, 'ok');
  mpAttachWaitingRoomListener();
}

function mpSetupWaitingRoomUI(roomId) {
  if (mu.roomCodeDisplay) mu.roomCodeDisplay.textContent = roomId;
  const shareUrl = `${location.origin}${location.pathname}?room=${roomId}`;
  const waText   = encodeURIComponent(`👥 משחק קבוצתי מיקרו כלכלה! לחץ/י כאן כדי להצטרף (בלי צורך להקליד קוד):\n${shareUrl}`);
  if (mu.whatsappShareBtn) mu.whatsappShareBtn.href = `https://wa.me/?text=${waText}`;
  if (mu.readyBtn) { mu.readyBtn.disabled = true; mu.readyBtn.textContent = '⏳ ממתין לשחקנים נוספים...'; mu.readyBtn.classList.remove('hidden'); }
  if (mu.waitingReadyMsg) { mu.waitingReadyMsg.textContent = ''; mu.waitingReadyMsg.classList.add('hidden'); }
}

// ── Join Room ────────────────────────────────────────────────────
async function mpJoinRoom() {
  mpClearError();
  const name = mu.playerName?.value.trim();
  const code = (mu.roomCodeInput?.value || '').trim().toUpperCase();

  if (!name) { mpShowError('אנא הכנס שם לפני הצטרפות.'); return; }
  if (code.length !== 6) { mpShowError('קוד החדר חייב להיות בן 6 תווים.'); return; }

  if (mu.joinRoomBtn) { mu.joinRoomBtn.disabled = true; mu.joinRoomBtn.textContent = '⏳ מחפש...'; }
  ms.roomRef = ms.db.ref(`${MP_ROOMS_PATH}/${code}`);

  let snapshot;
  try { snapshot = await ms.roomRef.once('value'); }
  catch {
    if (mu.joinRoomBtn) { mu.joinRoomBtn.disabled = false; mu.joinRoomBtn.textContent = '🚀 הצטרף'; }
    mpShowError('שגיאה בחיבור ל-Firebase. בדוק אינטרנט ונסה שוב.'); return;
  }
  if (mu.joinRoomBtn) { mu.joinRoomBtn.disabled = false; mu.joinRoomBtn.textContent = '🚀 הצטרף'; }

  const room = snapshot.val();
  if (!room)                     { mpShowError('חדר לא נמצא — בדוק את הקוד ונסה שוב.'); return; }
  if (!room.maxPlayers)           { mpShowError('הקוד הזה שייך לדו-קרב, לא למשחק קבוצתי.'); return; }
  if (room.status !== 'waiting')  { mpShowError('החדר כבר התחיל או הסתיים.'); return; }

  const activePlayers = Object.values(room.players || {}).filter(p => p.connected !== false);
  if (activePlayers.length >= MAX_PLAYERS_MP) { mpShowError(`החדר מלא — כבר ${MAX_PLAYERS_MP} שחקנים.`); return; }
  // איפשר להצטרף מחדש אם השחקן יצא (connected === false)
  if (room.players?.[ms.playerId] && room.players[ms.playerId].connected !== false) { mpShowError('אתה כבר בחדר הזה.'); return; }

  ms.playerName      = name;
  ms.role            = 'player';
  ms.roomId          = code;
  ms.questionCount   = room.questionCount   || 8;
  ms.questionTimeSec = room.questionTimeSec || 30;
  ms.lectureIds      = room.lectureIds      || [];

  const qMap = new Map(ms.allQuestions.map(q => [q.uniqueId, q]));
  ms.selectedQuestions = (room.questionIds || []).map(id => qMap.get(id)).filter(Boolean);
  if (!ms.selectedQuestions.length) { mpShowError('שגיאה בטעינת השאלות מהחדר.'); return; }

  // Atomic join write
  try {
    await ms.roomRef.update({
      [`players/${ms.playerId}`]: {
        name, role: 'player',
        totalScore: 0, currentIndex: 0,
        answeredIndex: -1, answerTimeMs: null, roundScore: null,
        finished: false, connected: true,
        readyConfirmed: false, nextConfirmed: false,
      },
    });
    ms.roomRef.child(`players/${ms.playerId}/connected`).onDisconnect().set(false);
  } catch (e) { mpShowError('שגיאה בהצטרפות לחדר.'); console.error(e); return; }

  mpSetupWaitingRoomUI(code);
  mpRenderWaitingPlayerList(room.players || {});
  mpShowSection(mu.waitingSection);
  mpSetStatus(`הצטרפת לחדר ${code} — לחץ "אני מוכן" כדי להתחיל`);
  mpAttachWaitingRoomListener();
}

// ── Waiting Room Listener (host + all players) ────────────────────
function mpAttachWaitingRoomListener() {
  if (ms.waitingListener) { ms.roomRef.off('value', ms.waitingListener); ms.waitingListener = null; }

  ms.waitingListener = ms.roomRef.on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;
    const players = room.players || {};

    // Update player list
    mpRenderWaitingPlayerList(players);

    // Host disconnected in waiting room (non-hosts get error)
    if (ms.role !== 'host' && players[room.hostId]?.connected === false) {
      ms.roomRef.off('value', ms.waitingListener);
      ms.waitingListener = null;
      mpShowSection(mu.lobbySection);
      mpShowError('המארח התנתק. החדר נסגר.');
      return;
    }

    // Host checks if all ready on every state change
    if (ms.role === 'host' && room.status === 'waiting') {
      mpCheckAllReady(room);
    }

    // Game starting — everyone transitions together
    if (room.status === 'countdown_start') {
      ms.roomRef.off('value', ms.waitingListener);
      ms.waitingListener = null;

      // Build opponents map from snapshot
      ms.opponents = {};
      Object.entries(players).forEach(([id, p]) => {
        if (id !== ms.playerId) {
          ms.opponents[id] = { name: p.name || 'שחקן', totalScore: 0, answeredIndex: -1, roundScore: 0, nextConfirmed: -1, finished: false, connected: true };
        }
      });

      // Show player names in countdown screen
      const names = Object.values(players).map(p => p.name).join(' · ');
      if (mu.countdownPlayers) mu.countdownPlayers.textContent = names;

      mpStartCountdown(() => { mpStartMultiplayerQuiz(); mpStartRoomListener(); });
    }
  });
}

// ── Ready ─────────────────────────────────────────────────────────
function mpConfirmReady() {
  if (ms.waitingPlayerCount < 2) return; // guard: אי אפשר להתחיל לבד
  if (mu.readyBtn) { mu.readyBtn.disabled = true; mu.readyBtn.textContent = '✅ מוכן!'; }
  if (mu.waitingReadyMsg) { mu.waitingReadyMsg.textContent = 'ממתין לשאר השחקנים...'; mu.waitingReadyMsg.classList.remove('hidden'); }

  ms.roomRef?.child(`players/${ms.playerId}`).update({ readyConfirmed: true })
    .catch(e => console.error(e));
  // Note: mpCheckAllReady is triggered by the Firebase listener on the host side
}

function mpCheckAllReady(room) {
  if (ms.role !== 'host') return;
  if (!room || room.status !== 'waiting') return;

  const connected = Object.values(room.players || {}).filter(p => p.connected !== false);
  if (connected.length < 2) return;   // need at least 2 players to start
  if (!connected.every(p => p.readyConfirmed)) return;

  // All connected players are ready — start!
  ms.roomRef.update({ status: 'countdown_start' }).catch(e => console.error(e));
}

// ── Countdown ─────────────────────────────────────────────────────
function mpStartCountdown(onDone) {
  mpShowSection(mu.countdownSection);
  mpSetStatus('המשחק מתחיל בעוד...');
  let count = 3;
  if (mu.countdownNumber) mu.countdownNumber.textContent = count;

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      if (mu.countdownNumber) mu.countdownNumber.textContent = count;
    } else {
      clearInterval(interval);
      if (mu.countdownNumber) mu.countdownNumber.textContent = '🚀';
      setTimeout(() => onDone?.(), 700);
    }
  }, 1000);
}

// ── Start Quiz ────────────────────────────────────────────────────
function mpStartMultiplayerQuiz() {
  ms.currentIndex = 0;
  ms.totalScore   = 0;
  ms.answered     = false;
  ms.selfFinished = false;
  ms.myRoundScore = 0;

  Object.keys(ms.opponents).forEach(id => {
    ms.opponents[id].totalScore    = 0;
    ms.opponents[id].answeredIndex = -1;
    ms.opponents[id].roundScore    = 0;
    ms.opponents[id].finished      = false;
  });

  mpSetStatus('');
  if (mu.status) mu.status.classList.add('hidden');

  if (ms.role === 'host') {
    ms.roomRef?.update({
      status:          'question',
      questionIndex:   0,
      questionStartAt: firebase.database.ServerValue.TIMESTAMP,
    }).catch(() => {});
  }
}

// ── Room-level Listener (drives transitions during quiz) ──────────
function mpStartRoomListener() {
  if (!ms.roomRef) return;

  ms.roomListener = ms.roomRef.on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;

    const allPlayers = Object.entries(room.players || {});

    // Update opponents map
    allPlayers.forEach(([id, p]) => {
      if (id === ms.playerId) return;
      ms.opponents[id] = {
        name:          p.name          || ms.opponents[id]?.name || 'שחקן',
        totalScore:    p.totalScore    || 0,
        answeredIndex: p.answeredIndex ?? -1,
        roundScore:    p.roundScore    ?? 0,
        nextConfirmed: p.nextConfirmed ?? -1,
        finished:      p.finished      || false,
        connected:     p.connected     !== false,
      };
    });

    // Host disconnect during active game
    if (ms.role !== 'host') {
      const hostData = (room.players || {})[room.hostId];
      const activeStatuses = ['question', 'feedback', 'countdown_next', 'countdown_start'];
      if (hostData?.connected === false && activeStatuses.includes(room.status)) {
        mpHandleHostDisconnect();
        return;
      }
    }

    // ניתוק אורח — בדוק אם נשאר שחקן אחד בלבד
    const activeGameStatuses = ['question', 'feedback', 'countdown_next'];
    if (activeGameStatuses.includes(room.status) && !ms.selfFinished) {
      const connectedPlayers = allPlayers.filter(([, p]) => p.connected !== false);
      if (connectedPlayers.length === 1 && connectedPlayers[0][0] === ms.playerId) {
        mpHandleTechnicalWin();
        return;
      }
    }

    // עדכון סטאטוס ענייה בלוח התוצאות החי
    if (room.status === 'question') {
      mpRenderLiveLeaderboard();
    }

    // Host: check if all answered
    if (room.status === 'question' && ms.role === 'host' && ms.answered) {
      mpCheckAllAnswered(room);
    }

    // Host: check if all confirmed "next"
    if (room.status === 'feedback' && ms.role === 'host') {
      mpCheckAllNext(room);
    }

    // ── STATUS TRANSITIONS ──────────────────────────────────────
    if (room.status === 'question' && room.questionIndex != null) {
      const qi = room.questionIndex;
      if (room.questionStartAt && !mu.quizSection?.classList.contains('shown_q' + qi)) {
        ms.currentIndex      = qi;
        ms.questionStartTime = room.questionStartAt - ms.firebaseTimeDelta;
        mpShowQuestion();
      }
    }

    if (room.status === 'feedback' && !mu.feedbackSection?.classList.contains('active-feedback')) {
      mpShowFeedbackScreen();
    }

    if (room.status === 'countdown_next') {
      mu.feedbackSection?.classList.remove('active-feedback');
      if (!ms.countingNext) {
        ms.countingNext = true;
        mu.countdownSection?.classList.add('counting');
        mpStartCountdown(() => {
          mu.countdownSection?.classList.remove('counting');
          if (ms.role === 'host') {
            ms.currentIndex++;
            if (ms.currentIndex >= ms.selectedQuestions.length) {
              mpFinishQuiz();
            } else {
              ms.roomRef?.update({
                status:          'question',
                questionIndex:   ms.currentIndex,
                questionStartAt: firebase.database.ServerValue.TIMESTAMP,
              }).catch(() => {});
            }
          }
        });
      }
    }

    if (room.status === 'finished') {
      if (!ms.selfFinished) mpFinishQuiz();
    }
  });
}

// ── Check All Answered ────────────────────────────────────────────
function mpCheckAllAnswered(room) {
  if (ms.role !== 'host') return;
  if (room.status !== 'question') return;
  const players = Object.entries(room.players || {});
  const active  = players.filter(([, p]) => p.connected !== false);
  if (active.length === 0) return;
  if (active.every(([, p]) => (p.answeredIndex ?? -1) >= ms.currentIndex)) {
    ms.roomRef.update({ status: 'feedback' }).catch(() => {});
  }
}

// ── Check All Confirmed "Next" ────────────────────────────────────
async function mpCheckAllNext(room) {
  if (ms.role !== 'host') return;
  if (room.status !== 'feedback') return;

  // Re-read for fresh data (multiple players may confirm in rapid succession)
  const snap = await ms.roomRef.once('value');
  const freshRoom = snap.val();
  if (!freshRoom || freshRoom.status !== 'feedback') return;

  const active = Object.values(freshRoom.players || {}).filter(p => p.connected !== false);
  if (!active.every(p => p.nextConfirmed === ms.currentIndex)) return;

  const isLast = ms.currentIndex >= ms.selectedQuestions.length - 1;
  if (isLast) {
    await ms.roomRef.update({ status: 'finished' });
    mpFinishQuiz();
  } else {
    mu.feedbackSection?.classList.remove('active-feedback');
    await ms.roomRef.update({ status: 'countdown_next' });
  }
}

// ── Show Question ──────────────────────────────────────────────────
function mpShowQuestion() {
  const q = ms.selectedQuestions[ms.currentIndex];
  if (!q) return;

  ms.countingNext        = false;
  ms.answered            = false;
  ms.myAnswerTime        = null;
  ms.myRoundScore        = 0;
  ms.displayedChoices    = {};
  ms.currentCorrectLabel = '';
  Object.keys(ms.opponents).forEach(id => { ms.opponents[id].roundScore = 0; });

  mu.quizSection?.classList.add('shown_q' + ms.currentIndex);

  const total = ms.selectedQuestions.length;
  if (mu.progressBar) mu.progressBar.style.width = `${(ms.currentIndex / total) * 100}%`;
  if (mu.questionNum)  mu.questionNum.textContent  = `שאלה ${ms.currentIndex + 1} / ${total}`;
  if (mu.questionMeta) mu.questionMeta.textContent = `שיעור ${Number(q.lectureId)} — ${q.lectureTitle}`;
  if (mu.questionText) mu.questionText.textContent = q.text;

  if (mu.feedback)     { mu.feedback.className = 'feedback hidden'; mu.feedback.innerHTML = ''; }
  if (mu.waitingOthersMsg) mu.waitingOthersMsg.classList.add('hidden');
  if (mu.othersAnsweredBadge) { mu.othersAnsweredBadge.classList.add('hidden'); mu.othersAnsweredBadge.textContent = ''; }
  if (mu.submitBtn)    { mu.submitBtn.classList.remove('hidden'); mu.submitBtn.disabled = false; }

  // Shuffle choices
  const srcKeys = Object.keys(q.choices).filter(k => ['A','B','C','D'].includes(k));
  const labels  = ['A','B','C','D'];
  if (mu.answersForm) mu.answersForm.innerHTML = '';

  mpShuffle(srcKeys).forEach((srcKey, idx) => {
    const dlabel = labels[idx];
    ms.displayedChoices[dlabel] = q.choices[srcKey];
    if (srcKey === q.correct) ms.currentCorrectLabel = dlabel;

    const lbl = document.createElement('label');
    lbl.className = 'choice';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'mp-answer'; radio.value = dlabel;
    const span = document.createElement('span');
    span.textContent = `${dlabel}. ${q.choices[srcKey]}`;
    lbl.appendChild(radio); lbl.appendChild(span);
    mu.answersForm?.appendChild(lbl);
  });

  // Reset this player's answer fields in Firebase
  ms.roomRef?.child(`players/${ms.playerId}`).update({
    currentIndex:  ms.currentIndex,
    answeredIndex: ms.currentIndex - 1,
    answerTimeMs:  null,
    roundScore:    null,
    nextConfirmed: -1,
  }).catch(() => {});

  mpRenderLiveLeaderboard();
  mpShowSection(mu.quizSection);
  mpStartQuestionTimer();
}

// ── Submit Answer ──────────────────────────────────────────────────
function mpSubmitAnswer() {
  if (ms.answered) return;

  const chosen = mu.answersForm?.querySelector('input[name="mp-answer"]:checked')?.value;
  if (!chosen) {
    if (mu.feedback) {
      mu.feedback.className = 'feedback bad';
      mu.feedback.textContent = 'אנא בחר תשובה לפני הגשה.';
      mu.feedback.classList.remove('hidden');
    }
    return;
  }

  mpStopTimer();
  ms.answered     = true;
  ms.myAnswerTime = Date.now() - ms.questionStartTime;

  const isCorrect = chosen === ms.currentCorrectLabel;
  const earned    = isCorrect ? mpCalcPoints(ms.myAnswerTime, ms.questionTimeSec * 1000) : 0;
  ms.myRoundScore = earned;
  ms.totalScore  += earned;

  if (mu.submitBtn) mu.submitBtn.classList.add('hidden');
  mu.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (inp) inp.disabled = true;
  });

  if (mu.waitingOthersMsg) {
    mu.waitingOthersMsg.textContent = '⏳ תשובתך נרשמה! ממתין שהשאר יסיימו...';
    mu.waitingOthersMsg.classList.remove('hidden');
  }

  ms.roomRef?.child(`players/${ms.playerId}`).update({
    totalScore:    ms.totalScore,
    answeredIndex: ms.currentIndex,
    answerTimeMs:  ms.myAnswerTime,
    roundScore:    earned,
  }).then(() => {
    if (ms.role === 'host') {
      ms.roomRef.once('value').then(snap => {
        const r = snap.val();
        if (r) mpCheckAllAnswered(r);
      });
    }
  }).catch(() => {});
}

// ── Timeout ────────────────────────────────────────────────────────
function mpTimeoutAnswer() {
  if (ms.answered) return;
  mpStopTimer();
  ms.answered     = true;
  ms.myAnswerTime = ms.questionTimeSec * 1000;
  ms.myRoundScore = 0;

  if (mu.submitBtn) mu.submitBtn.classList.add('hidden');
  mu.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (inp) inp.disabled = true;
  });
  if (mu.waitingOthersMsg) {
    mu.waitingOthersMsg.textContent = '⏰ נגמר הזמן! ממתין שהשאר יסיימו...';
    mu.waitingOthersMsg.classList.remove('hidden');
  }

  ms.roomRef?.child(`players/${ms.playerId}`).update({
    answeredIndex: ms.currentIndex,
    answerTimeMs:  ms.myAnswerTime,
    roundScore:    0,
  }).then(() => {
    if (ms.role === 'host') {
      ms.roomRef.once('value').then(snap => {
        const r = snap.val();
        if (r) mpCheckAllAnswered(r);
      });
    }
  }).catch(() => {});
}

// ── Feedback Screen ────────────────────────────────────────────────
function mpShowFeedbackScreen() {
  mu.feedbackSection?.classList.add('active-feedback');
  mpStopTimer();

  const total     = ms.selectedQuestions.length;
  const myPts     = ms.myRoundScore;
  const timedOut  = (ms.myAnswerTime != null && ms.myAnswerTime >= ms.questionTimeSec * 1000);
  const isCorrect = myPts > 0;
  const q         = ms.selectedQuestions[ms.currentIndex];

  if (mu.fbSectionTitle) mu.fbSectionTitle.textContent = `📊 סיכום שאלה ${ms.currentIndex + 1} / ${total}`;

  // Verdict
  const resultHtml = timedOut
    ? `<p class="fb-verdict fb-wrong">⏰ נגמר הזמן!</p>`
    : isCorrect
      ? `<p class="fb-verdict fb-correct">✅ נכון! <span class="round-pts-earned">+${myPts} נקודות</span></p>`
      : `<p class="fb-verdict fb-wrong">❌ לא נכון. התשובה הנכונה: <strong>${ms.currentCorrectLabel}.</strong> ${ms.displayedChoices[ms.currentCorrectLabel] || ''}</p>`;
  if (mu.fbResult) mu.fbResult.innerHTML = resultHtml;

  // Highlight choices
  mu.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (!inp) return;
    if (inp.value === ms.currentCorrectLabel) lbl.classList.add('choice-correct');
    else if (inp.checked && inp.value !== ms.currentCorrectLabel) lbl.classList.add('choice-wrong');
  });

  // Explanation
  if (mu.fbExplanation) mu.fbExplanation.innerHTML = `<p>💡 ${q?.explanation || ''}</p>`;

  // Round scores — all players sorted by points earned this round
  const allRound = [
    { name: ms.playerName, pts: myPts, total: ms.totalScore, isMe: true },
    ...Object.values(ms.opponents).map(o => ({ name: o.name, pts: o.roundScore || 0, total: o.totalScore || 0, isMe: false })),
  ].sort((a, b) => b.pts - a.pts);

  const maxPts = Math.max(...allRound.map(p => p.pts), 1);

  if (mu.fbRoundScores) {
    mu.fbRoundScores.innerHTML = `
      <div class="duel-round-scores">
        ${allRound.map((p, i) => `
          <div class="round-score-row">
            <span class="round-score-name">${['🥇','🥈','🥉'][i] || '  '} ${p.name}${p.isMe ? ' (אתה)' : ''}</span>
            <span class="round-score-pts ${p.pts === maxPts && p.pts > 0 ? 'round-winner' : ''}">+${p.pts} נק'</span>
          </div>`).join('')}
        <div class="round-score-total">סה"כ: ${
          [...allRound].sort((a, b) => b.total - a.total)
            .map(p => `${p.name} <strong>${p.total}</strong>`)
            .join(' · ')
        }</div>
      </div>`;
  }

  if (mu.nextConfirmBtn) {
    mu.nextConfirmBtn.disabled    = false;
    mu.nextConfirmBtn.textContent = ms.currentIndex < ms.selectedQuestions.length - 1
      ? 'אני מוכן לשאלה הבאה →'
      : 'אני מוכן לתוצאות הסופיות';
  }
  if (mu.waitingNextMsg) mu.waitingNextMsg.classList.add('hidden');

  mpShowSection(mu.feedbackSection);
}

// ── Confirm Next ──────────────────────────────────────────────────
function mpConfirmNext() {
  if (mu.nextConfirmBtn) { mu.nextConfirmBtn.disabled = true; mu.nextConfirmBtn.textContent = '✅ מוכן!'; }
  if (mu.waitingNextMsg) { mu.waitingNextMsg.textContent = 'ממתין שהשאר יאשרו...'; mu.waitingNextMsg.classList.remove('hidden'); }

  ms.roomRef?.child(`players/${ms.playerId}`).update({ nextConfirmed: ms.currentIndex })
    .then(() => {
      if (ms.role === 'host') {
        ms.roomRef.once('value').then(snap => {
          const r = snap.val();
          if (r) mpCheckAllNext(r);
        });
      }
    })
    .catch(e => console.error(e));
}

// ── Technical Win (last player standing) ────────────────────────────
function mpHandleTechnicalWin() {
  if (ms.selfFinished) return;
  mpStopTimer();
  ms.selfFinished = true;

  if (ms.roomRef && ms.roomListener) {
    ms.roomRef.off('value', ms.roomListener);
    ms.roomListener = null;
  }

  ms.roomRef?.child(`players/${ms.playerId}`).update({
    totalScore: ms.totalScore,
    finished:   true,
  }).catch(() => {});

  mpShowSection(mu.resultSection);
  if (mu.winnerBanner) {
    mu.winnerBanner.innerHTML = '🏆 ניצחון טכני! כל יתר השחקנים התנתקו';
    mu.winnerBanner.className = 'duel-winner-banner banner-win';
  }
  if (mu.finalRanking) {
    mu.finalRanking.innerHTML = `
      <div class="mp-ranking-table">
        <div class="mp-rank-row mp-rank-me mp-rank-first">
          <span class="mp-rank-medal">🥇</span>
          <span class="mp-rank-name">${ms.playerName} <span class="mp-me-tag">(אתה)</span></span>
          <span class="mp-rank-score">${ms.totalScore}</span>
        </div>
      </div>`;
  }
  if (mu.resultDetails) {
    mu.resultDetails.innerHTML = '<p style="font-size:13px; text-align:center;">המשחק הסתיים עקב ניתוק כלל יתר השחקנים.</p>';
  }
  mpSetStatus('ניצחון טכני — כל יתר השחקנים התנתקו 🏆');
}

// ── Host Disconnected (non-hosts) ─────────────────────────────────
function mpHandleHostDisconnect() {
  if (ms.selfFinished) return;
  mpStopTimer();
  ms.selfFinished = true;

  if (ms.roomRef && ms.roomListener) {
    ms.roomRef.off('value', ms.roomListener);
    ms.roomListener = null;
  }

  mpShowSection(mu.resultSection);
  if (mu.winnerBanner) {
    mu.winnerBanner.innerHTML = '⚠️ המארח התנתק — המשחק הסתיים';
    mu.winnerBanner.className = 'duel-winner-banner banner-tie';
  }
  if (mu.finalRanking) mu.finalRanking.innerHTML = '<p style="text-align:center; padding:16px;">המשחק הופסק עקב ניתוק המארח.</p>';
  mpSetStatus('המשחק הסתיים.');
}

// ── Finish Quiz ────────────────────────────────────────────────────
function mpFinishQuiz() {
  if (ms.selfFinished) return;
  mpStopTimer();
  ms.selfFinished = true;

  ms.roomRef?.child(`players/${ms.playerId}`).update({
    totalScore:   ms.totalScore,
    currentIndex: ms.selectedQuestions.length,
    finished:     true,
  }).catch(() => {});

  mpShowFinalResults();
}

// ── Final Results ──────────────────────────────────────────────────
function mpShowFinalResults() {
  mpShowSection(mu.resultSection);

  const all = [
    { name: ms.playerName, score: ms.totalScore, isMe: true },
    ...Object.values(ms.opponents).map(o => ({ name: o.name, score: o.totalScore || 0, isMe: false })),
  ].sort((a, b) => b.score - a.score);

  const maxPts = ms.questionCount * MAX_POINTS_MP;
  const medals = ['🥇', '🥈', '🥉'];
  const winner = all[0];
  const meRank = all.findIndex(p => p.isMe) + 1;

  if (mu.winnerBanner) {
    if (winner.isMe) {
      mu.winnerBanner.innerHTML = '🏆 כל הכבוד! ניצחת!';
      mu.winnerBanner.className = 'duel-winner-banner banner-win';
    } else if (meRank === 2) {
      mu.winnerBanner.innerHTML = `🥈 ${winner.name} ניצח/ה! אתה/את במקום 2`;
      mu.winnerBanner.className = 'duel-winner-banner banner-tie';
    } else {
      mu.winnerBanner.innerHTML = `🏆 ${winner.name} ניצח/ה! (אתה במקום ${meRank})`;
      mu.winnerBanner.className = 'duel-winner-banner banner-lose';
    }
  }

  if (mu.finalRanking) {
    mu.finalRanking.innerHTML = `
      <div class="mp-ranking-table">
        ${all.map((p, i) => `
          <div class="mp-rank-row ${p.isMe ? 'mp-rank-me' : ''} ${i === 0 ? 'mp-rank-first' : ''}">
            <span class="mp-rank-medal">${medals[i] || (i + 1)}</span>
            <span class="mp-rank-name">${p.name}${p.isMe ? ' <span class="mp-me-tag">(אתה)</span>' : ''}</span>
            <span class="mp-rank-score">${p.score}</span>
            <span class="mp-rank-pct">${Math.round((p.score / maxPts) * 100)}%</span>
          </div>`).join('')}
      </div>`;
  }

  if (mu.resultDetails) {
    mu.resultDetails.innerHTML = `<p style="font-size:13px; text-align:center;">מקסימום: ${maxPts} נק' (${ms.questionCount} שאלות × ${MAX_POINTS_MP} נק')</p>`;
  }

  mpSetStatus('המשחק הסתיים! 🎉');
}

// ── Copy Room Code ─────────────────────────────────────────────────
function mpCopyRoomCode() {
  const code = ms.roomId || '';
  if (!code) return;
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = code; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  };
  (navigator.clipboard?.writeText(code) ?? Promise.reject())
    .catch(fallback)
    .finally(() => {
      if (mu.copyCodeBtn) {
        mu.copyCodeBtn.textContent = '✅ הועתק!';
        setTimeout(() => { if (mu.copyCodeBtn) mu.copyCodeBtn.textContent = '📋 העתק קוד'; }, 2000);
      }
    });
}

// ── Play Again ─────────────────────────────────────────────────────
function mpPlayAgain() {
  if (ms.roomRef) {
    ms.roomRef.off();
    if (ms.role === 'host') ms.roomRef.remove().catch(() => {});
  }
  mpStopTimer();

  Object.assign(ms, {
    roomId: null, roomRef: null, roomListener: null, waitingListener: null, role: null,
    opponents: {}, selectedQuestions: [], displayedChoices: {}, currentCorrectLabel: '',
    currentIndex: 0, totalScore: 0, myRoundScore: 0, myAnswerTime: null,
    answered: false, selfFinished: false, countingNext: false,
  });

  [...(mu.quizSection?.classList || [])].filter(c => c.startsWith('shown_q')).forEach(c => mu.quizSection.classList.remove(c));
  mu.feedbackSection?.classList.remove('active-feedback');
  mu.countdownSection?.classList.remove('counting');
  if (mu.readyBtn) { mu.readyBtn.disabled = false; mu.readyBtn.textContent = '✅ אני מוכן!'; }
  if (mu.status) mu.status.classList.remove('hidden');
  mpShowSection(mu.lobbySection);
  mpSetStatus('הכנס שם ובחר: צור חדר חדש או הצטרף לחדר קיים');
}

// ── Keyboard shortcuts ─────────────────────────────────────────────
function mpOnKeyDown(e) {
  if (e.key !== 'Enter') return;
  if (!mu.quizSection?.classList.contains('hidden') && !ms.answered) { mpSubmitAnswer(); return; }
  if (!mu.feedbackSection?.classList.contains('hidden') && !mu.nextConfirmBtn?.disabled) { mpConfirmNext(); }
}

// ── Init ───────────────────────────────────────────────────────────
function mpInit() {
  mpInitTheme();

  const text = window.QUESTIONS_TEXT || '';
  if (text) {
    const parsed = mpParseQuestionsText(text);
    ms.allQuestions = parsed.allQuestions;
    ms.lectures     = parsed.lectures;
    mpRenderLectureFilters();
  }

  ms.playerId = mpGetOrCreatePlayerId();

  if (!mpInitFirebase()) {
    const lobby = document.querySelector('#mp-lobby-section');
    if (lobby) lobby.innerHTML = `
      <div style="padding:20px; color:var(--bad);">
        <h3>❌ Firebase לא מוגדר</h3>
        <p>יש למלא את פרטי Firebase ב-<strong>multiplayer.js</strong> (שורת FIREBASE_CONFIG_MP).</p>
      </div>`;
    return;
  }

  // Event listeners
  mu.createRoomBtn?.addEventListener('click', mpCreateRoom);
  mu.joinRoomBtn?.addEventListener('click', mpJoinRoom);
  mu.copyCodeBtn?.addEventListener('click', mpCopyRoomCode);
  mu.readyBtn?.addEventListener('click', mpConfirmReady);
  mu.submitBtn?.addEventListener('click', mpSubmitAnswer);
  mu.nextConfirmBtn?.addEventListener('click', mpConfirmNext);
  mu.playAgainBtn?.addEventListener('click', mpPlayAgain);
  mu.themeToggle?.addEventListener('click', () => {
    mpApplyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  mu.roomCodeInput?.addEventListener('input', () => {
    mu.roomCodeInput.value = mu.roomCodeInput.value.toUpperCase();
  });
  mu.roomCodeInput?.addEventListener('keydown', e => { if (e.key === 'Enter') mpJoinRoom(); });
  document.addEventListener('keydown', mpOnKeyDown);

  // Lobby tab toggle
  const tabCreate   = document.getElementById('mp-tab-create');
  const tabJoin     = document.getElementById('mp-tab-join');
  const panelCreate = document.getElementById('mp-panel-create');
  const panelJoin   = document.getElementById('mp-panel-join');

  function mpSwitchTab(tab) {
    const isCreate = (tab === 'create');
    tabCreate?.classList.toggle('active', isCreate);
    tabJoin?.classList.toggle('active', !isCreate);
    tabCreate?.setAttribute('aria-selected', String(isCreate));
    tabJoin?.setAttribute('aria-selected', String(!isCreate));
    panelCreate?.classList.toggle('hidden', !isCreate);
    panelJoin?.classList.toggle('hidden', isCreate);
  }

  tabCreate?.addEventListener('click', () => mpSwitchTab('create'));
  tabJoin?.addEventListener('click',   () => mpSwitchTab('join'));

  // Deep link: ?room=XXXXXX auto-fills the join field
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom && urlRoom.length === 6) {
    if (mu.roomCodeInput) mu.roomCodeInput.value = urlRoom.toUpperCase();
    mpSwitchTab('join');
    if (mu.playerName) mu.playerName.focus();
    mpShowToast('🎮 קוד חדר זוהה אוטומטית — הכנס שם ולחץ הצטרף!', 'info', 4000);
  }
}

document.addEventListener('DOMContentLoaded', mpInit);
