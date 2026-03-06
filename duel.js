// ════════════════════════════════════════════════════════════════
//  ⚔️  DUEL MODE  —  Real-time multiplayer via Firebase
//
//  זרימת משחק:
//  1. שני שחקנים בחדר ההמתנה → שניהם לוחצים “אני מוכן”
//  2. ספירה 3-2-1 → שאלה (timeout מסונכרן לפי Firebase timestamp)
//  3. שניהם ענו (/ נגמר זמן) → מסך פידבק עם ניקוד
//  4. שניהם לוחצים “הבאה” → ספירה 3-2-1 → שאלה הבאה
//  5. אחרי 8 שאלות → סיכום סופי
// ════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCyazG1L4p2qqbSQOZ5lRiO4QMrtyYb-lY",
  authDomain:        "study-guide-duel-mode.firebaseapp.com",
  databaseURL:       "https://study-guide-duel-mode-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "study-guide-duel-mode",
  storageBucket:     "study-guide-duel-mode.firebasestorage.app",
  messagingSenderId: "418263522242",
  appId:             "1:418263522242:web:6f8b90c0ade9f2b7d4145b",
  measurementId:     "G-137RN5FD0V",
};

// ── קבועים ──────────────────────────────────────────────────────
const MAX_POINTS_PER_Q    = 100;  // ניקוד מקסימלי לשאלה
const THEME_KEY           = 'micro-study-theme';

// ── State ────────────────────────────────────────────────────────
const ds = {
  db:                            null,
  roomRef:                       null,
  roomListener:                  null,
  waitingListener:               null, // listener reference for the pre-game waiting room
  playerId:                      null,
  opponentId:                    null,
  role:                          null,   // 'host' | 'guest'
  playerName:                    '',
  opponentName:                  '',
  allQuestions:                  [],
  lectures:                      [],
  selectedQuestions:             [],
  displayedChoices:              {},
  currentCorrectLabel:           '',
  currentIndex:                  0,
  questionCount:                 8,    // set by host at room creation
  questionTimeSec:               30,   // set by host at room creation
  questionStartTime:             0,     // local timestamp aligned to server
  firebaseTimeDelta:             0,     // server_time - Date.now()
  timerInterval:                 null,
  answered:                      false,
  myAnswerTime:                  null,
  totalScore:                    0,
  opponentTotalScore:            0,
  myRoundScore:                  0,
  oppRoundScore:                 0,
  selfFinished:                  false,
  opponentFinished:              false,
  opponentCurrentAnsweredIndex:  -1,
  oppReadyConfirmed:             false,
  oppNextConfirmed:              false,
  countingNext:                  false, // true while between-question countdown is running
  roomId:                        null,
  lectureIds:                    [],    // stored so rematch can pick same lectures
  rematchRequested:              false,
};

// ── Element References ───────────────────────────────────────────
const du = {
  status:           document.getElementById('duel-status'),
  themeToggle:      document.getElementById('theme-toggle'),

  // Lobby
  lobbySection:      document.getElementById('lobby-section'),
  playerName:        document.getElementById('player-name'),
  numQuestionsInput: document.getElementById('duel-num-questions'),
  timeLimitInput:    document.getElementById('duel-time-limit'),
  lectureFilters:    document.getElementById('duel-lecture-filters'),
  createRoomBtn:     document.getElementById('create-room-btn'),
  roomCodeInput:     document.getElementById('room-code-input'),
  joinRoomBtn:       document.getElementById('join-room-btn'),
  lobbyError:        document.getElementById('lobby-error'),

  // Waiting room (before game)
  waitingSection:    document.getElementById('waiting-section'),
  roomCodeDisplay:   document.getElementById('room-code-display'),
  copyCodeBtn:       document.getElementById('copy-code-btn'),
  whatsappShareBtn:  document.getElementById('whatsapp-share-btn'),
  waitMeName:        document.getElementById('wait-me-name'),
  waitOppName:      document.getElementById('wait-opp-name'),
  waitOppBadge:     document.getElementById('wait-opp-badge'),
  readyBtn:         document.getElementById('ready-btn'),
  waitingReadyMsg:  document.getElementById('waiting-ready-msg'),

  // Countdown
  countdownSection: document.getElementById('countdown-section'),
  countdownNumber:  document.getElementById('countdown-number'),
  cdMeName:         document.getElementById('cd-me-name'),
  cdOppName:        document.getElementById('cd-opp-name'),

  // Quiz
  quizSection:      document.getElementById('duel-quiz-section'),
  timerArc:         document.getElementById('duel-timer-arc'),
  timerText:        document.getElementById('duel-timer-text'),
  liveMeName:       document.getElementById('live-me-name'),
  liveMeScore:      document.getElementById('live-me-score'),
  liveOppName:      document.getElementById('live-opp-name'),
  liveOppScore:     document.getElementById('live-opp-score'),
  oppAnsweredBadge: document.getElementById('opp-answered-badge'),
  progressBar:      document.getElementById('duel-progress-bar'),
  questionNum:      document.getElementById('duel-question-num'),
  questionMeta:     document.getElementById('duel-question-meta'),
  questionText:     document.getElementById('duel-question-text'),
  answersForm:      document.getElementById('duel-answers-form'),
  submitBtn:        document.getElementById('duel-submit-btn'),
  feedback:         document.getElementById('duel-feedback'),
  waitingOppMsg:    document.getElementById('duel-waiting-opp'),

  // Feedback screen (between questions)
  feedbackSection:  document.getElementById('duel-feedback-section'),
  fbResult:         document.getElementById('fb-result'),
  fbExplanation:    document.getElementById('fb-explanation'),
  fbRoundScores:    document.getElementById('fb-round-scores'),
  nextConfirmBtn:   document.getElementById('next-confirm-btn'),
  waitingNextMsg:   document.getElementById('waiting-next-msg'),

  // Results
  resultSection:    document.getElementById('duel-result-section'),
  winnerBanner:     document.getElementById('duel-winner-banner'),
  finalMeCard:      document.getElementById('final-me-card'),
  finalMeName:      document.getElementById('final-me-name'),
  finalMeScore:     document.getElementById('final-me-score'),
  finalOppCard:     document.getElementById('final-opp-card'),
  finalOppName:     document.getElementById('final-opp-name'),
  finalOppScore:    document.getElementById('final-opp-score'),
  waitingFinalMsg:  null,  // removed – both finish together via Firebase status
  resultDetails:    document.getElementById('duel-result-details'),
  rematchBtn:       document.getElementById('duel-rematch-btn'),
  rematchWaitingMsg:document.getElementById('rematch-waiting-msg'),
  playAgainBtn:     document.getElementById('duel-play-again-btn'),
};

// ── Utilities ────────────────────────────────────────────────────

const ALL_SECTIONS = () => [
  du.lobbySection, du.waitingSection, du.countdownSection,
  du.quizSection, du.feedbackSection, du.resultSection,
];

function showSection(section) {
  ALL_SECTIONS().forEach(s => s?.classList.add('hidden'));
  section?.classList.remove('hidden');
}

function setStatus(msg) {
  if (du.status) du.status.textContent = msg;
}

function showError(msg) {
  if (du.lobbyError) {
    du.lobbyError.textContent = msg;
    du.lobbyError.classList.remove('hidden');
  }
}

function clearError() {
  du.lobbyError?.classList.add('hidden');
}

// טואסט התראות
function showToast(msg, type = 'info', durationMs = 3000) {
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

/** Generates a 6-character room code (no 0/O/1/I to avoid confusion) */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Persistent player ID (lives for the browser session) */
function getOrCreatePlayerId() {
  let id = sessionStorage.getItem('duel-player-id');
  if (!id) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('duel-player-id', id);
  }
  return id;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * ניקוד יחסי לפי מהירות תשובה.
 * מינימום 10 נקודות (עדיין כדאי לענות נכון אפילו בשניה האחרונה)
 */
function calcPoints(answerTimeMs, timeLimitMs) {
  if (answerTimeMs <= 0) return MAX_POINTS_PER_Q;
  const ratio = Math.max(0, 1 - answerTimeMs / timeLimitMs);
  return Math.max(10, Math.round(MAX_POINTS_PER_Q * (0.1 + 0.9 * ratio)));
}

// ── SVG Timer ────────────────────────────────────────────────────
const TIMER_R            = 40;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_R;

function setTimerArc(fraction) {
  if (!du.timerArc) return;
  const offset = TIMER_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
  du.timerArc.style.strokeDashoffset = offset;
  if (fraction > 0.5)       du.timerArc.style.stroke = '#22c55e';
  else if (fraction > 0.25) du.timerArc.style.stroke = '#f59e0b';
  else                      du.timerArc.style.stroke = '#ef4444';
}

function startQuestionTimer() {
  clearInterval(ds.timerInterval);
  // questionStartTime is server-aligned: set when Firebase pushes questionStartAt
  const totalMs = ds.questionTimeSec * 1000;
  setTimerArc(1);
  if (du.timerText) du.timerText.textContent = ds.questionTimeSec;

  ds.timerInterval = setInterval(() => {
    const elapsed   = Date.now() - ds.questionStartTime;
    const remaining = Math.max(0, totalMs - elapsed);
    setTimerArc(remaining / totalMs);
    if (du.timerText) du.timerText.textContent = Math.ceil(remaining / 1000);
    if (remaining <= 0) { clearInterval(ds.timerInterval); if (!ds.answered) timeoutAnswer(); }
  }, 100);
}

function stopTimer() {
  clearInterval(ds.timerInterval);
  ds.timerInterval = null;
}

// ── Theme ────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  if (du.themeToggle) {
    du.themeToggle.textContent = theme === 'dark' ? '☀️ מצב בהיר' : '🌙 מצב כהה';
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') { applyTheme(saved); return; }
  applyTheme(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

// ── Question Parsing (mirrors quiz.js) ───────────────────────────

function cleanQuotedValue(raw) {
  if (!raw) return '';
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseQuestionsText(text) {
  const allQuestions = [];
  const lecturesMap = new Map();
  const lines = text.split(/\r?\n/);
  let currentLectureId = '';
  let currentLectureTitle = '';
  let questionSequence = 0;
  let currentQuestion = null;
  let inChoices = false;

  function flush() {
    if (!currentQuestion) return;
    if (
      currentQuestion.text &&
      Object.keys(currentQuestion.choices).length >= 2 &&
      currentQuestion.correct &&
      currentQuestion.explanation
    ) {
      allQuestions.push(currentQuestion);
    }
    currentQuestion = null;
    inChoices = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const m1 = line.match(/^LECTURE_ID:\s*(.+)$/);
    if (m1) {
      flush();
      currentLectureId = cleanQuotedValue(m1[1]);
      if (!lecturesMap.has(currentLectureId)) {
        lecturesMap.set(currentLectureId, { lectureId: currentLectureId, lectureTitle: '' });
      }
      continue;
    }

    const m2 = line.match(/^LECTURE_TITLE:\s*(.+)$/);
    if (m2) {
      currentLectureTitle = cleanQuotedValue(m2[1]);
      if (currentLectureId) {
        lecturesMap.set(currentLectureId, { lectureId: currentLectureId, lectureTitle: currentLectureTitle });
      }
      continue;
    }

    const m3 = line.match(/^(Q\d+_\d+):$/);
    if (m3) {
      flush();
      questionSequence++;
      currentQuestion = {
        uniqueId: `${m3[1]}__${currentLectureId}__${questionSequence}`,
        questionId: m3[1],
        lectureId: currentLectureId,
        lectureTitle: currentLectureTitle,
        text: '',
        choices: {},
        correct: '',
        explanation: '',
      };
      inChoices = false;
      continue;
    }

    if (!currentQuestion) continue;

    if (line.startsWith('question:'))    { currentQuestion.text        = cleanQuotedValue(line.slice(9));  inChoices = false; continue; }
    if (line === 'choices:')             { inChoices = true; continue; }
    if (line.startsWith('correct:'))     { currentQuestion.correct      = cleanQuotedValue(line.slice(8));  inChoices = false; continue; }
    if (line.startsWith('explanation:')) { currentQuestion.explanation  = cleanQuotedValue(line.slice(12)); inChoices = false; continue; }

    if (inChoices) {
      const cm = line.match(/^([A-D]):\s*(.+)$/);
      if (cm) currentQuestion.choices[cm[1]] = cleanQuotedValue(cm[2]);
    }
  }

  flush();
  const lectures = [...lecturesMap.values()].sort((a, b) => Number(a.lectureId) - Number(b.lectureId));
  return { allQuestions, lectures };
}

// ── Lecture Filters ──────────────────────────────────────────────

function renderLectureFilters() {
  if (!du.lectureFilters) return;
  du.lectureFilters.innerHTML = '';
  ds.lectures.forEach(lecture => {
    const lbl = document.createElement('label');
    lbl.className = 'lecture-item';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.value = lecture.lectureId;
    inp.checked = true;
    const span = document.createElement('span');
    span.textContent = `שיעור ${Number(lecture.lectureId)} — ${lecture.lectureTitle}`;
    lbl.appendChild(inp);
    lbl.appendChild(span);
    du.lectureFilters.appendChild(lbl);
  });
}

function getSelectedLectureIds() {
  return [...du.lectureFilters.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
}

// ── Firebase ─────────────────────────────────────────────────────

function initFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    ds.db = firebase.database();
    return true;
  } catch (e) {
    console.error('Firebase init error:', e);
    return false;
  }
}

// ── Create Room ──────────────────────────────────────────────────

async function createRoom() {
  clearError();
  const name = du.playerName?.value.trim();
  if (!name) { showError('אנא הכנס שם לפני יצירת חדר.'); return; }

  const numQ    = Math.round(Number(du.numQuestionsInput?.value) || 8);
  const timeSec = Math.round(Number(du.timeLimitInput?.value)    || 30);
  if (numQ < 3 || numQ > 20) { showError('מספר השאלות חייב להיות בין 3 ל-20.'); return; }
  if (timeSec < 15 || timeSec > 120) { showError('הזמן לשאלה חייב להיות בין 15 ל-120 שניות.'); return; }

  const lectureIds = getSelectedLectureIds();
  if (!lectureIds.length) { showError('אנא בחר לפחות שיעור אחד.'); return; }

  const pool = shuffle(ds.allQuestions.filter(q => lectureIds.includes(q.lectureId)));
  if (pool.length < numQ) {
    showError(`צריך לפחות ${numQ} שאלות. מצאנו ${pool.length} — בחר יותר שיעורים.`);
    return;
  }

  const selected = pool.slice(0, numQ);
  ds.playerName        = name;
  ds.role              = 'host';
  ds.selectedQuestions = selected;
  ds.questionCount     = numQ;
  ds.questionTimeSec   = timeSec;
  ds.lectureIds        = lectureIds;

  const roomId = generateRoomId();
  ds.roomId    = roomId;
  ds.roomRef   = ds.db.ref(`rooms/${roomId}`);

  try {
    await ds.roomRef.set({
      status:          'waiting',
      hostId:          ds.playerId,
      questionCount:   numQ,
      questionTimeSec: timeSec,
      lectureIds:      lectureIds,
      questionIds:     selected.map(q => q.uniqueId),
      players: {
        [ds.playerId]: {
          name, role: 'host',
          totalScore: 0, currentIndex: 0,
          answeredIndex: -1, answerTimeMs: null, roundScore: null,
          finished: false, connected: true,
          readyConfirmed: false, nextConfirmed: false,
        },
      },
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
  } catch (e) {
    showError('שגיאה ביצירת החדר. בדוק אינטרנט ונסה שוב.');
    console.error(e); return;
  }

  ds.roomRef.child(`players/${ds.playerId}/connected`).onDisconnect().set(false);
  setTimeout(() => ds.roomRef?.remove().catch(() => {}), 30 * 60 * 1000);

  if (du.roomCodeDisplay) du.roomCodeDisplay.textContent = roomId;
  if (du.waitMeName)      du.waitMeName.textContent = name;
  if (du.waitOppName)     du.waitOppName.textContent = 'ממתין...';
  if (du.waitOppBadge) {
    du.waitOppBadge.textContent = '⏳ טרם הצטרף';
    du.waitOppBadge.className   = 'duel-player-badge badge-waiting';
  }
  // WhatsApp deep-link share
  const shareUrl = `${location.origin}${location.pathname}?room=${roomId}`;
  const waText   = encodeURIComponent(`⚔️ אתגר דו-קרב מיקרו כלכלה! לחץ/י כאן כדי להצטרף ישירות לחדר שלי (בלי צורך להקליד קוד):
${shareUrl}`);
  if (du.whatsappShareBtn) du.whatsappShareBtn.href = `https://wa.me/?text=${waText}`;
  showSection(du.waitingSection);
  setStatus(`חדר ${roomId} נוצר — שתף את הקוד עם היריב`);
  showToast(`חדר ${roomId} נוצר בהצלחה ✔`, 'ok');
  listenForOpponent();
}

// ── Join Room ────────────────────────────────────────────────────

async function joinRoom() {
  clearError();
  const name = du.playerName?.value.trim();
  const code = (du.roomCodeInput?.value || '').trim().toUpperCase();

  if (!name) { showError('אנא הכנס שם לפני הצטרפות.'); return; }
  if (code.length !== 6) { showError('קוד החדר חייב להיות בן 6 תווים.'); return; }

  // Loading skeleton on join button
  if (du.joinRoomBtn) { du.joinRoomBtn.disabled = true; du.joinRoomBtn.textContent = '⏳ מחפש...'; }
  ds.roomRef = ds.db.ref(`rooms/${code}`);
  let snapshot;
  try {
    snapshot = await ds.roomRef.once('value');
  } catch {
    if (du.joinRoomBtn) { du.joinRoomBtn.disabled = false; du.joinRoomBtn.textContent = '🚀 הצטרף'; }
    showError('שגיאה בחיבור ל-Firebase. בדוק אינטרנט ונסה שוב.');
    return;
  }
  if (du.joinRoomBtn) { du.joinRoomBtn.disabled = false; du.joinRoomBtn.textContent = '🚀 הצטרף'; }

  const room = snapshot.val();
  if (!room)                                     { showError('חדר לא נמצא — בדוק את הקוד ונסה שוב.'); return; }
  if (room.status !== 'waiting')                 { showError('החדר כבר התחיל או הסתיים.'); return; }
  // Count only connected (or never-disconnected) players to allow re-join after disconnect
  const activePlayers = Object.values(room.players || {}).filter(p => p.connected !== false);
  if (activePlayers.length >= 2) { showError('החדר מלא — יש כבר שני שחקנים.'); return; }

  // Resolve host info
  const hostId = room.hostId;
  ds.opponentName    = room.players?.[hostId]?.name || 'יריב';
  ds.playerName      = name;
  ds.role            = 'guest';
  ds.roomId          = code;
  ds.questionCount   = room.questionCount   || 8;
  ds.questionTimeSec = room.questionTimeSec || 30;
  ds.lectureIds      = room.lectureIds      || [];

  // Resolve questions from local question bank (same uniqueIds as host stored)
  const qMap = new Map(ds.allQuestions.map(q => [q.uniqueId, q]));
  ds.selectedQuestions = (room.questionIds || []).map(id => qMap.get(id)).filter(Boolean);

  if (!ds.selectedQuestions.length) { showError('שגיאה בטעינת השאלות מהחדר — ייתכן שגרסאות שאלות שונות.'); return; }

  try {
    await ds.roomRef.child(`players/${ds.playerId}`).set({
      name, role: 'guest',
      totalScore: 0, currentIndex: 0,
      answeredIndex: -1, answerTimeMs: null, roundScore: null,
      finished: false, connected: true,
      readyConfirmed: false, nextConfirmed: false,
    });
    ds.roomRef.child(`players/${ds.playerId}/connected`).onDisconnect().set(false);
    await ds.roomRef.update({ status: 'both_joined', guestId: ds.playerId });
  } catch (e) {
    showError('שגיאה בהצטרפות לחדר.');
    console.error(e); return;
  }

  // Show ready button immediately for guest
  if (du.waitMeName)      du.waitMeName.textContent  = name;
  if (du.waitOppName)     du.waitOppName.textContent = ds.opponentName;
  if (du.waitOppBadge) {
    du.waitOppBadge.textContent = '✅ מחובר';
    du.waitOppBadge.className   = 'duel-player-badge badge-ready';
  }
  if (du.roomCodeDisplay) du.roomCodeDisplay.textContent = code;
  if (du.readyBtn)         du.readyBtn.classList.remove('hidden');
  showSection(du.waitingSection);
  setStatus(`הצטרפת לחדר ${code} — לחץ “אני מוכן” כדי להתחיל`);

  // Guest listens for countdown_start triggered by host
  ds.waitingListener = ds.roomRef.on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;
    const players = room.players || {};
    const oppId = Object.keys(players).find(id => id !== ds.playerId);

    // Host disconnected in waiting room
    if (oppId && players[oppId]?.connected === false) {
      ds.roomRef.off('value', ds.waitingListener);
      ds.waitingListener = null;
      showSection(du.lobbySection);
      showError(`${ds.opponentName || 'המארח'} התנתק. החדר נסגר.`);
      return;
    }

    if (oppId && players[oppId]?.readyConfirmed && du.waitingReadyMsg) {
      ds.oppReadyConfirmed = true;
      du.waitingReadyMsg.textContent = `${ds.opponentName} מוכן! מחכה לעילה...`;
    }
    if (room.status === 'countdown_start') {
      ds.roomRef.off('value', ds.waitingListener);
      ds.waitingListener = null;
      startCountdown(() => {
        startDuelQuiz();
        startRoomListener();
      });
    }
  });
}

// ── Listen for Opponent (host side, waiting room) ────────────────

function listenForOpponent() {
  // Always detach any previous waiting-room listener before adding a new one
  if (ds.waitingListener) {
    ds.roomRef.off('value', ds.waitingListener);
    ds.waitingListener = null;
  }

  ds.waitingListener = ds.roomRef.on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;
    const players = room.players || {};
    const oppId   = Object.keys(players).find(id => id !== ds.playerId);

    // Guest disconnected in waiting room
    if (oppId && players[oppId]?.connected === false) {
      ds.roomRef.off('value', ds.waitingListener);
      ds.waitingListener = null;
      // Reset waiting room UI
      if (du.waitOppName)  du.waitOppName.textContent  = 'ממתין...';
      if (du.waitOppBadge) {
        du.waitOppBadge.textContent = '⏳ טרם הצטרף';
        du.waitOppBadge.className   = 'duel-player-badge badge-waiting';
      }
      if (du.readyBtn) { du.readyBtn.classList.add('hidden'); du.readyBtn.disabled = false; du.readyBtn.textContent = '✅ אני מוכן!'; }
      if (du.waitingReadyMsg) du.waitingReadyMsg.classList.add('hidden');
      // Remove disconnected guest from Firebase so a new guest can join
      ds.roomRef.child(`players/${oppId}`).remove().catch(() => {});
      ds.roomRef.update({ status: 'waiting', guestId: null }).catch(() => {});
      setStatus('היריב התנתק — ממתין לשחקן חדש...');
      showToast(`${players[oppId]?.name || 'היריב'} התנתק — החדר פתוח להצטרפות שחקן חדש`, 'info', 4000);
      listenForOpponent(); // re-attach listener
      return;
    }

    if (oppId && players[oppId]) {
      ds.opponentId   = oppId;
      ds.opponentName = players[oppId].name || 'יריב';
      if (du.waitOppName)  du.waitOppName.textContent = ds.opponentName;
      if (du.waitOppBadge) {
        du.waitOppBadge.textContent = '✅ הצטרף!';
        du.waitOppBadge.className   = 'duel-player-badge badge-ready';
      }
      // Show "I'm ready" button once opponent joined
      if (du.readyBtn) du.readyBtn.classList.remove('hidden');
      setStatus('היריב הצטרף! לחץ “אני מוכן” כדי להתחיל');
    }
    // Watch for readyConfirmed status updates
    if (room.status === 'both_joined') {
      // check if opp already ready
      const oppId2 = Object.keys(players).find(id => id !== ds.playerId);
      if (oppId2 && players[oppId2]?.readyConfirmed) {
        ds.oppReadyConfirmed = true;
        if (du.waitingReadyMsg) du.waitingReadyMsg.textContent = `${ds.opponentName} מוכן! מחכה לעילה...`;
        // If host already clicked ready too, trigger the start now
        if (players[ds.playerId]?.readyConfirmed) checkBothReady();
      }
    }
    if (room.status === 'countdown_start') {
      ds.roomRef.off('value');
      startCountdown(() => {
        startDuelQuiz();
        startRoomListener();
      });
    }
  });
}

// ── Ready Button ─────────────────────────────────────────────────

function confirmReady() {
  if (du.readyBtn) { du.readyBtn.disabled = true; du.readyBtn.textContent = '✅ מוכן!'; }
  if (du.waitingReadyMsg) {
    du.waitingReadyMsg.textContent = 'ממתין שהיריב יאשר גם...';
    du.waitingReadyMsg.classList.remove('hidden');
  }

  ds.roomRef?.child(`players/${ds.playerId}`).update({ readyConfirmed: true })
    .then(() => checkBothReady())
    .catch(e => console.error(e));
}

async function checkBothReady() {
  const snap = await ds.roomRef.once('value');
  const players = snap.val()?.players || {};
  const allReady = Object.values(players).every(p => p.readyConfirmed);
  if (allReady && ds.role === 'host') {
    await ds.roomRef.update({ status: 'countdown_start' });
  }
}

// ── Countdown ────────────────────────────────────────────────────

function startCountdown(onDone) {
  if (du.cdMeName)  du.cdMeName.textContent  = ds.playerName;
  if (du.cdOppName) du.cdOppName.textContent = ds.opponentName || '...';

  showSection(du.countdownSection);
  setStatus('הדו-קרב מתחיל בעוד...');

  let count = 3;
  if (du.countdownNumber) du.countdownNumber.textContent = count;

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      if (du.countdownNumber) du.countdownNumber.textContent = count;
    } else {
      clearInterval(interval);
      if (du.countdownNumber) du.countdownNumber.textContent = '🚀';
      setTimeout(() => onDone?.(), 700);
    }
  }, 1000);
}

// ── Start Quiz ────────────────────────────────────────────────────

function startDuelQuiz() {
  ds.currentIndex               = 0;
  ds.totalScore                 = 0;
  ds.opponentTotalScore         = 0;
  ds.answered                   = false;
  ds.selfFinished               = false;
  ds.opponentCurrentAnsweredIndex = -1;
  ds.oppReadyConfirmed          = false;
  ds.oppNextConfirmed           = false;

  if (du.liveMeName)   du.liveMeName.textContent  = ds.playerName;
  if (du.liveOppName)  du.liveOppName.textContent = ds.opponentName || 'יריב';
  if (du.liveMeScore)  du.liveMeScore.textContent  = '0';
  if (du.liveOppScore) du.liveOppScore.textContent = '0';

  setStatus('');
  if (du.status) du.status.classList.add('hidden');
  // host pushes the first questionStartAt; guest will get it via startRoomListener
  if (ds.role === 'host') {
    ds.roomRef?.update({
      status:          'question',
      questionIndex:   0,
      questionStartAt: firebase.database.ServerValue.TIMESTAMP,
    }).catch(() => {});
  }
}

// ── Room-level Listener (drives transitions after quiz starts) ────

function startRoomListener() {
  if (!ds.roomRef) return;
  ds.roomListener = ds.roomRef.on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;

    const players = snap_players(room);
    const opp     = players.find(p => p.id !== ds.playerId);
    if (opp) {
      ds.opponentId                   = opp.id;
      ds.opponentName                 = opp.name          || ds.opponentName || 'יריב';
      ds.opponentTotalScore           = opp.totalScore    || 0;
      ds.opponentCurrentAnsweredIndex = opp.answeredIndex ?? -1;
      ds.opponentFinished             = opp.finished      || false;
      if (opp.answeredIndex === ds.currentIndex) ds.oppRoundScore = opp.roundScore || 0;

      // Opponent disconnect detection — only during active game (not lobby/waiting)
      const activeStatuses = ['question', 'feedback', 'countdown_next', 'countdown_start', 'both_joined'];
      if (opp.connected === false && activeStatuses.includes(room.status) && !ds.selfFinished) {
        handleOpponentDisconnect();
        return;
      }

      // Only update live scoreboard outside question phase (avoid spoiling correctness)
      if (room.status !== 'question') {
        if (du.liveOppScore) du.liveOppScore.textContent = ds.opponentTotalScore;
      }

      // Show badge when opp answers during question phase
      if (room.status === 'question' && opp.answeredIndex === ds.currentIndex && !ds.answered) {
        if (du.oppAnsweredBadge) {
          du.oppAnsweredBadge.textContent = `${ds.opponentName} ענה ✅`;
          du.oppAnsweredBadge.classList.remove('hidden');
        }
      }

      // Both answered → host pushes feedback status
      if (room.status === 'question' &&
          ds.answered &&
          opp.answeredIndex === ds.currentIndex &&
          ds.role === 'host') {
        ds.roomRef.update({ status: 'feedback' }).catch(() => {});
      }

      // nextConfirmed tracking
      if (opp.nextConfirmed === ds.currentIndex) {
        ds.oppNextConfirmed = true;
        // Host re-checks advance in case host already confirmed and was waiting for opp
        if (ds.role === 'host') checkBothNext();
      }

      // Opponent requested rematch
      if (opp.rematchReady && ds.rematchRequested && du.rematchWaitingMsg) {
        du.rematchWaitingMsg.textContent = `${ds.opponentName} אישר! מתחיל סיבוב נוסף...`;
      }
      // Host checks if both requested rematch
      if (opp.rematchReady && ds.rematchRequested && ds.role === 'host') {
        checkBothRematch();
      }
    }

    // ── STATUS TRANSITIONS ──────────────────────────────────────
    if (room.status === 'question' && room.questionIndex != null) {
      const qi = room.questionIndex;
      // Use server's questionIndex as source of truth.
      // This fixes the race where the Firebase event arrives at the guest
      // BEFORE the guest's countdown callback increments ds.currentIndex,
      // causing the guard (room.questionIndex === ds.currentIndex) to fail → stuck on rocket.
      if (room.questionStartAt && !du.quizSection?.classList.contains('shown_q' + qi)) {
        ds.currentIndex      = qi;   // sync to server
        ds.questionStartTime = room.questionStartAt - ds.firebaseTimeDelta;
        showQuestion();
      }
    }

    if (room.status === 'feedback' && !du.feedbackSection?.classList.contains('active-feedback')) {
      showFeedbackScreen();
    }

    if (room.status === 'countdown_next') {
      // Both host AND guest must clear the feedback guard so next question's feedback can show.
      // (checkBothNext only clears it on the host side)
      du.feedbackSection?.classList.remove('active-feedback');
      // Use a JS flag (not DOM class) so the guard can't be bypassed by a Firebase event
      // firing in the window between classList.remove('counting') and the host pushing status:'question'
      if (!ds.countingNext) {
        ds.countingNext = true;
        du.countdownSection?.classList.add('counting');
        startCountdown(() => {
          du.countdownSection?.classList.remove('counting');
          // Only the host advances the index and pushes the next question.
          // The guest syncs ds.currentIndex from room.questionIndex in the Firebase event.
          // This prevents the race where the guest's Firebase event arrives before
          // its own ds.currentIndex++ runs, causing a missed showQuestion() call.
          if (ds.role === 'host') {
            ds.currentIndex++;
            if (ds.currentIndex >= ds.selectedQuestions.length) {
              finishDuelQuiz();
            } else {
              ds.roomRef?.update({
                status:          'question',
                questionIndex:   ds.currentIndex,
                questionStartAt: firebase.database.ServerValue.TIMESTAMP,
              }).catch(() => {});
            }
          }
          // Note: ds.countingNext stays true here — cleared by showQuestion() once rendered
        });
      }
    }

    if (room.status === 'finished') {
      // finishDuelQuiz() is called directly by host (via checkBothNext) and sets ds.selfFinished=true.
      // For the guest, this Firebase event is the trigger — must call finishDuelQuiz() here.
      if (!ds.selfFinished) finishDuelQuiz();
    }

    // Rematch: host sets countdown_start again after both request
    if (room.status === 'countdown_start' && ds.selfFinished) {
      if (!du.countdownSection?.classList.contains('counting')) {
        handleRematch(room);
      }
    }
  });
}

function snap_players(room) {
  return Object.entries(room.players || {}).map(([id, p]) => ({ id, ...p }));
}

// ── Show Question ─────────────────────────────────────────────────

function showQuestion() {
  const q     = ds.selectedQuestions[ds.currentIndex];
  if (!q) return;

  ds.countingNext = false; // countdown is done, safe to allow next countdown
  const total = ds.selectedQuestions.length;
  ds.answered          = false;
  ds.myAnswerTime      = null;
  ds.oppNextConfirmed  = false;
  ds.displayedChoices  = {};
  ds.currentCorrectLabel = '';

  // mark so we don't re-render on duplicate firebase events
  du.quizSection?.classList.add('shown_q' + ds.currentIndex);

  // progress bar & header
  if (du.progressBar) du.progressBar.style.width = `${(ds.currentIndex / total) * 100}%`;
  if (du.questionNum) du.questionNum.textContent  = `שאלה ${ds.currentIndex + 1} / ${total}`;
  if (du.questionMeta) du.questionMeta.textContent = `שיעור ${Number(q.lectureId)} — ${q.lectureTitle}`;
  if (du.questionText) du.questionText.textContent = q.text;

  // reset UI
  if (du.feedback)     { du.feedback.className = 'feedback hidden'; du.feedback.innerHTML = ''; }
  if (du.waitingOppMsg) du.waitingOppMsg.classList.add('hidden');
  if (du.oppAnsweredBadge) { du.oppAnsweredBadge.classList.add('hidden'); du.oppAnsweredBadge.textContent = ''; }
  if (du.submitBtn)    { du.submitBtn.classList.remove('hidden'); du.submitBtn.disabled = false; }

  // shuffle choices
  const srcKeys = Object.keys(q.choices).filter(k => ['A','B','C','D'].includes(k));
  const labels  = ['A','B','C','D'];
  if (du.answersForm) du.answersForm.innerHTML = '';

  shuffle(srcKeys).forEach((srcKey, idx) => {
    const dlabel = labels[idx];
    ds.displayedChoices[dlabel] = q.choices[srcKey];
    if (srcKey === q.correct) ds.currentCorrectLabel = dlabel;

    const lbl = document.createElement('label');
    lbl.className = 'choice';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'duel-answer'; radio.value = dlabel;
    const span = document.createElement('span');
    span.textContent = `${dlabel}. ${q.choices[srcKey]}`;
    lbl.appendChild(radio); lbl.appendChild(span);
    du.answersForm?.appendChild(lbl);
  });

  // reset player's answer fields in Firebase
  ds.roomRef?.child(`players/${ds.playerId}`).update({
    currentIndex:  ds.currentIndex,
    answeredIndex: ds.currentIndex - 1,
    answerTimeMs:  null,
    roundScore:    null,
    nextConfirmed: -1,
  }).catch(() => {});

  showSection(du.quizSection);
  startQuestionTimer();
}

// ── Submit Answer ─────────────────────────────────────────────────

function submitDuelAnswer() {
  if (ds.answered) return;

  const chosen = du.answersForm?.querySelector('input[name="duel-answer"]:checked')?.value;
  if (!chosen) {
    if (du.feedback) {
      du.feedback.className = 'feedback bad';
      du.feedback.textContent = 'אנא בחר תשובה לפני הגשה.';
      du.feedback.classList.remove('hidden');
    }
    return;
  }

  stopTimer();
  ds.answered     = true;
  ds.myAnswerTime = Date.now() - ds.questionStartTime;

  const isCorrect  = chosen === ds.currentCorrectLabel;
  const earned     = isCorrect ? calcPoints(ds.myAnswerTime, ds.questionTimeSec * 1000) : 0;
  ds.myRoundScore  = earned;
  ds.totalScore   += earned;

  if (du.submitBtn) du.submitBtn.classList.add('hidden');
  // Don't update liveMeScore here — update after feedback screen shows, to avoid spoiling correctness

  // Disable all choices — DON'T reveal correct/wrong yet.
  // The correct answer + explanation will appear on the feedback screen
  // only after BOTH players have answered.
  du.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (inp) inp.disabled = true;
  });

  // Show waiting message
  if (du.waitingOppMsg) {
    du.waitingOppMsg.textContent = '⏳ תשובתך נרשמה! ממתין שהיריב יסיים לענות...';
    du.waitingOppMsg.classList.remove('hidden');
  }

  // Push to Firebase (triggers host to check if both answered)
  ds.roomRef?.child(`players/${ds.playerId}`).update({
    totalScore:    ds.totalScore,
    answeredIndex: ds.currentIndex,
    answerTimeMs:  ds.myAnswerTime,
    roundScore:    earned,
  }).then(() => {
    // If we are host, check if opp already answered
    if (ds.role === 'host' && ds.opponentCurrentAnsweredIndex === ds.currentIndex) {
      ds.roomRef.update({ status: 'feedback' }).catch(() => {});
    }
  }).catch(() => {});
}

// ── Timeout ───────────────────────────────────────────────────────

function timeoutAnswer() {
  if (ds.answered) return;
  stopTimer();
  ds.answered     = true;
  ds.myAnswerTime = ds.questionTimeSec * 1000;
  ds.myRoundScore = 0;

  if (du.submitBtn) du.submitBtn.classList.add('hidden');
  // Disable choices — correct answer revealed on feedback screen after both answered
  du.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (inp) inp.disabled = true;
  });
  if (du.waitingOppMsg) {
    du.waitingOppMsg.textContent = '⏰ נגמר הזמן! ממתין שהיריב יסיים...';
    du.waitingOppMsg.classList.remove('hidden');
  }

  ds.roomRef?.child(`players/${ds.playerId}`).update({
    answeredIndex: ds.currentIndex,
    answerTimeMs:  ds.myAnswerTime,
    roundScore:    0,
  }).then(() => {
    if (ds.role === 'host' && ds.opponentCurrentAnsweredIndex === ds.currentIndex) {
      ds.roomRef.update({ status: 'feedback' }).catch(() => {});
    }
  }).catch(() => {});
}

// ── Feedback Screen (shown when status === 'feedback') ───────────

function showFeedbackScreen() {
  du.feedbackSection?.classList.add('active-feedback');
  stopTimer();
  // Now it's safe to reveal updated scores on the live scoreboard
  if (du.liveMeScore)  du.liveMeScore.textContent  = ds.totalScore;
  if (du.liveOppScore) du.liveOppScore.textContent = ds.opponentTotalScore;
  const titleEl = document.getElementById('fb-section-title');
  if (titleEl) titleEl.textContent = `📊 סיכום שאלה ${ds.currentIndex + 1} / ${ds.selectedQuestions.length}`;

  // Refresh opp score from state
  const myPts  = ds.myRoundScore;
  const oppPts = ds.oppRoundScore;
  const q      = ds.selectedQuestions[ds.currentIndex];
  const timedOut = (ds.myAnswerTime >= ds.questionTimeSec * 1000);
  const isCorrect = ds.myRoundScore > 0;

  // Result line
  let resultHtml = timedOut
    ? `<p class="fb-verdict fb-wrong">⏰ נגמר הזמן!</p>`
    : isCorrect
      ? `<p class="fb-verdict fb-correct">✅ נכון! <span class="round-pts-earned">+${myPts} נקודות</span></p>`
      : `<p class="fb-verdict fb-wrong">❌ לא נכון. התשובה הנכונה: <strong>${ds.currentCorrectLabel}.</strong> ${ds.displayedChoices[ds.currentCorrectLabel] || ''}</p>`;

  if (du.fbResult) du.fbResult.innerHTML = resultHtml;

  // Now highlight choices in quiz section (shown underneath feedback in DOM)
  // so if user navigates back they see highlighted state
  du.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (!inp) return;
    if (inp.value === ds.currentCorrectLabel) lbl.classList.add('choice-correct');
    else if (inp.checked && inp.value !== ds.currentCorrectLabel) lbl.classList.add('choice-wrong');
  });

  // Explanation
  if (du.fbExplanation) du.fbExplanation.innerHTML = `<p>💡 ${q?.explanation || ''}</p>`;

  // Round scores
  if (du.fbRoundScores) {
    du.fbRoundScores.innerHTML = `
      <div class="duel-round-scores">
        <div class="round-score-row">
          <span class="round-score-name">${ds.playerName}</span>
          <span class="round-score-pts ${myPts > oppPts ? 'round-winner' : ''}">+${myPts} נק'</span>
        </div>
        <div class="round-score-row">
          <span class="round-score-name">${ds.opponentName}</span>
          <span class="round-score-pts ${oppPts > myPts ? 'round-winner' : ''}">+${oppPts} נק'</span>
        </div>
        <div class="round-score-total">סה"כ: ${ds.playerName} <strong>${ds.totalScore}</strong> | ${ds.opponentName} <strong>${ds.opponentTotalScore}</strong></div>
      </div>`;
  }

  if (du.nextConfirmBtn) { du.nextConfirmBtn.disabled = false; du.nextConfirmBtn.textContent = ds.currentIndex < ds.selectedQuestions.length - 1 ? 'אני מוכן לשאלה הבאה →' : 'אני מוכן לתוצאות הסופיות'; }
  if (du.waitingNextMsg) du.waitingNextMsg.classList.add('hidden');

  showSection(du.feedbackSection);
}

function confirmNext() {
  if (du.nextConfirmBtn) { du.nextConfirmBtn.disabled = true; du.nextConfirmBtn.textContent = '✅ מוכן!'; }
  if (du.waitingNextMsg) {
    du.waitingNextMsg.textContent = 'ממתין שהיריב יאשר גם...';
    du.waitingNextMsg.classList.remove('hidden');
  }

  ds.roomRef?.child(`players/${ds.playerId}`).update({ nextConfirmed: ds.currentIndex })
    .then(() => checkBothNext())
    .catch(e => console.error(e));
}

async function checkBothNext() {
  const snap = await ds.roomRef.once('value');
  const players = snap.val()?.players || {};
  const allNext = Object.values(players).every(p => p.nextConfirmed === ds.currentIndex);
  if (allNext && ds.role === 'host') {
    const isLast = ds.currentIndex >= ds.selectedQuestions.length - 1;
    if (isLast) {
      await ds.roomRef.update({ status: 'finished' });
      finishDuelQuiz();
    } else {
      du.feedbackSection?.classList.remove('active-feedback');
      await ds.roomRef.update({ status: 'countdown_next' });
    }
  }
}

// ── Opponent Disconnected ─────────────────────────────────────

function handleOpponentDisconnect() {
  if (ds.selfFinished) return; // already done
  stopTimer();
  ds.selfFinished = true;
  // Remove the listener so no more transitions happen
  if (ds.roomRef && ds.roomListener) {
    ds.roomRef.off('value', ds.roomListener);
    ds.roomListener = null;
  }

  // Show technical win screen
  showSection(du.resultSection);
  if (du.winnerBanner) {
    du.winnerBanner.innerHTML = `🏆 ניצחת טכנית! ${ds.opponentName} התנתק`;
    du.winnerBanner.className = 'duel-winner-banner banner-win';
  }
  if (du.finalMeName)   du.finalMeName.textContent   = ds.playerName;
  if (du.finalMeScore)  du.finalMeScore.textContent  = ds.totalScore;
  if (du.finalOppName)  du.finalOppName.textContent  = ds.opponentName;
  if (du.finalOppScore) du.finalOppScore.textContent = ds.opponentTotalScore;
  du.finalMeCard?.classList.add('duel-winner-card');
  du.finalOppCard?.classList.remove('duel-winner-card');
  if (du.resultDetails) {
    du.resultDetails.innerHTML = `<p>⚠️ ${ds.opponentName} התנתק מהמשחק — ניצחת בדרך טכנית.</p>`;
  }
  setStatus('הדו-קרב הסתיים.');
}

// ── Finish Quiz ───────────────────────────────────────────────────

function finishDuelQuiz() {
  if (ds.selfFinished) return; // guard against double-call (checkBothNext race)
  stopTimer();
  ds.selfFinished = true;

  ds.roomRef?.child(`players/${ds.playerId}`).update({
    totalScore:   ds.totalScore,
    currentIndex: ds.selectedQuestions.length,
    finished:     true,
  }).catch(() => {});

  showFinalResults();
}

// ── Final Results ─────────────────────────────────────────────────

function showFinalResults() {
  showSection(du.resultSection);

  const mine   = ds.totalScore;
  const theirs = ds.opponentTotalScore;
  const maxPts = ds.questionCount * MAX_POINTS_PER_Q;

  if (du.finalMeName)   du.finalMeName.textContent   = ds.playerName;
  if (du.finalMeScore)  du.finalMeScore.textContent  = mine;
  if (du.finalOppName)  du.finalOppName.textContent  = ds.opponentName || 'יריב';
  if (du.finalOppScore) du.finalOppScore.textContent = theirs;

  du.finalMeCard?.classList.remove('duel-winner-card');
  du.finalOppCard?.classList.remove('duel-winner-card');

  if (du.winnerBanner) {
    if (mine > theirs) {
      du.winnerBanner.innerHTML = '🏆 ניצחת! כל הכבוד!';
      du.winnerBanner.className = 'duel-winner-banner banner-win';
      du.finalMeCard?.classList.add('duel-winner-card');
    } else if (theirs > mine) {
      du.winnerBanner.innerHTML = `😤 ${ds.opponentName} ניצח הפעם. תנסה שוב!`;
      du.winnerBanner.className = 'duel-winner-banner banner-lose';
      du.finalOppCard?.classList.add('duel-winner-card');
    } else {
      du.winnerBanner.innerHTML = '🤝 תיקו! ביצועים זהים';
      du.winnerBanner.className = 'duel-winner-banner banner-tie';
    }
  }

  if (du.resultDetails) {
    const myPct  = Math.round((mine  / maxPts) * 100);
    const oppPct = Math.round((theirs / maxPts) * 100);
    du.resultDetails.innerHTML = `
      <p>🎯 ${ds.playerName}: <strong>${mine}</strong> נקודות (${myPct}% מהמקסימום)</p>
      <p>🎯 ${ds.opponentName || 'יריב'}: <strong>${theirs}</strong> נקודות (${oppPct}% מהמקסימום)</p>
      <p class="muted" style="font-size:13px;">מקסימום: ${maxPts} נק' (${ds.questionCount} שאלות × ${MAX_POINTS_PER_Q} נק')</p>
    `;
  }

  setStatus('⚔️ הדו-קרב הסתיים!');
}

// ── Copy Room Code ────────────────────────────────────────────────

function copyRoomCode() {
  const code = ds.roomId || '';
  if (!code) return;

  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };

  (navigator.clipboard?.writeText(code) ?? Promise.reject())
    .catch(fallback)
    .finally(() => {
      if (du.copyCodeBtn) {
        du.copyCodeBtn.textContent = '✅ הועתק!';
        setTimeout(() => { if (du.copyCodeBtn) du.copyCodeBtn.textContent = '📋 העתק קוד'; }, 2000);
      }
    });
}

// ── Rematch ───────────────────────────────────────────────────────

function requestRematch() {
  if (ds.rematchRequested) return;
  ds.rematchRequested = true;
  if (du.rematchBtn) { du.rematchBtn.disabled = true; du.rematchBtn.textContent = '⏳ ממתין לאישור היריב...'; }
  if (du.rematchWaitingMsg) { du.rematchWaitingMsg.textContent = 'ממתין שהיריב יאשר גם...'; du.rematchWaitingMsg.classList.remove('hidden'); }
  ds.roomRef?.child(`players/${ds.playerId}`).update({ rematchReady: true })
    .then(() => { if (ds.role === 'host') checkBothRematch(); })
    .catch(e => console.error(e));
}

async function checkBothRematch() {
  const snap = await ds.roomRef.once('value');
  const room = snap.val();
  if (!room) return;
  const players = Object.values(room.players || {});
  if (players.length === 2 && players.every(p => p.rematchReady)) {
    startRematch(room);
  }
}

async function startRematch(room) {
  const lectureIds = ds.lectureIds.length ? ds.lectureIds
    : [...new Set(ds.selectedQuestions.map(q => q.lectureId))];
  const pool  = shuffle(ds.allQuestions.filter(q => lectureIds.includes(q.lectureId)));
  const newQs = pool.length >= ds.questionCount ? pool.slice(0, ds.questionCount) : pool;

  const updates = {
    status:          'countdown_start',
    questionIds:     newQs.map(q => q.uniqueId),
    questionStartAt: null,
    questionIndex:   0,
  };
  Object.keys(room.players || {}).forEach(pid => {
    updates[`players/${pid}/totalScore`]     = 0;
    updates[`players/${pid}/currentIndex`]   = 0;
    updates[`players/${pid}/answeredIndex`]  = -1;
    updates[`players/${pid}/answerTimeMs`]   = null;
    updates[`players/${pid}/roundScore`]     = null;
    updates[`players/${pid}/finished`]       = false;
    updates[`players/${pid}/readyConfirmed`] = false;
    updates[`players/${pid}/nextConfirmed`]  = -1;
    updates[`players/${pid}/rematchReady`]   = false;
  });
  await ds.roomRef.update(updates).catch(e => console.error(e));
}

function handleRematch(room) {
  const qMap = new Map(ds.allQuestions.map(q => [q.uniqueId, q]));
  ds.selectedQuestions = (room.questionIds || []).map(id => qMap.get(id)).filter(Boolean);
  ds.questionCount     = room.questionCount   || ds.questionCount;
  ds.questionTimeSec   = room.questionTimeSec || ds.questionTimeSec;
  ds.selfFinished      = false;
  ds.rematchRequested  = false;
  ds.myRoundScore      = 0;
  ds.oppRoundScore     = 0;
  ds.opponentCurrentAnsweredIndex = -1;
  ds.oppReadyConfirmed = false;
  ds.oppNextConfirmed  = false;

  if (du.quizSection) {
    [...du.quizSection.classList].filter(c => c.startsWith('shown_q'))
      .forEach(c => du.quizSection.classList.remove(c));
  }
  du.feedbackSection?.classList.remove('active-feedback');
  du.countdownSection?.classList.remove('counting');
  if (du.liveMeScore)  du.liveMeScore.textContent  = '0';
  if (du.liveOppScore) du.liveOppScore.textContent = '0';

  showToast(`🔄 סיבוב נוסף! ${ds.questionCount} שאלות`, 'ok');
  startCountdown(() => { startDuelQuiz(); });
}

// ── Play Again ────────────────────────────────────────────────────

function playAgain() {
  // Clean up Firebase listeners
  if (ds.roomRef) {
    ds.roomRef.off();
    if (ds.role === 'host') ds.roomRef.remove().catch(() => {});
  }

  stopTimer();
  Object.assign(ds, {
    roomId: null, roomRef: null, roomListener: null, role: null,
    opponentId: null, opponentName: '',
    selectedQuestions: [], displayedChoices: {}, currentCorrectLabel: '',
    currentIndex: 0, totalScore: 0, opponentTotalScore: 0,
    myRoundScore: 0, oppRoundScore: 0,
    answered: false, selfFinished: false, opponentFinished: false,
    opponentCurrentAnsweredIndex: -1, oppReadyConfirmed: false, oppNextConfirmed: false,
    countingNext: false, rematchRequested: false,
  });

  // reset class markers
  du.quizSection?.className.split(' ').filter(c => c.startsWith('shown_q')).forEach(c => du.quizSection.classList.remove(c));
  du.feedbackSection?.classList.remove('active-feedback');
  du.countdownSection?.classList.remove('counting');
  if (du.readyBtn) { du.readyBtn.disabled = false; du.readyBtn.textContent = '✅ אני מוכן!'; }

  showSection(du.lobbySection);
  setStatus('הכנס שם ובחר: צור חדר חדש או הצטרף לחדר קיים');
}

// ── Keyboard Shortcuts ────────────────────────────────────────────

function onKeyDown(e) {
  if (e.key !== 'Enter') return;
  if (!du.quizSection?.classList.contains('hidden') && !ds.answered) { submitDuelAnswer(); return; }
  if (!du.feedbackSection?.classList.contains('hidden') && !du.nextConfirmBtn?.disabled) { confirmNext(); }
}

// ── Init ──────────────────────────────────────────────────────────

function init() {
  initTheme();

  // Parse questions
  const text = window.QUESTIONS_TEXT || '';
  if (text) {
    const parsed = parseQuestionsText(text);
    ds.allQuestions = parsed.allQuestions;
    ds.lectures     = parsed.lectures;
    renderLectureFilters();
  }

  ds.playerId = getOrCreatePlayerId();

  // Firebase guard
  if (!initFirebase()) {
    const lobby = document.querySelector('#lobby-section');
    if (lobby) {
      lobby.innerHTML = `
        <div style="padding:20px; color:var(--bad);">
          <h3>❌ Firebase לא מוגדר</h3>
          <p>יש למלא את פרטי Firebase ב-<strong>duel.js</strong> (שורת FIREBASE_CONFIG).</p>
          <p>ראה הוראות בראש הקובץ.</p>
        </div>`;
    }
    return;
  }

  // Event listeners
  du.createRoomBtn?.addEventListener('click', createRoom);
  du.joinRoomBtn?.addEventListener('click', joinRoom);
  du.copyCodeBtn?.addEventListener('click', copyRoomCode);
  du.readyBtn?.addEventListener('click', confirmReady);
  du.submitBtn?.addEventListener('click', submitDuelAnswer);
  du.nextConfirmBtn?.addEventListener('click', confirmNext);
  du.rematchBtn?.addEventListener('click', requestRematch);
  du.playAgainBtn?.addEventListener('click', playAgain);
  du.themeToggle?.addEventListener('click', () => {
    applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  du.roomCodeInput?.addEventListener('input', () => {
    du.roomCodeInput.value = du.roomCodeInput.value.toUpperCase();
  });
  du.roomCodeInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRoom();
  });
  document.addEventListener('keydown', onKeyDown);

  // Lobby tab toggle
  const tabCreate   = document.getElementById('tab-create');
  const tabJoin     = document.getElementById('tab-join');
  const panelCreate = document.getElementById('panel-create');
  const panelJoin   = document.getElementById('panel-join');

  function switchTab(tab) {
    const isCreate = (tab === 'create');
    tabCreate.classList.toggle('active', isCreate);
    tabJoin.classList.toggle('active', !isCreate);
    tabCreate.setAttribute('aria-selected', isCreate);
    tabJoin.setAttribute('aria-selected', !isCreate);
    panelCreate.classList.toggle('hidden', !isCreate);
    panelJoin.classList.toggle('hidden', isCreate);
  }

  tabCreate?.addEventListener('click', () => switchTab('create'));
  tabJoin?.addEventListener('click',   () => switchTab('join'));

  // Deep link: ?room=XXXXXX automatically fills the join field and switches to join tab
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom && urlRoom.length === 6) {
    if (du.roomCodeInput) du.roomCodeInput.value = urlRoom.toUpperCase();
    switchTab('join');
    if (du.playerName) du.playerName.focus();
    showToast('🎮 קוד חדר זוהה אוטומטית — הכנס שם ולחץ הצטרף!', 'info', 4000);
  }
}

document.addEventListener('DOMContentLoaded', init);
