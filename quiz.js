const state = {
  allQuestions: [],
  lectures: [],
  selectedQuestions: [],
  currentIndex: 0,
  score: 0,
  answered: false,
  mode: 'marathon',
  lives: 3,
  timerInterval: null,
  timeRemainingSec: 0,
  quizStartedAt: 0,
  weakStats: {},
  leaderboard: {},
};

const el = {
  loadStatus: document.getElementById('load-status'),
  lectureFilters: document.getElementById('lecture-filters'),
  questionCount: document.getElementById('question-count'),
  timerMinutes: document.getElementById('timer-minutes'),
  timerField: document.getElementById('timer-field'),
  startQuiz: document.getElementById('start-quiz'),
  resetSetup: document.getElementById('reset-setup'),
  selectionSummary: document.getElementById('selection-summary'),

  quizSection: document.getElementById('quiz-section'),
  resultSection: document.getElementById('result-section'),

  progress: document.getElementById('progress'),
  modeStatus: document.getElementById('mode-status'),
  timerStatus: document.getElementById('timer-status'),
  livesStatus: document.getElementById('lives-status'),
  questionMeta: document.getElementById('question-meta'),
  questionText: document.getElementById('question-text'),
  answersForm: document.getElementById('answers-form'),
  submitAnswer: document.getElementById('submit-answer'),
  nextQuestion: document.getElementById('next-question'),
  feedback: document.getElementById('feedback'),

  resultScore: document.getElementById('result-score'),
  resultDetails: document.getElementById('result-details'),
  restartQuiz: document.getElementById('restart-quiz'),

  leaderboardTitle: document.getElementById('leaderboard-title'),
  leaderboardList: document.getElementById('leaderboard-list'),

  bankSummary: document.getElementById('bank-summary'),
  questionBank: document.getElementById('question-bank'),
  themeToggle: document.getElementById('theme-toggle'),
};

const THEME_KEY = 'micro-study-theme';
const WEAK_STATS_KEY = 'micro-study-weak-stats-v1';
const LEADERBOARD_KEY = 'micro-study-leaderboard-v1';

const MODE_LABELS = {
  marathon: 'מרתון',
  timer: 'טיימר',
  lives: 'חיים',
  'weak-first': 'חלשים קודם',
};

function getModeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (!mode) return null;
  return Object.prototype.hasOwnProperty.call(MODE_LABELS, mode) ? mode : null;
}

function cleanQuotedValue(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
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

  function flushCurrentQuestion() {
    if (!currentQuestion) return;
    const hasValidQuestion =
      currentQuestion.text &&
      Object.keys(currentQuestion.choices).length >= 2 &&
      currentQuestion.correct &&
      currentQuestion.explanation;

    if (hasValidQuestion) {
      allQuestions.push(currentQuestion);
    }
    currentQuestion = null;
    inChoices = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lectureIdMatch = line.match(/^LECTURE_ID:\s*(.+)$/);
    if (lectureIdMatch) {
      flushCurrentQuestion();
      currentLectureId = cleanQuotedValue(lectureIdMatch[1]);
      if (!lecturesMap.has(currentLectureId)) {
        lecturesMap.set(currentLectureId, {
          lectureId: currentLectureId,
          lectureTitle: currentLectureTitle || '',
        });
      }
      continue;
    }

    const lectureTitleMatch = line.match(/^LECTURE_TITLE:\s*(.+)$/);
    if (lectureTitleMatch) {
      currentLectureTitle = cleanQuotedValue(lectureTitleMatch[1]);
      if (currentLectureId) {
        lecturesMap.set(currentLectureId, {
          lectureId: currentLectureId,
          lectureTitle: currentLectureTitle,
        });
      }
      continue;
    }

    const questionIdMatch = line.match(/^(Q\d+_\d+):$/);
    if (questionIdMatch) {
      flushCurrentQuestion();
      questionSequence += 1;
      currentQuestion = {
        uniqueId: `${questionIdMatch[1]}__${currentLectureId}__${questionSequence}`,
        questionId: questionIdMatch[1],
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

    if (line.startsWith('question:')) {
      currentQuestion.text = cleanQuotedValue(line.slice('question:'.length));
      inChoices = false;
      continue;
    }

    if (line === 'choices:') {
      inChoices = true;
      continue;
    }

    if (line.startsWith('correct:')) {
      currentQuestion.correct = cleanQuotedValue(line.slice('correct:'.length));
      inChoices = false;
      continue;
    }

    if (line.startsWith('explanation:')) {
      currentQuestion.explanation = cleanQuotedValue(line.slice('explanation:'.length));
      inChoices = false;
      continue;
    }

    if (inChoices) {
      const choiceMatch = line.match(/^([A-D]):\s*(.+)$/);
      if (choiceMatch) {
        currentQuestion.choices[choiceMatch[1]] = cleanQuotedValue(choiceMatch[2]);
      }
    }
  }

  flushCurrentQuestion();

  const lectures = [...lecturesMap.values()].sort((a, b) => Number(a.lectureId) - Number(b.lectureId));

  return { allQuestions, lectures };
}

function renderLectureFilters() {
  el.lectureFilters.innerHTML = '';

  state.lectures.forEach((lecture) => {
    const label = document.createElement('label');
    label.className = 'lecture-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = lecture.lectureId;
    input.checked = true;

    const text = document.createElement('span');
    text.textContent = `מצגת ${Number(lecture.lectureId)} - ${lecture.lectureTitle}`;

    label.appendChild(input);
    label.appendChild(text);
    el.lectureFilters.appendChild(label);
  });
}

function renderQuestionBank() {
  el.questionBank.innerHTML = '';
  el.bankSummary.textContent = `סה״כ ${state.allQuestions.length} שאלות במאגר.`;

  state.allQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'bank-item';
    item.textContent = `${idx + 1}. [מצגת ${Number(q.lectureId)} - ${q.lectureTitle}] ${q.text}`;
    el.questionBank.appendChild(item);
  });
}

function getSelectedLectureIds() {
  return [...el.lectureFilters.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadWeakStats() {
  try {
    const raw = localStorage.getItem(WEAK_STATS_KEY);
    state.weakStats = raw ? JSON.parse(raw) : {};
  } catch {
    state.weakStats = {};
  }
}

function saveWeakStats() {
  localStorage.setItem(WEAK_STATS_KEY, JSON.stringify(state.weakStats));
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    state.leaderboard = raw ? JSON.parse(raw) : {};
  } catch {
    state.leaderboard = {};
  }
}

function saveLeaderboard() {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(state.leaderboard));
}

function getModeLabel(mode) {
  return MODE_LABELS[mode] || mode;
}

function updateModeUi() {
  if (el.timerField) {
    el.timerField.classList.toggle('hidden', state.mode !== 'timer');
  }
  renderLeaderboard();
  buildSelection();
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimerStatus() {
  if (!el.timerStatus) return;
  el.timerStatus.textContent = `זמן נותר: ${formatDuration(Math.max(0, state.timeRemainingSec))}`;
}

function startTimer() {
  stopTimer();
  updateTimerStatus();

  state.timerInterval = window.setInterval(() => {
    state.timeRemainingSec -= 1;
    updateTimerStatus();
    if (state.timeRemainingSec <= 0) {
      state.timeRemainingSec = 0;
      stopTimer();
      showResults('הזמן הסתיים.');
    }
  }, 1000);
}

function updateLivesStatus() {
  if (el.livesStatus) {
    el.livesStatus.textContent = `חיים שנותרו: ${state.lives}`;
  }
}

function renderLeaderboard() {
  if (!el.leaderboardList || !el.leaderboardTitle) return;

  const mode = state.mode || 'marathon';
  el.leaderboardTitle.textContent = `תוצאות מובילות - מצב ${getModeLabel(mode)}`;

  if (!['marathon', 'timer', 'lives'].includes(mode)) {
    el.leaderboardList.innerHTML = '<p class="muted">למצב זה אין Leaderboard.</p>';
    return;
  }

  const entries = state.leaderboard[mode] || [];
  if (!entries.length) {
    el.leaderboardList.innerHTML = '<p class="muted">עדיין אין תוצאות שמורות במצב הזה.</p>';
    return;
  }

  el.leaderboardList.innerHTML = '';
  entries.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    const date = new Date(entry.ts).toLocaleString('he-IL');
    item.textContent = `${i + 1}. ציון ${entry.score}/${entry.total} (${entry.percent}%) • זמן ${formatDuration(entry.durationSec)} • ${date}`;
    el.leaderboardList.appendChild(item);
  });
}

function saveLeaderboardEntry(reason = '') {
  const mode = state.mode;
  if (!['marathon', 'timer', 'lives'].includes(mode)) return;
  const total = state.selectedQuestions.length;
  if (!total) return;

  const durationSec = Math.max(0, Math.floor((Date.now() - state.quizStartedAt) / 1000));
  const percent = Math.round((state.score / total) * 100);
  const entry = {
    score: state.score,
    total,
    percent,
    durationSec,
    ts: Date.now(),
    reason,
  };

  const list = state.leaderboard[mode] || [];
  list.push(entry);

  list.sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    if (b.score !== a.score) return b.score - a.score;
    return a.durationSec - b.durationSec;
  });

  state.leaderboard[mode] = list.slice(0, 10);
  saveLeaderboard();
}

function buildSelection() {
  const selectedLectures = getSelectedLectureIds();
  let filtered = state.allQuestions.filter((q) => selectedLectures.includes(q.lectureId));

  if (state.mode === 'weak-first') {
    filtered = [...filtered].sort((a, b) => {
      const aw = Number(state.weakStats[a.uniqueId] || 0);
      const bw = Number(state.weakStats[b.uniqueId] || 0);
      if (bw !== aw) return bw - aw;
      return Math.random() - 0.5;
    });
  } else {
    filtered = shuffle(filtered);
  }

  const countInput = el.questionCount.value.trim();
  const requestedCount = countInput ? Number(countInput) : null;

  let selected = [...filtered];

  if (requestedCount && Number.isFinite(requestedCount) && requestedCount > 0) {
    selected = selected.slice(0, Math.min(requestedCount, filtered.length));
  }

  const lectureText = selectedLectures.length
    ? `מצגת ${selectedLectures.map((id) => Number(id)).join(', ')}`
    : 'לא נבחרו מצגות';

  el.selectionSummary.textContent = `ייבחרו ${selected.length} שאלות מתוך ${filtered.length} שאלות תואמות. שיעורים: ${lectureText}`;

  return selected;
}

function renderCurrentQuestion() {
  const q = state.selectedQuestions[state.currentIndex];
  if (!q) return;

  state.answered = false;
  el.feedback.className = 'feedback hidden';
  el.feedback.innerHTML = '';
  el.submitAnswer.disabled = false;
  el.nextQuestion.classList.add('hidden');

  el.progress.textContent = `שאלה ${state.currentIndex + 1} מתוך ${state.selectedQuestions.length}`;
  if (el.modeStatus) {
    el.modeStatus.textContent = `מצב משחק: ${getModeLabel(state.mode)}`;
  }

  if (el.timerStatus) {
    el.timerStatus.classList.toggle('hidden', state.mode !== 'timer');
  }

  if (el.livesStatus) {
    el.livesStatus.classList.toggle('hidden', state.mode !== 'lives');
  }

  if (state.mode === 'timer') {
    updateTimerStatus();
  }

  if (state.mode === 'lives') {
    updateLivesStatus();
  }

  el.questionMeta.textContent = `מצגת ${Number(q.lectureId)} - ${q.lectureTitle}`;
  el.questionText.textContent = q.text;

  el.answersForm.innerHTML = '';
  const choiceOrder = shuffle(['A', 'B', 'C', 'D']);
  choiceOrder.forEach((key) => {
    if (!q.choices[key]) return;
    const label = document.createElement('label');
    label.className = 'choice';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer';
    radio.value = key;

    const span = document.createElement('span');
    span.textContent = `${key}. ${q.choices[key]}`;

    label.appendChild(radio);
    label.appendChild(span);
    el.answersForm.appendChild(label);
  });
}

function submitCurrentAnswer() {
  if (state.answered) return;

  const q = state.selectedQuestions[state.currentIndex];
  const checked = el.answersForm.querySelector('input[name="answer"]:checked');

  if (!checked) {
    el.feedback.className = 'feedback bad';
    el.feedback.innerHTML = '<strong>לא נבחרה תשובה.</strong> יש לבחור אפשרות כדי להמשיך.';
    return;
  }

  const userAnswer = checked.value;
  const isCorrect = userAnswer === q.correct;

  if (isCorrect) {
    state.score += 1;
    el.feedback.className = 'feedback ok';
    el.feedback.innerHTML = `<strong>נכון!</strong><br>הסבר: ${q.explanation}`;
  } else {
    state.weakStats[q.uniqueId] = Number(state.weakStats[q.uniqueId] || 0) + 1;
    saveWeakStats();

    if (state.mode === 'lives') {
      state.lives -= 1;
      updateLivesStatus();
    }

    el.feedback.className = 'feedback bad';
    el.feedback.innerHTML = `<strong>לא נכון.</strong><br>התשובה הנכונה היא: ${q.correct}. ${q.choices[q.correct] || ''}<br><br>הסבר: ${q.explanation}`;
  }

  state.answered = true;
  el.submitAnswer.disabled = true;
  if (state.mode === 'lives' && state.lives <= 0) {
    el.nextQuestion.textContent = 'לסיכום';
  } else {
    el.nextQuestion.textContent = 'לשאלה הבאה';
  }

  el.nextQuestion.classList.remove('hidden');
}

function showResults(reason = '') {
  stopTimer();
  el.quizSection.classList.add('hidden');
  el.resultSection.classList.remove('hidden');

  const total = state.selectedQuestions.length;
  const percent = total ? Math.round((state.score / total) * 100) : 0;
  const durationSec = Math.max(0, Math.floor((Date.now() - state.quizStartedAt) / 1000));

  el.resultScore.textContent = `ציון: ${state.score} מתוך ${total} (${percent}%).`;
  const details = [`משך: ${formatDuration(durationSec)}`];
  if (reason) details.push(reason);
  if (state.mode === 'lives') details.push(`חיים שנותרו: ${Math.max(0, state.lives)}`);
  el.resultDetails.textContent = `${details.join(' | ')}. ניתן להתחיל תרגול נוסף עם בחירה חדשה של מספר שאלות ושיעורים.`;

  saveLeaderboardEntry(reason);
  renderLeaderboard();
}

function moveNext() {
  if (state.mode === 'lives' && state.lives <= 0) {
    showResults('נגמרו החיים.');
    return;
  }

  if (state.currentIndex < state.selectedQuestions.length - 1) {
    state.currentIndex += 1;
    renderCurrentQuestion();
  } else {
    showResults();
  }
}

function startQuiz() {
  stopTimer();
  const selected = buildSelection();

  if (selected.length === 0) {
    alert('לא נמצאו שאלות בהתאם לסינון שבחרת.');
    return;
  }

  state.selectedQuestions = selected;
  state.currentIndex = 0;
  state.score = 0;
  state.lives = 3;
  state.quizStartedAt = Date.now();

  el.resultSection.classList.add('hidden');
  el.quizSection.classList.remove('hidden');

  if (state.mode === 'timer') {
    const minutes = Number(el.timerMinutes?.value || 5);
    state.timeRemainingSec = Math.max(1, Math.floor(minutes * 60));
    startTimer();
  } else {
    state.timeRemainingSec = 0;
    stopTimer();
  }

  renderCurrentQuestion();
}

function resetSetup() {
  el.questionCount.value = '';
  if (el.timerMinutes) el.timerMinutes.value = '5';
  [...el.lectureFilters.querySelectorAll('input[type="checkbox"]')].forEach((c) => {
    c.checked = true;
  });
  updateModeUi();
  buildSelection();
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  if (el.themeToggle) {
    el.themeToggle.textContent = theme === 'dark' ? '☀️ מצב בהיר' : '🌙 מצב כהה';
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
    return;
  }

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

async function loadQuestionsText() {
  if (typeof window.QUESTIONS_TEXT === 'string' && window.QUESTIONS_TEXT.trim()) {
    return window.QUESTIONS_TEXT;
  }

  const response = await fetch('questions.txt');
  if (!response.ok) throw new Error('Load failed');
  return response.text();
}

async function init() {
  initTheme();
  loadWeakStats();
  loadLeaderboard();

  const modeFromQuery = getModeFromQuery();
  state.mode = modeFromQuery || 'marathon';

  try {
    const text = await loadQuestionsText();
    const parsed = parseQuestionsText(text);

    state.allQuestions = parsed.allQuestions;
    state.lectures = parsed.lectures;

    renderLectureFilters();
    renderQuestionBank();
    updateModeUi();
    buildSelection();

    el.loadStatus.textContent = `נטענו ${state.allQuestions.length} שאלות מתוך ${state.lectures.length} מצגות.`;

    el.startQuiz.disabled = false;
    el.submitAnswer.disabled = false;
  } catch (err) {
    console.error(err);
    el.loadStatus.textContent = 'שגיאה בטעינת מאגר השאלות.';
    el.startQuiz.disabled = true;
  }

  el.startQuiz.addEventListener('click', startQuiz);
  el.resetSetup.addEventListener('click', resetSetup);
  el.submitAnswer.addEventListener('click', submitCurrentAnswer);
  el.nextQuestion.addEventListener('click', moveNext);
  el.themeToggle?.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
  el.restartQuiz.addEventListener('click', () => {
    el.resultSection.classList.add('hidden');
    el.quizSection.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.questionCount.addEventListener('input', buildSelection);
  el.lectureFilters.addEventListener('change', buildSelection);
  el.timerMinutes?.addEventListener('input', buildSelection);
}

init();
