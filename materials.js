const state = {
  studyFiles: Array.isArray(window.STUDY_FILES) ? window.STUDY_FILES : [],
};

const el = {
  filesSummary: document.getElementById('files-summary'),
  filesLibrary: document.getElementById('files-library'),
  themeToggle: document.getElementById('theme-toggle'),
};

const THEME_KEY = 'micro-study-theme';

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

function renderStudyFiles() {
  if (!el.filesLibrary || !el.filesSummary) return;

  const files = state.studyFiles;
  el.filesLibrary.innerHTML = '';

  if (!files.length) {
    el.filesSummary.textContent = 'לא נמצאו קבצים להצגה.';
    return;
  }

  el.filesSummary.textContent = `סה״כ ${files.length} קבצים זמינים לקריאה ולהורדה.`;

  const categoryOrder = {
    'הרצאות': 1,
    'סיכום וחומר נוסף': 2,
  };

  function getLectureNumber(fileName = '') {
    const m = fileName.match(/מצגת\s*(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function compareFiles(a, b) {
    const aNum = getLectureNumber(a.name);
    const bNum = getLectureNumber(b.name);

    if (aNum !== null && bNum !== null) {
      return aNum - bNum;
    }

    if (aNum !== null) return -1;
    if (bNum !== null) return 1;

    return a.name.localeCompare(b.name, 'he');
  }

  const grouped = files.reduce((acc, file) => {
    const key = file.category || 'כללי';
    if (!acc[key]) acc[key] = [];
    acc[key].push(file);
    return acc;
  }, {});

  Object.entries(grouped)
    .sort((a, b) => {
      const aRank = categoryOrder[a[0]] ?? 99;
      const bRank = categoryOrder[b[0]] ?? 99;
      if (aRank !== bRank) return aRank - bRank;
      return a[0].localeCompare(b[0], 'he');
    })
    .forEach(([category, groupFiles]) => {
    const group = document.createElement('section');
    group.className = 'file-group';

    const title = document.createElement('h3');
    title.className = 'file-group-title';
    title.textContent = category;
    group.appendChild(title);

    const list = document.createElement('div');
    list.className = 'files-grid';

    [...groupFiles].sort(compareFiles).forEach((file) => {
      const item = document.createElement('article');
      item.className = 'file-item';

      const name = document.createElement('p');
      name.className = 'file-name';
      name.textContent = file.name;

      const meta = document.createElement('p');
      meta.className = 'file-meta muted';
      meta.textContent = `סוג קובץ: ${(file.ext || 'קובץ').toUpperCase()}`;

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      const encodedPath = encodeURI(file.path);

      const openLink = document.createElement('a');
      openLink.className = 'btn';
      openLink.href = encodedPath;
      openLink.target = '_blank';
      openLink.rel = 'noopener noreferrer';
      openLink.textContent = 'פתח קובץ';

      const downloadLink = document.createElement('a');
      downloadLink.className = 'btn';
      downloadLink.href = encodedPath;
      downloadLink.download = file.name;
      downloadLink.textContent = 'הורד קובץ';

      actions.appendChild(openLink);
      actions.appendChild(downloadLink);

      item.appendChild(name);
      item.appendChild(meta);
      item.appendChild(actions);
      list.appendChild(item);
    });

    group.appendChild(list);
    el.filesLibrary.appendChild(group);
  });
}

function init() {
  initTheme();
  renderStudyFiles();

  el.themeToggle?.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

init();
