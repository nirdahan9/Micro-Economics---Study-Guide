const state = {
  allQuestions: [],
  lectures: [],
  selectedQuestions: [],
  currentIndex: 0,
  score: 0,
  answeredCount: 0,
  answered: false,
  mode: 'freestyle',
  lives: 3,
  timerInterval: null,
  timeRemainingSec: 0,
  timerType: 'total',        // 'total' | 'per-question'
  perQuestionTimeSec: 30,
  freestyleUnlimited: false,
  quizStartedAt: 0,
  weakStats: {},
  wrongStats: {},
  lifetimeStats: { answered: 0, correct: 0 },
  displayedChoices: {},
  currentCorrectLabel: '',
  currentConfidenceLevel: '',
  currentAnswerIsCorrect: false,
  confidenceStats: {
    high: { total: 0, correct: 0 },
    medium: { total: 0, correct: 0 },
    low: { total: 0, correct: 0 },
  },
};

const el = {
  loadStatus: document.getElementById('load-status'),
  lectureFilters: document.getElementById('lecture-filters'),
  questionCount: document.getElementById('question-count'),
  timerTypeInputs: document.querySelectorAll('input[name="timer-type"]'),
  timerTotalMinutes: document.getElementById('timer-total-minutes'),
  timerTotalSeconds: document.getElementById('timer-total-seconds'),
  timerPerMinutes: document.getElementById('timer-per-minutes'),
  timerPerSeconds: document.getElementById('timer-per-seconds'),
  livesCount: document.getElementById('lives-count'),
  questionFilterInputs: document.querySelectorAll('input[name="question-filter"]'),
  authStatusBar: document.getElementById('auth-status-bar'),
  authUserDisplay: document.getElementById('auth-user-display'),
  logoutBtn: document.getElementById('logout-btn'),
  setupProgressBarWrap: document.getElementById('setup-progress-bar-wrap'),
  setupProgressBarFill: document.getElementById('setup-progress-bar-fill'),
  setupProgressBarText: document.getElementById('setup-progress-bar-text'),
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
  finishQuiz: document.getElementById('finish-quiz'),
  feedback: document.getElementById('feedback'),
  confidenceField: document.getElementById('confidence-field'),
  confidenceOptions: document.getElementById('confidence-options'),
  confidenceChangeSection: document.getElementById('confidence-change-section'),
  confidenceChangeOptions: document.getElementById('confidence-change-options'),
  confidenceChangeConfirm: document.getElementById('confidence-change-confirm'),
  progressBarWrap: document.getElementById('progress-bar-wrap'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  progressBarText: document.getElementById('progress-bar-text'),

  resultScore: document.getElementById('result-score'),
  resultDetails: document.getElementById('result-details'),
  restartQuiz: document.getElementById('restart-quiz'),

  bankSummary: document.getElementById('bank-summary'),
  questionBank: document.getElementById('question-bank'),
  themeToggle: document.getElementById('theme-toggle'),
};

const THEME_KEY = 'micro-study-theme';
const WEAK_STATS_KEY_PREFIX  = 'micro-study-weak-stats-v1';
const WRONG_STATS_KEY_PREFIX = 'micro-study-wrong-stats-v1';

function getWeakStatsKey() {
  const u = (typeof AUTH !== 'undefined') ? AUTH.currentUser() : null;
  return `${WEAK_STATS_KEY_PREFIX}__${u || 'global'}`;
}

function getWrongStatsKey() {
  const u = (typeof AUTH !== 'undefined') ? AUTH.currentUser() : null;
  return `${WRONG_STATS_KEY_PREFIX}__${u || 'global'}`;
}

const MODE_LABELS = {
  freestyle: 'Freestyle',
  timer: 'טיימר',
  lives: 'חיים',
  confidence: 'Confidence Mode',
  'weak-first': 'חלשים קודם',
};

function getModeFromPage() {
  const mode = document.body?.dataset?.mode;
  if (!mode) return null;
  return Object.prototype.hasOwnProperty.call(MODE_LABELS, mode) ? mode : null;
}

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
    text.textContent = `שיעור ${Number(lecture.lectureId)} - ${lecture.lectureTitle}`;

    label.appendChild(input);
    label.appendChild(text);
    el.lectureFilters.appendChild(label);
  });
}

function renderQuestionBank() {
  if (!el.questionBank || !el.bankSummary) return;
  el.questionBank.innerHTML = '';
  el.bankSummary.textContent = `סה״כ ${state.allQuestions.length} שאלות במאגר.`;

  state.allQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'bank-item';
    item.textContent = `${idx + 1}. [שיעור ${Number(q.lectureId)} - ${q.lectureTitle}] ${q.text}`;
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
    const raw = localStorage.getItem(getWeakStatsKey());
    state.weakStats = raw ? JSON.parse(raw) : {};
  } catch {
    state.weakStats = {};
  }
}

function saveWeakStats() {
  localStorage.setItem(getWeakStatsKey(), JSON.stringify(state.weakStats));
}

function loadWrongStats() {
  try {
    const raw = localStorage.getItem(getWrongStatsKey());
    state.wrongStats = raw ? JSON.parse(raw) : {};
  } catch {
    state.wrongStats = {};
  }
}

function saveWrongStats() {
  localStorage.setItem(getWrongStatsKey(), JSON.stringify(state.wrongStats));
}

const LIFETIME_STATS_KEY_PREFIX = 'micro-study-lifetime-stats-v1';

function getLifetimeStatsKey() {
  const u = (typeof AUTH !== 'undefined') ? AUTH.currentUser() : null;
  return `${LIFETIME_STATS_KEY_PREFIX}__${u || 'global'}`;
}

function loadLifetimeStats() {
  try {
    const raw = localStorage.getItem(getLifetimeStatsKey());
    state.lifetimeStats = raw ? JSON.parse(raw) : { answered: 0, correct: 0 };
  } catch {
    state.lifetimeStats = { answered: 0, correct: 0 };
  }
}

function saveLifetimeStats() {
  localStorage.setItem(getLifetimeStatsKey(), JSON.stringify(state.lifetimeStats));
}

function getModeLabel(mode) {
  return MODE_LABELS[mode] || mode;
}

function updateModeUi() {
  if (el.livesCount && state.mode !== 'lives') {
    el.livesCount.closest('.field')?.classList.add('hidden');
  }

  if (el.livesCount && state.mode === 'lives') {
    el.livesCount.closest('.field')?.classList.remove('hidden');
  }

  if (el.confidenceField) {
    el.confidenceField.classList.toggle('hidden', state.mode !== 'confidence');
  }

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
      if (state.timerType === 'per-question') {
        handlePerQuestionTimeout();
      } else {
        showResults('הזמן הסתיים.');
      }
    }
  }, 1000);
}

function handlePerQuestionTimeout() {
  if (state.answered) return;
  const q = state.selectedQuestions[state.currentIndex];
  if (!q) return;

  state.answered = true;
  state.answeredCount += 1;
  state.weakStats[q.uniqueId] = Number(state.weakStats[q.uniqueId] || 0) + 1;
  saveWeakStats();
  state.wrongStats[q.uniqueId] = Number(state.wrongStats[q.uniqueId] || 0) + 1;
  saveWrongStats();

  el.feedback.className = 'feedback bad';
  el.feedback.innerHTML = `<strong>⏱️ הזמן פג!</strong><br>התשובה הנכונה היא: ${state.currentCorrectLabel}. ${state.displayedChoices[state.currentCorrectLabel] || ''}<br><br>הסבר: ${q.explanation}`;
  el.submitAnswer.disabled = true;
  el.nextQuestion.textContent = 'לשאלה הבאה';
  el.nextQuestion.classList.remove('hidden');
}

function updateLivesStatus() {
  if (el.livesStatus) {
    el.livesStatus.textContent = `חיים שנותרו: ${state.lives}`;
  }
}

function buildSelection() {
  const selectedLectures = getSelectedLectureIds();
  let filtered = state.allQuestions.filter((q) => selectedLectures.includes(q.lectureId));

  // In weak-first mode, check if user wants wrong-only subset
  const questionFilter = [...(el.questionFilterInputs || [])].find((r) => r.checked)?.value || 'all';
  const wrongOnlyMode = (state.mode === 'weak-first' || state.mode === 'confidence') && questionFilter === 'wrong-only';

  if (wrongOnlyMode) {
    filtered = filtered.filter((q) => Number(state.wrongStats[q.uniqueId] || 0) > 0);
    filtered = [...filtered].sort((a, b) => {
      const aw = Number(state.wrongStats[a.uniqueId] || 0);
      const bw = Number(state.wrongStats[b.uniqueId] || 0);
      if (bw !== aw) return bw - aw;
      return Math.random() - 0.5;
    });
  } else if (state.mode === 'weak-first') {
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
    ? `שיעור ${selectedLectures.map((id) => Number(id)).join(', ')}`
    : 'לא נבחרו מצגות';

  if (wrongOnlyMode) {
    el.selectionSummary.textContent = `ייבחרו ${selected.length} שאלות מתוך ${filtered.length} שאלות שסומנו כשגויות בעבר. שיעורים: ${lectureText}`;
  } else {
    el.selectionSummary.textContent = `ייבחרו ${selected.length} שאלות מתוך ${filtered.length} שאלות תואמות. שיעורים: ${lectureText}`;
  }

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

  // Reset confidence change section for each new question
  if (el.confidenceChangeSection) {
    el.confidenceChangeSection.classList.add('hidden');
  }
  if (el.confidenceChangeConfirm) {
    el.confidenceChangeConfirm.disabled = false;
    el.confidenceChangeConfirm.textContent = 'עדכן רמת ביטחון';
  }

  if (state.mode === 'confidence' && el.confidenceOptions) {
    [...el.confidenceOptions.querySelectorAll('input[name="confidence-level"]')].forEach((option) => {
      option.checked = false;
    });
  }

  if (state.mode === 'freestyle' && state.freestyleUnlimited) {
    el.progress.textContent = `שאלה ${state.currentIndex + 1} (Freestyle פתוח)`;
  } else {
    el.progress.textContent = `שאלה ${state.currentIndex + 1} מתוך ${state.selectedQuestions.length}`;
  }

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
    if (state.timerType === 'per-question') {
      state.timeRemainingSec = state.perQuestionTimeSec;
      startTimer();
    } else {
      updateTimerStatus();
    }
  }

  if (state.mode === 'lives') {
    updateLivesStatus();
  }

  el.questionMeta.textContent = `שיעור ${Number(q.lectureId)} - ${q.lectureTitle}`;
  el.questionText.textContent = q.text;

  el.answersForm.innerHTML = '';
  state.displayedChoices = {};
  state.currentCorrectLabel = '';

  const sourceChoiceKeys = Object.keys(q.choices).filter((key) => ['A', 'B', 'C', 'D'].includes(key));
  const shuffledChoiceKeys = shuffle(sourceChoiceKeys);
  const fixedLabels = ['A', 'B', 'C', 'D'];

  shuffledChoiceKeys.forEach((sourceKey, index) => {
    const displayLabel = fixedLabels[index];
    const choiceText = q.choices[sourceKey];

    state.displayedChoices[displayLabel] = choiceText;
    if (sourceKey === q.correct) {
      state.currentCorrectLabel = displayLabel;
    }

    const label = document.createElement('label');
    label.className = 'choice';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer';
    radio.value = displayLabel;

    const span = document.createElement('span');
    span.textContent = `${displayLabel}. ${choiceText}`;

    label.appendChild(radio);
    label.appendChild(span);
    el.answersForm.appendChild(label);
  });

  updateProgressBar();
}

function submitCurrentAnswer() {
  if (state.answered) return;

  // Stop per-question timer when user submits an answer
  if (state.mode === 'timer' && state.timerType === 'per-question') {
    stopTimer();
  }

  const q = state.selectedQuestions[state.currentIndex];
  const checked = el.answersForm.querySelector('input[name="answer"]:checked');
  const confidenceChecked = el.confidenceOptions?.querySelector('input[name="confidence-level"]:checked');

  if (!checked) {
    el.feedback.className = 'feedback bad';
    el.feedback.innerHTML = '<strong>לא נבחרה תשובה.</strong> יש לבחור אפשרות כדי להמשיך.';
    return;
  }

  if (state.mode === 'confidence' && !confidenceChecked) {
    el.feedback.className = 'feedback bad';
    el.feedback.innerHTML = '<strong>לא נבחרה רמת ביטחון.</strong> יש לבחור גבוה / בינוני / נמוך לפני בדיקת תשובה.';
    return;
  }

  const userAnswer = checked.value;
  const isCorrect = userAnswer === state.currentCorrectLabel;
  state.currentAnswerIsCorrect = isCorrect;
  state.answeredCount += 1;

  if (state.mode === 'confidence' && confidenceChecked) {
    const level = confidenceChecked.value;
    state.currentConfidenceLevel = level;
    if (state.confidenceStats[level]) {
      state.confidenceStats[level].total += 1;
      if (isCorrect) {
        state.confidenceStats[level].correct += 1;
      }
    }
  }

  if (isCorrect) {
    state.score += 1;
    el.feedback.className = 'feedback ok';
    el.feedback.innerHTML = `<strong>נכון!</strong><br>הסבר: ${q.explanation}`;
  } else {
    state.weakStats[q.uniqueId] = Number(state.weakStats[q.uniqueId] || 0) + 1;
    saveWeakStats();

    state.wrongStats[q.uniqueId] = Number(state.wrongStats[q.uniqueId] || 0) + 1;
    saveWrongStats();

    if (state.mode === 'lives') {
      state.lives -= 1;
      updateLivesStatus();
    }

    el.feedback.className = 'feedback bad';
    el.feedback.innerHTML = `<strong>לא נכון.</strong><br>התשובה הנכונה היא: ${state.currentCorrectLabel}. ${state.displayedChoices[state.currentCorrectLabel] || ''}<br><br>הסבר: ${q.explanation}`;
  }

  // Track lifetime accuracy for protected modes
  if (state.mode === 'weak-first' || state.mode === 'confidence') {
    state.lifetimeStats.answered += 1;
    if (isCorrect) state.lifetimeStats.correct += 1;
    saveLifetimeStats();
    renderSetupProgressBar();
  }

  state.answered = true;
  el.submitAnswer.disabled = true;
  if (state.mode === 'lives' && state.lives <= 0) {
    el.nextQuestion.textContent = 'לסיכום';
  } else {
    el.nextQuestion.textContent = 'לשאלה הבאה';
  }

  // Show confidence-change panel so user can revise their confidence rating
  if (state.mode === 'confidence' && el.confidenceChangeSection && state.currentConfidenceLevel) {
    el.confidenceChangeSection.classList.remove('hidden');
    const currentRadio = el.confidenceChangeOptions?.querySelector(
      `input[value="${state.currentConfidenceLevel}"]`
    );
    if (currentRadio) currentRadio.checked = true;
  }

  updateProgressBar();
  el.nextQuestion.classList.remove('hidden');
}

function showResults(reason = '') {
  stopTimer();
  el.quizSection.classList.add('hidden');
  el.resultSection.classList.remove('hidden');

  const total = Math.max(1, state.answeredCount);
  const percent = total ? Math.round((state.score / total) * 100) : 0;
  const durationSec = Math.max(0, Math.floor((Date.now() - state.quizStartedAt) / 1000));

  el.resultScore.textContent = `ציון: ${state.score} מתוך ${total} (${percent}%).`;
  const details = [`משך: ${formatDuration(durationSec)}`];
  if (reason) details.push(reason);
  if (state.mode === 'lives') details.push(`חיים שנותרו: ${Math.max(0, state.lives)}`);

  if (state.mode === 'confidence') {
    const labels = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' };
    const confidenceSummary = ['high', 'medium', 'low']
      .map((key) => {
        const totalByLevel = state.confidenceStats[key].total;
        if (!totalByLevel) return null;
        const correctByLevel = state.confidenceStats[key].correct;
        const pct = Math.round((correctByLevel / totalByLevel) * 100);
        return `${labels[key]}: ${correctByLevel}/${totalByLevel} (${pct}%)`;
      })
      .filter(Boolean)
      .join(' | ');

    if (confidenceSummary) {
      details.push(`דיוק לפי ביטחון: ${confidenceSummary}`);
    }
  }

  el.resultDetails.textContent = `${details.join(' | ')}. ניתן להתחיל תרגול נוסף עם בחירה חדשה של מספר שאלות ושיעורים.`;

}

function renderSetupProgressBar() {
  if (!el.setupProgressBarWrap) return;
  const user = (typeof AUTH !== 'undefined') ? AUTH.currentUser() : null;
  if (!user) {
    el.setupProgressBarWrap.classList.add('hidden');
    return;
  }
  const { answered, correct } = state.lifetimeStats;
  el.setupProgressBarWrap.classList.remove('hidden');
  if (answered === 0) {
    if (el.setupProgressBarFill) el.setupProgressBarFill.style.width = '0%';
    if (el.setupProgressBarText) el.setupProgressBarText.textContent = 'עדיין לא ענית על שאלות במצב זה';
    return;
  }
  const pct = Math.round((correct / answered) * 100);
  if (el.setupProgressBarFill) {
    el.setupProgressBarFill.style.width = `${pct}%`;
    el.setupProgressBarFill.className = `progress-bar-fill ${pct >= 80 ? 'good' : pct >= 50 ? 'medium' : 'bad'}`;
  }
  if (el.setupProgressBarText) {
    el.setupProgressBarText.textContent = `סה"כ כל הזמנים: ${correct} מתוך ${answered} נכון (${pct}%)`;
  }
}

function updateProgressBar() {
  if (!el.progressBarWrap) return;
  const showBar = state.mode === 'weak-first' || state.mode === 'confidence';
  if (!showBar) {
    el.progressBarWrap.classList.add('hidden');
    return;
  }
  el.progressBarWrap.classList.remove('hidden');
  if (state.answeredCount === 0) {
    if (el.progressBarFill) el.progressBarFill.style.width = '0%';
    if (el.progressBarText) el.progressBarText.textContent = 'עדיין לא ענית על שאלות בסבב זה';
    return;
  }
  const pct = Math.round((state.score / state.answeredCount) * 100);
  if (el.progressBarFill) {
    el.progressBarFill.style.width = `${pct}%`;
    el.progressBarFill.className = `progress-bar-fill ${pct >= 80 ? 'good' : pct >= 50 ? 'medium' : 'bad'}`;
  }
  if (el.progressBarText) {
    el.progressBarText.textContent = `${state.score} מתוך ${state.answeredCount} נכון (${pct}%)`;
  }
}

function confirmConfidenceChange() {
  const newLevelInput = el.confidenceChangeOptions?.querySelector('input[name="confidence-change-level"]:checked');
  if (!newLevelInput) return;
  const newLevel = newLevelInput.value;
  const oldLevel = state.currentConfidenceLevel;
  if (newLevel === oldLevel) {
    if (el.confidenceChangeConfirm) {
      el.confidenceChangeConfirm.textContent = '✓ לא בוצע שינוי';
      el.confidenceChangeConfirm.disabled = true;
    }
    return;
  }
  // Undo old level stats
  if (state.confidenceStats[oldLevel]) {
    state.confidenceStats[oldLevel].total = Math.max(0, state.confidenceStats[oldLevel].total - 1);
    if (state.currentAnswerIsCorrect) {
      state.confidenceStats[oldLevel].correct = Math.max(0, state.confidenceStats[oldLevel].correct - 1);
    }
  }
  // Apply new level stats
  if (state.confidenceStats[newLevel]) {
    state.confidenceStats[newLevel].total += 1;
    if (state.currentAnswerIsCorrect) {
      state.confidenceStats[newLevel].correct += 1;
    }
  }
  state.currentConfidenceLevel = newLevel;
  const labels = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' };
  if (el.confidenceChangeConfirm) {
    el.confidenceChangeConfirm.textContent = `✓ עודכן ל"${labels[newLevel]}"`;
    el.confidenceChangeConfirm.disabled = true;
  }
}

function moveNext() {
  if (state.mode === 'lives' && state.lives <= 0) {
    showResults('נגמרו החיים.');
    return;
  }

  if (state.currentIndex < state.selectedQuestions.length - 1) {
    state.currentIndex += 1;
    renderCurrentQuestion();
  } else if (state.mode === 'freestyle' && state.freestyleUnlimited) {
    state.selectedQuestions = shuffle(state.selectedQuestions);
    state.currentIndex = 0;
    renderCurrentQuestion();
  } else {
    showResults();
  }
}

function startQuiz() {
  stopTimer();

  const selected = buildSelection();
  const questionFilter = [...(el.questionFilterInputs || [])].find((r) => r.checked)?.value || 'all';

  if (selected.length === 0) {
    if ((state.mode === 'weak-first' || state.mode === 'confidence') && questionFilter === 'wrong-only') {
      alert('עדיין אין שאלות שגויות שמורות עבור הסינון שבחרת. נסה קודם לענות על שאלות ותחזור לכאן.');
    } else {
      alert('לא נמצאו שאלות בהתאם לסינון שבחרת.');
    }
    return;
  }

  state.selectedQuestions = selected;
  state.currentIndex = 0;
  state.score = 0;
  state.answeredCount = 0;
  state.currentConfidenceLevel = '';
  state.currentAnswerIsCorrect = false;
  state.lives = state.mode === 'lives'
    ? Math.max(1, Number(el.livesCount?.value || 3))
    : 3;
  state.freestyleUnlimited = state.mode === 'freestyle' && !el.questionCount.value.trim();
  state.confidenceStats = {
    high: { total: 0, correct: 0 },
    medium: { total: 0, correct: 0 },
    low: { total: 0, correct: 0 },
  };
  state.quizStartedAt = Date.now();

  el.resultSection.classList.add('hidden');
  el.quizSection.classList.remove('hidden');

  if (state.mode === 'timer') {
    const timerTypeVal = [...(el.timerTypeInputs || [])].find((r) => r.checked)?.value || 'total';
    state.timerType = timerTypeVal;
    if (timerTypeVal === 'total') {
      const mins = Number(el.timerTotalMinutes?.value || 0);
      const secs = Number(el.timerTotalSeconds?.value || 0);
      state.timeRemainingSec = Math.max(1, mins * 60 + secs);
      startTimer();
    } else {
      const mins = Number(el.timerPerMinutes?.value || 0);
      const secs = Number(el.timerPerSeconds?.value || 30);
      state.perQuestionTimeSec = Math.max(5, mins * 60 + secs);
      state.timeRemainingSec = state.perQuestionTimeSec;
      // Timer starts per-question inside renderCurrentQuestion
    }
  } else {
    state.timeRemainingSec = 0;
    stopTimer();
  }

  renderCurrentQuestion();
}

function resetSetup() {
  el.questionCount.value = '';
  if (el.timerTotalMinutes) el.timerTotalMinutes.value = '5';
  if (el.timerTotalSeconds) el.timerTotalSeconds.value = '0';
  if (el.timerPerMinutes) el.timerPerMinutes.value = '0';
  if (el.timerPerSeconds) el.timerPerSeconds.value = '30';
  if (el.livesCount) {
    el.livesCount.value = '3';
  }
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

  const scriptCandidates = ['questions-data.js', new URL('questions-data.js', window.location.href).toString()];
  for (const src of scriptCandidates) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`script load failed: ${src}`));
        document.head.appendChild(script);
      });

      if (typeof window.QUESTIONS_TEXT === 'string' && window.QUESTIONS_TEXT.trim()) {
        return window.QUESTIONS_TEXT;
      }
    } catch {
      // continue to next fallback
    }
  }

  const textCandidates = ['questions.txt', new URL('questions.txt', window.location.href).toString()];
  for (const src of textCandidates) {
    try {
      const response = await fetch(src, { cache: 'no-store' });
      const text = await response.text();
      if (typeof text === 'string' && text.trim()) {
        return text;
      }
    } catch {
      // continue to next fallback
    }
  }

  throw new Error('Questions source is empty');
}

async function init() {
  initTheme();

  const modeFromPage = getModeFromPage();
  const modeFromQuery = getModeFromQuery();
  state.mode = modeFromPage || modeFromQuery || 'freestyle';

  // Auth guard for protected modes
  const PROTECTED_MODES = ['weak-first', 'confidence'];
  if (PROTECTED_MODES.includes(state.mode) && typeof AUTH !== 'undefined') {
    AUTH.requireAuth(window.location.pathname + window.location.search);
    // requireAuth redirects if not logged in; execution continues only when logged in
  }

  // Populate auth status bar (weak-first and confidence pages have one)
  if (typeof AUTH !== 'undefined' && el.authStatusBar) {
    const u = AUTH.currentUser();
    if (u && el.authUserDisplay) {
      el.authUserDisplay.textContent = `👤 ${u}`;
    }
    el.logoutBtn?.addEventListener('click', () => {
      AUTH.logout();
      window.location.replace('login.html?next=' + encodeURIComponent(window.location.pathname));
    });
  }

  loadWeakStats();
  loadWrongStats();
  loadLifetimeStats();
  renderSetupProgressBar();

  try {
    const text = await loadQuestionsText();
    const parsed = parseQuestionsText(text);

    state.allQuestions = parsed.allQuestions;
    state.lectures = parsed.lectures;

    renderLectureFilters();
    renderQuestionBank();
    updateModeUi();
    buildSelection();

    el.loadStatus.textContent = `מצב נוכחי: ${getModeLabel(state.mode)} | נטענו ${state.allQuestions.length} שאלות מתוך ${state.lectures.length} מצגות.`;

    el.startQuiz.disabled = false;
    el.submitAnswer.disabled = false;
  } catch (err) {
    console.error(err);
    el.loadStatus.textContent = 'שגיאה בטעינת מאגר השאלות. רענן את הדף ונסה שוב.';
    el.startQuiz.disabled = true;
  }

  el.startQuiz.addEventListener('click', startQuiz);
  el.resetSetup.addEventListener('click', resetSetup);
  el.submitAnswer.addEventListener('click', submitCurrentAnswer);
  el.nextQuestion.addEventListener('click', moveNext);
  el.finishQuiz?.addEventListener('click', () => {
    showResults('התרגול הסתיים לפי בחירתך.');
  });
  el.themeToggle?.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
  el.restartQuiz.addEventListener('click', () => {
    el.resultSection.classList.add('hidden');
    el.quizSection.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.confidenceChangeConfirm?.addEventListener('click', confirmConfidenceChange);

  el.questionCount.addEventListener('input', buildSelection);
  el.lectureFilters.addEventListener('change', buildSelection);
  el.timerTotalMinutes?.addEventListener('input', buildSelection);
  el.timerTotalSeconds?.addEventListener('input', buildSelection);
  el.timerPerMinutes?.addEventListener('input', buildSelection);
  el.timerPerSeconds?.addEventListener('input', buildSelection);
  el.livesCount?.addEventListener('input', buildSelection);
  el.questionFilterInputs?.forEach((r) => r.addEventListener('change', buildSelection));

  // Timer type toggle: show/hide matching time-input panel
  el.timerTypeInputs?.forEach((r) =>
    r.addEventListener('change', () => {
      const sel = [...(el.timerTypeInputs || [])].find((i) => i.checked)?.value || 'total';
      document.getElementById('timer-total-settings')?.classList.toggle('hidden', sel !== 'total');
      document.getElementById('timer-per-settings')?.classList.toggle('hidden', sel !== 'per-question');
    })
  );
}

init();
