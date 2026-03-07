# 📚 מדריך הלמידה — מיקרו כלכלה

> **A fully interactive study guide with 8 game modes and real-time multiplayer**, built for a university Microeconomics course.

🔗 **Live Demo:** [nirdahan9.github.io/Micro-Economics---Study-Guide](https://nirdahan9.github.io/Micro-Economics---Study-Guide/)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎮 **6 Game Modes** | Freestyle, Duel, Timer, Lives, Weak-First, Confidence |
| ⚔️ **Live Multiplayer** | Real-time duel mode via Firebase Realtime Database — create a room, share a link, battle a friend |
| 📱 **WhatsApp Deep Links** | Share a direct room link that auto-fills the join code for your opponent |
| 🔄 **Rematch System** | After a duel, both players can request a rematch — confirmed by both, new game starts instantly |
| ⚙️ **Custom Room Settings** | Host chooses number of questions (3–20) and time per question (15–120s) |
| 📊 **Speed-Based Scoring** | Points are awarded on correctness AND how fast you answered (0–100 pts/question) |
| 🌙 **Dark Mode** | Persisted per-device, respects system preference |
| 📁 **Study Materials** | View and download all 15 lecture PDFs + summary directly in-browser |

---

## 🎯 Game Modes

| Mode | Description |
|---|---|
| **Freestyle** | Open-ended practice — answer as many questions as you like at your own pace |
| **⚔️ Duel** | Real-time 1v1 — same questions, synced timer, speed scoring |
| **Timer** | Countdown for the whole session, or per-question — choose minutes and seconds |
| **Lives** | You have a set number of lives — lose one for every wrong answer |
| **Weak-First** | Questions you’ve gotten wrong before appear more often; includes “Review Wrong” filter |
| **Confidence** | Rate your confidence before each answer — tracks self-assessed mastery per level |

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JS (ES2020+), HTML5, CSS3 — no frameworks, no build tools
- **Multiplayer:** [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) (compat SDK v10, europe-west1 region)
- **Hosting:** GitHub Pages (static)
- **State Machine:** Custom Firebase-driven state machine (`waiting → both_joined → countdown_start → question → feedback → countdown_next → finished`)

---

## 📂 Project Structure

```
Study Guide/
├── index.html          # Home page with stats, navigation and per-lecture error chart
├── quiz.html           # Freestyle mode
├── duel.html           # Real-time multiplayer duel
├── game-modes.html     # Hub for all game modes
├── timer.html          # Timer mode (whole-session or per-question)
├── lives.html          # Lives mode
├── weak-first.html     # Weak-first mode (includes wrong-only filter)
├── confidence.html     # Confidence mode
├── multiplayer.html    # Group multiplayer (2–6 players)
├── materials.html      # Lecture PDFs browser
├── login.html          # Auth page (email/password)
│
├── styles.css          # Single shared stylesheet (dark mode, all components)
├── app.js              # Shared quiz engine (used by most game modes)
├── quiz.js             # Full quiz engine (all game mode logic, ~1100 lines)
├── duel.js             # Firebase multiplayer duel logic (~1200 lines)
├── multiplayer.js      # Group multiplayer logic
├── materials.js        # PDF file browser renderer
├── auth.js             # Firebase Auth module
├── version.js          # App version footer
│
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline support)
│
├── questions-data.js   # 118 questions in custom text format
├── documents-data.js   # PDF file metadata (name + path)
│
└── הרצאות/             # 15 lecture PDFs (מצגת 1–15)
```

---

## ⚔️ Duel Mode — How It Works

```
Host creates room → shares WhatsApp link → Guest joins → Both click "Ready"
       ↓
  3-2-1 Countdown (synced via Firebase ServerValue.TIMESTAMP)
       ↓
  Question (30s server-synced timer, opponent activity badge)
       ↓
  Both answer / timeout → Firebase pushes "feedback" status
       ↓
  Feedback screen (correct answer, explanation, round scores)
       ↓
  Both click "Next" → 3-2-1 Countdown → next question
       ↓
  After N questions → Final results + "Rematch" button
       ↓
  Both click Rematch → New questions, same room, same settings
```

**Scoring formula:**
$$\text{points} = \max\left(10,\ \text{round}\left(100 \times \left(0.1 + 0.9 \times \left(1 - \frac{t_{\text{answer}}}{t_{\text{limit}}}\right)\right)\right)\right)$$

---

## 🚀 Running Locally

No build step required — just open `index.html` in a browser, or serve with any static file server:

```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .
```

Then open [http://localhost:8000](http://localhost:8000).

> **Note:** Duel mode requires an active Firebase project. The current credentials are pre-configured for the production database.

---

## 📖 Question Format

Questions are stored in a custom plain-text format in `questions-data.js`:

```
LECTURE_ID: 5
LECTURE_TITLE: הביקוש

Q1_5:
question: "מה קובע את שיפוע עקומת הביקוש?"
choices:
  A: "מחיר המוצר"
  B: "הכנסת הצרכן"
  C: "אלסטיות הביקוש"
  D: "מחיר תחליפים"
correct: C
explanation: "שיפוע עקומת הביקוש תלוי באלסטיות — ככל שהביקוש אלסטי יותר, העקומה שטוחה יותר."
```

---

## 👩‍💻 Author

Built by **Nir Dahan** as a study tool for a university Microeconomics course.
