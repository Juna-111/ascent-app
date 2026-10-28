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
    const fallback = { days: {}, words: {}, settings: { reminderEnabled: false, reminderTime: "19:00" } };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
      const reminderTime = typeof settings.reminderTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.reminderTime)
        ? settings.reminderTime : "19:00";
      return {
        days: raw.days && typeof raw.days === "object" && !Array.isArray(raw.days) ? raw.days : {},
        words: raw.words && typeof raw.words === "object" && !Array.isArray(raw.words) ? raw.words : {},
        settings: { reminderEnabled: settings.reminderEnabled === true, reminderTime }
      };
    } catch (_) {
      return fallback;
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
  function activeDate() {
    const match = location.hash.match(/^#\/?today\/(\d{4}-\d{2}-\d{2})$/);
    if (!match) return planToday();
    const parsed = new Date(match[1] + "T12:00:00");
    return dateISO(parsed) === match[1] ? match[1] : planToday();
  }
  function formatMissionDate(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  function dayOffset(iso) {
    const a = new Date(START + "T12:00:00");
    const b = new Date(iso + "T12:00:00");
    return Math.floor((b - a) / 86400000);
  }
  function currentWeek(iso) { return Math.max(1, Math.min(30, Math.floor(Math.max(0, dayOffset(iso)) / 7) + 1)); }
  function dayIndex(iso) { return ((dayOffset(iso) % 7) + 7) % 7; }
  function dayState(iso) {
    if (!state.days[iso] || typeof state.days[iso] !== "object" || Array.isArray(state.days[iso])) {
      state.days[iso] = { done: {}, questionCount: {}, accuracy: {}, notes: "" };
    }
    const record = state.days[iso];
    if (!record.done || typeof record.done !== "object" || Array.isArray(record.done)) record.done = {};
    if (!record.questionCount || typeof record.questionCount !== "object" || Array.isArray(record.questionCount)) record.questionCount = {};
    if (!record.accuracy || typeof record.accuracy !== "object" || Array.isArray(record.accuracy)) record.accuracy = {};
    if (typeof record.notes !== "string") record.notes = "";
    return record;
  }
  function subject(id) { return SUBJECTS.find(s => s.id === id) || { id, name: id, short: id }; }
  function unitsFor(week, weekday) {
    const all = [];
    BOOKS.forEach(book => book.units.forEach(unit => {
      if (unit.week <= week && book.subject !== "english") {
        all.push(Object.assign({}, unit, { bookId: book.id, book, subject: subject(book.subject) }));
      }
    }));
    const subjectPools = SUBJECTS.filter(sub => sub.id !== "english" && sub.id !== "aptitude").map(sub => {
      const due = all.filter(u => u.subject.id === sub.id && u.week === week);
      const past = all.filter(u => u.subject.id === sub.id && u.week < week);
      const pool = due.length ? due : past.slice(-Math.min(6, past.length));
      return { subject: sub, pool };
    }).filter(item => item.pool.length);
    const count = Math.min(3, subjectPools.length);
    if (!count) return [];
    const start = (weekday * count) % subjectPools.length;
    const chosen = [];
    for (let offset = 0; offset < count; offset++) {
      const subjectIndex = (start + offset) % subjectPools.length;
      const entry = subjectPools[subjectIndex];
      let appearancesBefore = 0;
      for (let day = 0; day < Math.min(weekday, 5); day++) {
        const priorStart = (day * count) % subjectPools.length;
        for (let priorOffset = 0; priorOffset < count; priorOffset++) {
          if ((priorStart + priorOffset) % subjectPools.length === subjectIndex) appearancesBefore++;
        }
      }
      const poolIndex = entry.pool.length ? appearancesBefore % entry.pool.length : 0;
      chosen.push(Object.assign({}, entry.pool[poolIndex], {
        missionReview: weekday >= 5 || entry.pool[poolIndex].week < week
      }));
    }
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
  function practiceHint(subjectId, isReview) {
    const hints = {
      math: "Practise worked examples first, then timed multiple-choice questions from this unit.",
      physics: "Practise numerical problems, diagrams or graphs, and concept-check MCQs.",
      chemistry: "Practise balanced equations, calculations where relevant, and concept-check MCQs.",
      biology: "Practise recall, comparison and application MCQs; label or interpret diagrams when relevant.",
      english: "Answer questions that test only today's named English skill.",
      aptitude: "Attempt mixed reasoning questions under a time limit, then analyse every error."
    };
    return (isReview ? "Revision practice: " : "Question practice: ") + (hints[subjectId] || "Attempt questions from the assigned topic, then review every error.");
  }
  function missionTasks(iso) {
    const week = currentWeek(iso);
    const weekday = dayIndex(iso);
    const todayUnits = unitsFor(week, weekday);
    const tasks = todayUnits.map((u, i) => ({
      id: (u.missionReview ? "review-" : "learn-") + u.id,
      type: u.missionReview ? "review" : "learn",
      title: u.subject.name + " · Grade " + u.book.grade + " Unit " + u.no,
      detail: u.missionReview ? "Consolidate: " + u.name : u.name,
      portion: pageLabel(u, iso),
      questions: u.subject.id === "biology" ? 20 : 15,
      questionHint: practiceHint(u.subject.id, !!u.missionReview),
      subject: u.subject.id,
      href: "#books/" + u.bookId + "/" + u.id
    }));
    const englishBooks = BOOKS.filter(b => b.subject === "english").sort((a,b) => a.grade-b.grade);
    const allEnglishUnits = englishBooks.flatMap(book => book.units.map(unit => Object.assign({}, unit, { bookId: book.id, book })))
      .sort((a,b) => a.week-b.week || a.book.grade-b.book.grade || a.no-b.no);
    if (allEnglishUnits.length) {
      const scheduled = allEnglishUnits.filter(u => u.week === week);
      const eligible = allEnglishUnits.filter(u => u.week <= week);
      const englishPool = scheduled.length ? scheduled : eligible.length ? eligible.slice(-Math.min(6, eligible.length)) : [allEnglishUnits[0]];
      const englishUnit = englishPool[Math.max(0, dayOffset(iso)) % englishPool.length];
      const skillIndex = ((dayOffset(iso) % SKILLS.length) + SKILLS.length) % SKILLS.length;
      const skill = SKILLS[skillIndex];
      tasks.push({
        id: "english-skill-" + skillIndex,
        type: "skill",
        title: "English · " + skill[0],
        detail: "Reading: " + englishUnit.name + " · Grade " + englishUnit.book.grade,
        portion: "Read one passage or the relevant unit section, then apply this single skill.",
        questions: 10,
        questionHint: practiceHint("english", false),
        subject: "english",
        href: "#books/" + englishUnit.bookId + "/" + englishUnit.id,
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
      questionHint: practiceHint("aptitude", false),
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
      questionHint: "Retry questions you previously missed. Explain why each wrong option is wrong before checking the key.",
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
      if (sub.id === "english") {
        const completedSkills = new Set();
        Object.keys(state.days).forEach(date => {
          const done = state.days[date] && state.days[date].done;
          if (!done || typeof done !== "object") return;
          for (let index = 0; index < SKILLS.length; index++) {
            if (done["english-skill-" + index]) completedSkills.add(index);
          }
        });
        return { subject: sub, total: SKILLS.length, complete: completedSkills.size, label: "skills covered", pct: Math.round(completedSkills.size / SKILLS.length * 100) };
      }
      const subjectBooks = BOOKS.filter(b => b.subject === sub.id);
      let total = 0, complete = 0;
      subjectBooks.forEach(book => book.units.forEach(unit => {
        total++;
        const record = units[unit.id] || {};
        const passes = record.passes && typeof record.passes === "object" ? record.passes : {};
        if (["map","learn","prove","compress"].every(key => !!passes[key])) complete++;
      }));
      return { subject: sub, total, complete, label: "units", pct: total ? Math.round(complete / total * 100) : 0 };
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
      '<div class="mission-subject-progress">' + stats.perSubject.map(item => '<div class="mission-subject-row"><div><span>' + esc(item.subject.name) + '</span><strong>' + (item.total ? item.complete + '/' + item.total + ' ' + (item.label || 'units') : 'Practice-based') + '</strong></div>' + (item.total ? '<div class="mission-subject-track"><span style="width:' + item.pct + '%;background:' + esc(item.subject.color) + '"></span></div>' : '<div class="mission-subject-note">Track attempts and accuracy in Practice.</div>') + '</div>').join("") + '</div></section>';
  }
  function wordData(iso) {
    if (!Array.isArray(state.words[iso])) state.words[iso] = [];
    state.words[iso] = state.words[iso].slice(0,4).map(word => ({
      word: word && typeof word.word === "string" ? word.word : "",
      meaning: word && typeof word.meaning === "string" ? word.meaning : "",
      sentence: word && typeof word.sentence === "string" ? word.sentence : "",
      recalled: !!(word && word.recalled),
      reviewedOn: word && typeof word.reviewedOn === "string" ? word.reviewedOn : null
    }));
    while (state.words[iso].length < 4) state.words[iso].push({ word:"", meaning:"", sentence:"", recalled:false, reviewedOn:null });
    return state.words[iso];
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
    const iso = activeDate();
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
        '<div class="mission-task-copy"><div class="mission-task-meta"><span>' + esc(t.type === "learn" ? "COVER" : t.type === "skill" ? "ENGLISH SKILL" : t.type === "review" ? "RECALL" : "PRACTISE") + '</span><span>' + esc(record.questionCount[t.id] == null ? t.questions : record.questionCount[t.id]) + ' questions</span></div>' +
        '<h3>' + esc(t.title) + '</h3><p>' + esc(t.detail) + '</p><div class="mission-portion">' + esc(t.portion) + '</div>' +
        (t.skillDetail ? '<p class="mission-skill-detail">' + esc(t.skillDetail) + '</p>' : '') +
        '<div class="mission-task-actions"><a href="' + esc(t.href) + '">Open relevant section ↗</a><label>Questions to attempt <input type="number" min="0" max="200" step="1" value="' + esc(record.questionCount[t.id] == null ? t.questions : record.questionCount[t.id]) + '" data-question-count="' + esc(t.id) + '"></label></div></div></article>';
    }).join("");
    const dueHTML = dueWords.length ? dueWords.map(item => '<div class="mission-due-word"><div><strong>' + esc(item.word.word) + '</strong><span>Added ' + esc(item.date) + '</span></div><button type="button" class="mission-secondary" data-due-word="' + esc(item.date) + '" data-due-index="' + item.index + '">Test recall</button></div>').join("") : '<p class="mission-no-due">No spaced-recall words due today. Keep adding four useful words.</p>';
    const vocabHTML = words.map((w,i) => '<div class="mission-word-row"><span class="mission-word-number">' + (i+1) + '</span><div class="mission-word-fields"><input type="text" maxlength="80" placeholder="Word ' + (i+1) + '" aria-label="Vocabulary word ' + (i+1) + '" data-word="' + i + '" data-word-field="word" value="' + esc(w.word) + '"><input type="text" maxlength="180" placeholder="Meaning" aria-label="Meaning of word ' + (i+1) + '" data-word="' + i + '" data-word-field="meaning" value="' + esc(w.meaning) + '"><input type="text" maxlength="240" placeholder="Your example sentence" aria-label="Example sentence for word ' + (i+1) + '" data-word="' + i + '" data-word-field="sentence" value="' + esc(w.sentence) + '"></div><button type="button" class="mission-recall ' + (w.recalled ? 'is-recalled' : '') + '" data-word-recall="' + i + '">' + (w.recalled ? 'Recalled ✓' : 'Test recall') + '</button></div>').join("");
    const card = document.createElement("section");
    card.className = "mission-shell";
    card.innerHTML = '<div class="mission-hero"><div><span class="mission-eyebrow">YOUR NEXT BEST STEP · WEEK ' + week + '</span><h1>' + esc(iso === planToday() ? "Today's mission" : "Mission for " + formatMissionDate(iso)) + '</h1><p>Study the listed portion. Then practise the stated number of questions in Practice. This page tells you what to do; it is not another question bank.</p></div><div class="mission-progress-ring" style="--mission-progress:' + pct + '%"><strong>' + pct + '%</strong><span>planned</span></div></div>' +
      '<div class="mission-summary"><div><strong>' + tasks.length + '</strong><span>focused actions</span></div><div><strong>' + finished + '/' + tasks.length + '</strong><span>marked complete</span></div><div><strong>4</strong><span>new words</span></div></div>' +
      '<div class="mission-section-heading"><div><span class="mission-kicker">01 · LEARN & APPLY</span><h2>What to cover and practise</h2></div><span class="mission-muted">Check printed pages against your edition.</span></div>' +
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
    const today = planToday();
    const routeParts = location.hash.replace(/^#\/?/, "").split("/");
    const requestedWeek = Number(routeParts[1]);
    const week = Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 30 ? requestedWeek : currentWeek(today);
    const weekStart = new Date(START + "T12:00:00");
    weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
    const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const strip = document.createElement("section");
    strip.className = "mission-week-strip";
    strip.innerHTML = '<div class="mission-week-head"><div><span class="mission-kicker">WEEKLY COMMAND VIEW</span><h2>Seven-day overview</h2><p>Tap a day to open its mission. Progress is saved separately for each date.</p></div><span class="mission-week-badge">Week ' + week + ' / 30</span></div><div class="mission-week-days">' + days.map((d,i) => {
      const date = new Date(weekStart); date.setDate(weekStart.getDate() + i);
      const dateKey = dateISO(date);
      const tasks = missionTasks(dateKey), rec = dayState(dateKey);
      const done = tasks.filter(t => rec.done[t.id]).length;
      const isToday = dateKey === today;
      return '<a href="#today/' + dateKey + '" class="mission-week-day ' + (isToday ? 'is-current' : '') + '" aria-current="' + (isToday ? 'date' : 'false') + '"><span>' + d + '</span><strong>' + date.getDate() + '</strong><small>' + done + '/' + tasks.length + ' tasks</small></a>';
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
      const iso = activeDate(), rec = dayState(iso);
      rec.done[t.dataset.missionDone] = t.checked;
      save(); refresh();
    } else if (t.matches("[data-question-count]")) {
      const rec = dayState(activeDate());
      rec.questionCount[t.dataset.questionCount] = Math.max(0, Math.min(200, Math.round(Number(t.value) || 0)));
      save();
    } else if (t.matches("[data-word], [data-word-field]")) {
      const i = Number(t.dataset.word), field = t.dataset.wordField;
      if (!Number.isInteger(i) || i<0 || i>3) return;
      const words = wordData(activeDate()); words[i][field] = t.value; words[i].recalled = false; save();
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
      const i = Number(recall.dataset.wordRecall), words = wordData(activeDate());
      const w = words[i];
      if (!w || !w.word.trim() || !w.meaning.trim()) { recall.textContent = "Add word + meaning first"; return; }
      const meaningField = document.querySelector('[data-word="' + i + '"][data-word-field="meaning"]');
      if (meaningField) meaningField.type = "password";
      const answer = window.prompt("Recall the meaning without looking.\n\nWord: " + w.word);
      if (meaningField) meaningField.type = "text";
      if (answer === null) return;
      const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      const expected = normalize(w.meaning), given = normalize(answer);
      const expectedWords = expected.split(" ").filter(Boolean);
      const overlap = expectedWords.filter(word => given.split(" ").includes(word)).length;
      w.recalled = !!given && (given === expected || (expectedWords.length >= 3 && overlap / expectedWords.length >= 0.6));
      w.reviewedOn = planToday();
      save(); recall.classList.toggle("is-recalled", w.recalled); recall.textContent = w.recalled ? "Recalled ✓" : "Review again";
      if (!w.recalled) window.alert("Keep this word in your review list.\n\nMeaning: " + w.meaning + "\n\nExample: " + (w.sentence || "Add your own sentence."));
      return;
    }
    const dueButton = e.target.closest("[data-due-word]");
    if (dueButton) {
      const date = dueButton.dataset.dueWord, index = Number(dueButton.dataset.dueIndex);
      const word = state.words[date] && state.words[date][index];
      if (!word) return;
      const answer = window.prompt("Type the meaning from memory.\n\nWord: " + word.word);
      if (answer === null) return;
      const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      const expected = normalize(word.meaning), given = normalize(answer);
      const parts = expected.split(" ").filter(Boolean);
      const overlap = parts.filter(part => given.split(" ").includes(part)).length;
      word.recalled = !!given && (given === expected || (parts.length >= 3 && overlap / parts.length >= 0.6));
      word.reviewedOn = planToday();
      save();
      if (!word.recalled) window.alert("Review again later.\n\nMeaning: " + word.meaning + "\n\nExample: " + (word.sentence || "Add your own sentence."));
      refresh();
      return;
    }
    if (e.target.closest("[data-vocab-save]")) {
      const words = wordData(activeDate());
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
