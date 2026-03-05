// ════════════════════════════════════════════════════════════════
//  ⚔️  DUEL MODE  —  Real-time multiplayer via Firebase
//
//  חוקים:
//  • 8 שאלות קבועות
//  • 30 שניות לשאלה (טיימר עגול חי)
//  • ניקוד יחסי לפי מהירות: עד 100 נק' לשאלה, 0 אם טועים/נגמר הזמן
//  • כששניהם ענו → מתקדמים מיד (לא מחכים 30 שניות)
//  • בכל שאלה: רואים תשובה נכונה + הסבר + ניקוד יחסי
//  • בסוף: הכרזת מנצח
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
const DUEL_QUESTION_COUNT = 8;    // שאלות קבועות
const QUESTION_TIME_SEC   = 30;   // שניות לשאלה
const MAX_POINTS_PER_Q    = 100;  // ניקוד מקסימלי לשאלה
const THEME_KEY           = 'micro-study-theme';

// ── State ────────────────────────────────────────────────────────
const ds = {
  db:                            null,
  roomRef:                       null,
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
  questionStartTime:             0,
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
  pendingAdvance:                false,
  roomId:                        null,
};

// ── Element References ───────────────────────────────────────────
const du = {
  status:           document.getElementById('duel-status'),
  themeToggle:      document.getElementById('theme-toggle'),

  // Lobby
  lobbySection:     document.getElementById('lobby-section'),
  playerName:       document.getElementById('player-name'),
  lectureFilters:   document.getElementById('duel-lecture-filters'),
  createRoomBtn:    document.getElementById('create-room-btn'),
  roomCodeInput:    document.getElementById('room-code-input'),
  joinRoomBtn:      document.getElementById('join-room-btn'),
  lobbyError:       document.getElementById('lobby-error'),

  // Waiting
  waitingSection:   document.getElementById('waiting-section'),
  roomCodeDisplay:  document.getElementById('room-code-display'),
  copyCodeBtn:      document.getElementById('copy-code-btn'),
  waitMeName:       document.getElementById('wait-me-name'),
  waitOppName:      document.getElementById('wait-opp-name'),
  waitOppBadge:     document.getElementById('wait-opp-badge'),

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
  nextBtn:          document.getElementById('duel-next-btn'),

  // Results
  resultSection:    document.getElementById('duel-result-section'),
  winnerBanner:     document.getElementById('duel-winner-banner'),
  finalMeCard:      document.getElementById('final-me-card'),
  finalMeName:      document.getElementById('final-me-name'),
  finalMeScore:     document.getElementById('final-me-score'),
  finalOppCard:     document.getElementById('final-opp-card'),
  finalOppName:     document.getElementById('final-opp-name'),
  finalOppScore:    document.getElementById('final-opp-score'),
  waitingFinalMsg:  document.getElementById('duel-waiting-final'),
  resultDetails:    document.getElementById('duel-result-details'),
  playAgainBtn:     document.getElementById('duel-play-again-btn'),
};

// ── Utilities ────────────────────────────────────────────────────

const ALL_SECTIONS = () => [
  du.lobbySection, du.waitingSection, du.countdownSection,
  du.quizSection, du.resultSection,
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
  ds.questionStartTime = Date.now();
  const totalMs = QUESTION_TIME_SEC * 1000;
  setTimerArc(1);
  if (du.timerText) du.timerText.textContent = QUESTION_TIME_SEC;

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
    span.textContent = `מצגת ${Number(lecture.lectureId)} — ${lecture.lectureTitle}`;
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

  const lectureIds = getSelectedLectureIds();
  if (!lectureIds.length) { showError('אנא בחר לפחות שיעור אחד.'); return; }

  const pool = shuffle(ds.allQuestions.filter(q => lectureIds.includes(q.lectureId)));
  if (pool.length < DUEL_QUESTION_COUNT) {
    showError(`צריך לפחות ${DUEL_QUESTION_COUNT} שאלות. מצאנו ${pool.length} — בחר יותר שיעורים.`);
    return;
  }

  const selected = pool.slice(0, DUEL_QUESTION_COUNT);
  ds.playerName        = name;
  ds.role              = 'host';
  ds.selectedQuestions = selected;

  const roomId = generateRoomId();
  ds.roomId    = roomId;
  ds.roomRef   = ds.db.ref(`rooms/${roomId}`);

  try {
    await ds.roomRef.set({
      status:      'waiting',
      hostId:      ds.playerId,
      questionIds: selected.map(q => q.uniqueId),
      players: {
        [ds.playerId]: {
          name, role: 'host',
          totalScore: 0, currentIndex: 0,
          answeredIndex: -1, answerTimeMs: null, roundScore: null,
          finished: false, connected: true,
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
  showSection(du.waitingSection);
  setStatus(`חדר ${roomId} נוצר — שתף את הקוד עם היריב`);
  listenForOpponent();
}

// ── Join Room ────────────────────────────────────────────────────

async function joinRoom() {
  clearError();
  const name = du.playerName?.value.trim();
  const code = (du.roomCodeInput?.value || '').trim().toUpperCase();

  if (!name) { showError('אנא הכנס שם לפני הצטרפות.'); return; }
  if (code.length !== 6) { showError('קוד החדר חייב להיות בן 6 תווים.'); return; }

  ds.roomRef = ds.db.ref(`rooms/${code}`);
  let snapshot;
  try {
    snapshot = await ds.roomRef.once('value');
  } catch {
    showError('שגיאה בחיבור ל-Firebase. בדוק אינטרנט ונסה שוב.');
    return;
  }

  const room = snapshot.val();
  if (!room)                                     { showError('חדר לא נמצא — בדוק את הקוד ונסה שוב.'); return; }
  if (room.status !== 'waiting')                 { showError('החדר כבר התחיל או הסתיים.'); return; }
  if (Object.keys(room.players || {}).length >= 2) { showError('החדר מלא — יש כבר שני שחקנים.'); return; }

  // Resolve host info
  const hostId = room.hostId;
  ds.opponentName = room.players?.[hostId]?.name || 'יריב';
  ds.playerName   = name;
  ds.role         = 'guest';
  ds.roomId       = code;

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
    });
    ds.roomRef.child(`players/${ds.playerId}/connected`).onDisconnect().set(false);
    await ds.roomRef.update({ status: 'countdown', guestId: ds.playerId });
  } catch (e) {
    showError('שגיאה בהצטרפות לחדר.');
    console.error(e); return;
  }

  setStatus(`מצטרף לחדר ${code}...`);
  startCountdown();
}

// ── Listen for Opponent (host side, waiting room) ────────────────

function listenForOpponent() {
  ds.roomRef.on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;
    const players = room.players || {};
    const oppId   = Object.keys(players).find(id => id !== ds.playerId);
    if (oppId && players[oppId]) {
      ds.opponentId   = oppId;
      ds.opponentName = players[oppId].name || 'יריב';
      if (du.waitOppName)  du.waitOppName.textContent = ds.opponentName;
      if (du.waitOppBadge) {
        du.waitOppBadge.textContent = '✅ הצטרף!';
        du.waitOppBadge.className   = 'duel-player-badge badge-ready';
      }
    }
    if (room.status === 'countdown') {
      ds.roomRef.off('value');
      startCountdown();
    }
  });
}

// ── Countdown ────────────────────────────────────────────────────

function startCountdown() {
  if (du.cdMeName) du.cdMeName.textContent = ds.playerName;
  if (du.cdOppName) du.cdOppName.textContent = ds.opponentName || '...';

  // Fetch opponent name if not yet known
  if (!ds.opponentName && ds.roomRef) {
    ds.roomRef.once('value').then(snap => {
      const players = snap.val()?.players || {};
      const oppId = Object.keys(players).find(id => id !== ds.playerId);
      if (oppId && players[oppId]?.name) {
        ds.opponentName = players[oppId].name;
        if (du.cdOppName) du.cdOppName.textContent = ds.opponentName;
      }
    });
  }

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
      setTimeout(startDuelQuiz, 700);
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
  ds.pendingAdvance             = false;
  ds.opponentCurrentAnsweredIndex = -1;

  if (du.liveMeName)   du.liveMeName.textContent  = ds.playerName;
  if (du.liveOppName)  du.liveOppName.textContent = ds.opponentName || 'יריב';
  if (du.liveMeScore)  du.liveMeScore.textContent  = '0';
  if (du.liveOppScore) du.liveOppScore.textContent = '0';

  showSection(du.quizSection);
  setStatus('⚔️ דו-קרב מתנהל!');
  ds.roomRef?.update({ status: 'playing' }).catch(() => {});
  listenToOpponent();
  renderDuelQuestion();
}

// ── Render Question ───────────────────────────────────────────────

function renderDuelQuestion() {
  const q     = ds.selectedQuestions[ds.currentIndex];
  if (!q) return;

  const total = ds.selectedQuestions.length;
  ds.answered          = false;
  ds.myAnswerTime      = null;
  ds.pendingAdvance    = false;
  ds.displayedChoices  = {};
  ds.currentCorrectLabel = '';

  // progress bar & header
  if (du.progressBar) du.progressBar.style.width = `${(ds.currentIndex / total) * 100}%`;
  if (du.questionNum) du.questionNum.textContent  = `שאלה ${ds.currentIndex + 1} / ${total}`;
  if (du.questionMeta) du.questionMeta.textContent = `מצגת ${Number(q.lectureId)} — ${q.lectureTitle}`;
  if (du.questionText) du.questionText.textContent = q.text;

  // reset UI
  if (du.feedback)     { du.feedback.className = 'feedback hidden'; du.feedback.innerHTML = ''; }
  if (du.nextBtn)      du.nextBtn.classList.add('hidden');
  if (du.waitingOppMsg) du.waitingOppMsg?.classList.add('hidden');
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

  // עדכן Firebase: התחלנו שאלה חדשה
  ds.roomRef?.child(`players/${ds.playerId}`).update({
    currentIndex:  ds.currentIndex,
    answeredIndex: ds.currentIndex - 1,
    answerTimeMs:  null,
    roundScore:    null,
  }).catch(() => {});

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
  const earned     = isCorrect ? calcPoints(ds.myAnswerTime, QUESTION_TIME_SEC * 1000) : 0;
  ds.myRoundScore  = earned;
  ds.totalScore   += earned;

  if (du.submitBtn) du.submitBtn.classList.add('hidden');
  if (du.liveMeScore) du.liveMeScore.textContent = ds.totalScore;

  // highlight choices
  du.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (!inp) return;
    if (inp.value === ds.currentCorrectLabel) lbl.classList.add('choice-correct');
    else if (inp.value === chosen && !isCorrect) lbl.classList.add('choice-wrong');
    inp.disabled = true;
  });

  // push to Firebase
  ds.roomRef?.child(`players/${ds.playerId}`).update({
    totalScore:    ds.totalScore,
    answeredIndex: ds.currentIndex,
    answerTimeMs:  ds.myAnswerTime,
    roundScore:    earned,
  }).catch(() => {});

  showFeedbackAfterAnswer(isCorrect, earned, chosen);
}

// ── Timeout ───────────────────────────────────────────────────────

function timeoutAnswer() {
  if (ds.answered) return;
  stopTimer();
  ds.answered     = true;
  ds.myAnswerTime = QUESTION_TIME_SEC * 1000;
  ds.myRoundScore = 0;

  if (du.submitBtn) du.submitBtn.classList.add('hidden');
  du.answersForm?.querySelectorAll('label.choice').forEach(lbl => {
    const inp = lbl.querySelector('input');
    if (!inp) return;
    if (inp.value === ds.currentCorrectLabel) lbl.classList.add('choice-correct');
    inp.disabled = true;
  });

  ds.roomRef?.child(`players/${ds.playerId}`).update({
    answeredIndex: ds.currentIndex,
    answerTimeMs:  ds.myAnswerTime,
    roundScore:    0,
  }).catch(() => {});

  showFeedbackAfterAnswer(false, 0, null, true);
}

// ── Show Feedback ─────────────────────────────────────────────────

function showFeedbackAfterAnswer(isCorrect, earned, chosen, timedOut = false) {
  const q = ds.selectedQuestions[ds.currentIndex];

  let html = timedOut
    ? `<strong>⏰ נגמר הזמן!</strong>`
    : isCorrect
      ? `<strong>✅ נכון!</strong> <span class="round-pts-earned">+${earned} נקודות</span>`
      : `<strong>❌ לא נכון.</strong> התשובה הנכונה: <strong>${ds.currentCorrectLabel}.</strong> ${ds.displayedChoices[ds.currentCorrectLabel] || ''}`;

  html += `<hr style="margin:10px 0;border-color:var(--border);"><p style="margin:0;">💡 ${q.explanation}</p>`;
  html += `<div id="round-score-block"></div>`; // יתמלא אחרי שהיריב יענה

  if (du.feedback) {
    du.feedback.className = (isCorrect && !timedOut) ? 'feedback ok' : 'feedback bad';
    du.feedback.innerHTML = html;
    du.feedback.classList.remove('hidden');
  }

  // בדוק אם הניקוד היחסי כבר ידוע (היריב ענה לפני)
  tryShowRoundScores();
  tryAdvance();
}

// ── ניקוד יחסי לשאלה ─────────────────────────────────────────────

function tryShowRoundScores() {
  const oppAnsweredThis = (ds.opponentCurrentAnsweredIndex >= ds.currentIndex);
  if (!ds.answered || !oppAnsweredThis) return; // ממתינים לשניים

  const block = document.getElementById('round-score-block');
  if (!block || block.dataset.filled) return;
  block.dataset.filled = '1';

  const myPts  = ds.myRoundScore;
  const oppPts = ds.oppRoundScore;

  block.innerHTML = `
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
    </div>
  `;
}

function tryAdvance() {
  const oppAnsweredThis = (ds.opponentCurrentAnsweredIndex >= ds.currentIndex);
  if (!ds.answered || !oppAnsweredThis) {
    // מציגים הודעה שאנו מחכים
    if (ds.answered && du.waitingOppMsg) du.waitingOppMsg?.classList.remove('hidden');
    ds.pendingAdvance = true;
    return;
  }
  ds.pendingAdvance = false;
  if (du.waitingOppMsg) du.waitingOppMsg?.classList.add('hidden');
  if (du.oppAnsweredBadge) du.oppAnsweredBadge.classList.add('hidden');

  const isLast = ds.currentIndex >= ds.selectedQuestions.length - 1;
  if (du.nextBtn) {
    du.nextBtn.textContent = isLast ? '📊 לתוצאות הסופיות' : 'לשאלה הבאה ←';
    du.nextBtn.classList.remove('hidden');
  }
}

// ── Next Question ─────────────────────────────────────────────────

function nextDuelQuestion() {
  ds.currentIndex++;
  if (ds.currentIndex >= ds.selectedQuestions.length) finishDuelQuiz();
  else renderDuelQuestion();
}

// ── Finish Quiz ───────────────────────────────────────────────────

function finishDuelQuiz() {
  stopTimer();
  ds.selfFinished = true;

  ds.roomRef?.child(`players/${ds.playerId}`).update({
    totalScore:   ds.totalScore,
    currentIndex: ds.selectedQuestions.length,
    finished:     true,
  }).catch(() => {});

  showSection(du.resultSection);
  if (du.winnerBanner)  { du.winnerBanner.textContent = ''; du.winnerBanner.className = 'duel-winner-banner'; }
  if (du.finalMeName)   du.finalMeName.textContent   = ds.playerName;
  if (du.finalMeScore)  du.finalMeScore.textContent  = ds.totalScore;
  if (du.finalOppName)  du.finalOppName.textContent  = ds.opponentName || 'יריב';
  if (du.finalOppScore) du.finalOppScore.textContent = ds.opponentTotalScore;

  if (!ds.opponentFinished) {
    if (du.waitingFinalMsg) du.waitingFinalMsg.classList.remove('hidden');
    setStatus('סיימת! ממתין שהיריב יסיים...');
  } else {
    showFinalResults();
  }
}

// ── Listen to Opponent (real-time) ────────────────────────────────

function listenToOpponent() {
  if (!ds.roomRef) return;

  ds.roomRef.child('players').on('value', snapshot => {
    const players = snapshot.val();
    if (!players) return;

    const oppId = Object.keys(players).find(id => id !== ds.playerId);
    if (!oppId) return;

    const opp = players[oppId];
    ds.opponentId                       = oppId;
    ds.opponentName                     = opp.name            || ds.opponentName || 'יריב';
    ds.opponentTotalScore               = opp.totalScore      || 0;
    ds.opponentCurrentAnsweredIndex     = opp.answeredIndex   ?? -1;
    ds.opponentFinished                 = opp.finished        || false;
    // שמור ניקוד יחסי של היריב לשאלה הנוכחית
    if (opp.answeredIndex === ds.currentIndex) ds.oppRoundScore = opp.roundScore || 0;

    // scoreboard חי
    if (du.liveOppScore) du.liveOppScore.textContent = ds.opponentTotalScore;

    // badge "היריב ענה" (כשאנחנו עוד לא ענינו)
    if (du.oppAnsweredBadge && opp.answeredIndex === ds.currentIndex && !ds.answered) {
      du.oppAnsweredBadge.textContent = `${ds.opponentName} ענה ✅`;
      du.oppAnsweredBadge.classList.remove('hidden');
    }

    // אם שניהם ענו
    if (ds.answered && opp.answeredIndex === ds.currentIndex) {
      tryShowRoundScores();
      tryAdvance();
    }

    // עדכן תוצאה אם כבר בסיכום
    if (ds.selfFinished) {
      if (du.finalOppScore) du.finalOppScore.textContent = ds.opponentTotalScore;
      if (ds.opponentFinished) showFinalResults();
    }
  });
}

// ── Final Results ─────────────────────────────────────────────────

function showFinalResults() {
  if (du.waitingFinalMsg) du.waitingFinalMsg.classList.add('hidden');
  showSection(du.resultSection);

  const mine   = ds.totalScore;
  const theirs = ds.opponentTotalScore;
  const maxPts = DUEL_QUESTION_COUNT * MAX_POINTS_PER_Q;

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
      <p class="muted" style="font-size:13px;">מקסימום: ${maxPts} נק' (${DUEL_QUESTION_COUNT} שאלות × ${MAX_POINTS_PER_Q} נק')</p>
    `;
  }

  ds.roomRef?.update({ status: 'finished' }).catch(() => {});
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

// ── Play Again ────────────────────────────────────────────────────

function playAgain() {
  // Clean up Firebase listeners
  if (ds.roomRef) {
    ds.roomRef.off();
    if (ds.role === 'host') ds.roomRef.remove().catch(() => {});
  }

  stopTimer();
  Object.assign(ds, {
    roomId: null, roomRef: null, role: null,
    opponentId: null, opponentName: '',
    selectedQuestions: [], displayedChoices: {}, currentCorrectLabel: '',
    currentIndex: 0, totalScore: 0, opponentTotalScore: 0,
    myRoundScore: 0, oppRoundScore: 0,
    answered: false, selfFinished: false, opponentFinished: false,
    pendingAdvance: false, opponentCurrentAnsweredIndex: -1,
  });

  showSection(du.lobbySection);
  setStatus('הכנס שם ובחר: צור חדר חדש או הצטרף לחדר קיים');
}

// ── Keyboard Shortcuts ────────────────────────────────────────────

function onKeyDown(e) {
  if (du.quizSection?.classList.contains('hidden')) return;
  if (e.key === 'Enter') {
    if (!ds.answered) submitDuelAnswer();
    else if (!du.nextBtn?.classList.contains('hidden')) nextDuelQuestion();
  }
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
  du.submitBtn?.addEventListener('click', submitDuelAnswer);
  du.nextBtn?.addEventListener('click', nextDuelQuestion);
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
}

document.addEventListener('DOMContentLoaded', init);
