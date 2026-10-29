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

  function saveSleepForm(form) {
    clearFormError(form);
    const date = fieldValue(form, "date");
    const coreRaw = fieldValue(form, "core");
    const napRaw = fieldValue(form, "napMinutes");
    const energyRaw = fieldValue(form, "energy");
    const note = fieldValue(form, "note");

    if (!isISODate(date)) {
      showFormError(form, "Choose a valid date.");
      return;
    }
    if (coreRaw === "" && napRaw === "") {
      showFormError(form, "Record core sleep, a nap, or both.");
      return;
    }
    const core = coreRaw === "" ? 0 : Number(coreRaw);
    if (!Number.isFinite(core) || core < 0 || core > 16) {
      showFormError(form, "Core sleep must be between 0 and 16 hours.");
      return;
    }
    const napMinutes = napRaw === "" ? 0 : Number(napRaw);
    if (!Number.isFinite(napMinutes) || napMinutes < 0 || napMinutes > 300) {
      showFormError(form, "The nap must be between 0 and 300 minutes.");
      return;
    }
    if (core + napMinutes / 60 <= 0) {
      showFormError(form, "Record at least some sleep so the chart means something.");
      return;
    }
    let energy = null;
    if (energyRaw !== "") {
      energy = Number(energyRaw);
      if (!Number.isInteger(energy) || energy < 1 || energy > 5) {
        showFormError(form, "Morning energy must be between 1 and 5.");
        return;
      }
    }

    saveSleep(date, {
      core: Math.round(core * 100) / 100,
      nap: Math.round((napMinutes / 60) * 100) / 100,
      energy: energy,
      note: note,
      loggedAt: new Date().toISOString(),
    });
    const total = core + napMinutes / 60;
    closeModal();
    softRefresh();
    toast("Sleep logged · " + formatHours(total) + " total for " + formatDayMonth(date) + ".");
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
        ["ascent.mock.v1", "ascent.reading.v1", "ascent.repair.v1", "ascent.backup-dismiss.v1"].forEach((key) => {
          if (isPlainObject(importedExtras[key]) && importedExtras[key].version === 1) {
            try { window.localStorage.setItem(key, JSON.stringify(importedExtras[key])); } catch (error) {
              toast("Some new feature data could not be restored because browser storage is full.");
            }
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
      case "sleep":
        saveSleepForm(form);
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
