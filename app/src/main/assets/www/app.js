/*!
 * Ascent — ESSLCE 2027
 * Local-first study command center.
 */
(function () {
  "use strict";

  const DATA = window.PLAN_DATA;
  if (!DATA) {
    document.body.innerHTML = "<p style='padding:40px;font-family:sans-serif'>Plan data did not load.</p>";
    return;
  }

  const PORTION_DATA = window.PORTION_DATA && isPlainObject(window.PORTION_DATA.units)
    ? window.PORTION_DATA
    : { units: {}, source: "not loaded", verifiedOn: null };

  /* ==========================================================================
     Constants and data maps
     ========================================================================== */

  const STORAGE_KEY = "ascent.esslce.v1";
  const APP_VERSION = "1.2.0";
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const SUBJECTS = DATA.subjects;
  const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map((subject) => [subject.id, subject]));
  const TEXT_SUBJECTS = SUBJECTS.filter((subject) => subject.id !== "aptitude");
  const BOOKS = DATA.books;
  const BOOK_BY_ID = Object.fromEntries(BOOKS.map((book) => [book.id, book]));
  const ALL_UNITS = [];
  BOOKS.forEach((book) => {
    book.units.forEach((unit) => {
      ALL_UNITS.push({
        ...unit,
        bookId: book.id,
        book: book,
        subject: SUBJECT_BY_ID[book.subject],
      });
    });
  });
  const UNIT_BY_ID = Object.fromEntries(ALL_UNITS.map((unit) => [unit.id, unit]));
  const TOTAL_UNITS = ALL_UNITS.length;
  const TOTAL_PAGES = BOOKS.reduce((sum, book) => sum + book.pages, 0);
  const MOCK_BY_ID = Object.fromEntries(DATA.mocks.map((mock) => [mock.id, mock]));

  const FIRST_PASS = [
    { key: "map", label: "Map", detail: "Read the outcomes, summary, and end-of-unit questions first." },
    { key: "learn", label: "Learn", detail: "Work the examples with the book closed, then check." },
    { key: "prove", label: "Prove", detail: "End-of-unit questions plus 10–15 timed past-paper MCQs." },
    { key: "compress", label: "Compress", detail: "One-page summary, ten flashcards, errors logged." },
  ];

  const REVISITS = [
    { key: "d2", label: "D+2 recall", offset: 2, detail: "Blank-page recall + 5 MCQs. 15 minutes." },
    { key: "d7", label: "D+7 quiz", offset: 7, detail: "10–15 mixed questions from the week. 20 minutes." },
    { key: "d30", label: "D+30 revision", offset: 30, detail: "Summary review + 10 mixed questions. 25 minutes." },
  ];

  // One reading block should fit a 90-minute night block with time left for
  // examples and a short recall. These are printed pages, not PDF pages.
  const PORTION_PROFILE = {
    math: { pages: 16, minutesPerPage: 3.2 },
    physics: { pages: 16, minutesPerPage: 3.0 },
    chemistry: { pages: 16, minutesPerPage: 3.0 },
    biology: { pages: 18, minutesPerPage: 2.6 },
    english: { pages: 20, minutesPerPage: 2.2 },
    aptitude: { pages: 20, minutesPerPage: 2.2 },
  };

  const FOCUS_PRESETS = [25, 45, 90];

  // Study blocks that deserve a focus clock even when they carry no textbook
  // pages: practice papers, drills, retrieval, and the deep weekend blocks.
  const FOCUS_TASK_IDS = new Set([
    "activation", "preview", "drill-1", "drill-2", "setup",
    "night-1", "night-2", "night-3", "sunday-review",
    "block-a", "block-b", "block-c", "block-d", "block-e", "block-f", "light",
    "timed-paper", "mixed-test", "english-paper", "aptitude-1", "aptitude-2", "aptitude-3", "teacher",
  ]);

  const CAUSES = [
    { key: "C", label: "Concept", detail: "I did not understand the idea." },
    { key: "K", label: "Knowledge", detail: "I did not know the fact, formula, or term." },
    { key: "S", label: "Slip", detail: "I knew it but made an arithmetic or transcription error." },
    { key: "M", label: "Misread", detail: "I misread the question, units, or qualifier." },
    { key: "T", label: "Time", detail: "I ran out of time or rushed." },
  ];
  const CAUSE_BY_KEY = Object.fromEntries(CAUSES.map((cause) => [cause.key, cause]));

  const WEEK_META = Object.fromEntries(DATA.weeks.map((week) => [week.n, week]));
  const NIGHT_ROTATION = DATA.nightRotation;
  const REVIEW_QUESTIONS = DATA.reviewQuestions;
  const NATION_PROMPTS = DATA.nationPrompts;

  const els = {
    viewRoot: document.getElementById("view-root"),
    main: document.getElementById("main"),
    modalRoot: document.getElementById("modal-root"),
    focusRoot: document.getElementById("focus-root"),
    toastRegion: document.getElementById("toast-region"),
    topbarDate: document.getElementById("topbar-date"),
    topbarContext: document.getElementById("topbar-context"),
    streakPill: document.getElementById("streak-pill"),
    streakCopy: document.getElementById("streak-copy"),
    avatar: document.getElementById("avatar"),
    railPhase: document.getElementById("rail-phase"),
    railWeek: document.getElementById("rail-week"),
    railProgressFill: document.getElementById("rail-progress-fill"),
    railProgressCopy: document.getElementById("rail-progress-copy"),
  };

  /* ==========================================================================
     Utilities
     ========================================================================== */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toISODate(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  const PLAN_DAY_START_MINUTES = 5 * 60 + 20;

  function todayISO() {
    const now = new Date();
    const calendarDate = toISODate(now);
    if (now.getHours() * 60 + now.getMinutes() < PLAN_DAY_START_MINUTES) {
      now.setDate(now.getDate() - 1);
    }
    const planDate = toISODate(now);
    const startDate = state && state.settings ? state.settings.startDate : null;
    // Before 05:20 on the start date, show Day 1 rather than the pre-plan evening.
    if (startDate && planDate < startDate && calendarDate === startDate) {
      return startDate;
    }
    return planDate;
  }

  function isLateSession() {
    if (state && state.settings && todayISO() < state.settings.startDate) return false;
    return toISODate(new Date()) !== todayISO();
  }

  function nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function parseISODate(iso) {
    if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const parts = iso.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null;
    return date;
  }

  function isISODate(iso) {
    return Boolean(parseISODate(iso));
  }

  function addDays(iso, amount) {
    const date = parseISODate(iso);
    if (!date) return iso;
    date.setDate(date.getDate() + amount);
    return toISODate(date);
  }

  function epochDay(iso) {
    const date = parseISODate(iso);
    if (!date) return NaN;
    return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  }

  function daysBetween(fromISO, toISO) {
    return Math.round(epochDay(toISO) - epochDay(fromISO));
  }

  function formatLongDate(iso) {
    const date = parseISODate(iso);
    if (!date) return "";
    return DAY_NAMES[date.getDay()] + ", " + date.getDate() + " " + MONTH_LONG[date.getMonth()] + " " + date.getFullYear();
  }

  function formatDateShort(iso) {
    const date = parseISODate(iso);
    if (!date) return "";
    return date.getDate() + " " + MONTH_SHORT[date.getMonth()] + " " + date.getFullYear();
  }

  function formatDayMonth(iso) {
    const date = parseISODate(iso);
    if (!date) return "";
    return date.getDate() + " " + MONTH_SHORT[date.getMonth()];
  }

  function formatNumericDate(iso) {
    const date = parseISODate(iso);
    if (!date) return "";
    return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1);
  }

  function formatWeekday(iso, short) {
    const date = parseISODate(iso);
    if (!date) return "";
    return short ? DAY_SHORT[date.getDay()] : DAY_NAMES[date.getDay()];
  }

  function formatHours(hours, withUnit) {
    if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) return "—";
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (withUnit === false) return h === 0 ? m + "m" : h + "h " + pad2(m) + "m";
    return h + " h " + pad2(m);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-GB");
  }

  function percentage(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  function plural(count, singular, pluralWord) {
    return count === 1 ? singular : (pluralWord || singular + "s");
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  const HTML_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => HTML_ESCAPE[character]);
  }

  function icon(name, className) {
    return '<svg class="' + (className || "") + '" aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  }

  function subjectVars(subject) {
    return 'style="--subject-color:' + subject.color + ";--subject-tint:" + subject.tint + ';"';
  }

  function subjectDot(subjectId) {
    const subject = SUBJECT_BY_ID[subjectId];
    if (!subject) return "";
    return '<i class="subject-dot" style="background:' + subject.color + '" aria-hidden="true"></i>';
  }

  function bookLabel(book) {
    return book.title + " · Grade " + book.grade;
  }

  function formatValue(value, fallback) {
    return value == null || value === "" ? (fallback || "—") : value;
  }

  function isoPath(...parts) {
    return "#" + parts.filter(Boolean).join("/");
  }

  /* ==========================================================================
     State
     ========================================================================== */

  function createBlankState() {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DATA.defaultSettings },
      daily: {},
      weekly: {},
      units: {},
      setup: {},
      tests: [],
      errors: [],
      focus: null,
    };
  }

  function normalizeRecordMap(value) {
    return isPlainObject(value) ? value : {};
  }

  function normalizeFocus(raw) {
    if (!isPlainObject(raw)) return null;
    const unit = UNIT_BY_ID[raw.unitId] || null;
    if (raw.unitId && !unit) return null;
    if (!isISODate(raw.date) || typeof raw.taskId !== "string" || !raw.taskId) return null;
    if (!unit && !raw.title) return null;
    const status = ["running", "paused", "done"].includes(raw.status) ? raw.status : "paused";
    const durationMin = clamp(Number(raw.durationMin) || 25, 5, 180);
    const totalMs = durationMin * 60000;
    let remainingMs = Number.isFinite(Number(raw.remainingMs)) ? clamp(Number(raw.remainingMs), 0, totalMs * 2) : totalMs;
    const endsAt = Number.isFinite(Number(raw.endsAt)) ? Number(raw.endsAt) : null;
    if (status === "running" && !endsAt) {
      return {
        ...raw,
        status: "paused",
        durationMin: durationMin,
        remainingMs: remainingMs,
        endsAt: null,
        runStartedAt: null,
        accruedMs: Math.max(0, Number(raw.accruedMs) || 0),
        logged: Boolean(raw.logged),
      };
    }
    if (status === "done") remainingMs = 0;
    return {
      ...raw,
      status: status,
      date: raw.date,
      taskId: raw.taskId,
      unitId: unit ? unit.id : null,
      subjectId: unit ? unit.book.subject : (SUBJECT_BY_ID[raw.subjectId] ? raw.subjectId : null),
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : (unit ? unit.name : "Focus block"),
      part: Number.isFinite(Number(raw.part)) ? Number(raw.part) : 0,
      start: Number(raw.start) || null,
      end: Number(raw.end) || null,
      durationMin: durationMin,
      remainingMs: remainingMs,
      endsAt: endsAt,
      runStartedAt: status === "running" && Number.isFinite(Number(raw.runStartedAt)) ? Number(raw.runStartedAt) : null,
      accruedMs: Math.max(0, Number(raw.accruedMs) || 0),
      logged: Boolean(raw.logged),
      notified: Boolean(raw.notified),
    };
  }

  function normalizeState(raw) {
    const base = createBlankState();
    if (!isPlainObject(raw)) return base;

    const settings = isPlainObject(raw.settings) ? raw.settings : {};
    const startDate = isISODate(settings.startDate) ? settings.startDate : base.settings.startDate;
    const examDate = isISODate(settings.examDate) ? settings.examDate : base.settings.examDate;
    const targetScore = Number(settings.targetScore);
    const name = typeof settings.name === "string" && settings.name.trim() ? settings.name.trim().slice(0, 60) : base.settings.name;

    const lastBackupAt = typeof settings.lastBackupAt === "string" && Number.isFinite(Date.parse(settings.lastBackupAt))
      ? settings.lastBackupAt
      : null;

    const state = {
      version: 1,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
      settings: {
        ...base.settings,
        ...settings,
        name: name,
        startDate: startDate,
        examDate: examDate,
        targetScore: Number.isFinite(targetScore) ? clamp(Math.round(targetScore), 0, 100) : base.settings.targetScore,
        workbook: typeof settings.workbook === "string" && settings.workbook ? settings.workbook.slice(0, 10) : base.settings.workbook,
        lastBackupAt: lastBackupAt,
      },
      daily: normalizeRecordMap(raw.daily),
      weekly: normalizeRecordMap(raw.weekly),
      units: normalizeRecordMap(raw.units),
      setup: normalizeRecordMap(raw.setup),
      tests: Array.isArray(raw.tests) ? raw.tests.filter(isPlainObject) : [],
      errors: Array.isArray(raw.errors) ? raw.errors.filter(isPlainObject) : [],
      focus: normalizeFocus(raw.focus),
    };

    return state;
  }

  function loadState() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return createBlankState();
      let parsed;
      try {
        parsed = JSON.parse(stored);
      } catch (error) {
        try {
          window.localStorage.setItem("ascent.esslce.v1.corrupt." + Date.now(), stored);
        } catch (preserveError) {
          // Preserve is best-effort; still recover to a blank state.
        }
        return createBlankState();
      }
      return normalizeState(parsed);
    } catch (error) {
      return createBlankState();
    }
  }

  let state = loadState();
  let saveErrorShown = false;

  function saveState(silent) {
    try {
      state.updatedAt = new Date().toISOString();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveErrorShown = false;
      return true;
    } catch (error) {
      if (!silent && !saveErrorShown) {
        saveErrorShown = true;
        toast("Could not save to this browser. Export a backup before continuing.");
      }
      return false;
    }
  }

  const ui = {
    selectedDate: todayISO(),
    selectedWeek: 1,
    booksSubject: "all",
    booksGrade: "all",
    booksStatus: "all",
    bookUnitFilter: "all",
    openUnits: new Set(),
    lastBookId: null,
    practiceTab: "overview",
    errorFilters: { status: "open", subject: "all", cause: "all" },
    reflectWeek: 1,
    lastView: "",
  };

  /* ==========================================================================
     Calendar and plan helpers
     ========================================================================== */

  function startingWeekForDate(iso) {
    return Math.floor(daysBetween(state.settings.startDate, iso) / 7) + 1;
  }

  function currentWeekNo() {
    const raw = startingWeekForDate(todayISO());
    return clamp(raw, 1, 30);
  }

  function weekStart(n) {
    return addDays(state.settings.startDate, (n - 1) * 7);
  }

  function weekEnd(n) {
    return addDays(weekStart(n), 6);
  }

  function weekForDate(iso) {
    return clamp(startingWeekForDate(iso), 1, 30);
  }

  function phaseForWeek(n) {
    return DATA.phases.find((phase) => n >= phase.startWeek && n <= phase.endWeek) || DATA.phases[DATA.phases.length - 1];
  }

  function weekRangeLabel(n) {
    const start = parseISODate(weekStart(n));
    const end = parseISODate(weekEnd(n));
    if (!start || !end) return "";
    const startMonth = MONTH_SHORT[start.getMonth()];
    const endMonth = MONTH_SHORT[end.getMonth()];
    if (start.getFullYear() !== end.getFullYear()) {
      return start.getDate() + " " + startMonth + " " + start.getFullYear() + " – " + end.getDate() + " " + endMonth + " " + end.getFullYear();
    }
    if (start.getMonth() !== end.getMonth()) {
      return start.getDate() + " " + startMonth + " – " + end.getDate() + " " + endMonth + " " + end.getFullYear();
    }
    return start.getDate() + "–" + end.getDate() + " " + startMonth + " " + start.getFullYear();
  }

  function weekMonthLabel(n) {
    const start = parseISODate(weekStart(n));
    return start ? MONTH_SHORT[start.getMonth()] : "";
  }

  function daysToExam() {
    return daysBetween(todayISO(), state.settings.examDate);
  }

  function daysToReadiness() {
    return daysBetween(todayISO(), DATA.examNotes.readinessDate);
  }

  function isPlanComplete() {
    return daysBetween(weekEnd(30), todayISO()) > 0;
  }

  function formatCountdown(value) {
    return Number.isFinite(value) && value >= 0 ? String(value) : "—";
  }

  function unitsForWeek(n) {
    return ALL_UNITS.filter((unit) => unit.week === n);
  }

  function plannedUnitCountThrough(n) {
    return ALL_UNITS.filter((unit) => unit.week <= n).length;
  }

  function nextMock() {
    const logged = new Set(state.tests.map((test) => test.mockId).filter(Boolean));
    const unlogged = DATA.mocks.filter((mock) => !logged.has(mock.id));
    if (!unlogged.length) return null;
    const week = currentWeekNo();
    return unlogged.find((mock) => mock.week >= week) || unlogged[0];
  }

  function mockDate(mock) {
    return addDays(weekStart(mock.week), 5);
  }

  function mockForTest(test) {
    return test && test.mockId ? MOCK_BY_ID[test.mockId] || null : null;
  }

  /* ==========================================================================
     Unit and progress helpers
     ========================================================================== */

  function unitRecord(unitId) {
    const record = state.units[unitId];
    return isPlainObject(record) ? record : null;
  }

  function ensureUnit(unitId) {
    if (!isPlainObject(state.units[unitId])) {
      state.units[unitId] = { passes: {}, revisits: {}, revision: null };
    }
    const record = state.units[unitId];
    if (!isPlainObject(record.passes)) record.passes = {};
    if (!isPlainObject(record.revisits)) record.revisits = {};
    if (!isPlainObject(record.portions)) record.portions = {};
    return record;
  }

  function firstPassCount(unitId) {
    const record = unitRecord(unitId);
    if (!record || !isPlainObject(record.passes)) return 0;
    return FIRST_PASS.reduce((count, pass) => count + (record.passes[pass.key] ? 1 : 0), 0);
  }

  function firstPassDate(unitId) {
    const record = unitRecord(unitId);
    if (!record || !isPlainObject(record.passes)) return null;
    const dates = FIRST_PASS.map((pass) => record.passes[pass.key]).filter(Boolean).sort();
    return dates.length === FIRST_PASS.length ? dates[dates.length - 1] : null;
  }

  function isUnitFirstPassComplete(unitId) {
    return Boolean(firstPassDate(unitId));
  }

  function isUnitFullyRevised(unitId) {
    const record = unitRecord(unitId);
    return Boolean(record && record.revision);
  }

  function getRevisionWeek(unit) {
    return unit.revisionWeek || 24;
  }

  function retrievalDueDate(unitId, revisitKey) {
    const revisit = REVISITS.find((item) => item.key === revisitKey);
    const completedOn = firstPassDate(unitId);
    if (!revisit || !completedOn) return null;
    return addDays(completedOn, revisit.offset);
  }

  function getDueRevisits(onDate, options) {
    const date = onDate || todayISO();
    const opts = options || {};
    const due = [];
    ALL_UNITS.forEach((unit) => {
      if (opts.bookId && unit.bookId !== opts.bookId) return;
      const completedOn = firstPassDate(unit.id);
      if (!completedOn) return;
      const record = unitRecord(unit.id);
      REVISITS.forEach((revisit) => {
        if (record && record.revisits && record.revisits[revisit.key]) return;
        const dueDate = addDays(completedOn, revisit.offset);
        if (daysBetween(dueDate, date) >= 0) {
          due.push({
            unit: unit,
            revisit: revisit,
            dueDate: dueDate,
            overdueDays: daysBetween(dueDate, date),
          });
        }
      });
    });
    return due.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.unit.book.subject.localeCompare(b.unit.book.subject);
    });
  }

  function completedUnitCount() {
    return ALL_UNITS.filter((unit) => isUnitFirstPassComplete(unit.id)).length;
  }

  function revisedUnitCount() {
    return ALL_UNITS.filter((unit) => isUnitFullyRevised(unit.id)).length;
  }

  function bookProgress(book) {
    const completed = book.units.filter((unit) => isUnitFirstPassComplete(unit.id)).length;
    return {
      completed: completed,
      total: book.units.length,
      pct: percentage(completed, book.units.length),
    };
  }

  function bookStarted(book) {
    return book.units.some((unit) => firstPassCount(unit.id) > 0);
  }

  function bookHasDueRevisits(book) {
    return getDueRevisits(todayISO(), { bookId: book.id }).length > 0;
  }

  function bookComplete(book) {
    return book.units.every((unit) => isUnitFirstPassComplete(unit.id));
  }

  function unitNextPass(unit) {
    const record = unitRecord(unit.id);
    return FIRST_PASS.find((pass) => !record || !record.passes || !record.passes[pass.key]) || null;
  }

  function toggleUnitPass(unitId, key, done) {
    const record = ensureUnit(unitId);
    if (done) record.passes[key] = todayISO();
    else delete record.passes[key];
    if (key === "learn" && done) markAllPortionsRead(unitId, todayISO(), true);
    saveState();
  }

  function toggleUnitRevisit(unitId, key, done) {
    if (!firstPassDate(unitId)) return false;
    const record = ensureUnit(unitId);
    if (done) record.revisits[key] = todayISO();
    else delete record.revisits[key];
    saveState();
    return true;
  }

  function toggleUnitRevision(unitId, done) {
    const record = ensureUnit(unitId);
    record.revision = done ? todayISO() : null;
    saveState();
  }

  function toggleSetup(itemId, done) {
    if (done) state.setup[itemId] = todayISO();
    else delete state.setup[itemId];
    saveState();
  }

  function setupProgress() {
    const done = DATA.calibration.filter((item) => state.setup[item.id]).length;
    return { done: done, total: DATA.calibration.length, pct: percentage(done, DATA.calibration.length) };
  }

  function unitStatus(unit) {
    const count = firstPassCount(unit.id);
    if (count === 0) return "not-started";
    if (count < FIRST_PASS.length) return "in-progress";
    return "complete";
  }

  /* ==========================================================================
     Reading portions
     ========================================================================== */

  function portionKey(start, end) {
    return Number(start) + "-" + Number(end);
  }

  function portionLabel(portion) {
    if (!portion) return "";
    return "pp. " + portion.start + "–" + portion.end;
  }

  function unitPageRange(unit) {
    if (!unit) return null;
    const record = unitRecord(unit.id);
    const custom = record && isPlainObject(record.pages) ? record.pages : null;
    const customStart = custom ? Number(custom.start) : NaN;
    const customEnd = custom ? Number(custom.end) : NaN;
    if (Number.isFinite(customStart) && Number.isFinite(customEnd) && customStart >= 1 && customEnd > customStart) {
      return { start: Math.round(customStart), end: Math.round(customEnd), custom: true };
    }
    const source = PORTION_DATA.units[unit.id];
    if (!source) return null;
    const start = Number(source.start);
    const end = Number(source.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end <= start) return null;
    return { start: start, end: end, custom: false };
  }

  function unitPortions(unit) {
    const range = unitPageRange(unit);
    if (!range) return [];
    const profile = PORTION_PROFILE[unit.book.subject] || PORTION_PROFILE.math;
    const length = range.end - range.start + 1;
    const count = Math.max(1, Math.ceil(length / profile.pages));
    const size = Math.ceil(length / count);
    const portions = [];
    for (let index = 0; index < count; index += 1) {
      const start = range.start + index * size;
      if (start > range.end) break;
      const end = Math.min(range.end, start + size - 1);
      const pages = end - start + 1;
      const minutes = clamp(Math.round((pages * profile.minutesPerPage) / 5) * 5, 15, 120);
      portions.push({
        part: index,
        total: count,
        start: start,
        end: end,
        pages: pages,
        minutes: minutes,
        key: portionKey(start, end),
      });
    }
    return portions;
  }

  function portionRecord(unitId) {
    const record = unitRecord(unitId);
    return record && isPlainObject(record.portions) ? record.portions : {};
  }

  function portionReadEntry(unitId, portion) {
    if (!portion) return null;
    const map = portionRecord(unitId);
    const key = typeof portion === "string" ? portion : portionKey(portion.start, portion.end);
    const entry = map[key];
    return isPlainObject(entry) && entry.readAt ? entry : null;
  }

  function isPortionRead(unitId, portion) {
    return Boolean(portionReadEntry(unitId, portion));
  }

  function unitPortionProgress(unit) {
    const portions = unitPortions(unit);
    const read = portions.filter((portion) => isPortionRead(unit.id, portion)).length;
    return { read: read, total: portions.length, pct: percentage(read, portions.length) };
  }

  function nextUnreadPortion(unit) {
    return unitPortions(unit).find((portion) => !isPortionRead(unit.id, portion)) || null;
  }

  function portionStepLabel(unit) {
    const record = unitRecord(unit.id);
    if (!record || !isPlainObject(record.passes) || !record.passes.map) return "Map + Learn";
    if (!record.passes.learn) return "Learn";
    return "Review";
  }

  function portionInstruction(unit, portion) {
    if (!portion) return "";
    if (portion.part === 0 && portionStepLabel(unit) === "Map + Learn") {
      return "Read the outcomes and summary first, then " + portionLabel(portion) + ". Work each example with the book closed before you check it.";
    }
    return "Start at p. " + portion.start + " and stop at p. " + portion.end + ". Work the examples as you go; do not read past this portion.";
  }

  function markAllPortionsRead(unitId, date, auto) {
    const unit = UNIT_BY_ID[unitId];
    if (!unit) return;
    const record = ensureUnit(unitId);
    unitPortions(unit).forEach((portion) => {
      if (record.portions[portion.key]) return;
      record.portions[portion.key] = {
        readAt: date || todayISO(),
        minutes: portion.minutes,
        auto: Boolean(auto),
      };
    });
  }

  function togglePortionRead(unitId, start, end, done, date) {
    const unit = UNIT_BY_ID[unitId];
    if (!unit) return false;
    const record = ensureUnit(unitId);
    const key = portionKey(start, end);
    if (done) {
      const portion = unitPortions(unit).find((item) => item.key === key);
      record.portions[key] = {
        readAt: isISODate(date) ? date : todayISO(),
        minutes: portion ? portion.minutes : null,
        via: "unit",
      };
    } else {
      delete record.portions[key];
    }
    saveState();
    return true;
  }

  function taskText(task) {
    return String((task && task.focus) || "") + " " + String((task && task.title) || "");
  }

  function taskDurationMinutes(task) {
    if (!task) return 45;
    const match = String(task.time || "").match(/^(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})$/);
    if (!match) return 45;
    let start = Number(match[1]) * 60 + Number(match[2]);
    let end = Number(match[3]) * 60 + Number(match[4]);
    if (end <= start) end += 1440;
    const span = end - start;
    if (!Number.isFinite(span) || span <= 0) return 45;
    return clamp(Math.min(span, 90), 5, 180);
  }

  function isFocusableTask(task) {
    return Boolean(task && FOCUS_TASK_IDS.has(task.id));
  }

  function taskReadsText(task) {
    if (!task) return false;
    const text = taskText(task);
    if (!text.trim()) return false;
    if (/\bproblem set\b/i.test(text)) return false;
    if (/\bnew unit\b/i.test(text)) return true;
    if (/\bweak topic\b/i.test(text)) return true;
    if (task.id === "block-b" || task.id === "block-d" || task.id === "light") return true;
    if (/\benglish or aptitude\b/i.test(text)) return true;
    if (task.id === "block-c" && /\benglish\/aptitude\b/i.test(text)) return true;
    return false;
  }

  function taskSubjectHint(task) {
    const text = taskText(task);
    const matchers = [
      ["math", /\bmathemat/i],
      ["physics", /\bphysics/i],
      ["chemistry", /\bchem/i],
      ["biology", /\bbiology/i],
      ["english", /\benglish/i],
    ];
    for (let index = 0; index < matchers.length; index += 1) {
      if (matchers[index][1].test(text)) return matchers[index][0];
    }
    if (/\baptitude\b/i.test(text)) return "aptitude";
    return null;
  }

  function portionQueueForSubject(subjectId, date) {
    if (!SUBJECT_BY_ID[subjectId] || subjectId === "aptitude") return [];
    const pivot = isISODate(date) ? date : todayISO();
    const week = weekForDate(pivot);
    const rows = [];
    ALL_UNITS.forEach((unit) => {
      if (unit.book.subject !== subjectId) return;
      if (isUnitFirstPassComplete(unit.id)) return;
      const portions = unitPortions(unit);
      if (!portions.length) return;
      const unread = portions.filter((portion) => !isPortionRead(unit.id, portion));
      if (!unread.length) return;
      const started = Object.keys(portionRecord(unit.id)).length > 0;
      let priority = 5;
      if (started) priority = 0;
      else if (unit.week < week) priority = 1;
      else if (unit.week === week) priority = 2;
      else if (unit.week === week + 1) priority = 3;
      else if (unit.week <= week + 2) priority = 4;
      rows.push({ unit: unit, unread: unread, priority: priority });
    });
    rows.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.unit.week !== b.unit.week) return a.unit.week - b.unit.week;
      if (a.unit.book.grade !== b.unit.book.grade) return a.unit.book.grade - b.unit.book.grade;
      return a.unit.no - b.unit.no;
    });
    const queue = [];
    rows.forEach((row) => {
      row.unread.forEach((portion) => queue.push({ unit: row.unit, portion: portion, priority: row.priority }));
    });
    return queue;
  }

  function weakestSubjectId() {
    const candidates = TEXT_SUBJECTS.filter((subject) => subject.id !== "aptitude");
    const stats = candidates.map((subject) => {
      const history = subjectScoreHistory(subject.id);
      const latest = history.length ? history[history.length - 1].pct : null;
      const queue = portionQueueForSubject(subject.id, todayISO());
      const week = currentWeekNo();
      return {
        id: subject.id,
        latest: latest,
        backlog: queue.length,
        overdue: queue.filter((item) => item.unit.week < week).length,
      };
    });
    const scored = stats.filter((item) => item.latest != null);
    if (scored.length) {
      scored.sort((a, b) => (a.latest - b.latest) || (b.backlog - a.backlog));
      return scored[0].id;
    }
    stats.sort((a, b) => (b.overdue - a.overdue) || (b.backlog - a.backlog));
    return stats[0] ? stats[0].id : "math";
  }

  function findEarlierUnreadAssignment(unitId, start, end, date) {
    for (let offset = 1; offset <= 21; offset += 1) {
      const day = state.daily[addDays(date, -offset)];
      if (!day || !isPlainObject(day.portions)) continue;
      const found = Object.keys(day.portions).some((taskId) => {
        const item = day.portions[taskId];
        return isPlainObject(item) &&
          item.unitId === unitId &&
          Number(item.start) === Number(start) &&
          Number(item.end) === Number(end) &&
          !item.readAt;
      });
      if (found) return addDays(date, -offset);
    }
    return null;
  }

  function resolveTaskPortion(date, task, reserved) {
    if (!taskReadsText(task)) return null;
    let subjectId = taskSubjectHint(task);
    if (!subjectId || subjectId === "aptitude" || task.id === "block-b" || task.id === "block-d") {
      subjectId = task.id === "block-c" ? "english" : weakestSubjectId();
    }
    const used = reserved || new Set();
    const queue = portionQueueForSubject(subjectId, date);
    let candidate = queue.find((item) => !used.has(item.unit.id + ":" + item.portion.key));
    if (!candidate) {
      const order = [subjectId].concat(TEXT_SUBJECTS.map((subject) => subject.id));
      for (let index = 0; index < order.length && !candidate; index += 1) {
        if (order.indexOf(order[index]) !== index || order[index] === "aptitude") continue;
        const fallback = portionQueueForSubject(order[index], date).find((item) => !used.has(item.unit.id + ":" + item.portion.key));
        if (fallback) {
          candidate = fallback;
          subjectId = order[index];
        }
      }
    }
    if (!candidate) return null;
    used.add(candidate.unit.id + ":" + candidate.portion.key);
    return {
      unitId: candidate.unit.id,
      part: candidate.portion.part,
      start: candidate.portion.start,
      end: candidate.portion.end,
      minutes: candidate.portion.minutes,
      subjectId: subjectId,
      assignedAt: date,
      readAt: null,
      carriedFrom: findEarlierUnreadAssignment(candidate.unit.id, candidate.portion.start, candidate.portion.end, date),
    };
  }

  function resolveDayPortions(date, options) {
    const opts = options || {};
    const create = opts.create !== false;
    const source = state.daily[date];
    const saved = source && isPlainObject(source.portions) ? source.portions : {};
    const template = dailyTemplate(date);
    const result = {};
    const reserved = new Set();

    template.forEach((task) => {
      const item = saved[task.id];
      if (!isPlainObject(item)) return;
      const unit = UNIT_BY_ID[item.unitId];
      if (!unit) return;
      const portions = unitPortions(unit);
      const match = portions.find((portion) =>
        portion.part === Number(item.part) &&
        portion.start === Number(item.start) &&
        portion.end === Number(item.end)
      );
      if (!match) return;
      result[task.id] = {
        ...item,
        unitId: unit.id,
        part: match.part,
        start: match.start,
        end: match.end,
        minutes: match.minutes,
        subjectId: unit.book.subject,
      };
      if (!item.readAt) reserved.add(unit.id + ":" + match.key);
    });

    if (!create) return result;

    const day = ensureDay(date);
    if (!isPlainObject(day.portions)) day.portions = {};
    let changed = false;
    template.forEach((task) => {
      if (result[task.id]) return;
      if (!taskReadsText(task)) return;
      if (day.tasks[task.id]) return;
      const assignment = resolveTaskPortion(date, task, reserved);
      if (!assignment) return;
      day.portions[task.id] = assignment;
      result[task.id] = assignment;
      changed = true;
    });
    if (changed) saveState(true);
    return result;
  }

  function readingBlockCount(week) {
    let count = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      dailyTemplate(addDays(weekStart(week), offset)).forEach((task) => {
        if (taskReadsText(task)) count += 1;
      });
    }
    return count;
  }

  function weekPortionStats(week) {
    const units = unitsForWeek(week);
    let total = 0;
    let read = 0;
    let minutes = 0;
    units.forEach((unit) => {
      unitPortions(unit).forEach((portion) => {
        total += 1;
        if (isPortionRead(unit.id, portion)) read += 1;
        else minutes += portion.minutes;
      });
    });
    const blocks = readingBlockCount(week);
    return {
      units: units,
      total: total,
      read: read,
      remaining: total - read,
      minutes: minutes,
      blocks: blocks,
      spill: Math.max(0, total - blocks),
    };
  }

  function readingBlocksRemaining(week, date) {
    let count = 0;
    const from = date > weekStart(week) ? date : weekStart(week);
    const to = weekEnd(week);
    let cursor = from;
    for (let guard = 0; guard < 8 && cursor <= to; guard += 1) {
      const day = dayData(cursor);
      dailyTemplate(cursor).forEach((task) => {
        if (taskReadsText(task) && !day.tasks[task.id]) count += 1;
      });
      cursor = addDays(cursor, 1);
    }
    return count;
  }

  function nextReadingBlock(date) {
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidateDate = addDays(date, offset);
      const task = dailyTemplate(candidateDate).find(taskReadsText);
      if (task) return { date: candidateDate, task: task };
    }
    return null;
  }

  function dayFocusMinutes(date) {
    return Math.max(0, Number(dayData(date).focusMinutes) || 0);
  }

  /* ==========================================================================
     Daily helpers
     ========================================================================== */

  function normalizeDay(raw) {
    if (!isPlainObject(raw)) return { tasks: {}, mcqs: [], sleep: null, notes: "", portions: {}, focusMinutes: 0, focusSessions: [] };
    return {
      ...raw,
      tasks: isPlainObject(raw.tasks) ? raw.tasks : {},
      mcqs: Array.isArray(raw.mcqs) ? raw.mcqs.filter(isPlainObject) : [],
      sleep: isPlainObject(raw.sleep) ? raw.sleep : null,
      notes: typeof raw.notes === "string" ? raw.notes : "",
      portions: isPlainObject(raw.portions) ? raw.portions : {},
      focusMinutes: Math.max(0, Number(raw.focusMinutes) || 0),
      focusSessions: Array.isArray(raw.focusSessions) ? raw.focusSessions.filter(isPlainObject) : [],
    };
  }

  function dayData(date) {
    return normalizeDay(state.daily[date]);
  }

  function ensureDay(date) {
    if (!isPlainObject(state.daily[date])) state.daily[date] = normalizeDay(null);
    const day = normalizeDay(state.daily[date]);
    state.daily[date] = day;
    return day;
  }

  function templateKeyForDate(date) {
    const day = parseISODate(date).getDay();
    if (day === 3) return "wednesday";
    if (day === 6) return "saturday";
    if (day === 0) return "sunday";
    return "default";
  }

  function dailyTemplate(date) {
    const parsed = parseISODate(date);
    if (!parsed) return [];
    const weekday = parsed.getDay();
    const key = templateKeyForDate(date);
    const base = DATA.dailySchedules[key] || DATA.dailySchedules.default;
    const rotation = key === "default" ? NIGHT_ROTATION[weekday] : null;
    return base.map((task) => {
      const copy = { ...task };
      if (rotation) {
        if (task.id === "night-1") copy.focus = rotation.night1;
        if (task.id === "night-2") copy.focus = rotation.night2;
        if (task.id === "night-3") copy.focus = rotation.night3;
      }
      return copy;
    });
  }

  function templateLabel(date) {
    const key = templateKeyForDate(date);
    if (key === "wednesday") return "Wednesday recovery template";
    if (key === "saturday") return "Saturday deep-work template";
    if (key === "sunday") return "Sunday review template";
    return "Weekday template";
  }

  function dayProgress(date) {
    const template = dailyTemplate(date);
    const day = dayData(date);
    const done = template.filter((task) => day.tasks[task.id]).length;
    return { done: done, total: template.length, pct: percentage(done, template.length) };
  }

  function toggleDailyTask(date, taskId, done) {
    const day = ensureDay(date);
    const assignment = isPlainObject(day.portions) ? day.portions[taskId] : null;
    const unit = assignment ? UNIT_BY_ID[assignment.unitId] : null;
    let portion = null;
    let unitReadingComplete = false;

    if (unit && assignment) {
      const key = portionKey(assignment.start, assignment.end);
      portion = unitPortions(unit).find((item) => item.key === key) || null;
      const record = ensureUnit(unit.id);
      if (done) {
        const existingEntry = isPlainObject(record.portions[key]) ? record.portions[key] : {};
        record.portions[key] = {
          ...existingEntry,
          readAt: date,
          minutes: portion ? portion.minutes : assignment.minutes || null,
          focusMinutes: Math.max(0, Number(assignment.focusMinutes) || 0, Number(existingEntry.focusMinutes) || 0) || undefined,
          taskId: taskId,
          auto: true,
        };
        assignment.readAt = date;
      } else {
        const entry = record.portions[key];
        if (entry && entry.taskId === taskId) {
          delete record.portions[key];
          assignment.readAt = null;
        }
      }
      const progress = unitPortionProgress(unit);
      unitReadingComplete = progress.total > 0 && progress.read === progress.total;
    }

    if (done) day.tasks[taskId] = todayISO();
    else delete day.tasks[taskId];
    saveState();
    return { assignment: assignment, unit: unit, portion: portion, unitReadingComplete: unitReadingComplete };
  }

  function isTaskCurrent(task) {
    if (ui.selectedDate !== todayISO()) return false;
    const match = String(task.time || "").match(/^(\d{1,2}):(\d{2})–(\d{1,2}):(\d{2})$/);
    if (!match) return false;
    let start = Number(match[1]) * 60 + Number(match[2]);
    let end = Number(match[3]) * 60 + Number(match[4]);
    if (end <= start) end += 1440;
    let current = nowMinutes();
    if (current < start && start > 1200 && current < 300) current += 1440;
    return current >= start && current < end;
  }

  function taskWindow(task, date) {
    const match = String((task && task.time) || "").match(/^(\d{1,2}):(\d{2})–(\d{1,2}):(\d{2})$/);
    if (!match || !isISODate(date)) return null;
    const day = parseISODate(date);
    if (!day) return null;
    day.setHours(0, 0, 0, 0);
    const base = day.getTime();
    const start = Number(match[1]) * 60 + Number(match[2]);
    let end = Number(match[3]) * 60 + Number(match[4]);
    if (end <= start) end += 1440;
    return { start: base + start * 60000, end: base + end * 60000 };
  }

  function isTaskPast(task, date) {
    const window = taskWindow(task, date);
    return Boolean(window && Date.now() > window.end);
  }

  function mcqStats(logs) {
    const list = Array.isArray(logs) ? logs : [];
    const attempted = list.reduce((sum, log) => sum + (Number(log.count) || 0), 0);
    const correct = list.reduce((sum, log) => sum + (Number(log.correct) || 0), 0);
    return {
      attempted: attempted,
      correct: correct,
      wrong: Math.max(0, attempted - correct),
      accuracy: attempted ? Math.round((correct / attempted) * 100) : null,
      sessions: list.length,
    };
  }

  function dayMcqStats(date) {
    return mcqStats(dayData(date).mcqs);
  }

  function allMcqLogs() {
    const logs = [];
    Object.keys(state.daily).sort().forEach((date) => {
      const day = dayData(date);
      day.mcqs.forEach((log) => logs.push({ ...log, date: date }));
    });
    return logs.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function allMcqStats() {
    return mcqStats(allMcqLogs());
  }

  function sleepHours(sleep) {
    if (!isPlainObject(sleep)) return null;
    const core = Number(sleep.core);
    const nap = Number(sleep.nap);
    if (!Number.isFinite(core) && !Number.isFinite(nap)) return null;
    return Math.max(0, (Number.isFinite(core) ? core : 0) + (Number.isFinite(nap) ? nap : 0));
  }

  function sleepSummary(days) {
    const span = days || 7;
    const end = todayISO();
    const entries = [];
    for (let offset = span - 1; offset >= 0; offset -= 1) {
      const date = addDays(end, -offset);
      const sleep = dayData(date).sleep;
      const total = sleepHours(sleep);
      if (total != null) entries.push({ date: date, total: total, energy: Number(sleep.energy) || null });
    }
    if (!entries.length) {
      return { entries: entries, avg: null, weekdayAvg: null, weekendAvg: null, energyAvg: null, count: 0 };
    }
    const avg = entries.reduce((sum, entry) => sum + entry.total, 0) / entries.length;
    const weekday = entries.filter((entry) => {
      const day = parseISODate(entry.date).getDay();
      return day !== 0 && day !== 6;
    });
    const weekend = entries.filter((entry) => {
      const day = parseISODate(entry.date).getDay();
      return day === 0 || day === 6;
    });
    const energyEntries = entries.filter((entry) => entry.energy != null);
    return {
      entries: entries,
      avg: avg,
      weekdayAvg: weekday.length ? weekday.reduce((sum, entry) => sum + entry.total, 0) / weekday.length : null,
      weekendAvg: weekend.length ? weekend.reduce((sum, entry) => sum + entry.total, 0) / weekend.length : null,
      energyAvg: energyEntries.length ? energyEntries.reduce((sum, entry) => sum + entry.energy, 0) / energyEntries.length : null,
      count: entries.length,
    };
  }

  function latestSleepTotal() {
    const dates = Object.keys(state.daily).sort().reverse();
    for (const date of dates) {
      const total = sleepHours(dayData(date).sleep);
      if (total != null) return total;
    }
    return null;
  }

  function completionStreak() {
    const today = todayISO();
    let cursor = today;
    let todayPct = dayProgress(today).pct;
    if (todayPct < 60) cursor = addDays(today, -1);
    let count = 0;
    for (let i = 0; i < 500; i += 1) {
      if (cursor < state.settings.startDate) break;
      const progress = dayProgress(cursor);
      if (progress.done === 0 || progress.pct < 60) break;
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  /* ==========================================================================
     Focus clock
     ========================================================================== */

  let focusTicker = null;
  let wakeLock = null;
  let audioCtx = null;

  function focusTotalMs(focus) {
    return Math.max(60000, (Number(focus.durationMin) || 25) * 60000);
  }

  function focusRemainingMs(focus, now) {
    if (!focus) return 0;
    const stamp = Number.isFinite(Number(now)) ? now : Date.now();
    if (focus.status === "running" && focus.endsAt) return Math.max(0, focus.endsAt - stamp);
    if (focus.status === "done") return 0;
    return Math.max(0, Number(focus.remainingMs) || 0);
  }

  function focusAccruedMs(focus, now) {
    if (!focus) return 0;
    const stamp = Number.isFinite(Number(now)) ? now : Date.now();
    let accrued = Math.max(0, Number(focus.accruedMs) || 0);
    if (focus.status === "running" && focus.runStartedAt) {
      const stopAt = focus.endsAt ? Math.min(stamp, focus.endsAt) : stamp;
      accrued += Math.max(0, stopAt - focus.runStartedAt);
    }
    return accrued;
  }

  function formatFocusClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return hours + ":" + pad2(minutes) + ":" + pad2(seconds);
    return minutes + ":" + pad2(seconds);
  }

  function focusTaskActive(date, taskId) {
    return Boolean(state.focus &&
      state.focus.date === date &&
      state.focus.taskId === taskId &&
      state.focus.status !== "done");
  }

  function ensureAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) {
      try {
        audioCtx = new Ctx();
      } catch (error) {
        audioCtx = null;
      }
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playChime() {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [880, 1174.7].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        const start = now + index * 0.2;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.6);
      });
    } catch (error) {
      // Audio is a courtesy; the visible completion state still stands.
    }
  }

  function requestWakeLock() {
    if (!state.focus || state.focus.status !== "running") return;
    if (!("wakeLock" in navigator) || wakeLock) return;
    try {
      navigator.wakeLock.request("screen").then((lock) => {
        wakeLock = lock;
        lock.addEventListener("release", () => {
          wakeLock = null;
        });
      }).catch(() => {});
    } catch (error) {
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      wakeLock.release();
    } catch (error) {
      // Ignore: the lock will be released by the browser.
    }
    wakeLock = null;
  }

  function logFocusTime(focus, elapsedMs) {
    if (!focus || focus.logged) return 0;
    const minutes = Math.round(elapsedMs / 60000);
    if (minutes < 1) return 0;
    const day = ensureDay(focus.date);
    day.focusMinutes = Math.max(0, Number(day.focusMinutes) || 0) + minutes;
    day.focusSessions.unshift({
      id: uid("focuslog"),
      taskId: focus.taskId,
      unitId: focus.unitId,
      part: focus.part,
      minutes: minutes,
      at: new Date().toISOString(),
    });
    day.focusSessions = day.focusSessions.slice(0, 60);
    const unit = UNIT_BY_ID[focus.unitId];
    if (unit && focus.start && focus.end) {
      const record = ensureUnit(unit.id);
      const key = portionKey(focus.start, focus.end);
      const entry = record.portions[key];
      if (entry) entry.focusMinutes = (Number(entry.focusMinutes) || 0) + minutes;
    }
    const assignment = day.portions && day.portions[focus.taskId];
    if (assignment) assignment.focusMinutes = (Number(assignment.focusMinutes) || 0) + minutes;
    focus.logged = true;
    focus.loggedMinutes = minutes;
    saveState(true);
    return minutes;
  }

  function createFocusSession(date, taskId, minutes, assignment) {
    const unit = assignment ? UNIT_BY_ID[assignment.unitId] : null;
    const task = dailyTemplate(date).find((item) => item.id === taskId) || null;
    if (!unit && !task) {
      toast("That study block is not on today’s schedule.");
      return;
    }
    const existing = state.focus;
    if (existing && existing.status !== "done" && existing.date === date && existing.taskId === taskId) {
      if (existing.status === "paused") resumeFocus();
      else toast("That focus clock is already running.");
      return;
    }
    const fallback = unit && assignment ? assignment.minutes : taskDurationMinutes(task);
    const duration = clamp(Math.round(Number(minutes) || fallback || 45), 5, 180);
    const now = Date.now();
    state.focus = {
      id: uid("focus"),
      date: date,
      taskId: taskId,
      unitId: unit ? unit.id : null,
      part: assignment ? assignment.part : null,
      start: assignment ? assignment.start : null,
      end: assignment ? assignment.end : null,
      subjectId: unit ? unit.book.subject : null,
      title: unit ? unit.name : (task ? task.title : "Focus block"),
      durationMin: duration,
      remainingMs: duration * 60000,
      endsAt: now + duration * 60000,
      runStartedAt: now,
      accruedMs: 0,
      startedAt: new Date(now).toISOString(),
      status: "running",
      logged: false,
      notified: false,
    };
    ensureAudio();
    requestWakeLock();
    saveState(true);
    ensureFocusTicker();
    renderFocusDock();
    updateChrome(parseRoute());
    toast("Focus started · " + duration + " min · " + (unit ? portionLabel(assignment) + " · " + unit.name : task.title) + ".");
  }

  function startFocusSession(date, taskId, minutes) {
    const day = dayData(date);
    const assignment = day.portions && day.portions[taskId];
    const task = dailyTemplate(date).find((item) => item.id === taskId);
    if (!assignment && !task) {
      toast("That block has no page portion assigned.");
      return;
    }
    const existing = state.focus;
    if (existing && existing.status !== "done" && (existing.date !== date || existing.taskId !== taskId)) {
      const unit = UNIT_BY_ID[existing.unitId];
      openConfirm({
        eyebrow: "One focus clock at a time",
        title: "Replace the active session?",
        message: "The clock is already running on <strong>" + esc(unit ? unit.name : "another block") + "</strong>. Starting this block will log the time already spent and replace the clock.",
        confirmLabel: "Replace the clock",
        onConfirm: () => {
          stopFocus({ silent: true });
          createFocusSession(date, taskId, minutes, assignment);
        },
      });
      return;
    }
    createFocusSession(date, taskId, minutes, assignment);
  }

  function pauseFocus() {
    const focus = state.focus;
    if (!focus || focus.status !== "running") return;
    const now = Date.now();
    focus.accruedMs = focusAccruedMs(focus, now);
    focus.remainingMs = Math.max(0, (focus.endsAt || now) - now);
    focus.endsAt = null;
    focus.runStartedAt = null;
    focus.status = "paused";
    if (focus.remainingMs <= 0) {
      completeFocus();
      return;
    }
    releaseWakeLock();
    saveState(true);
    renderFocusDock();
    toast("Focus paused · " + formatFocusClock(focus.remainingMs) + " left.");
  }

  function resumeFocus() {
    const focus = state.focus;
    if (!focus || focus.status !== "paused") return;
    const now = Date.now();
    focus.status = "running";
    focus.runStartedAt = now;
    focus.endsAt = now + Math.max(1000, focus.remainingMs);
    ensureAudio();
    requestWakeLock();
    saveState(true);
    renderFocusDock();
    toast("Focus resumed.");
  }

  function addFocusMinutes(amount) {
    const focus = state.focus;
    if (!focus) return;
    const add = clamp(Number(amount) || 5, 1, 30) * 60000;
    if (focus.status === "running") {
      focus.endsAt = (focus.endsAt || Date.now()) + add;
      focus.remainingMs = Math.max(0, focus.endsAt - Date.now());
      focus.durationMin = clamp(focus.durationMin + add / 60000, 5, 240);
    } else if (focus.status === "paused") {
      focus.remainingMs += add;
      focus.durationMin = clamp(focus.durationMin + add / 60000, 5, 240);
    } else {
      focus.status = "running";
      focus.durationMin = clamp(add / 60000, 5, 30);
      focus.remainingMs = add;
      focus.accruedMs = 0;
      focus.runStartedAt = Date.now();
      focus.endsAt = Date.now() + add;
      focus.logged = false;
      focus.doneAt = null;
      ensureAudio();
      requestWakeLock();
    }
    saveState(true);
    renderFocusDock();
    ensureFocusTicker();
    toast("Five minutes added.");
  }

  function completeFocus(options) {
    const opts = options || {};
    const focus = state.focus;
    if (!focus) return;
    if (focus.status === "done") return;
    const now = Date.now();
    const accrued = Math.min(focusAccruedMs(focus, now), focusTotalMs(focus));
    focus.accruedMs = accrued;
    focus.runStartedAt = null;
    focus.endsAt = null;
    focus.remainingMs = 0;
    focus.status = "done";
    focus.doneAt = new Date(now).toISOString();
    logFocusTime(focus, accrued);
    releaseWakeLock();
    saveState(true);
    renderFocusDock();
    if (!opts.silent) {
      playChime();
      toast("Focus complete · " + focus.durationMin + " min. Close the book and recall.");
      if (parseRoute().view === "today") softRefresh();
    }
  }

  function stopFocus(options) {
    const opts = options || {};
    const focus = state.focus;
    if (!focus) return;
    if (focus.status !== "done" && opts.log !== false) {
      const accrued = Math.min(focusAccruedMs(focus, Date.now()), focusTotalMs(focus));
      logFocusTime(focus, accrued);
    }
    state.focus = null;
    releaseWakeLock();
    saveState(true);
    renderFocusDock();
    updateChrome(parseRoute());
    if (parseRoute().view === "today") softRefresh();
    if (!opts.silent) toast("Focus clock closed.");
  }

  function markFocusPortionRead() {
    const focus = state.focus;
    if (!focus) return;
    const day = ensureDay(focus.date);
    const assignment = day.portions && day.portions[focus.taskId];
    if (!assignment || !focus.unitId) {
      toast("This focus block carries no page portion.");
      return;
    }
    const result = toggleDailyTask(focus.date, focus.taskId, true);
    renderFocusDock();
    if (parseRoute().view === "today") softRefresh();
    toast(result && result.unitReadingComplete
      ? "Portion read. Every portion in " + result.unit.name + " is now read — close the Learn pass."
      : "Portion marked read. The block is logged.");
  }

  function focusDockMarkup(focus) {
    const unit = focus.unitId ? UNIT_BY_ID[focus.unitId] : null;
    if (focus.unitId && !unit) return "";
    const task = dailyTemplate(focus.date).find((item) => item.id === focus.taskId) || null;
    const subject = unit ? SUBJECT_BY_ID[unit.book.subject] || SUBJECTS[0] : null;
    const portions = unit ? unitPortions(unit) : [];
    const totalParts = portions.length || 1;
    const remaining = focusRemainingMs(focus, Date.now());
    const total = focusTotalMs(focus);
    const pct = focus.status === "done" ? 100 : clamp(100 - (remaining / total) * 100, 0, 100);
    const circumference = 2 * Math.PI * 19;
    const offset = circumference * (1 - pct / 100);
    const day = dayData(focus.date);
    const taskDone = Boolean(day.tasks[focus.taskId]);
    const assignment = day.portions && day.portions[focus.taskId];
    const hasPortion = Boolean(unit && assignment && Number.isFinite(Number(assignment.start)));
    const read = hasPortion ? Boolean(assignment.readAt) : taskDone;
    const statusLabel = focus.status === "running"
      ? "Focus running"
      : focus.status === "paused"
        ? "Focus paused"
        : "Focus complete";
    const primary = focus.status === "running"
      ? '<button type="button" data-action="focus-pause" aria-label="Pause focus clock" title="Pause">' + icon("pause") + '</button>'
      : focus.status === "paused"
        ? '<button type="button" data-action="focus-resume" aria-label="Resume focus clock" title="Resume">' + icon("play") + '</button>'
        : "";
    const title = hasPortion
      ? portionLabel(assignment) + " · Part " + (Number(assignment.part) + 1) + " of " + totalParts
      : focus.title || (task ? task.title : "Focus block");
    const sub = hasPortion
      ? unit.name + " · " + unit.book.title + " G" + unit.book.grade
      : (task ? task.time + " · " + task.group + " block" : "Study block");
    return '' +
      '<div class="focus-dock' + (focus.status === "done" ? " is-done" : focus.status === "paused" ? " is-paused" : "") + '" role="region" aria-label="' + esc(statusLabel) + '" style="--focus-accent:' + (subject ? subject.color : "#c79b3b") + '">' +
        '<div class="focus-ring" aria-hidden="true">' +
          '<svg viewBox="0 0 44 44">' +
            '<circle class="focus-ring-track" cx="22" cy="22" r="19"></circle>' +
            '<circle class="focus-ring-progress" cx="22" cy="22" r="19" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"></circle>' +
          '</svg>' +
        '</div>' +
        '<div class="focus-copy">' +
          '<span class="focus-eyebrow">' + (focus.status === "done" ? "Done · log it" : "Focus · " + esc(subject ? subject.short : "study")) + '</span>' +
          '<strong class="focus-title">' + esc(title) + '</strong>' +
          '<span class="focus-sub">' + esc(sub) + '</span>' +
        '</div>' +
        '<div class="focus-clock" data-focus-clock aria-label="' + esc(statusLabel) + '">' + (focus.status === "done" ? "Done" : formatFocusClock(remaining)) + '</div>' +
        '<div class="focus-actions">' +
          primary +
          '<button type="button" data-action="focus-plus" aria-label="Add five minutes" title="Add 5 minutes">+5</button>' +
          (hasPortion
            ? read
              ? '<span class="focus-read-done">' + icon("check") + ' Read</span>'
              : '<button type="button" class="focus-read" data-action="focus-mark-read" aria-label="Mark this portion read">Mark read</button>'
            : "") +
          '<button type="button" data-action="focus-stop" aria-label="Close focus clock" title="Close">' + icon("x") + '</button>' +
        '</div>' +
      '</div>';
  }

  function renderFocusDock() {
    if (!els.focusRoot) return;
    const focus = state.focus;
    if (!focus) {
      els.focusRoot.innerHTML = "";
      document.body.classList.remove("has-focus-dock");
      return;
    }
    if (focus.status === "running" && focus.endsAt && Date.now() >= focus.endsAt) {
      completeFocus();
      return;
    }
    els.focusRoot.innerHTML = focusDockMarkup(focus);
    document.body.classList.add("has-focus-dock");
  }

  function updateFocusDock(focus) {
    const dock = els.focusRoot ? els.focusRoot.querySelector(".focus-dock") : null;
    if (!dock) {
      renderFocusDock();
      return;
    }
    if (focus.status === "done" && !dock.classList.contains("is-done")) {
      renderFocusDock();
      return;
    }
    const remaining = focusRemainingMs(focus, Date.now());
    const total = focusTotalMs(focus);
    const pct = focus.status === "done" ? 100 : clamp(100 - (remaining / total) * 100, 0, 100);
    const clock = dock.querySelector("[data-focus-clock]");
    if (clock) clock.textContent = focus.status === "done" ? "Done" : formatFocusClock(remaining);
    const ring = dock.querySelector(".focus-ring-progress");
    if (ring) {
      const circumference = 2 * Math.PI * 19;
      ring.setAttribute("stroke-dashoffset", (circumference * (1 - pct / 100)).toFixed(1));
    }
    document.title = focus.status === "done"
      ? "Focus complete · Ascent"
      : formatFocusClock(remaining) + " · Ascent";
  }

  function tickFocus() {
    const focus = state.focus;
    if (!focus) {
      if (els.focusRoot && els.focusRoot.firstElementChild) renderFocusDock();
      return;
    }
    if (focus.status === "running" && focus.endsAt && Date.now() >= focus.endsAt) {
      completeFocus();
      return;
    }
    if (focus.status === "paused" && focus.remainingMs <= 0) {
      completeFocus();
      return;
    }
    updateFocusDock(focus);
  }

  function ensureFocusTicker() {
    if (focusTicker) return;
    focusTicker = window.setInterval(tickFocus, 500);
  }

  /* ==========================================================================
     Week, test, and error helpers
     ========================================================================== */

  function normalizeWeek(raw) {
    if (!isPlainObject(raw)) return { tasks: {}, minimums: {}, review: {}, nation: {}, reviewSavedAt: null, nationSavedAt: null };
    return {
      ...raw,
      tasks: isPlainObject(raw.tasks) ? raw.tasks : {},
      minimums: isPlainObject(raw.minimums) ? raw.minimums : {},
      review: isPlainObject(raw.review) ? raw.review : {},
      nation: isPlainObject(raw.nation) ? raw.nation : {},
    };
  }

  function weekData(week) {
    return normalizeWeek(state.weekly[week]);
  }

  function ensureWeek(week) {
    if (!isPlainObject(state.weekly[week])) state.weekly[week] = normalizeWeek(null);
    const record = normalizeWeek(state.weekly[week]);
    state.weekly[week] = record;
    return record;
  }

  function weeklyTaskDefinitions(week) {
    const tasks = DATA.weeklyTasks.map((task) => ({ ...task }));
    if (DATA.fullAptitudeWeeks.includes(Number(week))) {
      const insertAfter = tasks.findIndex((task) => task.id === "aptitude-3");
      tasks.splice(insertAfter + 1, 0, {
        id: "aptitude-paper",
        group: "Aptitude",
        title: "Full 60-question Aptitude paper",
        detail: "Complete one full paper this week under exam timing.",
      });
    }
    return tasks;
  }

  function toggleWeeklyTask(week, taskId, done) {
    const record = ensureWeek(week);
    if (done) record.tasks[taskId] = todayISO();
    else delete record.tasks[taskId];
    saveState();
  }

  function weekTaskProgress(week) {
    const tasks = weeklyTaskDefinitions(week);
    const record = weekData(week);
    const done = tasks.filter((task) => record.tasks[task.id]).length;
    return { done: done, total: tasks.length, pct: percentage(done, tasks.length) };
  }

  function weeklyMinimumStats(week) {
    const record = weekData(week);
    const totalTarget = DATA.weeklyMinimums.reduce((sum, item) => sum + item.target, 0);
    const totalActual = DATA.weeklyMinimums.reduce((sum, item) => sum + (Number(record.minimums[item.id]) || 0), 0);
    const met = DATA.weeklyMinimums.filter((item) => (Number(record.minimums[item.id]) || 0) >= item.target).length;
    return { totalTarget: totalTarget, totalActual: totalActual, met: met, count: DATA.weeklyMinimums.length };
  }

  function weekGridProgress(week) {
    const units = unitsForWeek(week);
    if (units.length) {
      const done = units.filter((unit) => isUnitFirstPassComplete(unit.id)).length;
      return { done: done, total: units.length, pct: percentage(done, units.length), label: "units" };
    }
    return { ...weekTaskProgress(week), label: "standards" };
  }

  function sortTests() {
    return state.tests.slice().sort((a, b) => {
      if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  function testScoreEntries(test) {
    if (!test || !isPlainObject(test.scores)) return [];
    return Object.entries(test.scores)
      .filter(([subjectId, score]) => SUBJECT_BY_ID[subjectId] && isPlainObject(score) && Number.isFinite(Number(score.score)) && Number(score.max) > 0)
      .map(([subjectId, score]) => ({
        subjectId: subjectId,
        score: Number(score.score),
        max: Number(score.max),
        pct: (Number(score.score) / Number(score.max)) * 100,
      }));
  }

  function testOverallPct(test) {
    const entries = testScoreEntries(test);
    if (!entries.length) return null;
    const score = entries.reduce((sum, entry) => sum + entry.score, 0);
    const max = entries.reduce((sum, entry) => sum + entry.max, 0);
    return max ? Math.round((score / max) * 100) : null;
  }

  function testRawTotal(test) {
    const entries = testScoreEntries(test);
    return {
      score: entries.reduce((sum, entry) => sum + entry.score, 0),
      max: entries.reduce((sum, entry) => sum + entry.max, 0),
    };
  }

  function mockTests() {
    return sortTests().filter((test) => test.kind === "mock");
  }

  function mockAverage() {
    const mocks = mockTests();
    if (!mocks.length) return null;
    const values = mocks.slice(-3).map(testOverallPct).filter((value) => value != null);
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  function subjectScoreHistory(subjectId) {
    return sortTests()
      .map((test) => {
        const entries = testScoreEntries(test);
        const found = entries.find((entry) => entry.subjectId === subjectId);
        return found ? { test: test, pct: Math.round(found.pct) } : null;
      })
      .filter(Boolean);
  }

  function errorRepeatRate() {
    if (!state.errors.length) return null;
    const repeats = state.errors.filter((error) => error.repeat).length;
    return Math.round((repeats / state.errors.length) * 100);
  }

  function errorsDueCount() {
    const today = todayISO();
    return state.errors.filter((error) => {
      if (error.status === "resolved") return false;
      return isISODate(error.retestDate) && daysBetween(error.retestDate, today) >= 0;
    }).length;
  }

  function errorOpenCount() {
    return state.errors.filter((error) => error.status !== "resolved").length;
  }

  function addMcqLog(date, log) {
    const day = ensureDay(date);
    day.mcqs.unshift(log);
    saveState();
  }

  function deleteMcqLog(date, id) {
    const day = ensureDay(date);
    day.mcqs = day.mcqs.filter((log) => log.id !== id);
    saveState();
  }

  function findErrorSubjects() {
    return [...TEXT_SUBJECTS];
  }

  /* ==========================================================================
     App chrome and routing
     ========================================================================== */

  function parseRoute() {
    const raw = window.location.hash.replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);
    const allowed = ["home", "today", "journey", "books", "practice", "reflect", "progress", "vocabulary", "focus", "schedule", "more", "settings", "mock", "mock-history", "reading", "repairs", "english-skills", "vocabulary-collection"];
    const view = allowed.includes(parts[0]) ? parts[0] : "today";
    return { view: view, segments: parts.slice(1) };
  }

  function navigate(view, segments) {
    const path = [view].concat(segments || []).join("/");
    if (window.location.hash === "#" + path) {
      handleRouteChange(true);
      return;
    }
    window.location.hash = path;
  }

  function applyRouteToUi(route) {
    if (route.view === "journey") {
      const requested = Number(route.segments[0]);
      ui.selectedWeek = Number.isFinite(requested) && requested >= 1 && requested <= 30 ? requested : currentWeekNo();
    }
    if (route.view === "reflect") {
      const requested = Number(route.segments[0]);
      ui.reflectWeek = Number.isFinite(requested) && requested >= 1 && requested <= 30 ? requested : currentWeekNo();
    }
    if (route.view === "practice") {
      ui.practiceTab = route.segments[0] === "errors" ? "errors" : "overview";
    }
    if (route.view === "books") {
      const bookId = route.segments[0];
      if (!bookId) {
        ui.lastBookId = null;
      } else if (BOOK_BY_ID[bookId]) {
        if (ui.lastBookId !== bookId) ui.openUnits.clear();
        ui.lastBookId = bookId;
        if (route.segments[1] && UNIT_BY_ID[route.segments[1]] && UNIT_BY_ID[route.segments[1]].bookId === bookId) {
          ui.openUnits.add(route.segments[1]);
        }
      }
    }
  }

  function handleRouteChange(force) {
    const route = parseRoute();
    const previousView = ui.lastView;
    applyRouteToUi(route);
    if (route.view === "today") {
      const requestedDate = route.segments[0];
      ui.selectedDate = isISODate(requestedDate) ? requestedDate : todayISO();
    }
    ui.lastView = route.view;
    renderApp({ scrollTop: force || previousView !== route.view });
  }

  function updateChrome(route) {
    const today = todayISO();
    const week = currentWeekNo();
    const phase = phaseForWeek(week);
    const completed = completedUnitCount();
    const streak = completionStreak();
    els.topbarDate.textContent = formatLongDate(today);
    els.topbarContext.textContent = isPlanComplete()
      ? "Maintenance · protect the score"
      : "Week " + week + " · " + phase.name;
    els.streakCopy.textContent = streak > 0 ? streak + "-day streak" : "Start today";
    els.streakPill.title = streak > 0
      ? streak + " consecutive " + plural(streak, "day") + " at 60%+ completion"
      : "Reach 60% of today's actions to start a streak";
    els.avatar.textContent = (state.settings.name || "A").slice(0, 1).toUpperCase();
    els.railPhase.textContent = phase.name;
    els.railWeek.textContent = "Week " + week + " / 30";
    els.railProgressFill.style.width = percentage(completed, TOTAL_UNITS) + "%";
    els.railProgressCopy.textContent = completed + " of " + TOTAL_UNITS + " units built";
    document.title = (route.view.charAt(0).toUpperCase() + route.view.slice(1)) + " · Ascent";

    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === route.view);
    });
  }

  function renderApp(options) {
    const opts = options || {};
    const route = parseRoute();
    const scrollY = window.scrollY;
    updateChrome(route);
    let html = "";
    if (["home", "progress", "vocabulary", "focus", "more", "mock", "mock-history", "reading", "repairs", "english-skills", "vocabulary-collection"].includes(route.view)) html = '<section class="screen-mount" aria-live="polite"></section>';
    else if (route.view === "today" || route.view === "schedule") html = renderToday();
    else if (route.view === "journey") html = renderJourney();
    else if (route.view === "books") html = renderBooks(route.segments);
    else if (route.view === "practice") html = renderPractice();
    else if (route.view === "reflect") html = renderReflect();
    else if (route.view === "settings") html = renderSettings();
    els.viewRoot.dataset.routeScreen = "";
    els.viewRoot.dataset.missionEnhanced = "0";
    els.viewRoot.dataset.weekEnhanced = "0";
    els.viewRoot.dataset.remindersEnhanced = "0";
    els.viewRoot.innerHTML = html || "";
    renderFocusDock();
    if (opts.scrollTop) {
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.scrollTo({ top: scrollY, behavior: "auto" });
    }
    if (opts.focusSelector) {
      requestAnimationFrame(() => {
        const target = document.querySelector(opts.focusSelector);
        if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
      });
    }
  }

  function softRefresh(focusSelector) {
    renderApp({ focusSelector: focusSelector });
  }

  function pageHead(eyebrow, title, description, actions) {
    return '' +
      '<div class="page-head">' +
        '<div>' +
          '<div class="eyebrow-row"><span class="eyebrow">' + esc(eyebrow) + '</span></div>' +
          '<h1>' + esc(title) + '</h1>' +
          (description ? '<p class="lead">' + description + '</p>' : "") +
        '</div>' +
        (actions ? '<div class="page-head-actions">' + actions + '</div>' : "") +
      '</div>';
  }

  function progressBar(pct, classes) {
    return '<div class="progress-track ' + (classes || "") + '"><span style="width:' + clamp(Number(pct) || 0, 0, 100) + '%"></span></div>';
  }

  function toast(message) {
    Array.from(els.toastRegion.querySelectorAll(".toast:not(.leaving)")).forEach((old) => {
      old.classList.add("leaving");
      window.setTimeout(() => old.remove(), 230);
    });
    const node = document.createElement("div");
    node.className = "toast";
    node.innerHTML = icon("check") + "<span>" + esc(message) + "</span>";
    els.toastRegion.appendChild(node);
    window.setTimeout(() => {
      node.classList.add("leaving");
      window.setTimeout(() => node.remove(), 230);
    }, 3000);
  }

  /* ==========================================================================
     Today
     ========================================================================== */

  function computeNextMove() {
    const week = currentWeekNo();
    const today = todayISO();
    const due = getDueRevisits(today);
    if (due.length) {
      const item = due[0];
      return {
        eyebrow: "Retrieve before you relearn",
        title: item.unit.name,
        description: bookLabel(item.unit.book) + ". Your " + item.revisit.label + " is due. Pull it from memory before you open the book.",
        href: isoPath("books", item.unit.bookId, item.unit.id),
        cta: "Open the unit",
        meta: [item.revisit.label, item.unit.subject.short, item.overdueDays > 0 ? item.overdueDays + "d overdue" : "Due today"],
        duration: "15–25 min",
      };
    }

    const setup = setupProgress();
    if (week <= 2 && setup.done < setup.total) {
      return {
        eyebrow: "Calibrate the machine",
        title: "Finish the calibration kit",
        description: "Diagnostics and six exam maps decide where every future hour goes. Do not plan in the dark.",
        href: isoPath("journey", "1"),
        cta: "Open calibration",
        meta: [setup.done + " / " + setup.total + " complete", "Week 1"],
        duration: "Build once",
      };
    }

    const overdueUnits = ALL_UNITS
      .filter((unit) => unit.week < week && !isUnitFirstPassComplete(unit.id))
      .sort((a, b) => a.week - b.week);
    if (overdueUnits.length) {
      const unit = overdueUnits[0];
      return {
        eyebrow: "48-hour triage",
        title: "Recover " + unit.name,
        description: bookLabel(unit.book) + ". The target week has passed. Use the triage rule: outcomes, summary, five MCQs, then finish the deep work in the Sunday buffer.",
        href: isoPath("books", unit.bookId, unit.id),
        cta: "Open the unit",
        meta: ["Behind schedule", unit.subject.short, "Target W" + unit.week],
        duration: "30 min triage",
      };
    }

    const currentUnits = unitsForWeek(week);
    const openUnit = currentUnits.find((unit) => !isUnitFirstPassComplete(unit.id));
    if (openUnit) {
      const nextPass = unitNextPass(openUnit);
      return {
        eyebrow: firstPassCount(openUnit.id) ? "Continue the build passes" : "Start this week's unit",
        title: openUnit.name,
        description: bookLabel(openUnit.book) + ". Next: " + (nextPass ? nextPass.label : "finish the loop") + ". Keep the book closed before you think; then check.",
        href: isoPath("books", openUnit.bookId, openUnit.id),
        cta: "Open the unit",
        meta: [openUnit.subject.short, "Tier " + openUnit.tier, "Target W" + openUnit.week],
        duration: nextPass ? "2–5 h" : "15 min",
      };
    }

    const pendingTask = weeklyTaskDefinitions(week).find((task) => !weekData(week).tasks[task.id]);
    if (pendingTask) {
      return {
        eyebrow: "Protect the weekly spine",
        title: pendingTask.title,
        description: pendingTask.detail,
        href: isoPath("journey", week),
        cta: "Open this week",
        meta: [pendingTask.group, "Week " + week],
        duration: "Non-negotiable",
      };
    }

    return {
      eyebrow: "The work is current",
      title: "Review the evidence",
      description: "The scheduled work is complete. Look at the error log, update a Nation Note, or bank the time as buffer. Do not add low-yield volume.",
      href: "#practice/errors",
      cta: "Open error lab",
      meta: ["Protect the margin"],
      duration: "20–30 min",
    };
  }

  function renderPortionLine(unit, assignment, portion, date) {
    const read = Boolean(assignment.readAt);
    const carried = assignment.carriedFrom && !read;
    const totalParts = unitPortions(unit).length || 1;
    const label = portion ? portionLabel(portion) : "pp. " + assignment.start + "–" + assignment.end;
    const minutes = portion ? portion.minutes : assignment.minutes;
    const step = portionStepLabel(unit);
    return '' +
      '<span class="action-portion' + (read ? " is-read" : "") + '" style="--subject-color:' + unit.subject.color + '">' +
        '<strong>' + esc(label) + '</strong>' +
        '<span>Grade ' + unit.book.grade + ' · Part ' + (Number(assignment.part) + 1) + ' of ' + totalParts + ' · ~' + esc(minutes || "—") + ' min</span>' +
        '<span class="portion-step">' + esc(step) + '</span>' +
        (carried ? '<span class="portion-flag">Carried from ' + esc(formatDayMonth(assignment.carriedFrom)) + '</span>' : "") +
        (read ? '<span class="portion-flag is-done">' + icon("check") + ' Read</span>' : "") +
      '</span>';
  }

  function renderActionRow(task, day, date, assignment) {
    const checked = Boolean(day.tasks[task.id]);
    const currentClass = isTaskCurrent(task) ? " is-current" : "";
    const unit = assignment ? UNIT_BY_ID[assignment.unitId] : null;
    const portion = unit && assignment
      ? unitPortions(unit).find((item) => item.key === portionKey(assignment.start, assignment.end)) || null
      : null;
    const read = Boolean(assignment && assignment.readAt);
    const canFocus = date === todayISO() && !checked && ((Boolean(assignment && unit) && !read) || isFocusableTask(task));
    const live = focusTaskActive(date, task.id);
    const focusLabel = unit ? unit.name : task.title;
    return '' +
      '<div class="action-row' + (checked ? " done" : "") + currentClass + '">' +
        '<label class="action-toggle">' +
          '<input type="checkbox" data-daily-task="' + esc(task.id) + '" data-date="' + esc(date) + '"' + (checked ? " checked" : "") + '>' +
          '<span class="action-check">' + icon("check") + '</span>' +
          '<span class="action-time">' + esc(task.time) + '</span>' +
          '<span class="action-copy">' +
            '<span class="action-title">' + esc(task.title) + '</span>' +
            '<span class="action-detail">' + esc(task.detail) + '</span>' +
            (task.focus ? '<span class="action-focus">' + esc(task.focus) + '</span>' : "") +
            (unit && assignment ? renderPortionLine(unit, assignment, portion, date) : "") +
          '</span>' +
        '</label>' +
        (canFocus
          ? '<button type="button" class="action-focus-btn' + (live ? " is-live" : "") + '" data-action="start-focus" data-date="' + esc(date) + '" data-task="' + esc(task.id) + '" aria-label="' + (live ? "Focus clock running for " : "Start focus clock for ") + esc(focusLabel) + '" title="' + (live ? "Focus clock running" : "Start focus clock") + '">' + icon(live ? "pause" : "clock") + '</button>'
          : "") +
      '</div>';
  }

  function renderDailySchedule(date, portions) {
    const template = dailyTemplate(date);
    const day = dayData(date);
    const resolved = portions || resolveDayPortions(date, { create: date === todayISO() });
    const groups = [];
    template.forEach((task) => {
      let group = groups.find((item) => item.name === task.group);
      if (!group) {
        group = { name: task.group, tasks: [] };
        groups.push(group);
      }
      group.tasks.push(task);
    });
    return groups.map((group) => {
      const completed = group.tasks.filter((task) => day.tasks[task.id]).length;
      return '' +
        '<div class="action-group">' +
          '<div class="action-group-head"><h3>' + esc(group.name) + '</h3><span>' + completed + " / " + group.tasks.length + '</span></div>' +
          '<div class="action-list">' + group.tasks.map((task) => renderActionRow(task, day, date, resolved[task.id])).join("") + '</div>' +
        '</div>';
    }).join("");
  }

  function renderCalibrationMini() {
    const progress = setupProgress();
    if (progress.done >= progress.total) return "";
    const pending = DATA.calibration.filter((item) => !state.setup[item.id]).slice(0, 4);
    return '' +
      '<section class="calibration-card">' +
        '<div class="section-head" style="margin-bottom:0">' +
          '<div><span class="eyebrow">Calibration kit</span><h3>Start with evidence.</h3></div>' +
          '<span class="badge badge-gold">' + progress.done + " / " + progress.total + '</span>' +
        '</div>' +
        '<div class="calibration-progress">' + progressBar(progress.pct, "gold") + '<span>' + progress.pct + '%</span></div>' +
        '<p class="small muted" style="margin:0 0 4px">The six diagnostics and six exam maps make the rest of the plan target real gaps.</p>' +
        '<div class="calibration-mini-list">' +
          pending.map((item) => (
            '<label class="' + (state.setup[item.id] ? "done" : "") + '">' +
              '<input type="checkbox" data-setup-item="' + esc(item.id) + '"' + (state.setup[item.id] ? " checked" : "") + '>' +
              '<span>' + esc(item.title) + '</span>' +
            '</label>'
          )).join("") +
        '</div>' +
        '<a class="text-button" href="' + isoPath("journey", "1") + '" style="margin-top:9px">Open the full kit ' + icon("arrow-right") + '</a>' +
      '</section>';
  }

  function renderDueCard() {
    const due = getDueRevisits(todayISO());
    if (!due.length) return "";
    const visible = due.slice(0, 4);
    return '' +
      '<section class="card card-padded">' +
        '<div class="section-head">' +
          '<div><span class="eyebrow">Spaced retrieval</span><h3>Due from memory</h3><p>Close the book. Recall first. Then check.</p></div>' +
          '<span class="badge badge-clay">' + due.length + ' due</span>' +
        '</div>' +
        '<div class="due-list">' +
          visible.map((item) => (
            '<div class="due-item">' +
              '<span class="due-day">D+' + item.revisit.offset + '</span>' +
              '<span class="due-copy"><strong>' + esc(item.unit.name) + '</strong><span>' + esc(item.unit.subject.short) + " · " + esc(item.unit.book.title) + " G" + item.unit.book.grade + " · " + (item.overdueDays > 0 ? item.overdueDays + "d overdue" : "today") + '</span></span>' +
              '<a class="icon-button" href="' + isoPath("books", item.unit.bookId, item.unit.id) + '" aria-label="Open ' + esc(item.unit.name) + '">' + icon("arrow-right") + '</a>' +
            '</div>'
          )).join("") +
        '</div>' +
        (due.length > visible.length ? '<a class="text-button" href="#practice" style="margin-top:12px">See the full queue ' + icon("arrow-right") + '</a>' : "") +
      '</section>';
  }

  function renderQuickLog() {
    const stats = dayMcqStats(ui.selectedDate);
    const sleep = sleepHours(dayData(ui.selectedDate).sleep);
    return '' +
      '<section class="card quick-log-card">' +
        '<div class="quick-log-head">' +
          '<div><span class="eyebrow">The evidence</span><h3>Log today</h3></div>' +
          '<span class="badge badge-ghost">' + esc(formatDayMonth(ui.selectedDate)) + '</span>' +
        '</div>' +
        '<div class="log-metrics">' +
          '<div class="log-metric"><span>MCQs</span><strong>' + (stats.attempted || "—") + '</strong></div>' +
          '<div class="log-metric"><span>Accuracy</span><strong>' + (stats.accuracy == null ? "—" : stats.accuracy + "%") + '</strong></div>' +
          '<div class="log-metric"><span>Sleep</span><strong>' + (sleep == null ? "—" : formatHours(sleep)) + '</strong></div>' +
        '</div>' +
        '<div class="quick-log-actions">' +
          '<button type="button" class="btn btn-secondary" data-action="open-practice-modal" data-date="' + esc(ui.selectedDate) + '">' + icon("plus") + ' Practice</button>' +
        '</div>' +
      '</section>';
  }

  function renderWeekSpine() {
    const week = currentWeekNo();
    const tasks = weeklyTaskDefinitions(week);
    const record = weekData(week);
    const done = tasks.filter((task) => record.tasks[task.id]).length;
    const pending = tasks.filter((task) => !record.tasks[task.id]).slice(0, 4);
    return '' +
      '<section class="card week-spine-card">' +
        '<div class="section-head" style="margin-bottom:0">' +
          '<div><span class="eyebrow">Week ' + week + '</span><h3>The weekly spine</h3></div>' +
          '<span class="badge ' + (done === tasks.length ? "badge-green" : "badge-ghost") + '">' + done + " / " + tasks.length + '</span>' +
        '</div>' +
        progressBar(percentage(done, tasks.length)) +
        '<p class="small muted" style="margin-top:9px;margin-bottom:2px">' + (pending.length ? "Do not trade these for more reading." : "The spine is complete. Bank the remaining time.") + '</p>' +
        (pending.length ? '<ul class="spine-list">' + pending.map((task) => (
          '<li><label style="display:flex;align-items:flex-start;gap:8px;width:100%;cursor:pointer">' +
            '<input type="checkbox" data-week-task="' + esc(task.id) + '" data-week="' + week + '" style="width:12px;height:12px;margin-top:2px;accent-color:var(--forest);flex:0 0 auto">' +
            '<span>' + esc(task.title) + '</span>' +
          '</label></li>'
        )).join("") + '</ul>' : "") +
        '<a class="text-button" href="' + isoPath("journey", week) + '" style="margin-top:12px">Open the week ' + icon("arrow-right") + '</a>' +
      '</section>';
  }

  function todaysReadingTarget(template, portions, day) {
    const candidates = [];
    template.forEach((task, index) => {
      const assignment = portions[task.id];
      if (!assignment || day.tasks[task.id]) return;
      candidates.push({ task: task, assignment: assignment, index: index });
    });
    if (!candidates.length) return null;
    const unread = candidates.filter((item) => !item.assignment.readAt);
    const pool = unread.length ? unread : candidates;
    return pool.find((item) => isTaskCurrent(item.task)) || pool[0];
  }

  function renderStartHere(date, template, portions, day) {
    if (date !== todayISO()) return "";
    const target = todaysReadingTarget(template, portions, day);
    const focusToday = dayFocusMinutes(date);
    const focusCopy = focusToday > 0
      ? "Focused " + formatHours(focusToday / 60) + " today."
      : "No focus time logged yet today.";

    if (!target) {
      const assigned = Object.keys(portions).map((taskId) => portions[taskId]).filter(Boolean);
      if (assigned.length) {
        const read = assigned.filter((item) => item.readAt).length;
        const next = nextReadingBlock(date);
        const nextCopy = next
          ? "Next reading block: " + formatWeekday(next.date, true) + " " + formatDayMonth(next.date) + " · " + next.task.time + " · " + (next.task.focus || next.task.title) + "."
          : "No reading block in the next seven days.";
        return '' +
          '<section class="start-here is-complete" aria-label="Reading complete for today">' +
            '<div class="start-here-head"><span class="eyebrow">Reading complete</span><span class="start-here-badge">' + icon("check") + ' ' + read + ' of ' + assigned.length + ' portions</span></div>' +
            '<h2>Today’s pages are done.</h2>' +
            '<p class="start-here-copy">' + esc(focusCopy) + ' Use the remaining blocks for Prove, Compress, or retrieval. Do not add low-yield reading.</p>' +
            '<div class="start-here-actions">' +
              '<a class="btn btn-primary btn-small" href="' + isoPath("journey", currentWeekNo()) + '">Open the week ' + icon("arrow-right") + '</a>' +
              '<span class="start-here-foot">' + esc(nextCopy) + '</span>' +
            '</div>' +
          '</section>';
      }
      const next = nextReadingBlock(date);
      const nextCopy = next
        ? "Next reading block: " + formatWeekday(next.date, true) + " " + formatDayMonth(next.date) + " · " + next.task.time + " · " + (next.task.focus || next.task.title) + "."
        : "No reading block in the next seven days. This is a consolidation week.";
      return '' +
        '<section class="start-here is-quiet" aria-label="No reading block today">' +
          '<div class="start-here-head"><span class="eyebrow">Reading</span><span class="start-here-badge">No new pages</span></div>' +
          '<h2>Today is for practice, not new pages.</h2>' +
          '<p class="start-here-copy">The schedule carries no textbook portion today. Work the timed drills, the error log, and the retrieval queue. ' + esc(focusCopy) + '</p>' +
          '<div class="start-here-actions">' +
            '<a class="btn btn-secondary btn-small" href="' + isoPath("journey", currentWeekNo()) + '">See the week ' + icon("arrow-right") + '</a>' +
            '<span class="start-here-foot">' + esc(nextCopy) + '</span>' +
          '</div>' +
        '</section>';
    }

    const unit = UNIT_BY_ID[target.assignment.unitId];
    if (!unit) return "";
    const portion = unitPortions(unit).find((item) => item.key === portionKey(target.assignment.start, target.assignment.end)) ||
      { start: target.assignment.start, end: target.assignment.end, minutes: target.assignment.minutes, part: target.assignment.part, total: 1 };
    const read = Boolean(target.assignment.readAt);
    const progress = unitPortionProgress(unit);
    const isNow = isTaskCurrent(target.task);
    const passed = !isNow && isTaskPast(target.task, date);
    const carried = target.assignment.carriedFrom && !read;
    const eyebrow = read ? "Read · close the block" : isNow ? "Start here · now" : passed ? "Unfinished block · earlier" : "Next reading block";
    const minutes = portion.minutes || target.assignment.minutes || 45;
    return '' +
      '<section class="start-here' + (read ? " is-read" : "") + '" aria-label="' + esc(eyebrow) + '" style="--subject-color:' + unit.subject.color + '">' +
        '<div class="start-here-head">' +
          '<span class="eyebrow">' + esc(eyebrow) + '</span>' +
          '<span class="start-here-badge">' + esc(target.task.time) + (carried ? " · carried" : passed ? " · passed" : "") + '</span>' +
        '</div>' +
        '<div class="start-here-body">' +
          '<div class="start-here-copy-wrap">' +
            '<h2>' + esc(unit.name) + '</h2>' +
            '<p class="start-here-pages"><strong>' + esc(portionLabel(portion)) + '</strong><span>Part ' + (portion.part + 1) + ' of ' + progress.total + '</span><span>' + esc(unit.book.title) + ' · Grade ' + unit.book.grade + '</span></p>' +
            '<div class="start-here-meta">' +
              '<span>' + icon("clock") + ' ~' + minutes + ' min</span>' +
              '<span>' + icon("books") + ' ' + esc(portionStepLabel(unit)) + '</span>' +
              '<span>' + icon("journey") + ' ' + esc(target.task.title) + '</span>' +
            '</div>' +
            '<p class="start-here-note">' + (passed ? "This block has already passed. Read the pages now if the time is genuinely there; otherwise they carry to the next reading block. " : "") + esc(portionInstruction(unit, portion)) + '</p>' +
          '</div>' +
          '<div class="start-here-progress" aria-label="Unit reading progress">' +
            '<span class="start-here-progress-value">' + progress.read + '<small>/' + progress.total + '</small></span>' +
            '<span class="start-here-progress-label">portions read</span>' +
            progressBar(progress.pct, "gold") +
          '</div>' +
        '</div>' +
        '<div class="start-here-actions">' +
          (read
            ? '<button type="button" class="btn btn-gold btn-small" data-action="complete-reading" data-date="' + esc(date) + '" data-task="' + esc(target.task.id) + '">' + icon("check") + ' Mark the block done</button>'
            : '<button type="button" class="btn btn-gold btn-small" data-action="start-focus" data-date="' + esc(date) + '" data-task="' + esc(target.task.id) + '">' + icon("play") + ' Start ' + minutes + '-min focus</button>' +
              '<button type="button" class="btn btn-secondary btn-small" data-action="complete-reading" data-date="' + esc(date) + '" data-task="' + esc(target.task.id) + '">' + icon("check") + ' Mark read</button>') +
          '<a class="start-here-link" href="' + isoPath("books", unit.bookId, unit.id) + '">Open the unit ' + icon("arrow-up-right") + '</a>' +
        '</div>' +
        '<div class="start-here-foot-row"><span>' + esc(focusCopy) + '</span><span>Printed pages, not PDF pages. Stop at p. ' + portion.end + '.</span></div>' +
      '</section>';
  }

  function weekFocusMinutes(week) {
    let total = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      total += dayFocusMinutes(addDays(weekStart(week), offset));
    }
    return total;
  }

  function renderReadingQueue() {
    const week = currentWeekNo();
    const stats = weekPortionStats(week);
    if (!stats.total) return "";
    const blocksLeft = readingBlocksRemaining(week, todayISO());
    const focus = weekFocusMinutes(week);
    const copy = stats.remaining === 0
      ? "Every portion for this week is read. The remaining blocks are for Prove, Compress, and retrieval."
      : blocksLeft >= stats.remaining
        ? stats.remaining + " " + plural(stats.remaining, "portion") + " left across " + blocksLeft + " reading " + plural(blocksLeft, "block") + ". The queue fits, but only if the blocks are protected."
        : stats.remaining + " " + plural(stats.remaining, "portion") + " left, with " + blocksLeft + " reading " + plural(blocksLeft, "block") + " remaining. " + (stats.remaining - blocksLeft) + " will carry into next week.";
    return '' +
      '<section class="card reading-queue-card">' +
        '<div class="reading-queue-head">' +
          '<div><span class="eyebrow">Reading queue · Week ' + week + '</span><h3>' + stats.read + ' of ' + stats.total + ' portions read</h3></div>' +
          '<span class="badge ' + (stats.remaining === 0 ? "badge-green" : "badge-ghost") + '">' + (stats.remaining === 0 ? "Clear" : "~" + formatHours(stats.minutes / 60)) + '</span>' +
        '</div>' +
        progressBar(percentage(stats.read, stats.total)) +
        '<p class="small muted" style="margin:11px 0 0">' + esc(copy) + '</p>' +
        '<div class="reading-queue-foot">' +
          '<span>Focus this week <strong>' + (focus > 0 ? formatHours(focus / 60) : "—") + '</strong></span>' +
          '<a class="text-button" href="' + isoPath("journey", week) + '">Load map ' + icon("arrow-right") + '</a>' +
        '</div>' +
      '</section>';
  }

  function renderToday() {
    const today = ui.selectedDate;
    const actualToday = todayISO();
    const week = weekForDate(today);
    const phase = phaseForWeek(week);
    const meta = WEEK_META[week];
    const day = dayData(today);
    const progress = dayProgress(today);
    const template = dailyTemplate(today);
    const isToday = today === actualToday;
    const portions = resolveDayPortions(today, { create: isToday });
    const examDays = daysToExam();
    const readinessDays = daysToReadiness();
    const next = nextMock();
    const nextMove = computeNextMove();
    const unitsDone = completedUnitCount();
    const mcqAll = allMcqStats();
    const dayStats = mcqStats(day.mcqs);
    const setComplete = setupProgress();
    const showCalibration = setComplete.done < setComplete.total && week <= 2;
    const planDay = clamp(daysBetween(state.settings.startDate, today) + 1, 1, 210);
    const countdownTitle = isPlanComplete() ? "The plan is complete. Protect what you built." : meta.focus;
    const nextMockText = next
      ? next.name + " · W" + next.week
      : "All mocks logged";
    const backup = backupReminder();

    return '' +
      '<section class="today-hero">' +
        '<div>' +
          '<div class="hero-kicker">' +
            '<span class="kicker-strong">Week ' + week + ' · ' + esc(phase.name) + '</span>' +
            '<span class="kicker-dot"></span>' +
            '<span>' + esc(weekRangeLabel(week)) + '</span>' +
            '<span class="kicker-dot"></span>' +
            '<span>Day ' + planDay + ' of 210</span>' +
            (isToday && isLateSession() ? '<span class="kicker-dot"></span><span title="The plan day rolls over at 05:20, when the sleep block begins.">Late session · until 05:20</span>' : "") +
          '</div>' +
          '<h1 class="hero-title">' + esc(countdownTitle) + '</h1>' +
          '<p class="hero-sub">' + esc(phase.mission) + '</p>' +
          '<div class="hero-actions">' +
            '<button type="button" class="btn btn-gold" data-action="scroll-daily">' + icon("check") + ' Resume today’s rhythm</button>' +
            '<a class="hero-secondary" href="' + isoPath("journey", week) + '">Open the week plan ' + icon("arrow-up-right") + '</a>' +
          '</div>' +
        '</div>' +
        '<aside class="hero-clock" aria-label="Countdown and next assessment">' +
          '<span class="hero-clock-label">Days to exam marker</span>' +
          '<p class="hero-clock-value numeric">' + formatCountdown(examDays) + '</p>' +
          '<p class="hero-clock-unit">Assumed · ' + esc(formatDateShort(state.settings.examDate)) + '</p>' +
          '<div class="hero-clock-meta">' +
            '<div><span>Readiness deadline</span><strong class="readiness-date">' + (readinessDays >= 0 ? readinessDays + " days · " : "") + esc(formatDateShort(DATA.examNotes.readinessDate)) + '</strong></div>' +
            '<div><span>Next mock</span><strong>' + esc(nextMockText) + '</strong></div>' +
          '</div>' +
        '</aside>' +
      '</section>' +

      '<section class="stat-strip" aria-label="Today at a glance">' +
        '<div class="stat"><div class="stat-label">' + icon("check") + ' Daily rhythm</div><div class="stat-value">' + progress.pct + '%</div><div class="stat-hint">' + progress.done + " of " + progress.total + ' actions</div></div>' +
        '<div class="stat"><div class="stat-label">' + icon("books") + ' Build loop</div><div class="stat-value">' + unitsDone + '<small>/ ' + TOTAL_UNITS + '</small></div><div class="stat-hint">' + percentage(unitsDone, TOTAL_UNITS) + '% of all textbook units</div></div>' +
        '<div class="stat"><div class="stat-label">' + icon("practice") + ' MCQ accuracy</div><div class="stat-value">' + (mcqAll.accuracy == null ? "—" : mcqAll.accuracy + "%") + '</div><div class="stat-hint">' + (mcqAll.attempted ? formatNumber(mcqAll.attempted) + " " + plural(mcqAll.attempted, "question") + " logged" : "No practice logged yet") + '</div></div>' +
      '</section>' +

      (backup ? renderBackupBanner(backup) : "") +

      renderStartHere(today, template, portions, day) +

      '<div class="today-grid">' +
        '<div class="today-main">' +
          '<section class="card card-padded daily-card" id="daily-card">' +
            '<div class="section-head">' +
              '<div><span class="eyebrow">Daily operating system · Week ' + week + '</span><h2>' + esc(formatLongDate(today)) + '</h2><p>' + esc(templateLabel(today)) + ' · ' + template.length + ' actions' + (isToday ? "" : " · historical log") + '</p></div>' +
              '<div class="day-switcher">' +
                '<button type="button" data-action="day-prev" aria-label="Previous day">' + icon("chevron-left") + '</button>' +
                '<button type="button" class="day-label" data-action="day-today" title="Jump to today">' + (isToday ? "Today · " : "") + esc(formatDayMonth(today)) + '</button>' +
                '<button type="button" data-action="day-next" aria-label="Next day">' + icon("chevron-right") + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="day-completion">' + progressBar(progress.pct) + '<span>' + progress.done + " / " + progress.total + '</span></div>' +
            renderDailySchedule(today, portions) +
            '<p class="tiny muted" style="margin:17px 0 0;padding-top:12px;border-top:1px solid var(--line-soft)">Option B: lights out by 1:00, sleep to 5:20, nap 90 minutes. The plan protects the assets that encode the work.</p>' +
          '</section>' +
        '</div>' +
        '<aside class="today-side">' +
          '<section class="next-move">' +
            '<span class="eyebrow">Next best move</span>' +
            '<h3 class="next-move-title">' + esc(nextMove.title) + '</h3>' +
            '<p>' + esc(nextMove.description) + '</p>' +
            '<div class="next-move-meta">' + nextMove.meta.map((item) => '<span class="badge badge-ghost">' + esc(item) + '</span>').join("") + '</div>' +
            '<div class="next-move-foot">' +
              '<a class="btn btn-primary btn-small" href="' + nextMove.href + '">' + esc(nextMove.cta) + ' ' + icon("arrow-right") + '</a>' +
              '<span class="tiny">' + esc(nextMove.duration) + '</span>' +
            '</div>' +
          '</section>' +
          (showCalibration ? renderCalibrationMini() : "") +
          renderDueCard() +
          renderReadingQueue() +
          renderQuickLog() +
          renderWeekSpine() +
        '</aside>' +
      '</div>';
  }

  /* ==========================================================================
     Journey
     ========================================================================== */

  function tierBadge(unit) {
    if (unit.skills) {
      return '<span class="tier tier-skills" title="Skills unit · frequency beats memorisation">Skills</span>';
    }
    const labels = {
      1: { label: "T1", title: "Tier 1 · deep treatment" },
      2: { label: "T2", title: "Tier 2 · standard treatment" },
      3: { label: "T3", title: "Tier 3 · survey pass" },
    };
    const tier = labels[unit.tier] || labels[2];
    return '<span class="tier tier-' + unit.tier + '" title="' + esc(tier.title) + '">' + tier.label + "</span>";
  }

  function unitHasDueRevisit(unitId) {
    const record = unitRecord(unitId);
    const completedOn = firstPassDate(unitId);
    if (!completedOn) return false;
    const today = todayISO();
    return REVISITS.some((revisit) => {
      if (record && record.revisits && record.revisits[revisit.key]) return false;
      return daysBetween(addDays(completedOn, revisit.offset), today) >= 0;
    });
  }

  function renderPhaseRail(selectedWeek) {
    const week = currentWeekNo();
    return '' +
      '<div class="phase-rail-wrap">' +
        '<div class="phase-rail" role="list" aria-label="Six phases of the plan">' +
          DATA.phases.map((phase) => {
            const active = selectedWeek >= phase.startWeek && selectedWeek <= phase.endWeek;
            const done = phase.endWeek < week;
            const range = phase.startWeek === phase.endWeek
              ? "Week " + phase.startWeek
              : "Weeks " + phase.startWeek + "–" + phase.endWeek;
            return '' +
              '<button type="button" role="listitem" class="phase-step' + (active ? " active" : "") + (done ? " done" : "") + '" data-action="select-week" data-week="' + phase.startWeek + '" aria-pressed="' + active + '">' +
                '<span class="phase-number">' + esc(range) + '</span>' +
                '<h3>' + esc(phase.name) + '</h3>' +
                '<span class="phase-weeks">' + esc(phase.dates) + '</span>' +
                '<p>' + esc(phase.mission) + '</p>' +
              '</button>';
          }).join("") +
        '</div>' +
      '</div>';
  }

  function renderWeekGrid() {
    const week = currentWeekNo();
    return '' +
      '<section class="card week-map-card" aria-label="The 30-week map">' +
        '<div class="week-map-head">' +
          '<div><span class="eyebrow">The whole route</span><h2>Thirty weeks, one job each.</h2><p>Select any week to see the units, standards, and minimums. Gold dots mark mock weeks.</p></div>' +
          '<div class="week-legend">' +
            '<span><i class="legend-dot"></i> Mock</span>' +
            '<span><i class="legend-box"></i> Select</span>' +
            '<span><i class="legend-box" style="background:var(--forest);border-color:var(--forest)"></i> Selected</span>' +
          '</div>' +
        '</div>' +
        '<div class="week-grid">' +
          DATA.weeks.map((item) => {
            const progress = weekGridProgress(item.n);
            const mock = DATA.mocks.find((candidate) => candidate.week === item.n);
            const classes = ["week-cell"];
            if (item.n === week) classes.push("current");
            if (item.n < week) classes.push("past");
            if (item.n === ui.selectedWeek) classes.push("selected");
            return '' +
              '<button type="button" class="' + classes.join(" ") + '" data-action="select-week" data-week="' + item.n + '" aria-label="Week ' + item.n + ": " + esc(item.focus) + '">' +
                '<span class="week-number">' + item.n + '</span>' +
                '<span class="week-month">' + esc(weekMonthLabel(item.n)) + '</span>' +
                (mock ? '<span class="mock-mark" title="' + esc(mock.name) + '"></span>' : "") +
                '<span class="week-mini-track" aria-hidden="true"><span style="width:' + progress.pct + '%"></span></span>' +
              '</button>';
          }).join("") +
        '</div>' +
      '</section>';
  }

  function renderJourneyUnit(unit) {
    const status = unitStatus(unit);
    const statusClass = status === "complete" ? "done" : status === "in-progress" ? "partial" : "";
    return '' +
      '<a class="week-unit" href="' + isoPath("books", unit.bookId, unit.id) + '" style="--subject-color:' + unit.subject.color + '">' +
        '<span class="week-unit-mark"></span>' +
        '<span class="week-unit-copy"><strong>' + esc(unit.name) + '</strong><span>' + esc(unit.book.title) + " · G" + unit.book.grade + " · " + (unit.skills ? "Skills" : "Tier " + unit.tier) + '</span></span>' +
        tierBadge(unit) +
        '<span class="unit-status ' + statusClass + '" aria-label="' + esc(status.replace("-", " ")) + '"></span>' +
        icon("chevron-right") +
      '</a>';
  }

  function renderWeekTasks(week) {
    const tasks = weeklyTaskDefinitions(week);
    const record = weekData(week);
    return tasks.map((task) => {
      const done = Boolean(record.tasks[task.id]);
      return '' +
        '<label class="week-task' + (done ? " done" : "") + '">' +
          '<input type="checkbox" data-week-task="' + esc(task.id) + '" data-week="' + week + '"' + (done ? " checked" : "") + '>' +
          '<span class="week-task-copy"><strong>' + esc(task.title) + '</strong><small>' + esc(task.detail) + '</small></span>' +
          '<span class="badge badge-ghost">' + esc(task.group) + '</span>' +
        '</label>';
    }).join("");
  }

  function renderWeeklyMinimums(week) {
    const record = weekData(week);
    const stats = weeklyMinimumStats(week);
    return '' +
      '<div class="minimums">' +
        '<div class="week-subhead"><h3>Weekly minimums</h3><span>Hours</span></div>' +
        DATA.weeklyMinimums.map((item) => {
          const value = record.minimums[item.id];
          const actual = Number(value) || 0;
          const met = actual >= item.target;
          return '' +
            '<div class="minimum-row" title="' + esc(item.why) + '">' +
              '<label for="minimum-' + esc(item.id) + '">' + esc(item.title) + '</label>' +
              '<span class="minimum-target">' + item.target + ' h</span>' +
              '<input id="minimum-' + esc(item.id) + '" type="number" min="0" max="40" step="0.25" inputmode="decimal" placeholder="0" value="' + (value == null ? "" : esc(value)) + '" data-week-minimum="' + esc(item.id) + '" data-week="' + week + '">' +
              '<span class="minimum-status' + (met ? " met" : "") + '">' + (value == null || value === "" ? "—" : met ? "Met" : Math.round((actual / item.target) * 100) + "%") + '</span>' +
            '</div>';
        }).join("") +
        '<div class="minimums-total"><span>' + stats.met + " of " + stats.count + ' minimums met</span><strong>' + Number(stats.totalActual.toFixed(2)) + " / " + stats.totalTarget + ' h</strong></div>' +
      '</div>';
  }

  function renderCalibrationFull() {
    const progress = setupProgress();
    const groups = [];
    DATA.calibration.forEach((item) => {
      let group = groups.find((candidate) => candidate.name === item.group);
      if (!group) {
        group = { name: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });
    return '' +
      '<section class="card card-padded" id="calibration" style="margin-top:22px">' +
        '<div class="section-head">' +
          '<div><span class="eyebrow">Week 1 · calibration</span><h2>Build the instrument before you trust it.</h2><p>Six diagnostics, six exam maps, and four operating tools. Nothing later works without this evidence.</p></div>' +
          '<span class="badge badge-gold">' + progress.done + " / " + progress.total + '</span>' +
        '</div>' +
        '<div class="calibration-progress">' + progressBar(progress.pct, "gold") + '<span>' + progress.pct + '%</span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:20px">' +
          groups.map((group) => {
            const done = group.items.filter((item) => state.setup[item.id]).length;
            return '' +
              '<div class="pass-block">' +
                '<div class="pass-label">' + esc(group.name) + '<span>' + done + " / " + group.items.length + '</span></div>' +
                '<div class="pass-list">' +
                  group.items.map((item) => {
                    const complete = Boolean(state.setup[item.id]);
                    return '' +
                      '<label class="pass-item' + (complete ? " done" : "") + '">' +
                        '<input type="checkbox" data-setup-item="' + esc(item.id) + '"' + (complete ? " checked" : "") + '>' +
                        '<span class="pass-copy"><strong>' + esc(item.title) + '</strong><small>' + esc(item.detail) + (complete ? " · " + esc(formatDateShort(state.setup[item.id])) : "") + '</small></span>' +
                      '</label>';
                  }).join("") +
                '</div>' +
              '</div>';
          }).join("") +
        '</div>' +
        '<p class="tiny muted" style="margin:18px 0 0;padding-top:13px;border-top:1px solid var(--line-soft)">The baseline sheet becomes the first column of the score ladder. Do not skip the diagnostics because they feel uncomfortable; they are the only honest starting line you will get.</p>' +
      '</section>';
  }

  function renderWeekReadingLoad(week) {
    const stats = weekPortionStats(week);
    if (!stats.total) return "";
    const focus = weekFocusMinutes(week);
    const spill = stats.spill;
    const copy = spill
      ? stats.total + " portions across " + stats.units.length + " " + plural(stats.units.length, "unit") + " meet " + stats.blocks + " reading blocks. " + spill + " will carry into the next week if every block is not protected."
      : stats.total + " portions across " + stats.units.length + " " + plural(stats.units.length, "unit") + " fit inside " + stats.blocks + " reading blocks. The week can absorb the pages.";
    return '' +
      '<div class="reading-load' + (spill ? " is-heavy" : "") + '">' +
        '<div class="reading-load-head">' +
          '<div><span class="eyebrow">Reading load</span><strong>' + stats.read + " of " + stats.total + ' portions read</strong></div>' +
          '<span class="badge ' + (stats.remaining === 0 ? "badge-green" : spill ? "badge-clay" : "badge-ghost") + '">' + (stats.remaining === 0 ? "Clear" : "~" + formatHours(stats.minutes / 60)) + '</span>' +
        '</div>' +
        progressBar(percentage(stats.read, stats.total)) +
        '<p>' + esc(copy) + '</p>' +
        '<div class="reading-load-meta">' +
          '<span>' + stats.blocks + ' reading blocks</span>' +
          '<span>' + stats.total + ' portions</span>' +
          '<span>Focus logged ' + (focus > 0 ? formatHours(focus / 60) : "—") + '</span>' +
        '</div>' +
        (spill ? '<p class="reading-load-warning">' + icon("alert") + ' The weekend backlog blocks are part of the count. Losing one moves pages into the next week, not out of the plan.</p>' : "") +
      '</div>';
  }

  function renderJourney() {
    const week = clamp(ui.selectedWeek, 1, 30);
    const meta = WEEK_META[week] || DATA.weeks[0];
    const phase = phaseForWeek(week);
    const newUnits = unitsForWeek(week);
    const revisionUnits = ALL_UNITS
      .filter((unit) => getRevisionWeek(unit) <= week && !isUnitFullyRevised(unit.id))
      .sort((a, b) => getRevisionWeek(a) - getRevisionWeek(b));
    const showRevision = newUnits.length === 0;
    const listedUnits = showRevision ? revisionUnits.slice(0, 10) : newUnits;
    const taskProgress = weekTaskProgress(week);
    const mock = meta.mockId ? MOCK_BY_ID[meta.mockId] : null;
    const review = weekData(week).review;
    const reviewFilled = Object.keys(review).filter((key) => typeof review[key] === "string" && review[key].trim()).length;

    return '' +
      pageHead(
        "The 30-week route",
        "Journey",
        "The whole plan, week by week. Every unit has a target week; every week has a spine you do not trade away.",
        '<button type="button" class="btn btn-secondary btn-small" data-action="select-week" data-week="' + currentWeekNo() + '">This week</button>' +
        '<button type="button" class="btn btn-gold btn-small" data-action="select-week" data-week="1">' + icon("target") + ' Calibration</button>'
      ) +
      renderPhaseRail(week) +
      renderWeekGrid() +
      '<section class="week-detail">' +
        '<div class="week-detail-hero">' +
          '<div>' +
            '<span class="eyebrow">Week ' + week + " · " + esc(phase.name) + " · " + esc(weekRangeLabel(week)) + '</span>' +
            '<h2>' + esc(meta.focus) + '</h2>' +
            '<p>' + esc(phase.mission) + '</p>' +
            '<div class="week-hero-meta" style="margin-top:13px">' +
              '<span class="badge badge-ghost">' + esc(meta.assessment) + '</span>' +
              (meta.milestone ? '<span class="badge badge-gold">' + esc(meta.milestone) + '</span>' : "") +
              (mock ? '<span class="badge badge-clay">' + esc(mock.name) + '</span>' : "") +
            '</div>' +
          '</div>' +
          '<div class="week-nav" aria-label="Week navigation">' +
            '<button type="button" class="icon-button" data-action="week-step" data-delta="-1"' + (week <= 1 ? " disabled" : "") + ' aria-label="Previous week">' + icon("chevron-left") + '</button>' +
            '<button type="button" class="icon-button" data-action="week-step" data-delta="1"' + (week >= 30 ? " disabled" : "") + ' aria-label="Next week">' + icon("chevron-right") + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="week-body">' +
          '<div class="week-column">' +
            '<div class="week-subhead"><h3>' + (showRevision ? "Revision queue" : "Scheduled units") + '</h3><span>' + (showRevision ? revisionUnits.length + " outstanding" : newUnits.length + " " + plural(newUnits.length, "unit")) + '</span></div>' +
            (listedUnits.length
              ? '<div class="week-units">' + listedUnits.map(renderJourneyUnit).join("") + '</div>'
              : '<div class="empty-state" style="min-height:130px"><strong>No new units this week.</strong><p>The books are complete. The work is revision, evidence, and timing.</p></div>') +
            (showRevision && revisionUnits.length > listedUnits.length
              ? '<p class="tiny muted" style="margin:10px 0 0">And ' + (revisionUnits.length - listedUnits.length) + ' more in the revision queue. Use the Books page to work through the rest.</p>'
              : "") +
            renderWeekReadingLoad(week) +
            '<div class="week-assessment">' +
              '<span>Assessment</span>' +
              '<strong>' + esc(meta.assessment) + '</strong>' +
              (meta.milestone ? '<small>Milestone · ' + esc(meta.milestone) + '</small>' : '<small>Exact timing. No notes. Log the evidence.</small>') +
            '</div>' +
            (mock
              ? '<button type="button" class="btn btn-primary btn-small" style="margin-top:12px" data-action="open-test-modal" data-mock="' + esc(mock.id) + '">' + icon("practice") + ' Log ' + esc(mock.name) + '</button>'
              : "") +
            (DATA.revisionFocus[week]
              ? '<div class="week-review-focus"><span>Revision focus</span><p>' + esc(DATA.revisionFocus[week]) + '</p></div>'
              : "") +
            (week === 1 ? '' : '<a class="text-button" href="' + isoPath("reflect", week) + '" style="margin-top:18px">Open the Week ' + week + ' review · ' + reviewFilled + '/10 answered ' + icon("arrow-right") + '</a>') +
          '</div>' +
          '<div class="week-column">' +
            '<div class="week-subhead"><h3>The weekly spine</h3><span>' + taskProgress.done + " / " + taskProgress.total + '</span></div>' +
            '<div class="week-tasks">' + renderWeekTasks(week) + '</div>' +
            renderWeeklyMinimums(week) +
            '<div class="week-review-focus" style="margin-top:22px"><span>Why the minimums exist</span><p>They are minimums, not maximums. If you finish early, stop or bank the time as buffer. Do not fill every minute because the plan says so.</p></div>' +
          '</div>' +
        '</div>' +
      '</section>' +
      (week === 1 ? renderCalibrationFull() : "");
  }

  /* ==========================================================================
     Books
     ========================================================================== */

  function renderSubjectFilterChips() {
    const options = [{ id: "all", name: "All subjects" }].concat(SUBJECTS.filter((subject) => subject.id !== "aptitude"));
    return options.map((subject) => (
      '<button type="button" class="filter-chip' + (ui.booksSubject === subject.id ? " active" : "") + '" data-action="filter-books-subject" data-subject="' + subject.id + '">' + esc(subject.name) + '</button>'
    )).join("");
  }

  function bookMatchesFilters(book) {
    if (ui.booksSubject !== "all" && book.subject !== ui.booksSubject) return false;
    if (ui.booksGrade !== "all" && String(book.grade) !== String(ui.booksGrade)) return false;
    if (ui.booksStatus === "not-started" && bookStarted(book)) return false;
    if (ui.booksStatus === "in-progress" && (!bookStarted(book) || bookComplete(book))) return false;
    if (ui.booksStatus === "complete" && !bookComplete(book)) return false;
    if (ui.booksStatus === "due" && !bookHasDueRevisits(book)) return false;
    return true;
  }

  function renderBookCard(book) {
    const subject = SUBJECT_BY_ID[book.subject];
    const progress = bookProgress(book);
    const due = getDueRevisits(todayISO(), { bookId: book.id }).length;
    return '' +
      '<a class="book-card" href="' + isoPath("books", book.id) + '" style="--subject-color:' + subject.color + ";--subject-tint:" + subject.tint + ';">' +
        '<div class="book-card-top">' +
          '<span class="book-grade">Grade ' + book.grade + '</span>' +
          '<span class="book-pages">' + formatNumber(book.pages) + ' pages</span>' +
        '</div>' +
        '<h3>' + esc(book.title) + '</h3>' +
        '<p class="book-sub">' + book.units.length + " " + plural(book.units.length, "unit") + " · " + esc(subject.paper) + '</p>' +
        '<div class="book-card-foot">' +
          '<div class="book-progress-copy"><span>' + progress.completed + " of " + progress.total + ' units built</span><strong>' + progress.pct + '%</strong>' + icon("arrow-up-right", "book-arrow") + '</div>' +
          '<div class="book-progress-track"><span style="width:' + progress.pct + '%"></span></div>' +
          (due ? '<span class="badge badge-clay" style="margin-top:9px">' + due + " retrieval " + plural(due, "check") + ' due</span>' : "") +
        '</div>' +
      '</a>';
  }

  function renderBooksIndex() {
    const filtered = BOOKS.filter(bookMatchesFilters);
    const allRevisits = getDueRevisits(todayISO());
    return '' +
      pageHead(
        "Twenty books · Grades 9–12",
        "The library",
        "Every unit is mapped, tiered, and scheduled. Completion means four build passes plus spaced retrieval, not a page count.",
        '<button type="button" class="btn btn-secondary btn-small" data-action="clear-book-filters">Reset filters</button>'
      ) +
      '<section class="books-summary" aria-label="Library summary">' +
        '<div class="books-summary-main"><span class="monogram">20</span><div><strong>Twenty books. One score.</strong><span>' + formatNumber(TOTAL_PAGES) + ' pages · ' + TOTAL_UNITS + ' units · 30 weeks</span></div></div>' +
        '<div class="books-summary-stat"><span>Units built</span><strong>' + completedUnitCount() + " / " + TOTAL_UNITS + '</strong></div>' +
        '<div class="books-summary-stat"><span>Fully revised</span><strong>' + revisedUnitCount() + " / " + TOTAL_UNITS + '</strong></div>' +
        '<div class="books-summary-stat"><span>Retrieval due</span><strong>' + allRevisits.length + '</strong></div>' +
      '</section>' +
      '<div class="books-toolbar">' +
        '<div class="filter-chips" role="group" aria-label="Filter by subject">' + renderSubjectFilterChips() + '</div>' +
        '<div class="toolbar-selects">' +
          '<div class="select-wrap"><select data-book-grade-filter aria-label="Filter by grade">' +
            ["all", "9", "10", "11", "12"].map((grade) => '<option value="' + grade + '"' + (ui.booksGrade === grade ? " selected" : "") + '>' + (grade === "all" ? "All grades" : "Grade " + grade) + '</option>').join("") +
          '</select></div>' +
          '<div class="select-wrap"><select data-book-status-filter aria-label="Filter by book status">' +
            [["all", "All statuses"], ["not-started", "Not started"], ["in-progress", "In progress"], ["complete", "Build loop complete"], ["due", "Retrieval due"]].map((option) => '<option value="' + option[0] + '"' + (ui.booksStatus === option[0] ? " selected" : "") + '>' + option[1] + '</option>').join("") +
          '</select></div>' +
        '</div>' +
      '</div>' +
      (filtered.length
        ? '<div class="book-grid">' + filtered.map(renderBookCard).join("") + '</div>'
        : '<div class="empty-state"><strong>No books match these filters.</strong><p>The ledger is still there. Clear a filter or reset the view.</p><button type="button" class="btn btn-secondary btn-small" data-action="clear-book-filters">Reset filters</button></div>');
  }

  function renderPassItem(unit, pass, record) {
    const date = record && isPlainObject(record.passes) ? record.passes[pass.key] : null;
    return '' +
      '<label class="pass-item' + (date ? " done" : "") + '">' +
        '<input type="checkbox" data-unit-pass="' + esc(pass.key) + '" data-unit="' + esc(unit.id) + '"' + (date ? " checked" : "") + '>' +
        '<span class="pass-copy"><strong>' + esc(pass.label) + '</strong><small>' + esc(pass.detail) + (date ? " · " + esc(formatDateShort(date)) : "") + '</small></span>' +
      '</label>';
  }

  function renderRevisitItem(unit, revisit, record) {
    const completedOn = firstPassDate(unit.id);
    const date = record && isPlainObject(record.revisits) ? record.revisits[revisit.key] : null;
    const dueDate = completedOn ? addDays(completedOn, revisit.offset) : null;
    const overdueDays = dueDate ? daysBetween(dueDate, todayISO()) : null;
    const disabled = !completedOn;
    let dueCopy = "Available after the build loop";
    let dueClass = "";
    if (date) {
      dueCopy = "Completed " + formatDateShort(date);
    } else if (dueDate) {
      dueCopy = "Due " + formatDateShort(dueDate);
      if (overdueDays > 0) {
        dueCopy += " · " + overdueDays + "d overdue";
        dueClass = " overdue";
      } else if (overdueDays === 0) {
        dueCopy += " · today";
        dueClass = " overdue";
      }
    }
    return '' +
      '<label class="pass-item' + (date ? " done" : "") + (disabled ? " disabled" : "") + '">' +
        '<input type="checkbox" data-unit-revisit="' + esc(revisit.key) + '" data-unit="' + esc(unit.id) + '"' + (date ? " checked" : "") + (disabled ? " disabled" : "") + '>' +
        '<span class="pass-copy"><strong>' + esc(revisit.label) + '</strong><small>' + esc(revisit.detail) + '</small><small class="pass-due' + dueClass + '">' + esc(dueCopy) + '</small></span>' +
      '</label>';
  }

  function renderUnitReading(unit, record) {
    const range = unitPageRange(unit);
    const portions = unitPortions(unit);
    const progress = unitPortionProgress(unit);
    const custom = Boolean(range && range.custom);
    const rangeCopy = range
      ? "pp. " + range.start + "–" + range.end + " · " + formatNumber(range.end - range.start + 1) + " printed pages"
      : "No printed page range on file for this unit.";
    const editor = '' +
      '<form class="unit-page-range" data-form="page-range" data-unit="' + esc(unit.id) + '">' +
        '<span class="unit-page-range-label">Printed pages</span>' +
        '<input name="pageStart" type="number" min="1" max="3000" step="1" inputmode="numeric" aria-label="First printed page" placeholder="Start" value="' + (range ? range.start : "") + '">' +
        '<span class="unit-page-range-dash">–</span>' +
        '<input name="pageEnd" type="number" min="2" max="3000" step="1" inputmode="numeric" aria-label="Last printed page" placeholder="End" value="' + (range ? range.end : "") + '">' +
        '<button type="submit" class="btn btn-secondary btn-small">Save range</button>' +
        (custom ? '<button type="button" class="btn btn-ghost btn-small" data-action="reset-page-range" data-unit="' + esc(unit.id) + '">Restore contents page</button>' : "") +
      '</form>';
    const list = portions.length
      ? '<div class="unit-portions">' + portions.map((portion) => {
          const entry = portionReadEntry(unit.id, portion);
          return '' +
            '<label class="unit-portion' + (entry ? " is-read" : "") + '">' +
              '<input type="checkbox" data-portion-read data-portion-unit="' + esc(unit.id) + '" data-portion-start="' + portion.start + '" data-portion-end="' + portion.end + '"' + (entry ? " checked" : "") + '>' +
              '<span class="unit-portion-check">' + icon("check") + '</span>' +
              '<span class="unit-portion-copy"><strong>pp. ' + portion.start + '–' + portion.end + '</strong><span>Part ' + (portion.part + 1) + ' of ' + portion.total + ' · ~' + portion.minutes + ' min</span></span>' +
              '<span class="unit-portion-date">' + (entry ? esc(formatDateShort(entry.readAt)) : "") + '</span>' +
            '</label>';
        }).join("") + '</div>'
      : '<p class="unit-reading-empty">Set the printed range above and the unit will split into reading portions automatically.</p>';

    return '' +
      '<div class="unit-reading">' +
        '<div class="unit-reading-head">' +
          '<div><span class="eyebrow">Reading map</span><h4>' + esc(rangeCopy) + '</h4></div>' +
          '<span class="badge ' + (progress.total && progress.read === progress.total ? "badge-green" : "badge-ghost") + '">' + progress.read + ' / ' + progress.total + ' portions</span>' +
        '</div>' +
        (progress.total ? progressBar(progress.pct) : "") +
        '<p class="unit-reading-note">Printed page numbers from the book’s contents page, not PDF pages. Check the first page before you trust the range' + (custom ? '. This unit uses a custom range.' : ".") + '</p>' +
        list +
        editor +
      '</div>';
  }

  function renderUnitPanel(unit) {
    const record = unitRecord(unit.id);
    const completedOn = firstPassDate(unit.id);
    const count = firstPassCount(unit.id);
    const next = unitNextPass(unit);
    const revisionDone = isUnitFullyRevised(unit.id);
    const revisionWeek = getRevisionWeek(unit);
    return '' +
      '<div class="unit-panel" id="panel-' + esc(unit.id) + '">' +
        '<div class="unit-panel-head">' +
          '<p>Target week ' + unit.week + " · Revision week " + revisionWeek + " · " + (unit.skills ? "Skills unit" : "Tier " + unit.tier) + (completedOn ? " · Build loop closed " + esc(formatDateShort(completedOn)) : "") + '</p>' +
          '<button type="button" class="btn btn-secondary btn-small" data-action="open-practice-modal" data-date="' + todayISO() + '" data-subject="' + esc(unit.book.subject) + '" data-topic="' + esc(unit.name) + '">' + icon("practice") + ' Log practice</button>' +
        '</div>' +
        '<div class="pass-columns">' +
          '<div class="pass-block">' +
            '<div class="pass-label">Build passes<span>' + count + ' / ' + FIRST_PASS.length + '</span></div>' +
            '<div class="pass-list">' + FIRST_PASS.map((pass) => renderPassItem(unit, pass, record)).join("") + '</div>' +
          '</div>' +
          '<div class="pass-block">' +
            '<div class="pass-label">Spaced retrieval · the fifth pass<span>D+2 · D+7 · D+30</span></div>' +
            '<div class="pass-list">' + REVISITS.map((revisit) => renderRevisitItem(unit, revisit, record)).join("") + '</div>' +
          '</div>' +
        '</div>' +
        renderUnitReading(unit, record) +
        '<div class="unit-actions">' +
          '<span class="unit-actions-copy">' + (next ? "Next action: " + esc(next.label) + " — " + esc(next.detail) : completedOn ? "Build loop complete. Retrieval dates are now fixed." : "Start with the outcome questions, not page one.") + '</span>' +
          '<button type="button" class="btn ' + (revisionDone ? "btn-secondary" : "btn-primary") + ' btn-small" data-action="toggle-unit-revision" data-unit="' + esc(unit.id) + '">' + icon("check") + ' ' + (revisionDone ? "Final revision done · " + esc(formatDateShort(record.revision)) : "Mark final revision") + '</button>' +
        '</div>' +
      '</div>';
  }

  function renderUnitCard(unit) {
    const count = firstPassCount(unit.id);
    const status = unitStatus(unit);
    const open = ui.openUnits.has(unit.id);
    const due = unitHasDueRevisit(unit.id);
    return '' +
      '<article class="unit-card' + (open ? " open" : "") + '">' +
        '<button type="button" class="unit-summary" data-action="toggle-unit" data-unit="' + esc(unit.id) + '" aria-expanded="' + open + '" aria-controls="panel-' + esc(unit.id) + '">' +
          '<span class="unit-number">' + unit.no + '</span>' +
          '<span class="unit-summary-copy"><strong>' + esc(unit.name) + '</strong><span>Target W' + unit.week + " · Revision W" + getRevisionWeek(unit) + (due ? " · Retrieval due" : "") + '</span></span>' +
          tierBadge(unit) +
          '<span class="unit-summary-progress">' + progressBar((count / FIRST_PASS.length) * 100) + '<span>' + count + '/4</span></span>' +
          icon("chevron-down", "unit-chevron") +
        '</button>' +
        (open ? renderUnitPanel(unit) : "") +
      '</article>';
  }

  function renderBookDetail(book) {
    const subject = SUBJECT_BY_ID[book.subject];
    const progress = bookProgress(book);
    const due = getDueRevisits(todayISO(), { bookId: book.id });
    const units = book.units.map((unit) => UNIT_BY_ID[unit.id]);
    const filters = [
      { id: "all", label: "All units" },
      { id: "not-started", label: "Not started" },
      { id: "in-progress", label: "In progress" },
      { id: "complete", label: "Built" },
      { id: "due", label: "Retrieval due" },
    ];
    const filtered = units.filter((unit) => {
      if (ui.bookUnitFilter === "all") return true;
      if (ui.bookUnitFilter === "due") return unitHasDueRevisit(unit.id);
      return unitStatus(unit) === ui.bookUnitFilter;
    });
    return '' +
      '<div class="book-toolbar"><a class="book-breadcrumb" href="#books">' + icon("chevron-left") + ' All books</a></div>' +
      '<section class="book-head" style="--subject-color:' + subject.color + ";--subject-tint:" + subject.tint + ';">' +
        '<div>' +
          '<span class="eyebrow">' + esc(subject.name) + " · Grade " + book.grade + '</span>' +
          '<h1>' + esc(book.title) + '</h1>' +
          '<div class="book-head-meta">' +
            '<span class="badge badge-ghost">Grade ' + book.grade + '</span>' +
            '<span class="badge badge-ghost">' + book.units.length + " " + plural(book.units.length, "unit") + '</span>' +
            '<span class="badge badge-ghost">' + formatNumber(book.pages) + ' pages</span>' +
            '<span class="badge badge-gold">' + esc(subject.paper) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="book-head-side">' +
          '<div class="book-head-stat"><span>Units built</span><strong>' + progress.completed + " / " + progress.total + '</strong></div>' +
          '<div class="book-head-stat"><span>Revised</span><strong>' + book.units.filter((unit) => isUnitFullyRevised(unit.id)).length + " / " + book.units.length + '</strong></div>' +
          '<div class="book-head-stat"><span>Due</span><strong>' + due.length + '</strong></div>' +
        '</div>' +
      '</section>' +
      '<div class="book-unit-toolbar">' +
        '<h2>Unit ledger</h2>' +
        '<div class="filter-chips" role="group" aria-label="Filter units">' +
          filters.map((filter) => {
            const filterCount = filter.id === "all"
              ? units.length
              : filter.id === "due"
                ? units.filter((unit) => unitHasDueRevisit(unit.id)).length
                : units.filter((unit) => unitStatus(unit) === filter.id).length;
            return '<button type="button" class="filter-chip' + (ui.bookUnitFilter === filter.id ? " active" : "") + '" data-action="filter-book-units" data-filter="' + filter.id + '">' + esc(filter.label) + ' · ' + filterCount + '</button>';
          }).join("") +
        '</div>' +
      '</div>' +
      (filtered.length
        ? '<div class="unit-list">' + filtered.map(renderUnitCard).join("") + '</div>'
        : '<div class="empty-state"><strong>No units in this state.</strong><p>The ledger is intact. Choose another filter to see the work.</p><button type="button" class="btn btn-secondary btn-small" data-action="filter-book-units" data-filter="all">Show every unit</button></div>') +
      '<p class="tiny muted" style="margin:18px 0 0">' + esc(subject.note) + ' Five passes: map, learn, prove, compress, revisit. Mark a pass only when the evidence exists.</p>';
  }

  function renderBooks(routeSegments) {
    const bookId = routeSegments && routeSegments[0];
    if (bookId && BOOK_BY_ID[bookId]) return renderBookDetail(BOOK_BY_ID[bookId]);
    return renderBooksIndex();
  }

  /* ==========================================================================
     Practice
     ========================================================================== */

  function escBreaks(value) {
    return esc(value).replace(/\n/g, "<br>");
  }

  function testDisplayName(test) {
    const mock = mockForTest(test);
    if (mock) return mock.name;
    return test.name || "Assessment";
  }

  function testKindLabel(test) {
    if (mockForTest(test)) return "Mock";
    if (test.kind === "diagnostic") return "Diagnostic";
    return "Subject test";
  }

  function testShortLabel(test) {
    const mock = mockForTest(test);
    if (mock) return mock.name.replace("Mock ", "M");
    const name = test.name || "Test";
    return name.length > 9 ? name.slice(0, 8) + "…" : name;
  }

  function renderTrajectoryChart() {
    const tests = sortTests().filter((test) => testScoreEntries(test).length).slice(-10);
    const points = tests.map((test) => ({
      pct: testOverallPct(test),
      label: testShortLabel(test),
      fullLabel: testDisplayName(test),
      date: test.date,
    }));
    let chart = "";
    if (!points.length) {
      chart = '' +
        '<div class="chart-empty">' + icon("practice") +
          '<strong>No evidence yet.</strong>' +
          '<span>Log your first subject test or mock. The line starts with one honest score, not a guess.</span>' +
        '</div>';
    } else {
      const W = 760;
      const H = 230;
      const padL = 31;
      const padR = 14;
      const top = 17;
      const bottom = 34;
      const plotW = W - padL - padR;
      const plotH = H - top - bottom;
      const xAt = (index) => points.length === 1 ? padL + plotW / 2 : padL + (index / (points.length - 1)) * plotW;
      const yAt = (value) => top + (1 - value / 100) * plotH;
      const line = points.map((point, index) => (index === 0 ? "M" : "L") + xAt(index).toFixed(1) + "," + yAt(point.pct).toFixed(1)).join(" ");
      const baseline = top + plotH;
      const area = points.length > 1 ? line + " L" + xAt(points.length - 1).toFixed(1) + "," + baseline + " L" + xAt(0).toFixed(1) + "," + baseline + " Z" : "";
      const gridlines = [0, 25, 50, 75, 100].map((value) => {
        const y = yAt(value);
        return '<line class="chart-gridline" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"></line>' +
          '<text class="chart-axis-label" x="' + (padL - 8) + '" y="' + (y + 3) + '" text-anchor="end">' + value + '</text>';
      }).join("");
      const dots = points.map((point, index) => {
        const x = xAt(index);
        const y = yAt(point.pct);
        const labelAnchor = points.length === 1 ? "middle" : index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
        return '<circle class="chart-dot labeled" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (index === points.length - 1 ? 4.2 : 3.2) + '"></circle>' +
          '<text class="chart-axis-label" x="' + x.toFixed(1) + '" y="' + (y - 9).toFixed(1) + '" text-anchor="middle" style="fill:var(--ink-soft);font-weight:700">' + point.pct + '%</text>' +
          '<text class="chart-axis-label" x="' + x.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="' + labelAnchor + '">' + esc(point.label) + '</text>';
      }).join("");
      chart = '' +
        '<svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Assessment percentages over the last ' + points.length + ' logged tests">' +
          '<defs><linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2f6b57" stop-opacity="0.30"></stop><stop offset="100%" stop-color="#2f6b57" stop-opacity="0"></stop></linearGradient></defs>' +
          gridlines +
          (area ? '<path class="chart-area" d="' + area + '"></path>' : "") +
          (points.length > 1 ? '<path class="chart-line" d="' + line + '"></path>' : "") +
          dots +
        '</svg>';
    }
    return '' +
      '<section class="card chart-card">' +
        '<div class="chart-head">' +
          '<div><span class="eyebrow">Score evidence</span><h3>Assessment trajectory</h3><p>Last ' + points.length + ' logged ' + plural(points.length, "assessment") + '. A line, not a verdict.</p></div>' +
          '<div class="chart-head-actions"><button type="button" class="btn btn-secondary btn-small" data-action="open-test-modal">' + icon("plus") + ' Log test</button></div>' +
        '</div>' +
        '<div class="chart-wrap">' + chart + '</div>' +
        '<div class="chart-legend"><span><i></i>Overall percentage</span><span><i class="gold"></i>Latest point highlighted</span></div>' +
      '</section>';
  }

  function renderScoreLadder() {
    return '' +
      '<section class="card scorecard">' +
        '<h3>The score ladder</h3>' +
        '<p>Every paper is 100 marks. Update this table with real evidence, never with hope.</p>' +
        '<table class="score-table" aria-label="Scores by paper">' +
          '<thead><tr><th>Paper</th><th>Latest</th><th>Best</th><th>Δ</th><th>Target</th></tr></thead>' +
          '<tbody>' +
            SUBJECTS.map((subject) => {
              const history = subjectScoreHistory(subject.id);
              const latest = history.length ? history[history.length - 1] : null;
              const first = history.length ? history[0] : null;
              const best = history.length ? Math.max.apply(null, history.map((entry) => entry.pct)) : null;
              const change = latest && first ? latest.pct - first.pct : null;
              return '' +
                '<tr>' +
                  '<td><span class="subject-cell"><i style="background:' + subject.color + '"></i>' + esc(subject.name) + '</span></td>' +
                  '<td>' + (latest ? latest.pct : '<span class="score-muted">—</span>') + '</td>' +
                  '<td>' + (best == null ? '<span class="score-muted">—</span>' : best) + '</td>' +
                  '<td>' + (change == null ? '<span class="score-muted">—</span>' : '<span class="score-change ' + (change > 0 ? "up" : change < 0 ? "down" : "") + '">' + (change > 0 ? "+" : change < 0 ? "−" : "") + Math.abs(change) + '</span>') + '</td>' +
                  '<td>' + state.settings.targetScore + '</td>' +
                '</tr>';
            }).join("") +
          '</tbody>' +
        '</table>' +
        '<p class="tiny muted" style="margin:13px 0 0">Target band: 80–85% average, no subject below 60%, English and Aptitude above 80%.</p>' +
      '</section>';
  }

  function renderUpcomingMocks() {
    return '' +
      '<section class="card card-padded">' +
        '<div class="section-head">' +
          '<div><span class="eyebrow">Seven checkpoints</span><h3>The mock ladder</h3><p>Log the score and then autopsy it. A mock you do not study is only a scare.</p></div>' +
        '</div>' +
        '<div class="upcoming-list">' +
          DATA.mocks.map((mock) => {
            const logged = state.tests.find((test) => test.mockId === mock.id);
            const pct = logged ? testOverallPct(logged) : null;
            const date = mockDate(mock);
            const isPast = daysBetween(date, todayISO()) > 0;
            const badgeClass = logged ? "badge-green" : isPast ? "badge-clay" : "badge-gold";
            return '' +
              '<div class="upcoming-mock" title="' + esc(mock.purpose) + '">' +
                '<div class="upcoming-date"><strong>' + parseISODate(date).getDate() + '</strong><span>' + MONTH_SHORT[parseISODate(date).getMonth()] + '</span></div>' +
                '<div class="upcoming-copy"><strong>' + esc(mock.name) + " · W" + mock.week + '</strong><span>' + esc(mock.papers.map((id) => SUBJECT_BY_ID[id].short).join(" · ")) + ' · ' + esc(formatDateShort(date)) + '</span></div>' +
                '<button type="button" class="badge ' + badgeClass + '" data-action="open-test-modal" data-mock="' + esc(mock.id) + '" title="' + (logged ? "Open this mock record" : "Log this mock") + '">' + (logged ? (pct == null ? "Logged" : pct + "%") : "Log") + '</button>' +
              '</div>';
          }).join("") +
        '</div>' +
        '<a class="text-button" href="' + isoPath("journey", currentWeekNo()) + '" style="margin-top:13px">Open the current week ' + icon("arrow-right") + '</a>' +
      '</section>';
  }

  function renderRecentMcqLogs() {
    const logs = allMcqLogs().slice(0, 8);
    return '' +
      '<section class="card card-padded">' +
        '<div class="section-head">' +
          '<div><span class="eyebrow">Daylight evidence</span><h3>Recent practice</h3><p>Timed questions. Correct answers. Accurate logs.</p></div>' +
          '<button type="button" class="btn btn-secondary btn-small" data-action="open-practice-modal">' + icon("plus") + ' Log</button>' +
        '</div>' +
        (logs.length
          ? '<div class="log-list">' + logs.map((log) => {
            const subject = SUBJECT_BY_ID[log.subject] || SUBJECTS[0];
            const accuracy = log.count ? Math.round((Number(log.correct) / Number(log.count)) * 100) : 0;
            return '' +
              '<div class="log-row">' +
                '<span class="log-row-mark" style="background:' + subject.color + '"></span>' +
                '<div class="log-row-copy"><strong>' + esc(log.topic || subject.name) + '</strong><span>' + esc(subject.short) + " · " + esc(formatDateShort(log.date)) + (log.source ? " · " + esc(log.source) : "") + '</span></div>' +
                '<div class="log-row-value">' + Number(log.correct) + "/" + Number(log.count) + ' <small>' + accuracy + '%</small></div>' +
                '<button type="button" class="row-delete" data-action="delete-mcq" data-date="' + esc(log.date) + '" data-log="' + esc(log.id) + '" aria-label="Delete this practice log">' + icon("trash") + '</button>' +
              '</div>';
          }).join("") + '</div>'
          : '<div class="empty-state" style="min-height:150px">' + icon("practice") + '<strong>No practice logged.</strong><p>One timed set today is worth more than a plan to start tomorrow.</p><button type="button" class="btn btn-primary btn-small" data-action="open-practice-modal">Log the first set</button></div>') +
      '</section>';
  }

  function renderAssessmentLog() {
    const tests = sortTests().slice().reverse().slice(0, 8);
    return '' +
      '<section class="card card-padded">' +
        '<div class="section-head">' +
          '<div><span class="eyebrow">The record</span><h3>Assessment log</h3><p>Scores first. Autopsy second. The sequence matters.</p></div>' +
          '<button type="button" class="btn btn-secondary btn-small" data-action="open-test-modal">' + icon("plus") + ' Log test</button>' +
        '</div>' +
        (tests.length
          ? '<div class="log-list">' + tests.map((test) => {
            const pct = testOverallPct(test);
            const entries = testScoreEntries(test);
            const mock = mockForTest(test);
            return '' +
              '<div class="log-row is-assessment">' +
                '<span class="log-row-mark" style="background:' + (mock ? "var(--gold)" : "var(--forest-soft)") + '"></span>' +
                '<div class="log-row-copy"><strong>' + esc(testDisplayName(test)) + '</strong><span>' + esc(formatDateShort(test.date)) + " · " + esc(testKindLabel(test)) + " · " + entries.length + " " + plural(entries.length, "paper") + '</span></div>' +
                '<div class="log-row-value">' + (pct == null ? "—" : pct + "%") + '</div>' +
                '<div class="error-actions">' +
                  (mock ? '<button type="button" class="btn btn-ghost btn-small" data-action="open-autopsy-modal" data-test="' + esc(test.id) + '">' + (test.autopsySavedAt ? "Autopsy" : "Autopsy due") + '</button>' : "") +
                  '<button type="button" class="btn btn-ghost btn-small" data-action="edit-test" data-test="' + esc(test.id) + '">Edit</button>' +
                  '<button type="button" class="row-delete" data-action="delete-test" data-test="' + esc(test.id) + '" aria-label="Delete this assessment">' + icon("trash") + '</button>' +
                '</div>' +
              '</div>';
          }).join("") + '</div>'
          : '<div class="empty-state" style="min-height:150px">' + icon("target") + '<strong>No assessments logged.</strong><p>The first diagnostic turns a vague fear into a number you can work on.</p><button type="button" class="btn btn-primary btn-small" data-action="open-test-modal">Log a test</button></div>') +
      '</section>';
  }

  function renderPracticeOverview() {
    const mcq = allMcqStats();
    const mocks = mockTests();
    const repeat = errorRepeatRate();
    return '' +
      '<section class="practice-stats" aria-label="Practice statistics">' +
        '<div class="practice-stat"><span>MCQ accuracy</span><strong>' + (mcq.accuracy == null ? "—" : mcq.accuracy + "%") + '</strong><em>' + (mcq.attempted ? formatNumber(mcq.attempted) + " " + plural(mcq.attempted, "question") + " logged" : "No questions logged") + '</em></div>' +
        '<div class="practice-stat"><span>Assessments</span><strong>' + sortTests().length + '<small>total</small></strong><em>' + mocks.length + " of 7 mocks logged</em></div>" +
        '<div class="practice-stat"><span>Mock average</span><strong>' + (mockAverage() == null ? "—" : mockAverage() + "%") + '</strong><em>Last three mocks</em></div>' +
        '<div class="practice-stat"><span>Repeat errors</span><strong>' + (repeat == null ? "—" : repeat + "%") + '</strong><em>' + (repeat == null ? "Build the error log" : repeat < 20 ? "Below the 20% target" : "Above the 20% target") + '</em></div>' +
      '</section>' +
      '<div class="practice-grid">' +
        '<div class="practice-main">' +
          renderTrajectoryChart() +
          renderScoreLadder() +
          renderAssessmentLog() +
          renderRecentMcqLogs() +
        '</div>' +
        '<aside class="practice-side">' +
          renderUpcomingMocks() +
          '<section class="card card-padded">' +
            '<span class="eyebrow">The conversion standard</span>' +
            '<h3 style="margin:7px 0 8px">What “ready” means</h3>' +
            '<div class="about-list">' +
              '<div class="about-row"><span>Target average</span><strong>80–85%</strong></div>' +
              '<div class="about-row"><span>Lowest subject</span><strong>Not below 60%</strong></div>' +
              '<div class="about-row"><span>Repeat errors</span><strong>Below 20%</strong></div>' +
              '<div class="about-row"><span>English + Aptitude</span><strong>Above 80% each</strong></div>' +
              '<div class="about-row"><span>Current target setting</span><strong>' + state.settings.targetScore + '%</strong></div>' +
            '</div>' +
            '<p class="tiny muted" style="margin:14px 0 0">Accuracy without speed is useless. Every set is timed from Week 1.</p>' +
          '</section>' +
          renderDueCard() +
        '</aside>' +
      '</div>';
  }

  function errorIsDue(error) {
    return error.status !== "resolved" && isISODate(error.retestDate) && daysBetween(error.retestDate, todayISO()) >= 0;
  }

  function filteredErrors() {
    const filters = ui.errorFilters;
    const list = state.errors.filter((error) => {
      if (filters.status === "open" && error.status === "resolved") return false;
      if (filters.status === "resolved" && error.status !== "resolved") return false;
      if (filters.status === "due" && !errorIsDue(error)) return false;
      if (filters.subject !== "all" && error.subjectId !== filters.subject) return false;
      if (filters.cause !== "all" && error.cause !== filters.cause) return false;
      return true;
    });
    return list.sort((a, b) => {
      const aDue = errorIsDue(a) ? 1 : 0;
      const bDue = errorIsDue(b) ? 1 : 0;
      if (aDue !== bDue) return bDue - aDue;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function renderErrorCard(error) {
    const subject = SUBJECT_BY_ID[error.subjectId] || SUBJECTS[0];
    const cause = CAUSE_BY_KEY[error.cause] || CAUSES[0];
    const due = errorIsDue(error);
    const resolved = error.status === "resolved";
    const retestCopy = resolved
      ? "Resolved" + (error.resolvedAt ? " · " + formatDateShort(error.resolvedAt) : "")
      : due
        ? "Retest due"
        : error.retestDate
          ? "Retest " + formatDateShort(error.retestDate)
          : "No retest date";
    return '' +
      '<article class="error-card' + (resolved ? " resolved" : "") + '">' +
        '<div class="error-card-main">' +
          '<span class="cause-code cause-' + esc(String(error.cause || "c").toLowerCase()) + '" title="' + esc(cause.label + ": " + cause.detail) + '">' + esc(error.cause || "?") + '</span>' +
          '<div class="error-copy">' +
            '<div class="error-meta">' +
              '<span class="badge badge-ghost">' + esc(subject.short) + '</span>' +
              (error.topic ? '<span class="badge badge-ghost">' + esc(error.topic) + '</span>' : "") +
              (error.source ? '<span class="badge badge-ghost">' + esc(error.source) + '</span>' : "") +
              (error.repeat ? '<span class="badge badge-clay">Repeat</span>' : "") +
              (resolved ? '<span class="badge badge-green">Resolved</span>' : "") +
            '</div>' +
            '<h3>' + esc(error.question || "Untitled error") + '</h3>' +
            '<div class="error-answer-row">' +
              '<span>My answer <strong>' + esc(formatValue(error.myAnswer, "—")) + '</strong></span>' +
              '<span>Correct <strong>' + esc(formatValue(error.correctAnswer, "—")) + '</strong></span>' +
            '</div>' +
            (error.fix ? '<p class="error-fix"><strong>Fix:</strong> ' + escBreaks(error.fix) + '</p>' : "") +
          '</div>' +
          '<div class="error-side">' +
            '<span class="error-retest' + (due ? " due" : "") + '">' + esc(retestCopy) + '</span>' +
            '<div class="error-actions">' +
              (!resolved ? '<button type="button" class="btn btn-secondary btn-small" data-action="retest-error" data-error="' + esc(error.id) + '">Retest</button>' : "") +
              '<button type="button" class="btn btn-ghost btn-small" data-action="edit-error" data-error="' + esc(error.id) + '">Edit</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderErrorLab() {
    const filtered = filteredErrors();
    const open = errorOpenCount();
    const due = errorsDueCount();
    const repeat = errorRepeatRate();
    return '' +
      '<section class="error-stats" aria-label="Error statistics">' +
        '<div class="error-stat"><span>Open errors</span><strong>' + open + '</strong><em>Every guess belongs here too</em></div>' +
        '<div class="error-stat"><span>Retest due</span><strong>' + due + '</strong><em>Re-test old errors, not new questions</em></div>' +
        '<div class="error-stat"><span>Repeat rate</span><strong>' + (repeat == null ? "—" : repeat + "%") + '</strong><em>Target: below 20%</em></div>' +
      '</section>' +
      '<p class="small muted" style="margin:-4px 0 18px;max-width:660px">A wrong answer is only useful if it becomes a cause code, a fix, and a retest date. If the same error comes back twice, it earns a red-list repair session.</p>' +
      '<div class="error-toolbar">' +
        '<h2>Error lab · ' + filtered.length + " shown</h2>" +
        '<div class="error-toolbar-filters">' +
          '<div class="select-wrap"><select data-error-filter="status" aria-label="Filter errors by status">' +
            [["open", "Open errors"], ["due", "Retest due"], ["resolved", "Resolved"], ["all", "All errors"]].map((option) => '<option value="' + option[0] + '"' + (ui.errorFilters.status === option[0] ? " selected" : "") + '>' + option[1] + '</option>').join("") +
          '</select></div>' +
          '<div class="select-wrap"><select data-error-filter="subject" aria-label="Filter errors by subject">' +
            '<option value="all"' + (ui.errorFilters.subject === "all" ? " selected" : "") + '>All subjects</option>' +
            SUBJECTS.map((subject) => '<option value="' + subject.id + '"' + (ui.errorFilters.subject === subject.id ? " selected" : "") + '>' + esc(subject.name) + '</option>').join("") +
          '</select></div>' +
          '<div class="select-wrap"><select data-error-filter="cause" aria-label="Filter errors by cause">' +
            '<option value="all"' + (ui.errorFilters.cause === "all" ? " selected" : "") + '>All causes</option>' +
            CAUSES.map((cause) => '<option value="' + cause.key + '"' + (ui.errorFilters.cause === cause.key ? " selected" : "") + '>' + cause.key + " · " + esc(cause.label) + '</option>').join("") +
          '</select></div>' +
        '</div>' +
      '</div>' +
      (filtered.length
        ? '<div class="error-list">' + filtered.map(renderErrorCard).join("") + '</div>'
        : '<div class="empty-state error-empty">' + icon("alert") + '<strong>' + (state.errors.length ? "No errors match this filter." : "The error lab is empty.") + '</strong><p>' + (state.errors.length ? "Widen the filter to find the rest of the evidence." : "Log the first wrong answer or guess from a timed set. The log is where the score is repaired.") + '</p><button type="button" class="btn btn-primary btn-small" data-action="edit-error">Log an error</button></div>');
  }

  function renderPractice() {
    const isErrors = ui.practiceTab === "errors";
    return '' +
      pageHead(
        "Evidence over effort",
        "Practice",
        "Scores, autopsies, timed sets, and the error lab. This is where the plan turns into marks.",
        '<button type="button" class="btn btn-secondary btn-small" data-action="open-test-modal">' + icon("target") + ' Log test</button>' +
        '<button type="button" class="btn btn-primary btn-small" data-action="' + (isErrors ? "edit-error" : "open-practice-modal") + '">' + icon("plus") + ' ' + (isErrors ? "Log error" : "Log practice") + '</button>'
      ) +
      '<div class="segmented" role="tablist" aria-label="Practice sections">' +
        '<button type="button" role="tab" aria-selected="' + (!isErrors) + '" class="' + (!isErrors ? "active" : "") + '" data-action="practice-tab" data-tab="overview">Overview</button>' +
        '<button type="button" role="tab" aria-selected="' + isErrors + '" class="' + (isErrors ? "active" : "") + '" data-action="practice-tab" data-tab="errors">Error lab' + (errorOpenCount() ? " · " + errorOpenCount() : "") + '</button>' +
      '</div>' +
      (isErrors ? renderErrorLab() : renderPracticeOverview());
  }

  /* ==========================================================================
     Reflect
     ========================================================================== */

  function formatStamp(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function weekMcqStats(week) {
    const start = weekStart(week);
    const end = weekEnd(week);
    const logs = allMcqLogs().filter((log) => log.date >= start && log.date <= end);
    return mcqStats(logs);
  }

  function weekSleepSummary(week) {
    const start = weekStart(week);
    const end = weekEnd(week);
    const entries = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(start, offset);
      if (date > end) break;
      const sleep = dayData(date).sleep;
      const total = sleepHours(sleep);
      if (total != null) entries.push({ date: date, total: total, energy: Number(sleep.energy) || null });
    }
    return {
      count: entries.length,
      avg: entries.length ? entries.reduce((sum, entry) => sum + entry.total, 0) / entries.length : null,
    };
  }

  function renderSleepChart() {
    const entries = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = addDays(todayISO(), -offset);
      const sleep = dayData(date).sleep;
      const total = sleepHours(sleep);
      const day = parseISODate(date).getDay();
      entries.push({ date: date, total: total, weekend: day === 0 || day === 6 });
    }
    const bars = entries.map((entry) => {
      const height = entry.total == null ? 3 : clamp((entry.total / 10) * 100, 3, 100);
      const classes = ["sleep-bar"];
      if (entry.weekend) classes.push("weekend");
      if (entry.total == null) classes.push("empty");
      const title = entry.total == null
        ? formatLongDate(entry.date) + " · no sleep logged"
        : formatLongDate(entry.date) + " · " + formatHours(entry.total);
      return '' +
        '<div class="sleep-bar-col" title="' + esc(title) + '">' +
          '<div class="' + classes.join(" ") + '" style="height:' + height.toFixed(1) + '%"></div>' +
          '<span class="sleep-bar-label">' + parseISODate(entry.date).getDate() + '</span>' +
        '</div>';
    }).join("");
    return '' +
      '<div class="sleep-chart-wrap">' +
        '<div class="sleep-chart" role="img" aria-label="Sleep totals for the last fourteen days">' +
          '<span class="sleep-gridline" style="top:25%"></span>' +
          '<span class="sleep-gridline" style="top:50%"></span>' +
          '<span class="sleep-gridline" style="top:75%"></span>' +
          '<span class="sleep-gridline target" style="top:20%" title="8 hours"></span>' +
          bars +
        '</div>' +
        '<div class="sleep-chart-caption">' +
          '<span><i></i>Weekday <i class="weekend" style="margin-left:6px"></i>Weekend</span>' +
          '<span><i class="target"></i>8-hour line</span>' +
        '</div>' +
      '</div>';
  }

  function sleepInsight(summary) {
    if (!summary.count) {
      return "<strong>No sleep logged yet.</strong> Start tonight. Total sleep is core sleep plus nap; the plan’s Option B is about 5 h 50 on weekdays.";
    }
    if (summary.avg < 5.5) {
      return "<strong>Below the plan’s floor.</strong> The schedule assumes about 5 h 50 total on weekdays. Cut depth or move a night block before you cut more sleep.";
    }
    if (summary.avg < 6.2) {
      return "<strong>Near the floor.</strong> Protect the nap and lights-out time. Memory consolidation is part of the study, not a break from it.";
    }
    if (summary.weekendAvg != null && summary.weekendAvg < 7.5) {
      return "<strong>Weekday rhythm is holding.</strong> Protect the 8-hour weekend floor; it is what makes the five-day deficit survivable.";
    }
    return "<strong>The asset is protected.</strong> Keep the sleep floor, the nap, and the same wake time. A rested brain is a scoring advantage.";
  }

  function renderSleepCard() {
    const summary14 = sleepSummary(14);
    const summary7 = sleepSummary(7);
    return '' +
      '<section class="card sleep-card">' +
        '<div class="section-head">' +
          '<div><span class="eyebrow">The performance engine</span><h2>Sleep is where the work consolidates.</h2><p>Total sleep per 24 hours: core plus nap. Weekends carry the recovery.</p></div>' +
          '<button type="button" class="btn btn-secondary btn-small" data-action="open-sleep-modal">' + icon("plus") + ' Log sleep</button>' +
        '</div>' +
        '<div class="sleep-summary">' +
          '<div class="sleep-stat"><span>14-night average</span><strong>' + (summary14.avg == null ? "—" : formatHours(summary14.avg)) + '</strong><em>' + summary14.count + " " + plural(summary14.count, "night") + ' logged</em></div>' +
          '<div class="sleep-stat"><span>7-night average</span><strong>' + (summary7.avg == null ? "—" : formatHours(summary7.avg)) + '</strong><em>' + summary7.count + " " + plural(summary7.count, "night") + ' logged</em></div>' +
          '<div class="sleep-stat"><span>Weekday average</span><strong>' + (summary7.weekdayAvg == null ? "—" : formatHours(summary7.weekdayAvg)) + '</strong><em>Monday–Friday</em></div>' +
          '<div class="sleep-stat"><span>Weekend average</span><strong>' + (summary7.weekendAvg == null ? "—" : formatHours(summary7.weekendAvg)) + '</strong><em>Recovery floor: 8 h</em></div>' +
        '</div>' +
        renderSleepChart() +
        '<div class="sleep-note">' + sleepInsight(summary7) + (summary7.energyAvg != null ? " Morning energy average: <strong>" + Math.round(summary7.energyAvg) + "/5</strong>." : "") + '</div>' +
        '<p class="tiny muted" style="margin:13px 0 0">If the charts look thin, log sleep even when it is bad. The pattern is the useful part.</p>' +
      '</section>';
  }

  function renderReviewCard() {
    const week = clamp(ui.reflectWeek, 1, 30);
    const record = weekData(week);
    const answered = REVIEW_QUESTIONS.filter((question, index) => {
      const value = record.review["q" + index];
      return typeof value === "string" && value.trim();
    }).length;
    return '' +
      '<form class="card review-card" data-form="review" data-week="' + week + '">' +
        '<div class="section-head">' +
          '<div><span class="eyebrow">Week ' + week + " · " + esc(weekRangeLabel(week)) + '</span><h2>The Sunday review</h2><p>Ten questions, honestly answered. The week becomes data; the data becomes next week.</p></div>' +
          '<div class="review-week-nav" aria-label="Review week navigation">' +
            '<button type="button" data-action="reflect-week-step" data-delta="-1"' + (week <= 1 ? " disabled" : "") + ' aria-label="Previous week">' + icon("chevron-left") + '</button>' +
            '<span>Week ' + week + '</span>' +
            '<button type="button" data-action="reflect-week-step" data-delta="1"' + (week >= 30 ? " disabled" : "") + ' aria-label="Next week">' + icon("chevron-right") + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="review-list">' +
          REVIEW_QUESTIONS.map((question, index) => {
            const value = record.review["q" + index] || "";
            return '' +
              '<div class="review-question">' +
                '<span>' + (index + 1) + '</span>' +
                '<div>' +
                  '<label for="review-q' + index + '">' + esc(question) + '</label>' +
                  '<textarea id="review-q' + index + '" name="q' + index + '" placeholder="Write the honest answer…">' + esc(value) + '</textarea>' +
                '</div>' +
              '</div>';
          }).join("") +
        '</div>' +
        '<div class="review-save-row"><span>' + answered + ' / ' + REVIEW_QUESTIONS.length + ' answered' + (record.reviewSavedAt ? " · last saved " + esc(formatStamp(record.reviewSavedAt)) : " · not saved yet") + '</span><button type="submit" class="btn btn-primary btn-small">Save review</button></div>' +
      '</form>';
  }

  function renderNationCard() {
    const week = clamp(ui.reflectWeek, 1, 30);
    const record = weekData(week);
    return '' +
      '<form class="card nation-card" data-form="nation" data-week="' + week + '">' +
        '<span class="eyebrow">Week ' + week + ' · the influence file</span>' +
        '<h3 style="margin-top:7px">The Nation Note</h3>' +
        '<p class="nation-intro">Five lines connecting this week’s learning to Ethiopia. Not decoration: elaborative encoding, vocabulary, and a reason the work matters.</p>' +
        '<div class="nation-fields">' +
          NATION_PROMPTS.map((prompt, index) => {
            const value = record.nation["n" + index] || "";
            return '' +
              '<div class="nation-field">' +
                '<label for="nation-n' + index + '">' + esc(prompt) + '</label>' +
                '<textarea id="nation-n' + index + '" name="n' + index + '" placeholder="One or two lines…">' + esc(value) + '</textarea>' +
              '</div>';
          }).join("") +
        '</div>' +
        '<div class="review-save-row">' +
          '<span>' + (record.nationSavedAt ? "Saved " + esc(formatStamp(record.nationSavedAt)) : "Not saved yet") + '</span>' +
          '<button type="submit" class="btn btn-primary btn-small">Save note</button>' +
        '</div>' +
        '<div class="nation-example"><strong>Example from the plan:</strong> “Electrolysis of brine produces chlorine and hydrogen.” → “Chlorine for water treatment; hydrogen as a future fuel.” → “Clean water access; energy diversification.” → “Cost, safety, distribution, maintenance.” → “What limits small-scale chlorine production in rural towns?”</div>' +
      '</form>';
  }

  function renderWeekReviewSummary() {
    const week = clamp(ui.reflectWeek, 1, 30);
    const meta = WEEK_META[week] || DATA.weeks[0];
    const units = unitsForWeek(week);
    const unitsDone = units.filter((unit) => isUnitFirstPassComplete(unit.id)).length;
    const tasks = weekTaskProgress(week);
    const minimums = weeklyMinimumStats(week);
    const mcq = weekMcqStats(week);
    const sleep = weekSleepSummary(week);
    const tests = state.tests.filter((test) => test.date >= weekStart(week) && test.date <= weekEnd(week));
    return '' +
      '<section class="card week-review-summary">' +
        '<span class="eyebrow">Week ' + week + ' evidence</span>' +
        '<h3 style="margin-top:7px">' + esc(meta.focus) + '</h3>' +
        '<p>' + esc(weekRangeLabel(week)) + " · " + esc(meta.assessment) + '</p>' +
        '<div class="week-review-stats">' +
          '<div class="week-review-stat"><span>Units built</span><strong>' + (units.length ? unitsDone + " / " + units.length : "Revision week") + '</strong></div>' +
          '<div class="week-review-stat"><span>Weekly spine</span><strong>' + tasks.done + " / " + tasks.total + '</strong></div>' +
          '<div class="week-review-stat"><span>Minimum hours</span><strong>' + Number(minimums.totalActual.toFixed(2)) + " / " + minimums.totalTarget + ' h</strong></div>' +
          '<div class="week-review-stat"><span>MCQ accuracy</span><strong>' + (mcq.accuracy == null ? "—" : mcq.accuracy + "%") + '</strong></div>' +
          '<div class="week-review-stat"><span>Sleep logged</span><strong>' + (sleep.avg == null ? "—" : formatHours(sleep.avg)) + " · " + sleep.count + "/7 nights</strong></div>" +
          '<div class="week-review-stat"><span>Assessments</span><strong>' + tests.length + '</strong></div>' +
        '</div>' +
        '<a class="text-button" href="' + isoPath("journey", week) + '" style="margin-top:13px">Open the week plan ' + icon("arrow-right") + '</a>' +
      '</section>';
  }

  function renderReflect() {
    return '' +
      pageHead(
        "The performance file",
        "Reflect",
        "Review this week’s scores, keep the next step clear, and decide what to adjust next.",
        '<a class="btn btn-primary btn-small" href="#practice/errors">' + icon("alert") + ' Error lab</a>'
      ) +
      '<div class="reflect-grid">' +
        '<div class="reflect-main">' +
          renderReviewCard() +
        '</div>' +
        '<aside class="reflect-side">' +
          renderNationCard() +
          renderWeekReviewSummary() +
        '</aside>' +
      '</div>';
  }

  /* ==========================================================================
     Settings
     ========================================================================== */

  function savedDayCount() {
    return Object.keys(state.daily).filter((date) => {
      const day = dayData(date);
      return Object.keys(day.tasks).length || day.mcqs.length || day.notes;
    }).length;
  }

  const BACKUP_REMINDER_DAYS = 7;

  function hasSavedProgress() {
    return savedDayCount() > 0 ||
      Object.keys(state.weekly).length > 0 ||
      Object.keys(state.units).length > 0 ||
      Object.keys(state.setup).length > 0 ||
      state.tests.length > 0 ||
      state.errors.length > 0;
  }

  function backupReminder() {
    if (!hasSavedProgress()) return null;
    const last = Date.parse(state.settings.lastBackupAt || "");
    if (!Number.isFinite(last)) return { never: true };
    const days = Math.floor((Date.now() - last) / 86400000);
    if (days < BACKUP_REMINDER_DAYS) return null;
    return { never: false, days: days };
  }

  function renderBackupBanner(info) {
    const message = info.never
      ? "You have evidence in this browser but no backup yet. Clearing browser data or changing phones would erase it."
      : "Last backup was " + info.days + " " + plural(info.days, "day") + " ago. Export a fresh copy so this week’s evidence is not browser-only.";
    return '' +
      '<section class="backup-banner" aria-label="Backup reminder">' +
        '<span class="backup-banner-icon">' + icon("alert") + '</span>' +
        '<div class="backup-banner-copy"><strong>Protect the evidence</strong><span>' + esc(message) + '</span></div>' +
        '<button type="button" class="btn btn-primary btn-small" data-action="export-data">' + icon("download") + ' Export backup</button>' +
      '</section>';
  }

  function renderSettings() {
    const first = weekStart(1);
    const last = weekEnd(30);
    return '' +
      pageHead(
        "Control room",
        "Settings",
        "Plan dates, target score, and a private backup. Your progress never leaves this browser unless you export it.",
        ""
      ) +
      '<div class="settings-grid">' +
        '<div class="stack">' +
          '<section class="card settings-card">' +
            '<h2>Plan settings</h2>' +
            '<p>The plan is built around 30 weeks. Change the start date only if the whole schedule moves; the readiness deadline printed in the plan remains 26 May 2027.</p>' +
            '<form data-form="settings" novalidate>' +
              '<div class="form-grid">' +
                formField("setting-name", "Your name", '<input id="setting-name" name="name" type="text" maxlength="60" autocomplete="name" value="' + esc(state.settings.name) + '" required>') +
                formField("setting-target", "Target average (%)", '<input id="setting-target" name="targetScore" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(state.settings.targetScore) + '" required>', "The plan targets 80–85%. A target below 70 keeps few options open.") +
                formField("setting-start", "Plan start", '<input id="setting-start" name="startDate" type="date" value="' + esc(state.settings.startDate) + '" required>', "Changing this shifts every week and mock.") +
                formField("setting-exam", "Exam marker (assumed)", '<input id="setting-exam" name="examDate" type="date" value="' + esc(state.settings.examDate) + '" required>', "2027 is not confirmed. Treat this as a working marker.") +
              '</div>' +
              '<div class="form-error is-hidden" data-form-error role="alert"></div>' +
              '<div class="form-actions"><button type="submit" class="btn btn-primary btn-small">' + icon("check") + ' Save settings</button></div>' +
            '</form>' +
          '</section>' +
          '<section class="card settings-card">' +
            '<h2>Data &amp; backup</h2>' +
            '<p>Everything is stored under <code>' + esc(STORAGE_KEY) + '</code> in this browser. Export a JSON backup before changing devices or clearing browser data.</p>' +
            '<div class="data-actions">' +
              '<button type="button" class="data-action" data-action="export-data">' + icon("download") + '<span class="data-action-copy"><strong>Export a backup</strong><span>Download every check, score, error, and note as JSON.</span></span>' + icon("chevron-right", "data-action-go") + '</button>' +
              '<button type="button" class="data-action" data-action="copy-backup">' + icon("copy") + '<span class="data-action-copy"><strong>Copy backup text</strong><span>Copy the same backup to the clipboard for a note or message.</span></span>' + icon("chevron-right", "data-action-go") + '</button>' +
              '<button type="button" class="data-action" data-action="import-data">' + icon("upload") + '<span class="data-action-copy"><strong>Import a backup file</strong><span>Replace this browser’s progress with an exported JSON file.</span></span>' + icon("chevron-right", "data-action-go") + '</button>' +
              '<button type="button" class="data-action" data-action="restore-backup-text">' + icon("rotate") + '<span class="data-action-copy"><strong>Restore from text</strong><span>Paste backup JSON when a file is not available.</span></span>' + icon("chevron-right", "data-action-go") + '</button>' +
              '<button type="button" class="data-action" data-action="reset-data">' + icon("trash") + '<span class="data-action-copy"><strong>Reset all progress</strong><span>Clear personal data and return to a blank plan. There is no undo.</span></span>' + icon("chevron-right", "data-action-go") + '</button>' +
            '</div>' +
            '<input type="file" class="is-hidden" accept=".json,application/json" data-import-file aria-hidden="true" tabindex="-1">' +
            '<div class="privacy-note">' + icon("alert") + '<span>Private by design. No account, no server, no analytics. This also means there is no automatic sync: the backup file is your transfer between phone and laptop.</span></div>' +
            '<div class="about-list" style="margin-top:15px">' +
              '<div class="about-row"><span>Days with activity</span><strong>' + savedDayCount() + '</strong></div>' +
              '<div class="about-row"><span>Practice sessions</span><strong>' + allMcqLogs().length + '</strong></div>' +
              '<div class="about-row"><span>Assessments</span><strong>' + state.tests.length + '</strong></div>' +
              '<div class="about-row"><span>Errors logged</span><strong>' + state.errors.length + '</strong></div>' +
              '<div class="about-row" data-last-backup><span>Last backup</span><strong>' + (state.settings.lastBackupAt ? esc(formatStamp(state.settings.lastBackupAt)) : "Never exported") + '</strong></div>' +
              '<div class="about-row"><span>Last saved</span><strong>' + (state.updatedAt ? esc(formatStamp(state.updatedAt)) : "Not yet") + '</strong></div>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<aside class="stack">' +
          '<section class="plan-link-card">' +
            '<span class="eyebrow eyebrow-light">The source document</span>' +
            '<h3 style="margin-top:7px">The plan behind the tracker</h3>' +
            '<p>Read the reasoning, the past-paper evidence, the subject playbooks, the full unit ledger, and the rules for when the week collapses.</p>' +
            '<a class="btn btn-gold btn-small" href="plan.html" target="_blank" rel="noopener">' + icon("journey") + ' Open the 7-month plan</a>' +
          '</section>' +
          '<section class="card settings-card">' +
            '<h2>About this build</h2>' +
            '<p>A local-first command center for one student and one exam. No fake progress is seeded.</p>' +
            '<div class="about-list">' +
              '<div class="about-row"><span>Plan horizon</span><strong>' + esc(formatDateShort(first)) + " – " + esc(formatDateShort(last)) + '</strong></div>' +
              '<div class="about-row"><span>Content</span><strong>' + BOOKS.length + " books · " + TOTAL_UNITS + " units</strong></div>" +
              '<div class="about-row"><span>Pages mapped</span><strong>' + formatNumber(TOTAL_PAGES) + '</strong></div>' +
              '<div class="about-row"><span>Papers</span><strong>6 papers · 600 marks</strong></div>' +
              '<div class="about-row"><span>Readiness target</span><strong>' + esc(formatDateShort(DATA.examNotes.readinessDate)) + '</strong></div>' +
              '<div class="about-row"><span>Exam marker</span><strong>' + esc(formatDateShort(state.settings.examDate)) + '</strong></div>' +
              '<div class="about-row"><span>Build</span><strong>v' + esc(APP_VERSION) + '</strong></div>' +
            '</div>' +
            '<p class="tiny muted" style="margin:15px 0 0">' + esc(DATA.examNotes.caveat) + '</p>' +
          '</section>' +
        '</aside>' +
      '</div>';
  }

  /* ==========================================================================
     Modals, forms, and data operations
     ========================================================================== */

  const MOCK_AUTOPSY_QUESTIONS = [
    "What did I not know? (Concept and knowledge errors.)",
    "What did I know but lose? (Slips and misreads.)",
    "Where did time disappear? (Which section or question type?)",
    "Which repeated traps appeared again?",
    "What are the three fixes for the next two weeks?",
  ];

  let lastFocusedElement = null;
  let pendingConfirm = null;

  function selectedAttr(value, expected) {
    return String(value) === String(expected) ? " selected" : "";
  }

  function formField(id, label, control, hint) {
    return '' +
      '<div class="form-field">' +
        '<label for="' + esc(id) + '">' + label + '</label>' +
        control +
        (hint ? '<small>' + hint + '</small>' : "") +
      '</div>';
  }

  function subjectOptions(selectedId) {
    return SUBJECTS.map((subject) => '<option value="' + subject.id + '"' + selectedAttr(subject.id, selectedId) + '>' + esc(subject.name) + '</option>').join("");
  }

  function showFormError(form, message) {
    const box = form.querySelector("[data-form-error]");
    if (!box) {
      toast(message);
      return;
    }
    box.textContent = message;
    box.classList.remove("is-hidden");
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function clearFormError(form) {
    const box = form.querySelector("[data-form-error]");
    if (!box) return;
    box.textContent = "";
    box.classList.add("is-hidden");
  }

  function openModal(options) {
    lastFocusedElement = document.activeElement;
    const wide = options.wide ? " modal-wide" : "";
    els.modalRoot.innerHTML = '' +
      '<div class="modal-backdrop" data-modal-backdrop>' +
        '<div class="modal-panel' + wide + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
          '<div class="modal-head">' +
            '<div>' +
              '<span class="eyebrow">' + esc(options.eyebrow || "Ascent") + '</span>' +
              '<h2 id="modal-title">' + esc(options.title || "") + '</h2>' +
              (options.description ? '<p>' + options.description + '</p>' : "") +
            '</div>' +
            '<button type="button" class="modal-close" data-action="close-modal" aria-label="Close dialog">' + icon("x") + '</button>' +
          '</div>' +
          '<div class="modal-body">' + options.body + '</div>' +
        '</div>' +
      '</div>';
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      const target = els.modalRoot.querySelector("[data-autofocus]") ||
        els.modalRoot.querySelector(".modal-body input:not([type='hidden']):not([disabled]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled])") ||
        els.modalRoot.querySelector(".modal-close");
      if (target) target.focus({ preventScroll: true });
    });
  }

  function closeModal() {
    if (!els.modalRoot.firstElementChild) return;
    els.modalRoot.innerHTML = "";
    document.body.classList.remove("modal-open");
    pendingConfirm = null;
    const target = lastFocusedElement;
    lastFocusedElement = null;
    if (target && document.contains(target) && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function openConfirm(options) {
    pendingConfirm = options.onConfirm;
    openModal({
      eyebrow: options.eyebrow || "Please confirm",
      title: options.title,
      body: '' +
        '<div class="confirm-copy">' + options.message + '</div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Cancel</button>' +
          '<button type="button" class="btn ' + (options.danger ? "btn-danger" : "btn-primary") + ' btn-small" data-action="confirm-yes">' + esc(options.confirmLabel || "Confirm") + '</button>' +
        '</div>',
    });
  }

  function runConfirmedAction() {
    const action = pendingConfirm;
    pendingConfirm = null;
    closeModal();
    if (typeof action === "function") action();
  }

  function openPracticeModal(options) {
    const opts = options || {};
    const date = isISODate(opts.date) ? opts.date : todayISO();
    const subjectId = SUBJECT_BY_ID[opts.subjectId] ? opts.subjectId : "math";
    openModal({
      eyebrow: "Timed evidence",
      title: "Log practice",
      description: "Count every question. Log every guess. The number is only useful if it is honest.",
      body: '' +
        '<form data-form="practice" novalidate>' +
          '<div class="form-row-2">' +
            formField("practice-date", "Date", '<input id="practice-date" name="date" type="date" value="' + esc(date) + '" required>') +
            formField("practice-subject", "Subject", '<select id="practice-subject" name="subject" required>' + subjectOptions(subjectId) + '</select>') +
          '</div>' +
          formField("practice-topic", "Topic or unit", '<input id="practice-topic" name="topic" type="text" maxlength="120" value="' + esc(opts.topic || "") + '" placeholder="e.g. Trigonometry or Mixed paper">') +
          '<div class="form-row-3">' +
            formField("practice-count", "Questions", '<input id="practice-count" name="count" type="number" min="1" max="300" step="1" inputmode="numeric" value="20" required>') +
            formField("practice-correct", "Correct", '<input id="practice-correct" name="correct" type="number" min="0" max="300" step="1" inputmode="numeric" placeholder="0" required>') +
            formField("practice-minutes", "Minutes", '<input id="practice-minutes" name="minutes" type="number" min="0" max="600" step="1" inputmode="numeric" placeholder="Timed">') +
          '</div>' +
          formField("practice-source", "Source", '<input id="practice-source" name="source" type="text" maxlength="120" placeholder="e.g. Past paper 2016 E.C. · Section B">') +
          '<div class="form-error is-hidden" data-form-error role="alert"></div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="btn btn-primary btn-small">Save practice</button>' +
          '</div>' +
        '</form>',
    });
  }

  function openTestModal(options) {
    const opts = options || {};
    let existing = null;
    if (opts.testId) existing = state.tests.find((test) => test.id === opts.testId) || null;
    if (!existing && opts.mockId) existing = state.tests.find((test) => test.mockId === opts.mockId) || null;
    const mockId = existing ? existing.mockId || "" : opts.mockId && MOCK_BY_ID[opts.mockId] ? opts.mockId : "";
    const mock = mockId ? MOCK_BY_ID[mockId] : null;
    const name = existing ? existing.name || "" : mock ? mock.name : "";
    const date = existing ? existing.date : opts.date && isISODate(opts.date) ? opts.date : mock ? mockDate(mock) : todayISO();
    const kind = existing ? existing.kind || (mock ? "mock" : "subject") : mock ? "mock" : "subject";
    const scores = existing && isPlainObject(existing.scores) ? existing.scores : {};
    const scoreGrid = SUBJECTS.map((subject) => {
      const saved = scores[subject.id];
      const value = saved && Number.isFinite(Number(saved.score)) ? saved.score : "";
      return '' +
        '<div class="score-input">' +
          '<i style="background:' + subject.color + '"></i>' +
          '<label for="score-' + subject.id + '">' + esc(subject.name) + '</label>' +
          '<input id="score-' + subject.id + '" name="score-' + subject.id + '" type="number" min="0" max="100" step="0.5" inputmode="decimal" placeholder="—" value="' + esc(value) + '">' +
          '<span>/100</span>' +
        '</div>';
    }).join("");
    openModal({
      eyebrow: existing ? "Edit assessment" : "New evidence",
      title: existing ? "Edit assessment" : "Log an assessment",
      description: "Scores first. Autopsy second. Leave a paper blank if it was not part of this test.",
      wide: true,
      body: '' +
        '<form data-form="test" data-test="' + esc(existing ? existing.id : "") + '" novalidate>' +
          '<div class="form-row-2">' +
            formField("test-name", "Assessment name", '<input id="test-name" name="testName" type="text" maxlength="100" value="' + esc(name) + '" placeholder="e.g. Mathematics subject test" required>') +
            formField("test-date", "Date", '<input id="test-date" name="testDate" type="date" value="' + esc(date) + '" required>') +
          '</div>' +
          '<div class="form-row-2">' +
            formField("test-kind", "Type", '<select id="test-kind" name="testKind">' +
              '<option value="mock"' + selectedAttr("mock", kind) + '>Mock</option>' +
              '<option value="subject"' + selectedAttr("subject", kind) + '>Subject test</option>' +
              '<option value="diagnostic"' + selectedAttr("diagnostic", kind) + '>Diagnostic</option>' +
            '</select>') +
            formField("test-mock", "Scheduled mock", '<select id="test-mock" name="testMock" data-test-mock>' +
              '<option value="">No scheduled mock</option>' +
              DATA.mocks.map((item) => '<option value="' + esc(item.id) + '"' + selectedAttr(item.id, mockId) + '>' + esc(item.name) + ' · Week ' + item.week + '</option>').join("") +
            '</select>', "Selecting a mock fills its date and name.") +
          '</div>' +
          '<div class="form-field"><label>Paper scores out of 100</label><div class="score-input-grid">' + scoreGrid + '</div><small class="field-hint">At least one paper is required. Scores are stored as percentages of 100.</small></div>' +
          '<div class="form-error is-hidden" data-form-error role="alert"></div>' +
          '<div class="modal-foot">' +
            (existing ? '<button type="button" class="danger-link" data-action="delete-test" data-test="' + esc(existing.id) + '">Delete assessment</button>' : "") +
            '<button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="btn btn-primary btn-small">' + (existing ? "Save changes" : "Save assessment") + '</button>' +
          '</div>' +
        '</form>',
    });
  }

  function openAutopsyModal(testId) {
    const test = state.tests.find((item) => item.id === testId);
    if (!test) {
      toast("That assessment no longer exists.");
      return;
    }
    const answers = Array.isArray(test.autopsy) ? test.autopsy : [];
    const pct = testOverallPct(test);
    openModal({
      eyebrow: "The five questions",
      title: testDisplayName(test) + " · autopsy",
      description: "A score without an autopsy is only a scare. Answer all five in writing within 48 hours.",
      wide: true,
      body: '' +
        '<div class="week-assessment" style="margin-bottom:18px"><span>Assessment</span><strong>' + esc(formatDateShort(test.date)) + " · " + (pct == null ? "No scores recorded" : pct + "% overall") + '</strong><small>' + (test.autopsySavedAt ? "Last autopsy saved " + esc(formatStamp(test.autopsySavedAt)) : "Autopsy not yet saved") + '</small></div>' +
        '<form data-form="autopsy" data-test="' + esc(test.id) + '" novalidate>' +
          MOCK_AUTOPSY_QUESTIONS.map((question, index) => formField(
            "autopsy-" + index,
            (index + 1) + ". " + esc(question),
            '<textarea id="autopsy-' + index + '" name="a' + index + '" required placeholder="Write the specific answer, not “revise more”.">' + esc(answers[index] || "") + '</textarea>'
          )).join("") +
          '<div class="form-error is-hidden" data-form-error role="alert"></div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="btn btn-primary btn-small">Save autopsy</button>' +
          '</div>' +
        '</form>',
    });
  }

  function causeOptionsMarkup(selected) {
    return '<div class="cause-options">' + CAUSES.map((cause) => (
      '<div class="cause-option">' +
        '<input type="radio" id="cause-' + cause.key + '" name="cause" value="' + cause.key + '"' + (selected === cause.key ? " checked" : "") + '>' +
        '<label for="cause-' + cause.key + '"><strong>' + cause.key + '</strong>' + esc(cause.label) + '</label>' +
      '</div>'
    )).join("") + '</div>';
  }

  function openErrorModal(errorId) {
    const error = errorId ? state.errors.find((item) => item.id === errorId) : null;
    const subjectId = error ? error.subjectId : "math";
    const cause = error ? error.cause : "C";
    const status = error ? error.status : "open";
    const retestDate = error && isISODate(error.retestDate) ? error.retestDate : addDays(todayISO(), 2);
    openModal({
      eyebrow: error ? "Edit error" : "Error lab",
      title: error ? "Edit this error" : "Log an error",
      description: "Not “I made a mistake.” A cause, a correction, a fix, and a date when it comes back.",
      wide: true,
      body: '' +
        '<form data-form="error" data-error="' + esc(error ? error.id : "") + '" novalidate>' +
          '<div class="form-row-2">' +
            formField("error-subject", "Subject", '<select id="error-subject" name="subjectId" required>' + subjectOptions(subjectId) + '</select>') +
            formField("error-topic", "Topic or unit", '<input id="error-topic" name="topic" type="text" maxlength="120" value="' + esc(error ? error.topic || "" : "") + '" placeholder="e.g. Projectile motion">') +
          '</div>' +
          formField("error-source", "Source", '<input id="error-source" name="source" type="text" maxlength="120" value="' + esc(error ? error.source || "" : "") + '" placeholder="e.g. Mock 1 · Physics Q14">') +
          formField("error-question", "The question or mistake", '<textarea id="error-question" name="question" required maxlength="600" placeholder="Describe the question or the specific step that failed.">' + esc(error ? error.question || "" : "") + '</textarea>') +
          '<div class="form-row-2">' +
            formField("error-my-answer", "My answer", '<input id="error-my-answer" name="myAnswer" type="text" maxlength="160" value="' + esc(error ? error.myAnswer || "" : "") + '" placeholder="What I chose or wrote">') +
            formField("error-correct-answer", "Correct answer", '<input id="error-correct-answer" name="correctAnswer" type="text" maxlength="160" value="' + esc(error ? error.correctAnswer || "" : "") + '" placeholder="The right answer or step">') +
          '</div>' +
          '<div class="form-field"><label>Cause code</label>' + causeOptionsMarkup(cause) + '<small class="field-hint">C concept · K knowledge · S slip · M misread · T time.</small></div>' +
          formField("error-fix", "The fix", '<textarea id="error-fix" name="fix" maxlength="600" required placeholder="What exactly will I do differently? Name the rule, the check, or the drill.">' + esc(error ? error.fix || "" : "") + '</textarea>') +
          '<div class="form-row-2">' +
            formField("error-retest", "Retest date", '<input id="error-retest" name="retestDate" type="date" value="' + esc(retestDate) + '" required>', "Default is D+2. A repeat earns a red-list repair and a new date.") +
            (error ? formField("error-status", "Status", '<select id="error-status" name="status"><option value="open"' + selectedAttr("open", status) + '>Open</option><option value="resolved"' + selectedAttr("resolved", status) + '>Resolved</option></select>') : "") +
          '</div>' +
          '<div class="form-error is-hidden" data-form-error role="alert"></div>' +
          '<div class="modal-foot">' +
            (error ? '<button type="button" class="danger-link" data-action="delete-error" data-error="' + esc(error.id) + '">Delete error</button>' : "") +
            '<button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="btn btn-primary btn-small">' + (error ? "Save changes" : "Log error") + '</button>' +
          '</div>' +
        '</form>',
    });
  }

  function openRetestModal(errorId) {
    const error = state.errors.find((item) => item.id === errorId);
    if (!error) {
      toast("That error no longer exists.");
      return;
    }
    const subject = SUBJECT_BY_ID[error.subjectId] || SUBJECTS[0];
    openModal({
      eyebrow: "Retrieval check",
      title: "Retest this error",
      description: "Close the book. Reconstruct the answer first. Then record what happened.",
      body: '' +
        '<div class="confirm-copy" style="margin-bottom:16px"><span class="badge badge-ghost">' + esc(subject.short) + '</span> ' + esc(error.question || "Untitled error") + (error.fix ? '<br><span class="small muted">Fix: ' + esc(error.fix) + '</span>' : "") + '</div>' +
        '<form data-form="retest" data-error="' + esc(error.id) + '" novalidate>' +
          '<div class="form-field"><label>Outcome</label>' +
            '<div class="pass-list">' +
              '<label class="pass-item"><input type="radio" name="outcome" value="resolved" required><span class="pass-copy"><strong>Correct this time</strong><small>Mark the error resolved and keep the record.</small></span></label>' +
              '<label class="pass-item"><input type="radio" name="outcome" value="repeat" required><span class="pass-copy"><strong>Missed it again</strong><small>Flag it as a repeat, add it to the red list, and schedule another retest in 7 days.</small></span></label>' +
            '</div>' +
          '</div>' +
          formField("retest-note", "What happened?", '<textarea id="retest-note" name="note" maxlength="300" placeholder="Optional: what was still unclear?">' + esc(error.retestNote || "") + '</textarea>') +
          '<div class="form-error is-hidden" data-form-error role="alert"></div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="btn btn-primary btn-small">Record retest</button>' +
          '</div>' +
        '</form>',
    });
  }

  /* ==========================================================================
     Form saves
     ========================================================================== */

  function fieldValue(form, name) {
    const field = form.elements.namedItem(name);
    if (!field) return "";
    return typeof field.value === "string" ? field.value.trim() : "";
  }

  function saveSettingsForm(form) {
    clearFormError(form);
    const name = fieldValue(form, "name");
    const startDate = fieldValue(form, "startDate");
    const examDate = fieldValue(form, "examDate");
    const targetRaw = fieldValue(form, "targetScore");
    const targetScore = Number(targetRaw);

    if (!name) {
      showFormError(form, "Add the name you want the tracker to use.");
      return;
    }
    if (!isISODate(startDate)) {
      showFormError(form, "Choose a valid plan start date.");
      return;
    }
    if (!isISODate(examDate)) {
      showFormError(form, "Choose a valid exam marker date.");
      return;
    }
    if (daysBetween(startDate, examDate) <= 0) {
      showFormError(form, "The exam marker must fall after the plan start.");
      return;
    }
    if (targetRaw === "" || !Number.isFinite(targetScore) || targetScore < 0 || targetScore > 100) {
      showFormError(form, "The target average must be a number between 0 and 100.");
      return;
    }

    state.settings.name = name.slice(0, 60);
    state.settings.startDate = startDate;
    state.settings.examDate = examDate;
    state.settings.targetScore = Math.round(targetScore);
    saveState();
    ui.selectedWeek = currentWeekNo();
    ui.reflectWeek = currentWeekNo();
    if (ui.selectedDate < state.settings.startDate) ui.selectedDate = todayISO();
    softRefresh("#setting-name");
    toast("Plan settings saved.");
  }

  function savePageRangeForm(form) {
    clearFormError(form);
    const unit = UNIT_BY_ID[form.dataset.unit];
    if (!unit) {
      toast("That unit is no longer in the plan.");
      return;
    }
    const start = Number(fieldValue(form, "pageStart"));
    const end = Number(fieldValue(form, "pageEnd"));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end <= start || end > 3000) {
      showFormError(form, "Enter a printed range where the last page is greater than the first page.");
      return;
    }
    const record = ensureUnit(unit.id);
    const priorReads = Object.keys(record.portions).filter((key) => record.portions[key] && record.portions[key].readAt).length;
    const apply = () => {
      record.pages = { start: Math.round(start), end: Math.round(end) };
      saveState();
      softRefresh('[data-action="toggle-unit"][data-unit="' + unit.id + '"]');
      toast("Page range saved. " + unit.name + " now has " + unitPortions(unit).length + " reading portions.");
    };
    if (priorReads > 0) {
      openConfirm({
        eyebrow: "Rebuild the reading map",
        title: "Change a range that already has read marks?",
        message: "This unit has <strong>" + priorReads + " read " + plural(priorReads, "portion") + "</strong> on record under the old range. A new range redraws the portions, so those marks may no longer line up with the pages. Change it only if the printed edition really differs. The old records stay in the backup until a new mark replaces them.",
        confirmLabel: "Use the new range",
        onConfirm: apply,
      });
      return;
    }
    apply();
  }

  function savePracticeForm(form) {
    clearFormError(form);
    const date = fieldValue(form, "date");
    const subjectId = fieldValue(form, "subject");
    const topic = fieldValue(form, "topic");
    const count = Number(fieldValue(form, "count"));
    const correct = Number(fieldValue(form, "correct"));
    const minutesRaw = fieldValue(form, "minutes");
    const source = fieldValue(form, "source");

    if (!isISODate(date)) {
      showFormError(form, "Choose a valid date.");
      return;
    }
    if (!SUBJECT_BY_ID[subjectId]) {
      showFormError(form, "Choose the subject you practised.");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 300) {
      showFormError(form, "Questions must be a whole number between 1 and 300.");
      return;
    }
    if (!Number.isInteger(correct) || correct < 0 || correct > count) {
      showFormError(form, "Correct cannot exceed the number of questions.");
      return;
    }
    let minutes = null;
    if (minutesRaw !== "") {
      minutes = Number(minutesRaw);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600) {
        showFormError(form, "Minutes must be a whole number between 0 and 600, or left blank.");
        return;
      }
    }

    addMcqLog(date, {
      id: uid("mcq"),
      createdAt: new Date().toISOString(),
      subject: subjectId,
      topic: topic || SUBJECT_BY_ID[subjectId].name,
      count: count,
      correct: correct,
      minutes: minutes,
      source: source,
    });
    const pct = Math.round((correct / count) * 100);
    closeModal();
    softRefresh();
    toast("Practice saved · " + correct + "/" + count + " · " + pct + "%.");
  }

  function saveTestForm(form) {
    clearFormError(form);
    const testId = form.dataset.test || "";
    const existing = testId ? state.tests.find((test) => test.id === testId) : null;
    const date = fieldValue(form, "testDate");
    const mockId = fieldValue(form, "testMock");
    const mock = mockId ? MOCK_BY_ID[mockId] : null;
    const kindRaw = fieldValue(form, "testKind");
    const kind = mock ? "mock" : (["mock", "subject", "diagnostic"].includes(kindRaw) ? kindRaw : "subject");
    const name = mock ? mock.name : fieldValue(form, "testName");

    if (!isISODate(date)) {
      showFormError(form, "Choose a valid date for this assessment.");
      return;
    }
    if (!name) {
      showFormError(form, "Give this assessment a name.");
      return;
    }
    if (mockId && !mock) {
      showFormError(form, "That scheduled mock is not recognised.");
      return;
    }
    if (mock) {
      const collision = state.tests.find((test) => test.mockId === mock.id && (!existing || test.id !== existing.id));
      if (collision) {
        showFormError(form, "A score already exists for " + mock.name + ". Edit that record instead of creating a second one.");
        return;
      }
    }

    const scores = {};
    let scoreCount = 0;
    let invalidSubject = null;
    SUBJECTS.forEach((subject) => {
      const raw = fieldValue(form, "score-" + subject.id);
      if (raw === "") return;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        invalidSubject = subject.name;
        return;
      }
      scores[subject.id] = { score: Math.round(value * 10) / 10, max: 100 };
      scoreCount += 1;
    });
    if (invalidSubject) {
      showFormError(form, invalidSubject + " must be between 0 and 100, or left blank.");
      return;
    }
    if (!scoreCount) {
      showFormError(form, "Enter at least one paper score. An assessment without numbers is only a feeling.");
      return;
    }

    const record = existing || {
      id: uid("test"),
      createdAt: new Date().toISOString(),
      autopsy: [],
      autopsySavedAt: null,
    };
    record.name = name.slice(0, 100);
    record.date = date;
    record.kind = kind;
    record.mockId = mock ? mock.id : "";
    record.scores = scores;
    record.updatedAt = new Date().toISOString();
    if (!existing) state.tests.push(record);

    const pct = testOverallPct(record);
    saveState();
    closeModal();
    softRefresh();
    if (record.kind === "mock") {
      toast((mock ? mock.name : "Mock") + " saved" + (pct == null ? "" : " · " + pct + "%") + ". Autopsy it within 48 hours.");
    } else {
      toast("Assessment saved" + (pct == null ? "." : " · " + pct + "%."));
    }
  }

  function saveAutopsyForm(form) {
    clearFormError(form);
    const testId = form.dataset.test || "";
    const test = state.tests.find((item) => item.id === testId);
    if (!test) {
      closeModal();
      toast("That assessment no longer exists.");
      return;
    }
    const answers = [];
    for (let index = 0; index < MOCK_AUTOPSY_QUESTIONS.length; index += 1) {
      const answer = fieldValue(form, "a" + index);
      if (!answer) {
        showFormError(form, "Answer all five questions. Number " + (index + 1) + " is still blank.");
        const field = form.elements.namedItem("a" + index);
        if (field && typeof field.focus === "function") field.focus();
        return;
      }
      answers.push(answer);
    }
    test.autopsy = answers;
    test.autopsySavedAt = new Date().toISOString();
    test.updatedAt = new Date().toISOString();
    saveState();
    closeModal();
    softRefresh();
    toast("Autopsy saved. The score is now a work order.");
  }

  function saveErrorForm(form) {
    clearFormError(form);
    const errorId = form.dataset.error || "";
    const existing = errorId ? state.errors.find((item) => item.id === errorId) : null;
    const subjectId = fieldValue(form, "subjectId");
    const topic = fieldValue(form, "topic");
    const source = fieldValue(form, "source");
    const question = fieldValue(form, "question");
    const myAnswer = fieldValue(form, "myAnswer");
    const correctAnswer = fieldValue(form, "correctAnswer");
    const fix = fieldValue(form, "fix");
    const retestDate = fieldValue(form, "retestDate");
    const causeField = form.querySelector('input[name="cause"]:checked');
    const cause = causeField ? causeField.value : "";

    if (!SUBJECT_BY_ID[subjectId]) {
      showFormError(form, "Choose the subject this error came from.");
      return;
    }
    if (!question) {
      showFormError(form, "Describe the question or the exact step that failed.");
      return;
    }
    if (!fix) {
      showFormError(form, "Write the fix. “Be more careful” is not a fix.");
      return;
    }
    if (!CAUSE_BY_KEY[cause]) {
      showFormError(form, "Choose a cause code: concept, knowledge, slip, misread, or time.");
      return;
    }
    if (!isISODate(retestDate)) {
      showFormError(form, "Choose a valid retest date.");
      return;
    }

    const status = existing ? fieldValue(form, "status") || "open" : "open";
    const record = existing || {
      id: uid("error"),
      createdAt: new Date().toISOString(),
      repeat: false,
      repeatCount: 0,
      resolvedAt: null,
      retestNote: "",
    };
    record.subjectId = subjectId;
    record.topic = topic;
    record.source = source;
    record.question = question;
    record.myAnswer = myAnswer;
    record.correctAnswer = correctAnswer;
    record.cause = cause;
    record.fix = fix;
    record.retestDate = retestDate;
    record.status = status === "resolved" ? "resolved" : "open";
    record.updatedAt = new Date().toISOString();
    if (record.status === "resolved" && !record.resolvedAt) record.resolvedAt = todayISO();
    if (record.status !== "resolved") record.resolvedAt = null;
    if (!existing) state.errors.unshift(record);

    saveState();
    closeModal();
    softRefresh();
    toast(
      existing
        ? "Error updated."
        : "Error logged · " + CAUSE_BY_KEY[cause].label + " · retest " + formatDateShort(retestDate) + "."
    );
  }

  function saveRetestForm(form) {
    clearFormError(form);
    const errorId = form.dataset.error || "";
    const error = state.errors.find((item) => item.id === errorId);
    if (!error) {
      closeModal();
      toast("That error no longer exists.");
      return;
    }
    const outcomeField = form.querySelector('input[name="outcome"]:checked');
    const outcome = outcomeField ? outcomeField.value : "";
    if (outcome !== "resolved" && outcome !== "repeat") {
      showFormError(form, "Record what happened: correct this time, or missed again.");
      return;
    }
    const note = fieldValue(form, "note");
    const today = todayISO();
    error.lastRetestedAt = today;
    error.retestNote = note;
    error.updatedAt = new Date().toISOString();

    if (outcome === "resolved") {
      error.status = "resolved";
      error.resolvedAt = today;
      saveState();
      closeModal();
      softRefresh();
      toast("Error resolved. The record stays in the lab.");
    } else {
      error.repeat = true;
      error.repeatCount = (Number(error.repeatCount) || 0) + 1;
      error.status = "open";
      error.resolvedAt = null;
      error.retestDate = addDays(today, 7);
      saveState();
      closeModal();
      softRefresh();
      toast("Repeat flagged · red-list repair · retest " + formatDateShort(error.retestDate) + ".");
    }
  }

  function saveReviewForm(form) {
    const week = clamp(Number(form.dataset.week) || currentWeekNo(), 1, 30);
    const record = ensureWeek(week);
    REVIEW_QUESTIONS.forEach((question, index) => {
      const value = fieldValue(form, "q" + index);
      if (value) record.review["q" + index] = value;
      else delete record.review["q" + index];
    });
    record.reviewSavedAt = new Date().toISOString();
    saveState();
    softRefresh();
    toast("Week " + week + " review saved.");
  }

  function saveNationForm(form) {
    const week = clamp(Number(form.dataset.week) || currentWeekNo(), 1, 30);
    const record = ensureWeek(week);
    NATION_PROMPTS.forEach((prompt, index) => {
      const value = fieldValue(form, "n" + index);
      if (value) record.nation["n" + index] = value;
      else delete record.nation["n" + index];
    });
    record.nationSavedAt = new Date().toISOString();
    saveState();
    softRefresh();
    toast("Week " + week + " Nation Note saved.");
  }

  /* ==========================================================================
     Data operations
     ========================================================================== */

  function buildBackupPayload() {
    saveState(true);
    const exportState = window.AscentStorage ? window.AscentStorage.sanitizeImportedState(state) : JSON.parse(JSON.stringify(state));
    Object.keys(exportState.daily || {}).forEach((date) => {
      if (exportState.daily[date] && Object.prototype.hasOwnProperty.call(exportState.daily[date], "sleep")) delete exportState.daily[date].sleep;
    });
    const extraData = {};
    ["ascent.mock.v1", "ascent.reading.v1", "ascent.repair.v1", "ascent.backup-dismiss.v1"].forEach((key) => {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) extraData[key] = JSON.parse(raw);
      } catch (error) {
        // Corrupt new-key data is preserved by its loader; do not export invalid JSON.
      }
    });
    return {
      app: "Ascent",
      format: "ascent-esslce-backup",
      version: APP_VERSION,
      storageKey: STORAGE_KEY,
      exportedAt: new Date().toISOString(),
      state: exportState,
      extraData: extraData,
    };
  }

  function backupText() {
    return JSON.stringify(buildBackupPayload(), null, 2);
  }

  function downloadBackup() {
    const payload = buildBackupPayload();
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ascent-esslce-backup-" + todayISO() + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      state.settings.lastBackupAt = new Date().toISOString();
      saveState(true);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      const backupRow = document.querySelector("[data-last-backup] strong");
      if (backupRow) backupRow.textContent = formatStamp(state.settings.lastBackupAt);
      if (document.querySelector(".backup-banner")) softRefresh();
      toast("Backup downloaded. Keep it somewhere outside this browser.");
    } catch (error) {
      toast("The browser could not create the backup file.");
    }
  }

  function openBackupTextModal() {
    const text = backupText();
    openModal({
      eyebrow: "Portable backup",
      title: "Copy the backup",
      description: "Paste this into a note, an email to yourself, or a private message. It holds every check, score, error, and note.",
      wide: true,
      body: '' +
        '<div class="backup-text-wrap">' +
          '<textarea class="backup-text" data-backup-text readonly rows="12" spellcheck="false" aria-label="Backup JSON">' + esc(text) + '</textarea>' +
          '<div class="backup-text-meta">' +
            '<span>' + formatNumber(text.length) + ' characters · v' + esc(APP_VERSION) + '</span>' +
            '<button type="button" class="btn btn-primary btn-small" data-action="copy-backup-text">' + icon("copy") + ' Copy text</button>' +
          '</div>' +
        '</div>' +
        '<p class="tiny muted" style="margin:12px 0 0">This is the same content as the JSON file. Keep it private: it includes your name and your study record. To restore it, open <strong>Restore from text</strong> in Settings.</p>' +
        '<div class="modal-foot"><button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Done</button></div>',
    });
  }

  function noteBackupTaken() {
    state.settings.lastBackupAt = new Date().toISOString();
    saveState(true);
    const backupRow = document.querySelector("[data-last-backup] strong");
    if (backupRow) backupRow.textContent = formatStamp(state.settings.lastBackupAt);
  }

  function copyBackupText(trigger) {
    const area = els.modalRoot.querySelector("[data-backup-text]");
    const text = area ? area.value : backupText();
    const done = () => {
      noteBackupTaken();
      if (trigger) {
        trigger.innerHTML = icon("check") + " Copied";
        window.setTimeout(() => {
          if (document.body.contains(trigger)) trigger.innerHTML = icon("copy") + " Copy text";
        }, 2200);
      }
      toast("Backup copied. Store it outside this browser.");
    };
    const fallback = () => {
      if (!area) {
        toast("Select the text and copy it manually.");
        return;
      }
      area.focus();
      area.select();
      try {
        if (document.execCommand("copy")) done();
        else toast("Select the text and copy it manually.");
      } catch (error) {
        toast("Select the text and copy it manually.");
      }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function openRestoreTextModal() {
    openModal({
      eyebrow: "Restore the evidence",
      title: "Restore from backup text",
      description: "Paste a backup exported from Ascent. The import replaces everything currently in this browser.",
      wide: true,
      body: '' +
        '<form data-form="restore-text" novalidate>' +
          '<label class="form-field" for="restore-payload"><span>Backup JSON</span>' +
            '<textarea id="restore-payload" name="payload" class="backup-text" rows="10" spellcheck="false" placeholder="Paste the full backup here" required></textarea>' +
          '</label>' +
          '<div class="form-error is-hidden" data-form-error role="alert"></div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn btn-ghost btn-small" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="btn btn-primary btn-small">Review and restore</button>' +
          '</div>' +
        '</form>',
    });
  }

  function parseBackupText(text) {
    const parsed = JSON.parse(String(text || ""));
    const source = isPlainObject(parsed) && isPlainObject(parsed.state) ? parsed.state : parsed;
    const keys = ["settings", "daily", "weekly", "units", "setup", "tests", "errors"];
    if (!isPlainObject(source) || !keys.some((key) => Object.prototype.hasOwnProperty.call(source, key))) {
      throw new Error("Not an Ascent backup");
    }
    const cleanSource = window.AscentStorage ? window.AscentStorage.sanitizeImportedState(source) : JSON.parse(JSON.stringify(source));
    if (isPlainObject(cleanSource.daily)) {
      Object.keys(cleanSource.daily).forEach((date) => {
        if (isPlainObject(cleanSource.daily[date])) delete cleanSource.daily[date].sleep;
      });
    }
    window.__ASCENT_IMPORTED_EXTRA_DATA = isPlainObject(parsed.extraData) ? parsed.extraData : {};
    return normalizeState(cleanSource);
  }

  function saveRestoreTextForm(form) {
    clearFormError(form);
    const raw = fieldValue(form, "payload");
    if (!raw) {
      showFormError(form, "Paste the backup text first.");
      return;
    }
    let imported;
    try {
      imported = parseBackupText(raw);
    } catch (error) {
      showFormError(form, "That text is not a valid Ascent backup. Paste the whole JSON, including the outer braces.");
      return;
    }
    closeModal();
    confirmImport(imported, "Pasted backup text");
  }

  function confirmImport(imported, label) {
    imported.focus = null;
    const activeDays = Object.keys(imported.daily).length;
    openConfirm({
      eyebrow: "Replace this browser’s data",
      title: "Import this backup?",
      message: '<strong>' + esc(label) + '</strong> contains ' + activeDays + ' logged ' + plural(activeDays, "day") + ', ' +
        imported.tests.length + ' ' + plural(imported.tests.length, "assessment") + ', and ' +
        imported.errors.length + ' ' + plural(imported.errors.length, "error") + '. Importing replaces everything currently in this browser, and an active focus clock is not restored. This cannot be undone.',
      confirmLabel: "Replace my data",
      onConfirm: () => {
        state = imported;
        const importedExtras = window.__ASCENT_IMPORTED_EXTRA_DATA || {};
        const emptyExtras = {
          "ascent.mock.v1": { version: 1, records: [], active: null },
          "ascent.reading.v1": { version: 1, completed: [], choices: {}, words: [], answers: [], fontSize: 18, readingEnabled: true, sentenceChecks: {}, sessions: [], streak: { count: 0, lastDate: null, windowStart: null, freezeUsed: false }, session: { chapterId: null, step: "teaser", questionIndex: 0, feedback: null, elapsedSeconds: 0, startedAt: null, lastActiveAt: 0, warned15: false, warned20: false, prompt15: false, prompt20: false, mode: "read" } },
          "ascent.repair.v1": { version: 1, items: [], practice: [], focusLink: null },
          "ascent.backup-dismiss.v1": { version: 1, until: 0 }
        };
        ["ascent.mock.v1", "ascent.reading.v1", "ascent.repair.v1", "ascent.backup-dismiss.v1"].forEach((key) => {
          const value = isPlainObject(importedExtras[key]) && importedExtras[key].version === 1 ? importedExtras[key] : emptyExtras[key];
          try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (error) {
            toast("Some new feature data could not be restored because browser storage is full.");
          }
        });
        window.__ASCENT_IMPORTED_EXTRA_DATA = {};
        state.settings.lastBackupAt = new Date().toISOString();
        saveState();
        resetUiAfterDataChange();
        handleRouteChange(true);
        toast("Backup imported. " + activeDays + " " + plural(activeDays, "day") + " of evidence restored.");
      },
    });
  }

  function beginImport() {
    const input = document.querySelector("[data-import-file]");
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function importBackupFile(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      confirmImport(parseBackupText(text), file.name);
    } catch (error) {
      toast("That file could not be imported. Choose a JSON backup exported by Ascent.");
    } finally {
      fileInput.value = "";
    }
  }

  function resetUiAfterDataChange() {
    ui.selectedDate = todayISO();
    ui.selectedWeek = currentWeekNo();
    ui.reflectWeek = currentWeekNo();
    ui.booksSubject = "all";
    ui.booksGrade = "all";
    ui.booksStatus = "all";
    ui.bookUnitFilter = "all";
    ui.openUnits.clear();
    ui.lastBookId = null;
    ui.practiceTab = "overview";
    ui.errorFilters = { status: "open", subject: "all", cause: "all" };
    ui.lastView = "";
  }

  function resetAllProgress() {
    openConfirm({
      eyebrow: "Irreversible",
      title: "Reset all progress?",
      message: "This clears every check, score, error, review, and Nation Note. The 140-unit plan remains, but your evidence is gone. There is no undo. Export a backup first if there is any doubt.",
      confirmLabel: "Reset everything",
      danger: true,
      onConfirm: () => {
        state = createBlankState();
        saveState();
        resetUiAfterDataChange();
        if (window.location.hash === "#today" || !window.location.hash) {
          handleRouteChange(true);
        } else {
          window.location.hash = "today";
        }
        toast("Progress cleared. The plan starts blank.");
      },
    });
  }

  /* ==========================================================================
     Event handlers
     ========================================================================== */

  function shiftSelectedDay(delta) {
    const next = addDays(ui.selectedDate, delta);
    if (next < state.settings.startDate) {
      toast("This is the first day of the plan.");
      return;
    }
    if (next > todayISO()) {
      toast("Future days unlock when they arrive.");
      return;
    }
    ui.selectedDate = next;
    softRefresh();
  }

  function askDeleteTest(testId) {
    const test = state.tests.find((item) => item.id === testId);
    if (!test) {
      toast("That assessment no longer exists.");
      return;
    }
    const entries = testScoreEntries(test).length;
    openConfirm({
      eyebrow: "Irreversible",
      title: "Delete this assessment?",
      message: 'This removes <strong>' + esc(testDisplayName(test)) + '</strong> from ' + esc(formatDateShort(test.date)) + ', including ' +
        entries + ' ' + plural(entries, "paper score") + (test.autopsySavedAt ? " and its autopsy" : "") + '. There is no undo.',
      confirmLabel: "Delete assessment",
      danger: true,
      onConfirm: () => {
        state.tests = state.tests.filter((item) => item.id !== testId);
        saveState();
        softRefresh();
        toast("Assessment deleted.");
      },
    });
  }

  function askDeleteError(errorId) {
    const error = state.errors.find((item) => item.id === errorId);
    if (!error) {
      toast("That error no longer exists.");
      return;
    }
    openConfirm({
      eyebrow: "Irreversible",
      title: "Delete this error?",
      message: 'This removes the record of <strong>' + esc(error.question || "this error") + '</strong>, including its cause, fix, and retest history. There is no undo.',
      confirmLabel: "Delete error",
      danger: true,
      onConfirm: () => {
        state.errors = state.errors.filter((item) => item.id !== errorId);
        saveState();
        softRefresh();
        toast("Error deleted.");
      },
    });
  }

  function askDeleteMcq(date, logId) {
    const log = dayData(date).mcqs.find((item) => item.id === logId);
    if (!log) {
      toast("That practice log no longer exists.");
      return;
    }
    const subject = SUBJECT_BY_ID[log.subject];
    openConfirm({
      eyebrow: "Irreversible",
      title: "Delete this practice log?",
      message: 'This removes the ' + esc(formatDateShort(date)) + ' set of <strong>' + esc(Number(log.correct) + "/" + Number(log.count)) + '</strong>' +
        (subject ? " in " + esc(subject.name) : "") + '. The accuracy totals will change. There is no undo.',
      confirmLabel: "Delete log",
      danger: true,
      onConfirm: () => {
        deleteMcqLog(date, logId);
        softRefresh();
        toast("Practice log deleted.");
      },
    });
  }

  function updateMinimumsDom(input) {
    const container = input.closest(".minimums");
    if (!container) return;
    const row = input.closest(".minimum-row");
    const def = DATA.weeklyMinimums.find((item) => item.id === input.dataset.weekMinimum);
    if (row && def) {
      const value = input.value.trim();
      const actual = Number(value) || 0;
      const met = value !== "" && actual >= def.target;
      const status = row.querySelector(".minimum-status");
      if (status) {
        status.textContent = value === "" ? "—" : met ? "Met" : Math.round((actual / def.target) * 100) + "%";
        status.classList.toggle("met", met);
      }
    }
    const values = Array.from(container.querySelectorAll("[data-week-minimum]"));
    let metCount = 0;
    let actualTotal = 0;
    values.forEach((field) => {
      const target = DATA.weeklyMinimums.find((item) => item.id === field.dataset.weekMinimum);
      const actual = Number(field.value) || 0;
      if (target && field.value.trim() !== "" && actual >= target.target) metCount += 1;
      actualTotal += actual;
    });
    const totalTarget = DATA.weeklyMinimums.reduce((sum, item) => sum + item.target, 0);
    const total = container.querySelector(".minimums-total");
    if (total) {
      total.innerHTML = "<span>" + metCount + " of " + DATA.weeklyMinimums.length + " minimums met</span><strong>" +
        Number(actualTotal.toFixed(2)) + " / " + totalTarget + " h</strong>";
    }
  }

  function handleDocumentClick(event) {
    const skip = event.target.closest(".skip-link");
    if (skip) {
      event.preventDefault();
      if (els.main && typeof els.main.focus === "function") els.main.focus();
      if (els.main) els.main.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      event.preventDefault();
      navigate(viewButton.dataset.view);
      return;
    }

    const trigger = event.target.closest("[data-action]");
    if (!trigger) {
      if (event.target.matches("[data-modal-backdrop]")) closeModal();
      return;
    }
    const action = trigger.dataset.action;

    switch (action) {
      case "close-modal":
        closeModal();
        break;
      case "confirm-yes":
        runConfirmedAction();
        break;
      case "select-week": {
        const week = Number(trigger.dataset.week);
        if (Number.isFinite(week) && week >= 1 && week <= 30) navigate("journey", [week]);
        break;
      }
      case "week-step": {
        const delta = Number(trigger.dataset.delta) || 0;
        navigate("journey", [clamp(ui.selectedWeek + delta, 1, 30)]);
        break;
      }
      case "reflect-week-step": {
        const delta = Number(trigger.dataset.delta) || 0;
        navigate("reflect", [clamp(ui.reflectWeek + delta, 1, 30)]);
        break;
      }
      case "practice-tab":
        if (trigger.dataset.tab === "errors") navigate("practice", ["errors"]);
        else navigate("practice");
        break;
      case "day-prev":
        shiftSelectedDay(-1);
        break;
      case "day-next":
        shiftSelectedDay(1);
        break;
      case "day-today":
        ui.selectedDate = todayISO();
        softRefresh();
        break;
      case "start-focus":
        if (trigger.dataset.date && trigger.dataset.task) {
          startFocusSession(trigger.dataset.date, trigger.dataset.task);
        }
        break;
      case "focus-pause":
        pauseFocus();
        break;
      case "focus-resume":
        resumeFocus();
        break;
      case "focus-plus":
        addFocusMinutes(5);
        break;
      case "focus-stop":
        stopFocus();
        break;
      case "focus-mark-read":
        markFocusPortionRead();
        break;
      case "complete-reading": {
        const date = trigger.dataset.date;
        const taskId = trigger.dataset.task;
        if (!isISODate(date) || !taskId) break;
        const result = toggleDailyTask(date, taskId, true);
        softRefresh();
        if (result && result.unitReadingComplete) {
          toast("Portion read. Every portion in " + result.unit.name + " is now read — close the Learn pass.");
        } else if (result && result.unit) {
          toast(portionLabel(result.portion) + " marked read. The block is logged.");
        } else {
          toast("Block logged.");
        }
        break;
      }
      case "copy-backup":
        openBackupTextModal();
        break;
      case "copy-backup-text":
        copyBackupText(trigger);
        break;
      case "restore-backup-text":
        openRestoreTextModal();
        break;
      case "reset-page-range": {
        const unitId = trigger.dataset.unit;
        const record = unitId ? ensureUnit(unitId) : null;
        if (!record) break;
        delete record.pages;
        saveState();
        softRefresh('[data-action="toggle-unit"][data-unit="' + unitId + '"]');
        toast("Page range restored to the printed contents page.");
        break;
      }
      case "scroll-daily": {
        const card = document.getElementById("daily-card");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      case "filter-books-subject":
        ui.booksSubject = trigger.dataset.subject || "all";
        softRefresh();
        break;
      case "filter-book-units":
        ui.bookUnitFilter = trigger.dataset.filter || "all";
        softRefresh();
        break;
      case "clear-book-filters":
        ui.booksSubject = "all";
        ui.booksGrade = "all";
        ui.booksStatus = "all";
        ui.bookUnitFilter = "all";
        softRefresh();
        break;
      case "toggle-unit": {
        const unitId = trigger.dataset.unit;
        if (!unitId) break;
        const open = ui.openUnits.has(unitId);
        if (open) ui.openUnits.delete(unitId);
        else ui.openUnits.add(unitId);
        softRefresh('[data-action="toggle-unit"][data-unit="' + unitId + '"]');
        break;
      }
      case "toggle-unit-revision": {
        const unitId = trigger.dataset.unit;
        const unit = UNIT_BY_ID[unitId];
        if (!unit) break;
        const done = isUnitFullyRevised(unitId);
        if (!done && !isUnitFirstPassComplete(unitId)) {
          toast("Finish the build loop before marking the final revision.");
          break;
        }
        const finish = () => {
          toggleUnitRevision(unitId, !done);
          softRefresh('[data-action="toggle-unit-revision"][data-unit="' + unitId + '"]');
          toast(done ? "Final revision reopened." : "Final revision marked for " + unit.name + ".");
        };
        const revisionWeek = getRevisionWeek(unit);
        if (!done && currentWeekNo() < revisionWeek) {
          openConfirm({
            eyebrow: "Early final revision",
            title: "Mark it before Week " + revisionWeek + "?",
            message: '<strong>' + esc(unit.name) + '</strong> is scheduled for final revision in Week ' + revisionWeek + '. That revision is a closed-book, exam-condition rework, not a reread. Mark it now only if you have already done that work. The D+2, D+7, and D+30 retrieval dates remain separate.',
            confirmLabel: "Mark it anyway",
            onConfirm: finish,
          });
          break;
        }
        finish();
        break;
      }
      case "open-practice-modal":
        openPracticeModal({
          date: trigger.dataset.date,
          subjectId: trigger.dataset.subject,
          topic: trigger.dataset.topic,
        });
        break;
      case "open-test-modal":
        openTestModal({
          mockId: trigger.dataset.mock,
          testId: trigger.dataset.test,
          date: trigger.dataset.date,
        });
        break;
      case "edit-test":
        if (trigger.dataset.test) openTestModal({ testId: trigger.dataset.test });
        break;
      case "open-autopsy-modal":
        if (trigger.dataset.test) openAutopsyModal(trigger.dataset.test);
        break;
      case "delete-test":
        if (trigger.dataset.test) askDeleteTest(trigger.dataset.test);
        break;
      case "edit-error":
        openErrorModal(trigger.dataset.error || null);
        break;
      case "delete-error":
        if (trigger.dataset.error) askDeleteError(trigger.dataset.error);
        break;
      case "retest-error":
        if (trigger.dataset.error) openRetestModal(trigger.dataset.error);
        break;
      case "delete-mcq":
        if (trigger.dataset.log && trigger.dataset.date) askDeleteMcq(trigger.dataset.date, trigger.dataset.log);
        break;
      case "export-data":
        downloadBackup();
        break;
      case "import-data":
        beginImport();
        break;
      case "reset-data":
        resetAllProgress();
        break;
      default:
        break;
    }
  }

  function handleDocumentChange(event) {
    const target = event.target;

    if (target.matches("[data-daily-task]")) {
      const date = target.dataset.date;
      const taskId = target.dataset.dailyTask;
      if (isISODate(date) && taskId) {
        const result = toggleDailyTask(date, taskId, target.checked);
        softRefresh('[data-daily-task="' + taskId + '"][data-date="' + date + '"]');
        if (target.checked && result.unitReadingComplete && result.unit) {
          toast("Every portion in " + result.unit.name + " is now read. Close the Learn pass.");
        }
      }
      return;
    }

    if (target.matches("[data-portion-read]")) {
      const unitId = target.dataset.portionUnit;
      const start = Number(target.dataset.portionStart);
      const end = Number(target.dataset.portionEnd);
      if (!unitId || !Number.isFinite(start) || !Number.isFinite(end)) return;
      togglePortionRead(unitId, start, end, target.checked, todayISO());
      softRefresh('[data-portion-read][data-portion-unit="' + unitId + '"][data-portion-start="' + start + '"]');
      toast(target.checked ? "Portion marked read." : "Portion reopened.");
      return;
    }

    if (target.matches("[data-setup-item]")) {
      toggleSetup(target.dataset.setupItem, target.checked);
      softRefresh('[data-setup-item="' + target.dataset.setupItem + '"]');
      return;
    }

    if (target.matches("[data-week-task]")) {
      const week = Number(target.dataset.week);
      toggleWeeklyTask(week, target.dataset.weekTask, target.checked);
      softRefresh('[data-week-task="' + target.dataset.weekTask + '"][data-week="' + week + '"]');
      return;
    }

    if (target.matches("[data-unit-pass]")) {
      const unitId = target.dataset.unit;
      const key = target.dataset.unitPass;
      const unit = UNIT_BY_ID[unitId];
      if (!unit) return;
      const done = target.checked;
      const wasComplete = isUnitFirstPassComplete(unitId);
      const apply = () => {
        toggleUnitPass(unitId, key, done);
        const nowComplete = isUnitFirstPassComplete(unitId);
        if (!wasComplete && nowComplete) {
          const due = retrievalDueDate(unitId, "d2");
          toast("Build loop complete. D+2 recall due " + formatDateShort(due) + ".");
        } else if (wasComplete && !nowComplete) {
          toast("Build loop reopened. Retrieval waits for the loop to close again.");
        } else {
          toast(done ? "Pass logged for " + unit.name + "." : "Pass reopened for " + unit.name + ".");
        }
        softRefresh('[data-unit-pass="' + key + '"][data-unit="' + unitId + '"]');
      };

      if (done && key === "learn") {
        const progress = unitPortionProgress(unit);
        if (progress.total > 0 && progress.read < progress.total) {
          target.checked = false;
          openConfirm({
            eyebrow: "Close the Learn pass",
            title: "Mark the remaining " + (progress.total - progress.read) + " " + plural(progress.total - progress.read, "portion") + " read?",
            message: "You have read <strong>" + progress.read + " of " + progress.total + "</strong> portions of " + esc(unit.name) + ". Marking Learn records the whole unit as read, including pages the daily plan has not reached. Only do this if the unit is genuinely finished.",
            confirmLabel: "Yes, every page is read",
            onConfirm: apply,
          });
          return;
        }
      }

      if (done && (key === "prove" || key === "compress")) {
        const progress = unitPortionProgress(unit);
        if (progress.total > 0 && progress.read < progress.total) {
          target.checked = false;
          openConfirm({
            eyebrow: "Evidence check",
            title: "The pages are not finished",
            message: "<strong>" + (progress.total - progress.read) + " of " + progress.total + "</strong> portions of " + esc(unit.name) + " are still unread. Prove and Compress are honest only when the reading is done. Mark the pass anyway only if the evidence already exists.",
            confirmLabel: "Mark the pass anyway",
            onConfirm: apply,
          });
          return;
        }
      }

      apply();
      return;
    }

    if (target.matches("[data-unit-revisit]")) {
      const unitId = target.dataset.unit;
      const key = target.dataset.unitRevisit;
      if (!toggleUnitRevisit(unitId, key, target.checked)) {
        toast("Complete the build loop before retrieval.");
        return;
      }
      if (target.checked) toast("Retrieval logged. Pulling it back is the study.");
      softRefresh('[data-unit-revisit="' + key + '"][data-unit="' + unitId + '"]');
      return;
    }

    if (target.matches("[data-week-minimum]")) {
      const week = Number(target.dataset.week);
      const minimumId = target.dataset.weekMinimum;
      if (!Number.isFinite(week) || !minimumId) return;
      const record = ensureWeek(week);
      if (target.value.trim() === "") {
        delete record.minimums[minimumId];
      } else {
        const value = Number(target.value);
        if (!Number.isFinite(value) || value < 0) {
          target.value = record.minimums[minimumId] == null ? "" : record.minimums[minimumId];
          return;
        }
        const clamped = Math.min(40, Math.round(value * 100) / 100);
        record.minimums[minimumId] = clamped;
        if (String(clamped) !== target.value) target.value = clamped;
      }
      saveState();
      updateMinimumsDom(target);
      return;
    }

    if (target.matches("[data-book-grade-filter]")) {
      ui.booksGrade = target.value;
      softRefresh();
      return;
    }

    if (target.matches("[data-book-status-filter]")) {
      ui.booksStatus = target.value;
      softRefresh();
      return;
    }

    if (target.matches("[data-error-filter]")) {
      const key = target.dataset.errorFilter;
      if (key && Object.prototype.hasOwnProperty.call(ui.errorFilters, key)) {
        ui.errorFilters[key] = target.value;
        softRefresh();
      }
      return;
    }

    if (target.matches("[data-test-mock]")) {
      const form = target.closest("form");
      const mock = MOCK_BY_ID[target.value];
      if (!form || !mock) return;
      const nameField = form.elements.namedItem("testName");
      const dateField = form.elements.namedItem("testDate");
      const kindField = form.elements.namedItem("testKind");
      if (nameField) nameField.value = mock.name;
      if (dateField) dateField.value = mockDate(mock);
      if (kindField) kindField.value = "mock";
      return;
    }

    if (target.matches("[data-import-file]")) {
      importBackupFile(target);
    }
  }

  function handleDocumentSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    clearFormError(form);
    switch (form.dataset.form) {
      case "settings":
        saveSettingsForm(form);
        break;
      case "page-range":
        savePageRangeForm(form);
        break;
      case "restore-text":
        saveRestoreTextForm(form);
        break;
      case "practice":
        savePracticeForm(form);
        break;
      case "test":
        saveTestForm(form);
        break;
      case "autopsy":
        saveAutopsyForm(form);
        break;
      case "error":
        saveErrorForm(form);
        break;
      case "retest":
        saveRetestForm(form);
        break;
      case "review":
        saveReviewForm(form);
        break;
      case "nation":
        saveNationForm(form);
        break;
      default:
        break;
    }
  }

  function trapModalFocus(event) {
    const panel = els.modalRoot.querySelector(".modal-panel");
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape") {
      if (els.modalRoot.firstElementChild) {
        event.preventDefault();
        closeModal();
      }
      return;
    }
    if (event.key === "Tab") trapModalFocus(event);
  }

  function init() {
    if (!window.location.hash) window.history.replaceState(null, "", "#home");
    ui.selectedDate = todayISO();
    ui.selectedWeek = currentWeekNo();
    ui.reflectWeek = currentWeekNo();
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("change", handleDocumentChange);
    document.addEventListener("submit", handleDocumentSubmit);
    document.addEventListener("keydown", handleDocumentKeydown);
    window.addEventListener("hashchange", () => handleRouteChange(false));
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      state = loadState();
      resetUiAfterDataChange();
      handleRouteChange(true);
      toast("Progress synced from another tab.");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.focus) tickFocus();
    });
    if (state.focus && state.focus.status === "running" && state.focus.endsAt && Date.now() >= state.focus.endsAt) {
      completeFocus({ silent: true });
    } else if (state.focus && state.focus.status === "paused" && state.focus.remainingMs <= 0) {
      completeFocus({ silent: true });
    }
    ensureFocusTicker();
    handleRouteChange(true);
  }

  init();
})();
