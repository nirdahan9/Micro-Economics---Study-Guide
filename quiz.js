const state = {
  allQuestions: [],
  lectures: [],
  selectedQuestions: [],
  currentIndex: 0,
  score: 0,
  answered: false,
};

const el = {
  loadStatus: document.getElementById('load-status'),
  lectureFilters: document.getElementById('lecture-filters'),
  questionCount: document.getElementById('question-count'),
  startQuiz: document.getElementById('start-quiz'),
  resetSetup: document.getElementById('reset-setup'),
  selectionSummary: document.getElementById('selection-summary'),

  quizSection: document.getElementById('quiz-section'),
  resultSection: document.getElementById('result-section'),

  progress: document.getElementById('progress'),
  questionMeta: document.getElementById('question-meta'),
  questionText: document.getElementById('question-text'),
  answersForm: document.getElementById('answers-form'),
  submitAnswer: document.getElementById('submit-answer'),
  nextQuestion: document.getElementById('next-question'),
  feedback: document.getElementById('feedback'),

  resultScore: document.getElementById('result-score'),
  resultDetails: document.getElementById('result-details'),
  restartQuiz: document.getElementById('restart-quiz'),

  bankSummary: document.getElementById('bank-summary'),
  questionBank: document.getElementById('question-bank'),
  themeToggle: document.getElementById('theme-toggle'),
};

const THEME_KEY = 'micro-study-theme';

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

function buildSelection() {
  const selectedLectures = getSelectedLectureIds();
  const filtered = state.allQuestions.filter((q) => selectedLectures.includes(q.lectureId));

  const countInput = el.questionCount.value.trim();
  const requestedCount = countInput ? Number(countInput) : null;

  let selected = filtered;

  if (requestedCount && Number.isFinite(requestedCount) && requestedCount > 0) {
    selected = shuffle(filtered).slice(0, Math.min(requestedCount, filtered.length));
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
  el.questionMeta.textContent = `מצגת ${Number(q.lectureId)} - ${q.lectureTitle}`;
  el.questionText.textContent = q.text;

  el.answersForm.innerHTML = '';
  ['A', 'B', 'C', 'D'].forEach((key) => {
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
    el.feedback.className = 'feedback bad';
    el.feedback.innerHTML = `<strong>לא נכון.</strong><br>התשובה הנכונה היא: ${q.correct}. ${q.choices[q.correct] || ''}<br><br>הסבר: ${q.explanation}`;
  }

  state.answered = true;
  el.submitAnswer.disabled = true;
  el.nextQuestion.classList.remove('hidden');
}

function showResults() {
  el.quizSection.classList.add('hidden');
  el.resultSection.classList.remove('hidden');

  const total = state.selectedQuestions.length;
  const percent = total ? Math.round((state.score / total) * 100) : 0;

  el.resultScore.textContent = `ציון: ${state.score} מתוך ${total} (${percent}%).`;
  el.resultDetails.textContent = 'ניתן להתחיל תרגול נוסף עם בחירה חדשה של מספר שאלות ושיעורים.';
}

function moveNext() {
  if (state.currentIndex < state.selectedQuestions.length - 1) {
    state.currentIndex += 1;
    renderCurrentQuestion();
  } else {
    showResults();
  }
}

function startQuiz() {
  const selected = buildSelection();

  if (selected.length === 0) {
    alert('לא נמצאו שאלות בהתאם לסינון שבחרת.');
    return;
  }

  state.selectedQuestions = selected;
  state.currentIndex = 0;
  state.score = 0;

  el.resultSection.classList.add('hidden');
  el.quizSection.classList.remove('hidden');

  renderCurrentQuestion();
}

function resetSetup() {
  el.questionCount.value = '';
  [...el.lectureFilters.querySelectorAll('input[type="checkbox"]')].forEach((c) => {
    c.checked = true;
  });
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

  try {
    const text = await loadQuestionsText();
    const parsed = parseQuestionsText(text);

    state.allQuestions = parsed.allQuestions;
    state.lectures = parsed.lectures;

    renderLectureFilters();
    renderQuestionBank();
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
}

init();
