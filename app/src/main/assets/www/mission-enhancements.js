/* Ascent Daily Mission — additive layer; existing planner and saved state remain intact. */
(function () {
  "use strict";
  const DATA = window.PLAN_DATA;
  if (!DATA || !document.getElementById("view-root")) return;
  const KEY = "ascent.mission.v1";
  const START = "2026-10-26";
  const SKILLS = [
    ["Reading comprehension", "Read the passage once, answer questions, and point to evidence for each answer."],
    ["Main idea and supporting details", "Identify the central claim, then separate supporting details from examples."],
    ["Inference and writer's purpose", "Infer only what the passage supports; identify the writer's purpose and tone."],
    ["Vocabulary in context", "Use surrounding sentences, word forms, and context clues before checking a dictionary."],
    ["Grammar and sentence structure", "Practise the grammar point taught in this unit and correct complete sentences."],
    ["Cloze and contextual completion", "Choose words by meaning, grammar, collocation, and the logic of the whole passage."],
    ["Paraphrase and sentence transformation", "Keep the original meaning while changing structure or wording accurately."],
    ["Writing and language use", "Practise the writing or functional-language task taught in this unit."]
  ];
  const SUBJECTS = DATA.subjects || [];
  const BOOKS = DATA.books || [];
  const PORTIONS = window.PORTION_DATA && window.PORTION_DATA.units || {};
  let state = load();
  let lastFocusStatus = "";
  let lastFocusSeconds = 0;
  let lastReminderDate = "";

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        days: raw.days && typeof raw.days === "object" ? raw.days : {},
        words: raw.words && typeof raw.words === "object" ? raw.words : {},
        settings: Object.assign({ reminderEnabled: false, reminderTime: "19:00" }, raw.settings || {})
      };
    } catch (_) {
      return { days: {}, words: {}, settings: { reminderEnabled: false, reminderTime: "19:00" } };
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function dateISO(date) {
    return date.getFullYear() + "-" + String(date.getMonth()+1).padStart(2,"0") + "-" + String(date.getDate()).padStart(2,"0");
  }
  function planToday() {
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < 320) now.setDate(now.getDate()-1);
    return dateISO(now);
  }
  function dayOffset(iso) {
    const a = new Date(START + "T12:00:00");
    const b = new Date(iso + "T12:00:00");
    return Math.floor((b - a) / 86400000);
  }
  function currentWeek(iso) { return Math.max(1, Math.min(30, Math.floor(Math.max(0, dayOffset(iso)) / 7) + 1)); }
  function dayIndex(iso) { return ((dayOffset(iso) % 7) + 7) % 7; }
  function dayState(iso) {
    if (!state.days[iso]) state.days[iso] = { done: {}, questionCount: {}, accuracy: {}, notes: "" };
    return state.days[iso];
  }
  function subject(id) { return SUBJECTS.find(s => s.id === id) || { id, name: id, short: id }; }
  function unitsFor(week, weekday) {
    const all = [];
    BOOKS.forEach(book => book.units.forEach(unit => {
      if (unit.week <= week) all.push(Object.assign({}, unit, { bookId: book.id, book, subject: subject(book.subject) }));
    }));
    const chosenBySubject = SUBJECTS.map(sub => {
      const due = all.filter(u => u.subject.id === sub.id && u.week === week);
      const pool = due.length ? due : all.filter(u => u.subject.id === sub.id && u.week <= week).slice(-1);
      return pool.length ? pool[weekday % pool.length] : null;
    }).filter(Boolean);
    // Three focused subjects per day; each subject's due units rotate without silently dropping extra units.
    const count = Math.min(3, chosenBySubject.length);
    const start = (weekday * count) % Math.max(1, chosenBySubject.length);
    const chosen = [];
    for (let i=0; i<count; i++) chosen.push(chosenBySubject[(start+i) % chosenBySubject.length]);
    return chosen;
  }
  function pageSlice(unit, iso) {
    const portion = PORTIONS[unit.id];
    if (!portion || !portion.start || !portion.end) return null;
    const total = portion.end - portion.start + 1;
    const weekday = dayIndex(iso);
    const week = currentWeek(iso);
    let slot = 0, appearances = 0;
    for (let day = 0; day <= 4; day++) {
      const scheduled = unitsFor(week, day).some(item => item.id === unit.id);
      if (scheduled) {
        appearances++;
        if (day < weekday) slot++;
      }
    }
    const chunks = Math.max(1, appearances);
    const chunk = Math.ceil(total / chunks);
    const start = portion.start + slot * chunk;
    return start > portion.end ? null : { start, end: Math.min(portion.end, start + chunk - 1) };
  }
  function pageLabel(unit, iso) {
    if (dayIndex(iso) >= 5) return "Weekend consolidation: revise this unit's summary, retry mistakes, and finish any weekday pages left incomplete.";
    if (unit.week < currentWeek(iso)) return "Revision: close the book, recall key ideas, then check the summary and repair gaps. Do not reread the whole unit.";
    const p = pageSlice(unit, iso);
    return p ? "Printed pages " + p.start + "–" + p.end : "Read the assigned section and learning outcomes; confirm page range in your edition.";
  }
  function missionTasks(iso) {
    const week = currentWeek(iso);
    const weekday = dayIndex(iso);
    const todayUnits = unitsFor(week, weekday);
    const tasks = todayUnits.map((u, i) => ({
      id: (u.week === week ? "learn-" : "review-") + u.id,
      type: u.week === week ? "learn" : "review",
      title: u.subject.name + " · Grade " + u.book.grade + " Unit " + u.no,
      detail: u.week === week ? u.name : "Review scheduled unit: " + u.name,
      portion: pageLabel(u, iso),
      questions: u.subject.id === "biology" ? 20 : u.subject.id === "english" ? 15 : 15,
      subject: u.subject.id,
      href: "#books/" + u.bookId + "/" + u.id
    }));
    const englishBook = BOOKS.filter(b => b.subject === "english").sort((a,b) => b.grade-a.grade)[0];
    if (englishBook) {
      const scheduled = englishBook.units.filter(u => u.week === week);
      const eligible = englishBook.units.filter(u => u.week <= week);
      const englishPool = scheduled.length ? scheduled : eligible.length ? [eligible[eligible.length - 1]] : [englishBook.units[0]];
      const englishUnit = englishPool[Math.max(0, dayOffset(iso)) % englishPool.length];
      const skill = SKILLS[weekday % SKILLS.length];
      tasks.push({
        id: "english-skill-" + englishUnit.id + "-" + weekday,
        type: "skill",
        title: "English · " + skill[0],
        detail: "Reading: " + englishUnit.name + " · Grade " + englishBook.grade,
        portion: "Read one passage or the relevant unit section, then apply this single skill.",
        questions: 10,
        subject: "english",
        href: "#books/" + englishBook.id + "/" + englishUnit.id,
        skillDetail: skill[1]
      });
    }
    tasks.push({
      id: "aptitude-" + week + "-" + weekday,
      type: "practice",
      title: "Scholastic Aptitude · timed drill",
      detail: "Attempt 15 mixed questions, then review every incorrect answer.",
      portion: "Use the existing Practice section; this is a target, not an embedded test.",
      questions: 15,
      subject: "aptitude",
      href: "#practice"
    });
    tasks.push({
      id: "review-errors",
      type: "review",
      title: "Repair yesterday's mistakes",
      detail: "Retry up to 10 due or previously incorrect questions without looking at the answers first.",
      portion: "Use Practice → errors and your saved assessment notes.",
      questions: 10,
      subject: "review",
      href: "#practice/errors"
    });
    return tasks;
  }
  function existingProgress() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem("ascent.esslce.v1") || "{}"); } catch (_) {}
    const units = raw.units && typeof raw.units === "object" ? raw.units : {};
    const daily = raw.daily && typeof raw.daily === "object" ? raw.daily : {};
    const errors = Array.isArray(raw.errors) ? raw.errors : [];
    const perSubject = SUBJECTS.map(sub => {
      const subjectBooks = BOOKS.filter(b => b.subject === sub.id);
      let total = 0, complete = 0;
      subjectBooks.forEach(book => book.units.forEach(unit => {
        total++;
        const record = units[unit.id] || {};
        const passes = record.passes && typeof record.passes === "object" ? record.passes : {};
        if (["map","learn","prove","compress"].every(key => !!passes[key])) complete++;
      }));
      return { subject: sub, total, complete, pct: total ? Math.round(complete / total * 100) : 0 };
    });
    const logs = [];
    Object.keys(daily).forEach(date => {
      const mcqs = daily[date] && Array.isArray(daily[date].mcqs) ? daily[date].mcqs : [];
      mcqs.forEach(log => logs.push(log));
    });
    const attempted = logs.reduce((n, log) => n + (Number(log.count) || 0), 0);
    const correct = logs.reduce((n, log) => n + (Number(log.correct) || 0), 0);
    return { perSubject, attempted, accuracy: attempted ? Math.round(correct / attempted * 100) : null, openErrors: errors.filter(error => error.status !== "resolved").length };
  }
  function progressMarkup() {
    const stats = existingProgress();
    return '<section class="mission-progress-panel"><div class="mission-section-heading"><div><span class="mission-kicker">PROOF OF PROGRESS</span><h2>Are your marks improving?</h2><p>Coverage shows what you have worked through. Practice accuracy and error repair show what you can actually retrieve.</p></div><a href="#practice">Open practice ↗</a></div>' +
      '<div class="mission-progress-metrics"><div><strong>' + (stats.accuracy == null ? "—" : stats.accuracy + "%") + '</strong><span>logged question accuracy</span></div><div><strong>' + stats.attempted + '</strong><span>questions logged</span></div><div><strong>' + stats.openErrors + '</strong><span>open error records</span></div></div>' +
      '<div class="mission-subject-progress">' + stats.perSubject.map(item => '<div class="mission-subject-row"><div><span>' + esc(item.subject.name) + '</span><strong>' + (item.total ? item.complete + '/' + item.total + ' units' : 'Practice-based') + '</strong></div>' + (item.total ? '<div class="mission-subject-track"><span style="width:' + item.pct + '%;background:' + esc(item.subject.color) + '"></span></div>' : '<div class="mission-subject-note">Track attempts and accuracy in Practice.</div>') + '</div>').join("") + '</div></section>';
  }
  function wordData(iso) {
    if (!state.words[iso]) state.words[iso] = ["","","",""].map(() => ({ word:"", meaning:"", sentence:"", recalled:false, reviewedOn:null }));
    while (state.words[iso].length < 4) state.words[iso].push({ word:"", meaning:"", sentence:"", recalled:false, reviewedOn:null });
    return state.words[iso].slice(0,4);
  }
  function dueVocabulary(iso) {
    const due = [];
    Object.keys(state.words).forEach(date => {
      const age = dayOffset(iso) - dayOffset(date);
      if (![1,3,7,14].includes(age)) return;
      (Array.isArray(state.words[date]) ? state.words[date] : []).forEach((word, index) => {
        if (word && word.word && word.meaning && word.reviewedOn !== iso) due.push({ date, index, word });
      });
    });
    return due;
  }
  function completion(tasks, record) {
    const total = tasks.length + 1;
    const done = tasks.filter(t => record.done[t.id]).length + (wordData(record.__date || planToday()).filter(w => w.word.trim()).length === 4 ? 1 : 0);
    return { done, total, pct: Math.round(done / total * 100) };
  }
  function renderMission() {
    const root = document.getElementById("view-root");
    if (!root || root.dataset.missionEnhanced === "1") return;
    if (!location.hash.match(/^#\/?today(?:\/|$)/)) return;
    root.dataset.missionEnhanced = "1";
    const iso = planToday();
    const week = currentWeek(iso);
    const record = dayState(iso);
    const tasks = missionTasks(iso);
    const words = wordData(iso);
    const dueWords = dueVocabulary(iso);
    const finished = tasks.filter(t => record.done[t.id]).length;
    const vocabComplete = words.filter(w => w.word.trim() && w.meaning.trim()).length === 4;
    const pct = Math.round((finished + (vocabComplete ? 1 : 0)) / (tasks.length + 1) * 100);
    const taskHTML = tasks.map(t => {
      const checked = !!record.done[t.id];
      return '<article class="mission-task ' + (checked ? 'is-done' : '') + '">' +
        '<label class="mission-check"><input type="checkbox" data-mission-done="' + esc(t.id) + '" ' + (checked ? 'checked' : '') + '><span class="mission-checkmark" aria-hidden="true"></span></label>' +
        '<div class="mission-task-copy"><div class="mission-task-meta"><span>' + esc(t.type === "learn" ? "COVER" : t.type === "skill" ? "ENGLISH SKILL" : t.type === "review" ? "RECALL" : "PRACTISE") + '</span><span>' + t.questions + ' questions</span></div>' +
        '<h3>' + esc(t.title) + '</h3><p>' + esc(t.detail) + '</p><div class="mission-portion">' + esc(t.portion) + '</div>' +
        (t.skillDetail ? '<p class="mission-skill-detail">' + esc(t.skillDetail) + '</p>' : '') +
        '<div class="mission-task-actions"><a href="' + esc(t.href) + '">Open relevant section ↗</a><label>Questions to attempt <input type="number" min="0" max="200" step="1" value="' + esc(record.questionCount[t.id] == null ? t.questions : record.questionCount[t.id]) + '" data-question-count="' + esc(t.id) + '"></label></div></div></article>';
    }).join("");
    const dueHTML = dueWords.length ? dueWords.map(item => '<div class="mission-due-word"><div><strong>' + esc(item.word.word) + '</strong><span>Added ' + esc(item.date) + '</span></div><button type="button" class="mission-secondary" data-due-word="' + esc(item.date) + '" data-due-index="' + item.index + '">Test recall</button></div>').join("") : '<p class="mission-no-due">No spaced-recall words due today. Keep adding four useful words.</p>';
    const vocabHTML = words.map((w,i) => '<div class="mission-word-row"><span class="mission-word-number">' + (i+1) + '</span><div class="mission-word-fields"><input type="text" maxlength="80" placeholder="Word ' + (i+1) + '" aria-label="Vocabulary word ' + (i+1) + '" data-word="' + i + '" data-word-field="word" value="' + esc(w.word) + '"><input type="text" maxlength="180" placeholder="Meaning" aria-label="Meaning of word ' + (i+1) + '" data-word="' + i + '" data-word-field="meaning" value="' + esc(w.meaning) + '"><input type="text" maxlength="240" placeholder="Your example sentence" aria-label="Example sentence for word ' + (i+1) + '" data-word="' + i + '" data-word-field="sentence" value="' + esc(w.sentence) + '"></div><button type="button" class="mission-recall ' + (w.recalled ? 'is-recalled' : '') + '" data-word-recall="' + i + '">' + (w.recalled ? 'Recalled ✓' : 'Test recall') + '</button></div>').join("");
    const card = document.createElement("section");
    card.className = "mission-shell";
    card.innerHTML = '<div class="mission-hero"><div><span class="mission-eyebrow">YOUR NEXT BEST STEP · WEEK ' + week + '</span><h1>Today\'s mission</h1><p>Study the listed portion. Then practise the stated number of questions in Practice. This page tells you what to do; it is not another question bank.</p></div><div class="mission-progress-ring" style="--mission-progress:' + pct + '%"><strong>' + pct + '%</strong><span>planned</span></div></div>' +
      '<div class="mission-summary"><div><strong>' + tasks.length + '</strong><span>focused actions</span></div><div><strong>' + finished + '/' + tasks.length + '</strong><span>marked complete</span></div><div><strong>4</strong><span>new words</span></div></div>' +
      '<div class="mission-section-heading"><div><span class="mission-kicker">01 · LEARN & APPLY</span><h2>What to cover and practise</h2></div><span class="mission-muted">Tick off as you finish</span></div>' +
      '<div class="mission-task-list">' + taskHTML + '</div>' +
      progressMarkup() +
      '<section class="mission-vocab"><div class="mission-section-heading"><div><span class="mission-kicker">02 · DAILY VOCABULARY</span><h2>Four words. Every day.</h2><p>Add words from today\'s reading or mistakes. Save a meaning and your own sentence, then test recall without peeking.</p></div></div><div class="mission-due-vocab"><div class="mission-due-head"><strong>Spaced recall · ' + dueWords.length + ' due</strong><span>Review at 1, 3, 7 and 14 days</span></div>' + dueHTML + '</div><div class="mission-word-list">' + vocabHTML + '</div><div class="mission-vocab-footer"><span data-vocab-count>' + words.filter(w => w.word.trim()).length + ' of 4 words saved</span><button type="button" class="mission-primary" data-vocab-save>Save today\'s words</button></div></section>' +
      '<section class="mission-focus"><div class="mission-focus-copy"><span class="mission-kicker">03 · FOCUS</span><h2>Protect one study block</h2><p>Use the existing focus timer below. Its countdown will also be mirrored to Android notifications when the native build supports it.</p></div><div class="mission-focus-actions"><a class="mission-primary" href="#today">Open today\'s plan</a><a class="mission-secondary" href="#journey/' + week + '">View weekly plan</a></div></section>' +
      '<section class="mission-reminders"><div><span class="mission-kicker">04 · ROUTINE</span><h2>Daily reminder</h2><p>Set a reminder time. In-app reminders work while Ascent is open; native notification scheduling depends on Android permission and device restrictions.</p></div><label class="mission-reminder-toggle"><input type="checkbox" data-reminder-enabled ' + (state.settings.reminderEnabled ? 'checked' : '') + '> Enable</label><input type="time" value="' + esc(state.settings.reminderTime) + '" data-reminder-time aria-label="Daily mission reminder time"><span data-reminder-status class="mission-muted">' + (state.settings.reminderEnabled ? 'Reminder enabled' : 'Reminder off') + '</span></section>';
    root.insertBefore(card, root.firstChild);
  }
  function enhanceJourney() {
    const root = document.getElementById("view-root");
    if (!root || root.dataset.weekEnhanced === "1" || !location.hash.match(/^#\/?journey(?:\/|$)/)) return;
    root.dataset.weekEnhanced = "1";
    const iso = planToday(), week = currentWeek(iso), day = dayIndex(iso);
    const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const strip = document.createElement("section");
    strip.className = "mission-week-strip";
    strip.innerHTML = '<div class="mission-week-head"><div><span class="mission-kicker">WEEKLY COMMAND VIEW</span><h2>Seven-day overview</h2><p>Open a day to see its mission. Completed work stays recorded by date.</p></div><span class="mission-week-badge">Week ' + week + ' / 30</span></div><div class="mission-week-days">' + days.map((d,i) => {
      const date = new Date(START + "T12:00:00"); date.setDate(date.getDate() + Math.max(0, dayOffset(iso) - day) + i);
      const dateKey = dateISO(date);
      const tasks = missionTasks(dateKey), rec = dayState(dateKey);
      const done = tasks.filter(t => rec.done[t.id]).length;
      return '<div class="mission-week-day ' + (i===day?'is-current':'') + '" aria-current="' + (i===day?'date':'false') + '"><span>' + d + '</span><strong>' + date.getDate() + '</strong><small>' + done + '/' + tasks.length + ' tasks</small></div>';
    }).join("") + '</div>';
    root.insertBefore(strip, root.firstChild);
  }
  function refresh() {
    const root = document.getElementById("view-root");
    if (!root) return;
    const oldMission = root.querySelector(".mission-shell");
    const oldWeek = root.querySelector(".mission-week-strip");
    if (oldMission) oldMission.remove();
    if (oldWeek) oldWeek.remove();
    root.dataset.missionEnhanced = "0";
    root.dataset.weekEnhanced = "0";
    renderMission();
    enhanceJourney();
  }
  document.addEventListener("change", function(e) {
    const t = e.target;
    if (t.matches("[data-mission-done]")) {
      const iso = planToday(), rec = dayState(iso);
      rec.done[t.dataset.missionDone] = t.checked;
      save(); refresh();
    } else if (t.matches("[data-question-count]")) {
      const rec = dayState(planToday());
      rec.questionCount[t.dataset.questionCount] = Math.max(0, Math.min(200, Number(t.value) || 0));
      save();
    } else if (t.matches("[data-word], [data-word-field]")) {
      const i = Number(t.dataset.word), field = t.dataset.wordField;
      if (!Number.isInteger(i) || i<0 || i>3) return;
      const words = wordData(planToday()); words[i][field] = t.value; words[i].recalled = false; save();
      const counter = document.querySelector("[data-vocab-count]");
      if (counter) counter.textContent = words.filter(w => w.word.trim()).length + " of 4 words saved";
    } else if (t.matches("[data-reminder-enabled]")) {
      state.settings.reminderEnabled = t.checked; save();
      syncNativeReminder();
      const status = document.querySelector("[data-reminder-status]");
      if (status) status.textContent = t.checked ? "Reminder enabled while Ascent is open" : "Reminder off";
    } else if (t.matches("[data-reminder-time]")) {
      state.settings.reminderTime = t.value || "19:00"; save(); syncNativeReminder();
    }
  });
  document.addEventListener("click", function(e) {
    const recall = e.target.closest("[data-word-recall]");
    if (recall) {
      const i = Number(recall.dataset.wordRecall), words = wordData(planToday());
      const w = words[i];
      if (!w || !w.word.trim() || !w.meaning.trim()) { recall.textContent = "Add word + meaning first"; return; }
      const meaningField = document.querySelector('[data-word="' + i + '"][data-word-field="meaning"]');
      if (meaningField) meaningField.type = "password";
      const answer = window.prompt("Recall the meaning without looking.\\n\\nWord: " + w.word);
      if (meaningField) meaningField.type = "text";
      if (answer === null) return;
      const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\\s+/g, " ").trim();
      const expected = normalize(w.meaning), given = normalize(answer);
      const expectedWords = expected.split(" ").filter(Boolean);
      const overlap = expectedWords.filter(word => given.split(" ").includes(word)).length;
      w.recalled = !!given && (given === expected || (expectedWords.length >= 3 && overlap / expectedWords.length >= 0.6));
      w.reviewedOn = planToday();
      save(); recall.classList.toggle("is-recalled", w.recalled); recall.textContent = w.recalled ? "Recalled ✓" : "Review again";
      if (!w.recalled) window.alert("Keep this word in your review list.\\n\\nMeaning: " + w.meaning + "\\n\\nExample: " + (w.sentence || "Add your own sentence."));
      return;
    }
    const dueButton = e.target.closest("[data-due-word]");
    if (dueButton) {
      const date = dueButton.dataset.dueWord, index = Number(dueButton.dataset.dueIndex);
      const word = state.words[date] && state.words[date][index];
      if (!word) return;
      const answer = window.prompt("Type the meaning from memory.\\n\\nWord: " + word.word);
      if (answer === null) return;
      const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\\s+/g, " ").trim();
      const expected = normalize(word.meaning), given = normalize(answer);
      const parts = expected.split(" ").filter(Boolean);
      const overlap = parts.filter(part => given.split(" ").includes(part)).length;
      word.recalled = !!given && (given === expected || (parts.length >= 3 && overlap / parts.length >= 0.6));
      word.reviewedOn = planToday();
      save();
      if (!word.recalled) window.alert("Review again later.\\n\\nMeaning: " + word.meaning + "\\n\\nExample: " + (word.sentence || "Add your own sentence."));
      refresh();
      return;
    }
    if (e.target.closest("[data-vocab-save]")) {
      const words = wordData(planToday());
      const count = words.filter(w => w.word.trim() && w.meaning.trim()).length;
      save();
      const counter = document.querySelector("[data-vocab-count]");
      if (counter) counter.textContent = count + " of 4 words saved (word + meaning)";
      return;
    }
  });
  function checkReminder() {
    const iso = planToday();
    if (window.AndroidBridge || !state.settings.reminderEnabled || !state.settings.reminderTime || lastReminderDate === iso) return;
    const now = new Date(), parts = state.settings.reminderTime.split(":").map(Number);
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;
    if (now.getHours() > parts[0] || (now.getHours() === parts[0] && now.getMinutes() >= parts[1])) {
      lastReminderDate = iso;
      const key = "ascent.mission.reminded." + iso;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
      const status = document.querySelector("[data-reminder-status]");
      if (status) status.textContent = "Reminder: start today's mission.";
      if (document.visibilityState === "visible") {
        const toast = document.createElement("div"); toast.className = "mission-reminder-toast"; toast.textContent = "Time for today's Ascent mission."; document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 7000);
      }
    }
  }
  function syncNativeReminder() {
    if (!window.AndroidBridge || typeof window.AndroidBridge.scheduleDailyReminder !== "function") return;
    const parts = String(state.settings.reminderTime || "19:00").split(":").map(Number);
    if (parts.length !== 2) return;
    try { window.AndroidBridge.scheduleDailyReminder(!!state.settings.reminderEnabled, parts[0], parts[1]); } catch (_) {}
  }
  function syncNativeFocus() {
    if (!window.AndroidBridge) return;
    const dock = document.querySelector(".focus-dock");
    if (!dock) {
      if (lastFocusStatus) { try { window.AndroidBridge.stopFocusTimer(); } catch (_) {} }
      lastFocusStatus = ""; lastFocusSeconds = 0; return;
    }
    const clock = dock.querySelector("[data-focus-clock]");
    const text = clock ? clock.textContent.trim() : "";
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    const seconds = match ? Number(match[1])*60 + Number(match[2]) : 0;
    const status = dock.classList.contains("is-done") ? "done" : dock.classList.contains("is-paused") ? "paused" : "running";
    const title = (dock.querySelector(".focus-title") || {}).textContent || "Ascent study session";
    let nativeState = "none";
    try { if (typeof window.AndroidBridge.getFocusTimerStatus === "function") nativeState = window.AndroidBridge.getFocusTimerStatus(); } catch (_) {}
    if (status === "running" && nativeState === "paused") {
      const pauseButton = dock.querySelector('[data-action="focus-pause"]');
      if (pauseButton) { pauseButton.click(); return; }
    }
    if (status === "paused" && nativeState === "running") {
      const resumeButton = dock.querySelector('[data-action="focus-resume"]');
      if (resumeButton) { resumeButton.click(); return; }
    }
    try {
      if (status === "done") {
        if (lastFocusStatus && lastFocusStatus !== "done") window.AndroidBridge.completeFocusTimer();
      } else if (status === "paused") {
        if (lastFocusStatus === "running") window.AndroidBridge.pauseFocusTimer(Math.max(1, seconds), title);
      } else if (status === "running" && (lastFocusStatus !== "running" || seconds > lastFocusSeconds + 4)) {
        window.AndroidBridge.startFocusTimer(Math.max(1, seconds), title);
      }
    } catch (_) {}
    lastFocusStatus = status; lastFocusSeconds = seconds;
  }
  const viewRoot = document.getElementById("view-root");
  const observer = new MutationObserver(() => {
    if (viewRoot.dataset.missionEnhanced === "1" && viewRoot.querySelector(".mission-shell")) return;
    if (viewRoot.dataset.weekEnhanced === "1" && viewRoot.querySelector(".mission-week-strip")) return;
    refresh();
  });
  observer.observe(viewRoot, { childList: true, subtree: false });
  window.addEventListener("hashchange", () => window.setTimeout(refresh, 80));
  syncNativeReminder();
  window.setInterval(() => { checkReminder(); syncNativeFocus(); }, 1000);
  window.setTimeout(refresh, 120);
})();
