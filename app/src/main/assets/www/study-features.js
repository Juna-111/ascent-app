/* Offline mock exams, readiness, repairs and Reading Quest. New data stays in versioned keys. */
(function () {
  "use strict";
  const MOCK_KEY = "ascent.mock.v1";
  const READING_KEY = "ascent.reading.v1";
  const REPAIR_KEY = "ascent.repair.v1";
  const CONFIG = window.ASCENT_EXAM_CONFIG || { subjects: {}, fullSetOrder: [] };
  const RULES = window.AscentReadiness;
  const STORY = window.READING_DATA;
  const root = document.getElementById("view-root");
  if (!root || !RULES || !STORY) return;
  const blankMock = () => ({ version: 1, records: [], active: null });
  const blankReading = () => ({ version: 1, completed: [], choices: {}, words: [], answers: [], fontSize: 18, readingEnabled: true, sentenceChecks: {}, sessions: [], streak: { count: 0, lastDate: null, windowStart: null, freezeUsed: false }, session: { chapterId: null, step: "teaser", questionIndex: 0, feedback: null, elapsedSeconds: 0, dayKey: null, daySeconds: 0, startedAt: null, lastActiveAt: 0, warned15: false, warned20: false, mode: "read" } });
  const blankRepair = () => ({ version: 1, items: [], practice: [], focusLink: null });
  function loadStore(key, fallback) {
    return window.AscentStorage.load(key, fallback, localStorage);
  }
  function save(key, value) {
    const ok = window.AscentStorage.save(key, value, localStorage);
    if (!ok) toast("Storage is full. Export a backup before continuing.");
    return ok;
  }
  function saveAll() { save(MOCK_KEY, mocks); save(READING_KEY, reading); save(REPAIR_KEY, repairs); }
  let mocks = loadStore(MOCK_KEY, blankMock);
  let reading = loadStore(READING_KEY, blankReading);
  let repairs = loadStore(REPAIR_KEY, blankRepair);
  function save(key, value) { value.version = 1; try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { toast("Storage is full. Export a backup before continuing."); return false; } }
  function saveAll() { save(MOCK_KEY, mocks); save(READING_KEY, reading); save(REPAIR_KEY, repairs); }
  function isoNow() { return new Date().toISOString().slice(0, 10); }
  function id(prefix) { return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch])); }
  function allUnits() {
    const data = window.PLAN_DATA || {};
    const subjects = data.subjects || [];
    return (data.books || []).flatMap(book => (book.units || []).map(unit => ({
      id: unit.id, name: unit.name, bookId: book.id, grade: book.grade,
      subjectId: book.subject, subject: (subjects.find(s => s.id === book.subject) || {}).name || book.subject,
      bookTitle: book.title
    })));
  }
  const UNITS = allUnits();
  const SUBJECTS = Object.keys(CONFIG.subjects || {}).map(key => ({ id: key, name: CONFIG.subjects[key].label || key }));
  function subjectName(id) { return (CONFIG.subjects[id] || {}).label || id || "Subject"; }
  function unitName(unitId) { const u = UNITS.find(x => x.id === unitId); return u ? u.subject + " · Grade " + u.grade + " · " + u.name : "General practice · no textbook unit linked"; }
  function toast(message) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const node = document.createElement("div"); node.className = "toast"; node.textContent = message; region.appendChild(node);
    setTimeout(() => node.remove(), 2600);
  }
  function pageHead(kicker, title, intro, actions) {
    return '<div class="mission-route-head"><span class="mission-kicker">' + esc(kicker) + '</span><h1>' + esc(title) + '</h1><p>' + esc(intro) + '</p>' + (actions || "") + '</div>';
  }
  function panel(title, body, extra) { return '<section class="mission-route-panel sf-panel">' + (title ? '<div class="mission-section-heading"><div><h2>' + title + '</h2></div></div>' : '') + body + (extra || '') + '</section>'; }
  function button(label, action, cls) { return '<button type="button" class="' + (cls || "mission-primary") + '" data-sf-action="' + action + '">' + label + '</button>'; }
  function currentRoute() { return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean); }
  function routeIsCustom(route) { return ["mock", "mock-history", "reading", "repairs", "english-skills", "vocabulary-collection"].includes(route[0]); }
  function unitPicker(selected, subjectFilter) {
    const groups = {};
    UNITS.forEach(unit => { if (!groups[unit.subjectId]) groups[unit.subjectId] = []; groups[unit.subjectId].push(unit); });
    const visibleSubjects = Object.keys(groups).filter(subjectId => subjectFilter === "full-set" || subjectId === subjectFilter);
    const groupsHtml = visibleSubjects.map(subjectId => {
      const units = groups[subjectId];
      return '<details ' + (subjectFilter === "full-set" || subjectFilter === subjectId ? "open" : "") + '><summary>' + esc(units[0].subject) + ' · ' + units.length + ' units</summary><div class="sf-unit-list">' + units.map(u => '<label><input type="checkbox" data-unit-pick value="' + esc(u.id) + '" ' + (selected.includes(u.id) ? "checked" : "") + '><span>Grade ' + u.grade + ' · ' + esc(u.name) + '</span></label>').join("") + '</div></details>';
    }).join("");
    return '<div class="sf-unit-groups">' + (groupsHtml || '<p class="sf-muted">No textbook units are catalogued for this subject. Incorrect answers will be saved as general repair items.</p>') + '</div>';
  }
  let mockDraft = { subject: "math", unitIds: [], mode: "totals" };
  function selectedUnitsFromDOM() { return Array.from(root.querySelectorAll("[data-unit-pick]:checked")).map(el => el.value); }
  function renderMockStart() {
    const subjectOptions = '<option value="full-set" ' + (mockDraft.subject === "full-set" ? "selected" : "") + '>Full set</option>' + SUBJECTS.map(s => '<option value="' + esc(s.id) + '" ' + (mockDraft.subject === s.id ? "selected" : "") + '>' + esc(s.name) + '</option>').join("");
    root.innerHTML = pageHead("TIMED PRACTICE", "Mock exam", "Choose a subject or a full set, select the textbook units covered, then start a timed section. The format below is a placeholder, not an official ESSLCE blueprint.") +
      panel("Set up a mock", '<label class="sf-field"><span>Subject or full set</span><select data-mock-subject>' + subjectOptions + '</select></label><p class="sf-note">' + esc(CONFIG.note || "Practice estimate, not an official score.") + '</p><label class="sf-field"><span>Question logging mode</span><select data-mock-mode><option value="totals" ' + (mockDraft.mode === "totals" ? "selected" : "") + '>Enter correct and total after the section</option><option value="questions" ' + (mockDraft.mode === "questions" ? "selected" : "") + '>Log each question: right, wrong or guessed</option></select></label><h3>Units covered</h3><p class="sf-muted">Select the units this mock covers so readiness can be estimated by unit.</p>' + unitPicker(mockDraft.unitIds, mockDraft.subject) + button("Start timed mock", "start-mock") + '<a class="mission-secondary sf-inline-link" href="#mock-history">View mock history →</a>');
  }
  function activeRecord() { return mocks.records.find(r => r.id === (mocks.active && mocks.active.recordId)); }
  function activeSection() { const record = activeRecord(); return record && record.sections[mocks.active.sectionIndex]; }
  function startMock() {
    const subject = mockDraft.subject;
    const subjectIds = subject === "full-set" ? (CONFIG.fullSetOrder || SUBJECTS.map(s => s.id)) : [subject];
    const unitIds = selectedUnitsFromDOM();
    if (!unitIds.length && subjectIds.some(subjectId => UNITS.some(unit => unit.subjectId === subjectId))) { toast("Select at least one textbook unit covered by this mock."); return; }
    const missingSubjects = subjectIds.filter(subjectId => UNITS.some(unit => unit.subjectId === subjectId) && !unitIds.some(unitId => {
      const unit = UNITS.find(item => item.id === unitId); return unit && unit.subjectId === subjectId;
    }));
    if (missingSubjects.length) { toast("Select at least one unit for each subject in the full set."); return; }
    const sections = [];
    subjectIds.forEach(subjectId => ((CONFIG.subjects[subjectId] || {}).sections || []).forEach(section => sections.push({
      id: id("section"), subjectId, sectionId: section.id, label: section.label,
      minutes: Number(section.minutes) || 1, questions: Math.max(1, Number(section.questions) || 1),
      marksPerQuestion: Number(section.marksPerQuestion) || 1, status: "pending", mode: mockDraft.mode,
      score: null, questionResults: [], remainingMs: (Number(section.minutes) || 1) * 60000
    })));
    if (!sections.length) { toast("No sections are configured for this selection."); return; }
    const record = { id: id("mock"), createdAt: isoNow(), startedAt: new Date().toISOString(), subjectIds, unitIds, sections, completedAt: null, durationSeconds: 0 };
    mocks.records.unshift(record); mocks.active = { recordId: record.id, sectionIndex: 0, running: false, sectionEndsAt: null, remainingMs: sections[0].remainingMs, currentQuestion: 0, questionStartedAt: 0 };
    save(MOCK_KEY, mocks); renderMock();
  }
  function currentSectionConfig(section) {
    const cfg = (CONFIG.subjects[section.subjectId] || {}).sections || [];
    return cfg.find(x => x.id === section.sectionId) || { minutes: section.minutes, questions: section.questions };
  }
  function startSection() {
    const section = activeSection(); if (!section) return;
    const active = mocks.active; active.running = true; active.sectionEndsAt = Date.now() + Math.max(0, Number(active.remainingMs) || section.remainingMs);
    section.status = "running";
    if (!active.questionStartedAt) active.questionStartedAt = Date.now();
    const record = activeRecord();
    const title = "Mock: " + subjectName(section.subjectId) + " · " + section.label;
    const focusSessionId = window.AscentFocus ? window.AscentFocus.startLinkedSession(title, Math.max(1, Math.ceil(active.remainingMs / 1000)), "mock", record.id + ":" + section.id) : null;
    repairs.focusLink = { version: 1, type: "mock", linkId: record.id + ":" + section.id, title, focusSessionId, startedAt: new Date().toISOString() };
    save(REPAIR_KEY, repairs);
    save(MOCK_KEY, mocks); renderMock();
  }
  function pauseSection() {
    const active = mocks.active; if (!active || !active.running) return;
    active.remainingMs = Math.max(0, active.sectionEndsAt - Date.now());
    if (active.questionStartedAt) active.currentQuestionElapsed = (active.currentQuestionElapsed || 0) + Math.max(0, Math.round((Date.now() - active.questionStartedAt) / 1000));
    active.questionStartedAt = 0; active.running = false; active.sectionEndsAt = null;
    if (window.AscentFocus) window.AscentFocus.pauseLinkedSession();
    save(MOCK_KEY, mocks); renderMock();
  }
  function finishSectionTimer() {
    const active = mocks.active; const section = activeSection(); if (!active || !section) return;
    if (active.running) active.remainingMs = Math.max(0, active.sectionEndsAt - Date.now());
    if (active.questionStartedAt) active.currentQuestionElapsed = (active.currentQuestionElapsed || 0) + Math.max(0, Math.round((Date.now() - active.questionStartedAt) / 1000));
    active.questionStartedAt = 0; active.running = false; active.sectionEndsAt = null;
    if (window.AscentFocus) window.AscentFocus.stopLinkedSession();
    section.status = "awaiting-score";
    section.timedOut = (Number(active.remainingMs) || 0) <= 0;
    if (section.mode === "questions") {
      const right = section.questionResults.filter(q => q.status === "right").length;
      section.score = { correct: right, total: section.questionResults.length, guessed: section.questionResults.filter(q => q.status === "guessed").length, accuracy: section.questionResults.length ? Math.round(right / section.questionResults.length * 100) : 0 };
    }
    save(MOCK_KEY, mocks); renderMock();
  }
  function sectionUnitIds(record, section) {
    return record.unitIds.filter(unitId => {
      const unit = UNITS.find(item => item.id === unitId);
      return unit && unit.subjectId === section.subjectId;
    });
  }
  function repairForResult(record, section, questionNo, status, unitId, description) {
    if (status === "right") return;
    const available = sectionUnitIds(record, section);
    const resolvedUnitId = unitId || (available.length ? available[(questionNo - 1) % available.length] : null);
    const item = { id: id("repair"), unitId: resolvedUnitId, sourceType: "mock", sourceId: record.id, createdAt: isoNow(), description: description || ("Question " + questionNo + ": " + (status === "guessed" ? "guessed answer" : "wrong answer")), status: "open", fixedAt: null, reviewStage: 0, questionNo, answerStatus: status };
    repairs.items.unshift(item);
  }
  function synthesizeTotalQuestions(record, section, correct, total) {
    section.questionResults = [];
    for (let n = 1; n <= total; n++) {
      const status = n <= correct ? "right" : "wrong";
      const unitIds = sectionUnitIds(record, section); const unitId = unitIds.length ? unitIds[(n - 1) % unitIds.length] : null;
      const q = { number: n, status, seconds: null, unitId };
      section.questionResults.push(q);
      if (status !== "right") repairForResult(record, section, n, status, unitId);
    }
  }
  function saveTotalScore() {
    const record = activeRecord(), section = activeSection(); if (!record || !section) return;
    const form = root.querySelector("[data-score-form]"); if (!form) return;
    const total = Math.max(1, Math.min(500, Number(form.elements.total.value) || section.questions));
    const correct = Math.max(0, Math.min(total, Number(form.elements.correct.value) || 0));
    section.score = { correct, total, accuracy: Math.round(correct / total * 100) };
    synthesizeTotalQuestions(record, section, correct, total);
    section.status = "done"; record.durationSeconds += Math.max(0, Math.round((section.minutes * 60) - (mocks.active.remainingMs / 1000)));
    advanceSection();
  }
  function saveQuestionAnswer(status) {
    const record = activeRecord(), section = activeSection(), active = mocks.active; if (!record || !section || !active) return;
    const n = active.currentQuestion + 1;
    const unitIds = sectionUnitIds(record, section); const unitId = unitIds.length ? unitIds[(n - 1) % unitIds.length] : null;
    const seconds = (active.currentQuestionElapsed || 0) + (active.questionStartedAt ? Math.max(0, Math.round((Date.now() - active.questionStartedAt) / 1000)) : 0);
    section.questionResults.push({ number: n, status, seconds, unitId });
    repairForResult(record, section, n, status, unitId);
    active.currentQuestion++;
    active.currentQuestionElapsed = 0;
    active.questionStartedAt = Date.now();
    if (active.currentQuestion >= section.questions) {
      const right = section.questionResults.filter(q => q.status === "right").length;
      section.score = { correct: right, total: section.questionResults.length, guessed: section.questionResults.filter(q => q.status === "guessed").length, accuracy: Math.round(right / section.questionResults.length * 100) };
      section.status = "done";
      record.durationSeconds += section.questionResults.reduce((sum, q) => sum + (q.seconds || 0), 0);
      advanceSection();
    } else { saveAll(); renderMock(); }
  }
  function advanceSection() {
    const record = activeRecord(); const active = mocks.active;
    if (!record || !active) return;
    if (window.AscentFocus) window.AscentFocus.stopLinkedSession();
    const next = active.sectionIndex + 1;
    if (next >= record.sections.length) {
      record.completedAt = new Date().toISOString();
      mocks.active = null;
      saveAll(); renderMock(); toast("Mock saved. Review the missed and guessed questions in Repairs."); return;
    }
    active.sectionIndex = next; active.running = false; active.sectionEndsAt = null;
    active.remainingMs = record.sections[next].remainingMs; active.currentQuestion = 0; active.questionStartedAt = 0; active.currentQuestionElapsed = 0;
    saveAll(); renderMock();
  }
  function renderMockActive() {
    const record = activeRecord(), section = activeSection(), active = mocks.active;
    if (!record || !section || !active) { mocks.active = null; save(MOCK_KEY, mocks); renderMockStart(); return; }
    const remaining = active.running ? Math.max(0, active.sectionEndsAt - Date.now()) : active.remainingMs;
    const clock = Math.floor(remaining / 1000);
    const timer = String(Math.floor(clock / 60)).padStart(2, "0") + ":" + String(clock % 60).padStart(2, "0");
    const sectionTitle = subjectName(section.subjectId) + " · " + section.label;
    let controls = "";
    if (section.status === "awaiting-score") {
      if (section.mode === "questions") {
        const right = section.questionResults.filter(q => q.status === "right").length;
        controls = '<p class="sf-note">Section time ended or was stopped. You logged ' + section.questionResults.length + ' questions (' + right + ' right, ' + section.questionResults.filter(q => q.status === "guessed").length + ' guessed).</p>' + button("Continue to next section", "advance-section");
      } else {
        controls = '<form data-score-form class="sf-score-form"><label class="sf-field"><span>Number correct</span><input type="number" name="correct" min="0" max="' + section.questions + '" value="0" required></label><label class="sf-field"><span>Total attempted</span><input type="number" name="total" min="1" max="500" value="' + section.questions + '" required></label><button class="mission-primary" type="submit">Save section score</button></form>';
      }
    } else if (section.mode === "questions") {
      const n = active.currentQuestion + 1;
      controls = (active.running ? button("Pause timer", "pause-section", "mission-secondary") : button("Start / resume timer", "start-section")) +
        (active.running ? '<p class="sf-muted">Question ' + n + ' of ' + section.questions + ' · Time per question is recorded.</p><div class="sf-answer-row">' + button("Right", "answer-right", "mission-primary") + button("Wrong", "answer-wrong", "mission-secondary") + button("Guessed", "answer-guessed", "mission-secondary") + '</div>' : '<p class="sf-muted">Start the section timer before logging answers.</p>') + button("Finish section early", "finish-section", "mission-secondary") + button("Skip section", "skip-section", "mission-secondary");
    } else {
      controls = active.running ? button("Pause timer", "pause-section", "mission-secondary") : button("Start / resume timer", "start-section");
      controls += button("Skip section", "skip-section", "mission-secondary");
    }
    root.innerHTML = pageHead("MOCK IN PROGRESS", "Timed mock", "Section " + (active.sectionIndex + 1) + " of " + record.sections.length + ". Results are stored locally on this device.") +
      panel(sectionTitle, '<div class="sf-clock" data-sf-clock>' + timer + '</div><p class="sf-muted">Placeholder duration: ' + section.minutes + ' minutes · target ' + section.questions + ' questions. Verify against official ESSLCE material.</p>' + controls) +
      '<p class="sf-note">Practice estimate, not an official score.</p>' + button("Cancel mock", "cancel-mock", "mission-secondary");
  }
  function renderMock() { if (mocks.active) renderMockActive(); else renderMockStart(); }
  function renderMockHistory() {
    const records = mocks.records.filter(r => r.completedAt);
    const history = records.length ? records.map(r => {
      const score = r.sections.filter(s => s.score).reduce((sum, s) => ({ correct: sum.correct + s.score.correct, total: sum.total + s.score.total }), { correct: 0, total: 0 });
      const pct = score.total ? Math.round(score.correct / score.total * 100) : 0;
      return '<article class="sf-history-item"><div><strong>' + esc(r.subjectIds.map(subjectName).join(" + ")) + '</strong><small>' + esc(r.createdAt) + ' · ' + r.sections.length + ' sections · ' + score.correct + '/' + score.total + ' correct</small><div class="sf-bar"><span style="width:' + pct + '%"></span></div><small>' + pct + '% · Practice estimate, not an official score.</small><small>' + (r.sections.some(s=>s.timedOut) ? "Time ran out in at least one section." : "No section timeout recorded.") + '</small></div><button type="button" class="mission-secondary" data-delete-mock="' + esc(r.id) + '">Delete</button></article>';
    }).join("") : '<p class="sf-muted">No completed mocks yet. Start a subject or full-set mock to build your history.</p>';
    const trends = SUBJECTS.map(subject => {
      const values = records.filter(r => r.subjectIds.includes(subject.id)).map(r => {
        const sections = r.sections.filter(s => s.subjectId === subject.id && s.score);
        const total = sections.reduce((n, s) => n + s.score.total, 0), correct = sections.reduce((n, s) => n + s.score.correct, 0);
        return total ? Math.round(correct / total * 100) : null;
      }).filter(v => v != null);
      const latest = values[0], previous = values[1];
      return '<div class="sf-trend"><span>' + esc(subject.name) + '</span><strong>' + (latest == null ? "No score yet" : latest + "%") + '</strong>' + (latest == null ? "" : '<div class="sf-bar"><span style="width:' + latest + '%"></span></div>') + '<small>' + (previous == null || latest == null ? "Need another mock for trend" : latest > previous ? "Up from " + previous + "%" : latest < previous ? "Down from " + previous + "%" : "Unchanged from " + previous + "%") + '</small></div>';
    }).join("");
    root.innerHTML = pageHead("LOCAL HISTORY", "Mock history", "Review your own practice results. No score here is an official ESSLCE result.") + panel("Subject trends", trends) + panel("Past mocks", history) + '<a class="mission-secondary sf-inline-link" href="#mock">Start another mock →</a>';
  }
  function openRepairs() { return repairs.items.filter(item => item.status === "open"); }
  function renderRepairs() {
    const today = isoNow();
    const items = repairs.items;
    const open = items.filter(i => i.status === "open");
    const fixed = items.filter(i => i.status === "fixed");
    const card = item => {
      const due = RULES.repairDueDate(item);
      const isDue = due && due <= today;
      return '<article class="sf-repair-item"><div class="sf-repair-top"><strong>' + esc(unitName(item.unitId)) + '</strong><span class="sf-status ' + (item.status === "open" ? "is-open" : "is-fixed") + '">' + esc(item.status) + '</span></div><small>' + esc(item.sourceType) + ' · ' + esc(item.sourceId) + ' · ' + (isDue ? "Due now" : "Next review " + due) + '</small><label class="sf-field"><span>What needs fixing?</span><input maxlength="180" data-repair-description="' + esc(item.id) + '" value="' + esc(item.description) + '"></label><div class="sf-actions">' + (item.status === "open" ? button("Mark fixed", "fix-repair", "mission-primary") : button("Review complete", "review-repair", "mission-secondary")) + '<button type="button" class="mission-secondary" data-repair-id="' + esc(item.id) + '">Delete</button></div><input type="hidden" data-repair-id-value="' + esc(item.id) + '"></article>';
    };
    root.innerHTML = pageHead("ERROR REPAIR", "Repair queue", open.length + " open repairs. Wrong and guessed answers stay here until fixed.") + panel("Open repairs · " + open.length, open.length ? open.map(card).join("") : '<p class="sf-muted">No open repairs. Keep logging practice so weak spots are caught early.</p>') + panel("Fixed · spaced review", fixed.length ? fixed.map(card).join("") : '<p class="sf-muted">Fixed items return after 1, 3, 7 and 14 days for spaced review.</p>');
  }
  function readinessForUnit(unit) {
    const relevantMocks = mocks.records.filter(r => r.completedAt && r.unitIds.includes(unit.id)).sort((a,b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    let mockAccuracy = null, lastReviewedAt = null;
    if (relevantMocks.length) {
      const questionSections = relevantMocks[0].sections.filter(s => s.mode === "questions" && s.questionResults && s.questionResults.some(q => q.unitId === unit.id));
      const questions = questionSections.flatMap(s => s.questionResults || []).filter(q => q.unitId === unit.id);
      if (questions.length) mockAccuracy = questions.filter(q => q.status === "right").length / questions.length * 100;
      else {
        const aggregate = relevantMocks[0].sections.filter(s => s.score && s.subjectId === unit.subjectId && relevantMocks[0].unitIds.includes(unit.id));
        const total = aggregate.reduce((n,s)=>n+s.score.total,0), correct = aggregate.reduce((n,s)=>n+s.score.correct,0);
        if (total) mockAccuracy = correct / total * 100;
      }
      lastReviewedAt = relevantMocks[0].createdAt;
    }
    const practice = repairs.practice.filter(p => p.questions.some(q => q.unitId === unit.id));
    let practiceAccuracy = null;
    if (practice.length) {
      const qs = practice.flatMap(p => p.questions).filter(q => q.unitId === unit.id);
      practiceAccuracy = qs.length ? qs.filter(q => q.status === "right").length / qs.length * 100 : null;
      lastReviewedAt = practice[practice.length - 1].createdAt;
    }
    if (!lastReviewedAt) {
      try {
        const legacy = JSON.parse(localStorage.getItem("ascent.esslce.v1") || "{}");
        const unitRecord = legacy.units && legacy.units[unit.id];
        if (unitRecord && typeof unitRecord === "object") {
          lastReviewedAt = unitRecord.lastReviewedAt || unitRecord.reviewedAt || unitRecord.completedAt || unitRecord.updatedAt || unitRecord.lastSeenAt || null;
        }
      } catch (error) { /* Legacy progress remains untouched if unavailable. */ }
    }
    const openCount = repairs.items.filter(i => i.unitId === unit.id && i.status === "open").length;
    const value = RULES.unitReadiness({ mockAccuracy, practiceAccuracy, openRepairs: openCount, lastReviewedAt, today: isoNow() });
    return { value, mockAccuracy, practiceAccuracy, openCount, lastReviewedAt };
  }
  function renderReadiness() {
    const grouped = {};
    UNITS.forEach(unit => { const r = readinessForUnit(unit); if (!grouped[unit.subject]) grouped[unit.subject] = []; grouped[unit.subject].push({ unit, readiness: r }); });
    const body = Object.keys(grouped).map(subject => {
      const weak = grouped[subject].sort((a,b) => a.readiness.value - b.readiness.value).slice(0,3);
      return '<div class="sf-readiness-subject"><h3>' + esc(subject) + '</h3>' + weak.map(x => '<div class="sf-readiness-unit"><div><strong>' + esc(x.unit.name) + '</strong><small>Grade ' + x.unit.grade + ' · ' + x.readiness.openCount + ' open repairs</small></div><div class="sf-readiness-score"><strong>' + x.readiness.value + '%</strong><small>Practice estimate, not an official score.</small></div></div>').join("") + '</div>';
    }).join("");
    return '<section class="mission-route-panel sf-panel" data-readiness-card><div class="mission-section-heading"><div><span class="mission-kicker">UNIT-LEVEL PRACTICE ESTIMATE</span><h2>Three weakest units per subject</h2><p>Weights: latest tagged mock accuracy 50%, practice accuracy 20%, unresolved-repair penalty 20%, review recency 10%.</p></div></div>' + body + '<p class="sf-note">Every readiness value is a practice estimate, not an official score. Missing mock or practice evidence is treated conservatively.</p></section>';
  }
  function weeklyCard() {
    const since = new Date(); since.setDate(since.getDate()-6); const from = since.toISOString().slice(0,10);
    const weekMocks = mocks.records.filter(r => r.createdAt >= from && r.completedAt);
    const covered = Array.from(new Set(weekMocks.flatMap(r => r.subjectIds)));
    const weakest = UNITS.map(unit => ({ unit, r: readinessForUnit(unit) })).sort((a,b)=>a.r.value-b.r.value).slice(0,3);
    const suggestion = repairs.items.some(i => i.status === "open" && RULES.daysBetween(i.createdAt, isoNow()) > 7)
      ? "Some repairs are older than 7 days. Schedule a repair session before starting new reading."
      : weekMocks.length === 0 ? "No mock was logged this week. Schedule one short timed section to measure recall."
      : "Keep the current routine and schedule one session for the weakest unit before adding new material.";
    const readingMinutes = (reading.sessions || []).filter(x=>x.date>=from).reduce((sum,x)=>sum+(Number(x.minutes)||0),0);
    const mockMinutes = Math.round(weekMocks.reduce((sum,r)=>sum+(r.durationSeconds||0),0)/60);
    const subjectTrends = SUBJECTS.map(subject => {
      const values = mocks.records.filter(r=>r.completedAt&&r.subjectIds.includes(subject.id)).map(r=>{
        const ss=r.sections.filter(x=>x.subjectId===subject.id&&x.score);
        const total=ss.reduce((n,x)=>n+x.score.total,0), correct=ss.reduce((n,x)=>n+x.score.correct,0);
        return total?Math.round(correct/total*100):null;
      }).filter(v=>v!=null);
      return '<span class="sf-week-trend"><strong>'+esc(subject.name)+'</strong> '+(values.length?values[0]+'%'+(values.length>1?' ('+(values[0]>values[1]?'up':values[0]<values[1]?'down':'steady')+' from '+values[1]+'%)':' · one mock'):'no mock yet')+'</span>';
    }).join("");
    return '<section class="mission-route-panel sf-panel" data-weekly-readiness><span class="mission-kicker">WEEKLY READINESS</span><h2>This week’s evidence</h2><p><strong>Subjects covered in completed mocks:</strong> ' + esc(covered.map(subjectName).join(", ") || "No completed mocks yet") + '</p><div class="sf-week-trends"><strong>Mock trend by subject</strong>'+subjectTrends+'</div><p><strong>Weakest units:</strong> ' + weakest.map(x=>esc(x.unit.name)+" ("+x.r.value+"%, practice estimate, not an official score.)").join(", ") + '</p><p><strong>Next-week adjustment:</strong> ' + esc(suggestion) + '</p><p class="sf-muted">Reading: ' + readingMinutes + ' min · Mock practice: ' + mockMinutes + ' min.</p></section>';
  }
    function decorateToday() {
    const list = root.querySelector(".mission-task-list");
    const hero = root.querySelector(".mission-hero");
    if (hero && !hero.querySelector("[data-open-repair-count]")) {
      const count = document.createElement("span"); count.className = "sf-open-count"; count.dataset.openRepairCount = "1";
      count.textContent = openRepairs().length + " open repairs"; hero.appendChild(count);
    }
    if (list && !root.querySelector("[data-today-repairs]")) {
      const due = RULES.dueRepairs(repairs.items, isoNow()).filter(i => i.status === "open").slice(0,2);
      if (due.length) {
        const card = document.createElement("section"); card.className = "sf-today-repairs"; card.dataset.todayRepairs = "1";
        card.innerHTML = '<div class="sf-repair-top"><strong>Repair tasks</strong><span class="sf-status is-open">' + openRepairs().length + ' open</span></div>' + due.map(i => '<article><div><strong>' + esc(i.description) + '</strong><small>' + esc(unitName(i.unitId)) + '</small></div><button type="button" class="mission-primary" data-start-repair="' + esc(i.id) + '">Start focus</button><a class="mission-secondary" href="#repairs">Open queue</a></article>').join("");
        if (list.children.length) list.children[0].after(card); else list.before(card);
      }
    }
    const existingReadingCard = root.querySelector("[data-reading-mission]");
    const englishTask = Array.from(root.querySelectorAll(".mission-task, .mission-task-card, .mission-task-item")).find(el => /english/i.test(el.textContent) && /skill/i.test(el.textContent));
    if (!reading.readingEnabled) {
      if (existingReadingCard) existingReadingCard.remove();
      if (englishTask) englishTask.hidden = false;
    } else {
      if (englishTask) englishTask.hidden = true;
      if (!existingReadingCard) {
        const chapter = nextReadingChapter();
        if (chapter) {
          const card = document.createElement("section"); card.className = "sf-reading-mission"; card.dataset.readingMission = "1";
          card.innerHTML = '<span class="mission-kicker">ENGLISH · READING QUEST</span><strong>' + esc(chapter.title) + '</strong><p>Continue the offline mystery and answer three reading questions.</p><a class="mission-primary" href="#reading/' + esc(chapter.id) + '">Start reading</a><label class="sf-toggle"><input type="checkbox" data-reading-enabled checked> Use Reading Quest as today’s English task</label>';
          const repairAnchor = root.querySelector("[data-today-repairs]");
          const first = repairAnchor || (list && list.children[0]);
          if (first) first.after(card); else if (list) list.before(card); else root.appendChild(card);
        }
      }
    }
  }
  function backupReminder() {
    const key = "ascent.backup-dismiss.v1";
    let saved = null; try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    if (saved && saved.version === 1 && saved.until && saved.until > Date.now()) {
      const banner = root.querySelector(".backup-banner"); if (banner) banner.hidden = true; return;
    }
    const banner = root.querySelector(".backup-banner");
    if (banner && !banner.querySelector("[data-dismiss-backup]")) {
      const b = document.createElement("button"); b.type = "button"; b.className = "mission-secondary"; b.dataset.dismissBackup = "1"; b.textContent = "Dismiss for 3 days"; banner.appendChild(b);
    }
  }
  function nextReadingChapter() {
    const chapters = (STORY.arcs || []).flatMap(a => a.chapters || []);
    return chapters.find(c => !reading.completed.includes(c.id)) || chapters[chapters.length-1] || null;
  }
  function chapterById(chapterId) { return (STORY.arcs || []).flatMap(a => a.chapters || []).find(c => c.id === chapterId) || null; }
  function chapterUnlocked(chapter) {
    if (!chapter) return false;
    if (chapter.number === 1) return true;
    const previous = chapterById(chapter.arc + "-chapter" + String(chapter.number-1).padStart(2,"0"));
    return !!previous && reading.completed.includes(previous.id);
  }
  function mergeDailyWords() {
    try {
      const raw = JSON.parse(localStorage.getItem("ascent.mission.v1") || "{}");
      const wordsByDate = raw.words || {};
      Object.keys(wordsByDate).forEach(date => (Array.isArray(wordsByDate[date]) ? wordsByDate[date] : []).forEach(w => {
        if (!w || !w.word || !String(w.word).trim()) return;
        addWord(w.word, w.meaning || "", w.sentence || "", "daily-vocabulary");
      }));
    } catch (e) {}
  }
  function addWord(word, meaning, example, source) {
    const clean = String(word || "").trim(); if (!clean) return;
    const key = clean.toLocaleLowerCase();
    let item = reading.words.find(w => String(w.word).toLocaleLowerCase() === key);
    if (!item) { item = { word: clean, meaning: String(meaning || ""), example: String(example || ""), status: "new", sources: [source || "reading"], recallDays: [], addedAt: isoNow(), lastSeenAt: isoNow() }; reading.words.push(item); }
    else {
      if (!item.meaning && meaning) item.meaning = meaning;
      if (!item.example && example) item.example = example;
      if (!item.sources.includes(source || "reading")) item.sources.push(source || "reading");
      item.lastSeenAt = isoNow();
    }
    save(READING_KEY, reading);
  }
  function meaningFor(chapter, word) {
    const key = String(word).toLocaleLowerCase().replace(/[^a-z'-]/g,"");
    const entry = (chapter.vocabulary || []).concat(chapter.targetWords || []).find(x => String(x.word).toLocaleLowerCase() === key);
    return entry ? { meaning: entry.meaning, example: entry.example || "" } : { meaning: "Saved for your word collection. Add a meaning when you review it.", example: "" };
  }
  function wordButtons(text, chapter) {
    return String(text).split(/(\s+)/).map(part => /^\s+$/.test(part) ? part : '<button type="button" class="sf-tap-word" data-read-word="' + esc(part.replace(/[^a-z'-]/gi,"")) + '" data-read-chapter="' + esc(chapter.id) + '">' + esc(part) + '</button>').join("");
  }
  const READING_LEVEL_THRESHOLDS = { beginner: 50, confident: 75 };
  function readingLevel() {
    const last = reading.answers.slice(-20);
    if (!last.length) return "Developing";
    const pct = last.filter(a=>a.correct).length / last.length * 100;
    return pct < READING_LEVEL_THRESHOLDS.beginner ? "Beginner" : pct < READING_LEVEL_THRESHOLDS.confident ? "Developing" : "Confident";
  }
  function updateStreak() {
    const today = isoNow(), streak = reading.streak;
    if (!streak.windowStart || RULES.daysBetween(streak.windowStart, today) >= 14) { streak.windowStart = today; streak.freezeUsed = false; }
    const gap = streak.lastDate ? RULES.daysBetween(streak.lastDate, today) : 999;
    if (gap === 1) streak.count = Math.max(1, streak.count) + 1;
    else if (gap > 1) streak.count = 1;
    streak.lastDate = today;
  }
  function streakWelcome() {
    const s = reading.streak;
    if (!s.lastDate || RULES.daysBetween(s.lastDate, isoNow()) <= 1) return "";
    const recovery = RULES.streakRecovery(s.lastDate, isoNow(), s.freezeUsed);
    if (!recovery.showWelcomeBack) return "";
    return '<section class="sf-welcome"><strong>Welcome back.</strong><p>Your reading place is saved. ' + (recovery.canRecover ? "Use your free missed day in this 14-day window to keep the streak going." : "Your streak can start again with today’s reading.") + '</p>' + (recovery.canRecover ? button("Recover my streak", "recover-streak") : "") + '</section>';
  }
  function renderReadingMap() {
    mergeDailyWords();
    const arc = STORY.arcs[0];
    const chapters = arc.chapters.map(c => {
      const unlocked = chapterUnlocked(c) || reading.completed.includes(c.id);
      const title = unlocked ? c.title : "???";
      return '<a class="sf-chapter-tile ' + (reading.completed.includes(c.id) ? "is-complete" : unlocked ? "is-open" : "is-locked") + '" href="' + (unlocked ? "#reading/" + c.id : "#reading") + '" ' + (!unlocked ? 'aria-disabled="true" tabindex="-1"' : "") + '><span>Chapter ' + c.number + '</span><strong>' + esc(title) + '</strong><small>' + (reading.completed.includes(c.id) ? "Completed · replay" : unlocked ? "Start / continue" : "Locked") + '</small></a>';
    }).join("");
    const dueWords = reading.words.filter(w => w.status !== "mastered");
    root.innerHTML = pageHead("OFFLINE ENGLISH MYSTERY", "Reading Quest", "Read the next chapter, solve three questions, and collect words as you go.") + streakWelcome() +
      panel("Your story map", '<p class="sf-muted">Arc 1 · ' + esc(arc.title) + '</p><div class="sf-chapter-map">' + chapters + '</div><div class="sf-summary-row"><div><strong>' + reading.completed.length + '/' + arc.chapters.length + '</strong><small>chapters complete</small></div><div><strong>' + readingLevel() + '</strong><small>reading level band</small></div><div><strong>' + reading.streak.count + '</strong><small>reading streak</small></div></div>') +
      panel("Word collection", '<p>' + reading.words.length + ' saved words · ' + dueWords.length + ' still learning.</p><a class="mission-primary" href="#vocabulary-collection">Open word collection</a>') +
      '<p class="sf-muted">Stories are original text bundled in the app. Future arcs can be added to reading-data.js; no online fetch is used.</p>';
  }
  function beginReading(chapter) {
    if (!chapterUnlocked(chapter) && !reading.completed.includes(chapter.id)) { toast("Finish the previous chapter to unlock this one."); location.hash = "reading"; return; }
    reading.session = Object.assign(blankReading().session, reading.session || {});
    reading.session.chapterId = chapter.id;
    reading.session.step = "teaser";
    reading.session.questionIndex = 0;
    reading.session.feedback = null;
    reading.session.lastActiveAt = Date.now();
    reading.session.startedAt = Date.now();
    reading.session.elapsedSeconds = 0;
    reading.session.dayKey = isoNow();
    reading.session.daySeconds = 0;
    reading.session.warned15 = false;
    reading.session.warned20 = false;
    reading.session.prompt15 = false;
    reading.session.prompt20 = false;
    save(READING_KEY, reading);
  }
  function ensureChapterSession(chapter) {
    if (!reading.session || reading.session.chapterId !== chapter.id) beginReading(chapter);
    if (!reading.session.lastActiveAt) reading.session.lastActiveAt = Date.now();
  }
  function readingTimeBanner() {
    const sec = reading.session.elapsedSeconds || 0;
    if (reading.session.prompt20 && !reading.session.warned20) return '<div class="sf-time-banner"><strong>Time for a break.</strong><p>Your place is saved. Take a short break before continuing.</p>' + button("Keep reading", "keep-reading") + '</div>';
    if (reading.session.prompt15 && !reading.session.warned15) return '<div class="sf-time-banner"><strong>Natural stopping point.</strong><p>You have been reading for about 15 minutes. Pause here or continue.</p>' + button("Keep reading", "keep-reading") + button("Stop for now", "stop-reading", "mission-secondary") + '</div>';
    return "";
  }
  function renderReadingChapter(chapter) {
    ensureChapterSession(chapter);
    const session = reading.session;
    const step = session.step || "teaser";
    const levelRule = RULES.adaptiveRule(reading.answers, (chapter.questions[0] || {}).skill);
    let body = "";
    if (step === "teaser") {
      body = '<p class="sf-teaser">' + esc(chapter.teaser || "A new chapter begins.") + '</p><h3>Preview three words</h3><div class="sf-target-words">' + chapter.targetWords.map(w=>'<button type="button" data-target-word="' + esc(w.word) + '" data-target-meaning="' + esc(w.meaning) + '"><strong>' + esc(w.word) + '</strong><small>Tap for meaning</small></button>').join("") + '</div>' + button("Start reading", "start-reading");
    } else if (step === "read") {
      const branch = chapter.branchStarts && reading.choices[chapter.arc] ? '<p class="sf-branch-start">' + esc(chapter.branchStarts[reading.choices[chapter.arc]]) + '</p>' : "";
      const reviewAtStart = levelRule === "review" ? '<aside class="sf-review-card"><strong>Quick review before reading</strong><ul>' + chapter.vocabulary.slice(0,3).map(v=>'<li><strong>'+esc(v.word)+'</strong>: '+esc(v.example)+'</li>').join("") + '</ul></aside>' : "";
      body = reviewAtStart + '<div class="sf-reading-controls"><label>Text size <input type="range" min="16" max="26" step="1" value="' + reading.fontSize + '" data-reading-font></label><span>' + reading.fontSize + ' px</span></div><article class="sf-story-text" style="font-size:' + reading.fontSize + 'px">' + branch + chapter.paragraphs.map(p=>'<p>' + wordButtons(p, chapter) + '</p>').join("") + '</article>' + button("Answer the questions", "to-questions");
    } else if (step === "questions") {
      const idx = session.questionIndex || 0;
      if (idx >= chapter.questions.length) {
        if (chapter.choice && !reading.choices[chapter.arc]) {
          body = '<h3>Choose the next lead</h3><p>' + esc(chapter.choice.prompt) + '</p><div class="sf-choice-list">' + chapter.choice.options.map(o=>'<button type="button" data-story-choice="' + esc(o.id) + '"><strong>' + esc(o.label) + '</strong><small>' + esc(o.branchText) + '</small></button>').join("") + '</div>';
        } else body = '<p>Questions complete. Reveal the next clue.</p>';
        body += button("Reveal the clue", "reveal-chapter");
      } else {
        const q = chapter.questions[idx];
        const adaptive = RULES.adaptiveRule(reading.answers, q.skill);
        let review = "";
        if (adaptive === "review") {
          const vocab = chapter.vocabulary.slice(0,3).map(v=>'<li><strong>' + esc(v.word) + '</strong>: ' + esc(v.example) + '</li>').join("");
          review = '<aside class="sf-review-card"><strong>Quick review</strong><p>Read these examples before trying the next skill question.</p><ul>' + vocab + '</ul></aside>';
        }
        body = review + '<div class="sf-question-count">Question ' + (idx+1) + ' of ' + chapter.questions.length + ' · ' + esc(q.skill) + '</div><h3>' + esc(q.question) + '</h3><div class="sf-options">' + q.options.map((opt,i)=>'<button type="button" data-reading-answer="' + i + '" ' + (session.feedback ? "disabled" : "") + '>' + esc(opt) + '</button>').join("") + '</div>';
        if (session.feedback) body += '<div class="sf-feedback ' + (session.feedback.correct ? "is-correct" : "is-wrong") + '"><strong>' + (session.feedback.correct ? "Correct" : "Not quite") + '</strong><p>' + esc(q.explanation) + '</p>' + button(idx + 1 >= chapter.questions.length ? "Continue" : "Next question", "next-question") + '</div>';
        if (adaptive === "challenge" && chapter.extraQuestions && chapter.extraQuestions.length) body += '<details class="sf-challenge"><summary>Optional challenge question</summary><p>' + esc(chapter.extraQuestions[0].question) + '</p><ul>' + chapter.extraQuestions[0].options.map(o=>'<li>' + esc(o) + '</li>').join("") + '</ul><details><summary>Check answer and explanation</summary><p><strong>Answer:</strong> ' + esc(chapter.extraQuestions[0].options[chapter.extraQuestions[0].answer]) + '</p><p>' + esc(chapter.extraQuestions[0].explanation) + '</p></details></details>';
      }
    } else if (step === "reveal") {
      body = '<div class="sf-reveal"><span class="mission-kicker">CLUE REVEALED</span><p>' + esc(chapter.cliffhanger) + '</p><strong>Next chapter unlocked.</strong></div>' + (chapter.number < STORY.arcs[0].chapters.length ? '<a class="mission-primary" href="#reading/' + esc(STORY.arcs[0].chapters[chapter.number].id) + '">Continue to chapter ' + (chapter.number+1) + '</a>' : '<a class="mission-primary" href="#reading">Return to story map</a>') + '<a class="mission-secondary sf-inline-link" href="#reading">Back to story map</a>';
    }
    root.innerHTML = pageHead("THE LANTERN ARCHIVE · CHAPTER " + chapter.number, chapter.title, "Read carefully, collect useful words, and let the evidence change your first guess.") + readingTimeBanner() + panel("Chapter session", body) + panel("Focus on this chapter", button("Start a 25-minute focus session", "start-reading-focus")) + '<p class="sf-muted">Reading time is counted only while this chapter is visible. Your place is saved on this device.</p>';
  }
  function renderReading() {
    const route = currentRoute();
    const chapter = route[1] ? chapterById(route[1]) : null;
    if (!chapter) renderReadingMap(); else renderReadingChapter(chapter);
  }
  function renderWordCollection() {
    mergeDailyWords();
    const rows = reading.words.map((w,i) => {
      const age = RULES.daysBetween(w.addedAt, isoNow());
      const due = [1,3,7,14].includes(age) && !(w.recallDays || []).includes(isoNow());
      return '<article class="sf-word-item"><div><strong>' + esc(w.word) + '</strong><small>' + esc(w.meaning || "Meaning not added") + '</small><p>' + esc(w.example || "Add an example sentence below.") + '</p><span class="sf-status ' + (w.status === "mastered" ? "is-fixed" : "is-open") + '">' + esc(w.status) + '</span>' + (due ? '<small>Spaced recall due today</small>' : '') + '</div><div class="sf-word-actions"><button type="button" class="mission-secondary" data-word-recall="' + i + '">Recall correct</button><button type="button" class="mission-secondary" data-word-review="' + i + '">Needs review</button></div><label class="sf-field"><span>Use it in a sentence this week</span><textarea maxlength="280" data-word-sentence="' + i + '">' + esc((reading.sentenceChecks[i] || {}).sentence || "") + '</textarea></label><div class="sf-actions"><button type="button" class="mission-secondary" data-sentence-status="' + i + '" data-status="ok">Sentence is OK</button><button type="button" class="mission-secondary" data-sentence-status="' + i + '" data-status="needs-work">Needs work</button><small>' + esc((reading.sentenceChecks[i] || {}).status || "Not checked this week") + '</small></div></article>';
    }).join("");
    root.innerHTML = pageHead("SHARED WORD COLLECTION", "Vocabulary", "Reading words and the existing four-word routine are merged by lowercase spelling. A word is mastered after correct recall on two different days.") + panel("Saved words · " + reading.words.length, rows || '<p class="sf-muted">Tap a word while reading or save today’s four words in the existing vocabulary screen.</p>') + '<a class="mission-secondary sf-inline-link" href="#vocabulary">Open daily four-word routine →</a>';
  }
    function renderEnglishSkills() {
    root.innerHTML = pageHead("KEEP THE ORIGINAL ROUTINE", "English skill practice", "The original English skill rotation remains available. Reading Quest can replace it on Today, or you can turn Reading Quest off below.") + panel("Choose your English task", '<p>Use the existing skill rotation from Today when Reading Quest is disabled.</p><label class="sf-toggle"><input type="checkbox" data-reading-enabled ' + (reading.readingEnabled ? "checked" : "") + '> Use Reading Quest as today’s English task</label><a class="mission-primary" href="#today">Open Today</a>');
  }
  function renderPracticeLogger() {
    if (root.querySelector("[data-practice-logger]")) return;
    const section = document.createElement("section"); section.className = "mission-route-panel sf-panel"; section.dataset.practiceLogger = "1";
    const subjectOptions = SUBJECTS.map(s=>'<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join("");
    section.innerHTML = '<span class="mission-kicker">QUESTION-LEVEL LOG</span><h2>Right, wrong or guessed</h2><p>Log each question with an optional time per question. Wrong and guessed answers create repair items.</p><form data-practice-form><label class="sf-field"><span>Unit</span><select name="unitId" required>' + UNITS.map(u=>'<option value="' + esc(u.id) + '">' + esc(u.subject) + ' · G' + u.grade + ' · ' + esc(u.name) + '</option>').join("") + '</select></label><label class="sf-field"><span>Number of questions</span><input type="number" name="count" min="1" max="100" value="5" required></label><label class="sf-field"><span>Optional seconds per question</span><input type="number" name="seconds" min="0" max="3600" value="0"></label><div class="sf-practice-questions" data-practice-questions></div><button class="mission-primary" type="submit">Save practice log</button></form>';
    root.appendChild(section);
    const form = section.querySelector("form");
    const count = form.elements.count.value;
    renderPracticeQuestions(section, Number(count));
  }
  function renderPracticeQuestions(section, count) {
    const box = section.querySelector("[data-practice-questions]");
    if (!box) return;
    box.innerHTML = Array.from({length:Math.max(1,Math.min(100,count||1))},(_,i)=>'<label class="sf-field"><span>Question ' + (i+1) + '</span><select data-practice-status><option value="right">Right</option><option value="wrong">Wrong</option><option value="guessed">Guessed</option></select></label>').join("");
  }
  function startRepairFocus(repairId) {
    const item = repairs.items.find(i=>i.id===repairId); if (!item) return;
    const title = "Repair: " + item.description;
    const focusSessionId = window.AscentFocus ? window.AscentFocus.startLinkedSession(title, 25*60, "repair", item.id) : null;
    repairs.focusLink = { version:1, type:"repair", repairId:item.id, linkId:item.id, focusSessionId, title, startedAt:new Date().toISOString() };
    save(REPAIR_KEY, repairs);
    toast("Focus started for this repair.");
  }
  function renderCurrent() {
    const route = currentRoute();
    if (routeIsCustom(route)) {
      if (root.dataset.studyFeatureRoute === route.join("/")) return;
      root.dataset.studyFeatureRoute = route.join("/");
      if (route[0] === "mock") renderMock();
      else if (route[0] === "mock-history") renderMockHistory();
      else if (route[0] === "reading") renderReading();
      else if (route[0] === "repairs") renderRepairs();
      else if (route[0] === "english-skills") renderEnglishSkills();
      else if (route[0] === "vocabulary-collection") renderWordCollection();
      return;
    }
    root.dataset.studyFeatureRoute = "";
    if (route[0] === "today") { decorateToday(); backupReminder(); }
    if (route[0] === "progress" && !root.querySelector("[data-readiness-card]")) root.insertAdjacentHTML("beforeend", renderReadiness());
    if ((route[0] === "journey" || route[0] === "reflect") && !root.querySelector("[data-weekly-readiness]")) root.insertAdjacentHTML("beforeend", weeklyCard());
    if (route[0] === "practice") renderPracticeLogger();
  }
  root.addEventListener("change", function (event) {
    const t = event.target;
    if (t.matches("[data-mock-subject]")) { mockDraft.unitIds = selectedUnitsFromDOM(); mockDraft.subject = t.value; renderMockStart(); }
    else if (t.matches("[data-mock-mode]")) { mockDraft.mode = t.value; }
    else if (t.matches("[data-unit-pick]")) { mockDraft.unitIds = selectedUnitsFromDOM(); }
    else if (t.matches("[data-reading-font]")) { reading.fontSize = Number(t.value)||18; save(READING_KEY,reading); renderReading(); }
    else if (t.matches("[data-reading-enabled]")) { reading.readingEnabled = t.checked; save(READING_KEY,reading); toast(t.checked ? "Reading Quest is now today’s English task." : "The original English skill task is available again."); if (currentRoute()[0] === "today") { root.dataset.studyFeatureRoute = ""; setTimeout(renderCurrent,100); } }
    else if (t.matches("[data-practice-form] [name=count]")) { const section=root.querySelector("[data-practice-logger]"); renderPracticeQuestions(section,Number(t.value)); }
    else if (t.matches("[data-repair-description]")) { const item=repairs.items.find(i=>i.id===t.dataset.repairDescription); if(item){item.description=t.value;save(REPAIR_KEY,repairs);} }
  });
  root.addEventListener("submit", function(event) {
    const form=event.target;
    if(form.matches("[data-score-form]")){event.preventDefault();saveTotalScore();}
    else if(form.matches("[data-practice-form]")){
      event.preventDefault();
      const unitId=form.elements.unitId.value, seconds=Math.max(0,Number(form.elements.seconds.value)||0), statuses=Array.from(form.querySelectorAll("[data-practice-status]")).map(t=>t.value);
      const record={id:id("practice"),createdAt:isoNow(),unitId,questions:statuses.map((status,index)=>({number:index+1,status,seconds,unitId}))};
      repairs.practice.unshift(record);
      statuses.forEach((status,index)=>{if(status!=="right")repairs.items.unshift({id:id("repair"),unitId,sourceType:"practice",sourceId:record.id,createdAt:isoNow(),description:"Question "+(index+1)+": "+status+" answer",status:"open",fixedAt:null,reviewStage:0,questionNo:index+1,answerStatus:status});});
      save(REPAIR_KEY,repairs);toast("Practice saved. Wrong and guessed answers are in Repairs.");form.reset();renderPracticeQuestions(root.querySelector("[data-practice-logger]"),5);
    }
  });
  root.addEventListener("click", function(event) {
    const t=event.target.closest("button"); if(!t)return;
    if(t.dataset.sfAction){
      const action=t.dataset.sfAction;
      if(action==="start-mock")startMock();
      else if(action==="start-section")startSection();
      else if(action==="pause-section")pauseSection();
      else if(action==="skip-section"){const section=activeSection();if(section){section.status="skipped";section.score={correct:0,total:0,accuracy:0};advanceSection();}}
      else if(action==="finish-section")finishSectionTimer();
      else if(action==="advance-section"){const section=activeSection();if(section){section.status="done";advanceSection();}}
      else if(action==="cancel-mock"){if(confirm("Cancel this mock? Recorded section results will remain in history.")){mocks.active=null;save(MOCK_KEY,mocks);renderMock();}}
      else if(action==="answer-right")saveQuestionAnswer("right");
      else if(action==="answer-wrong")saveQuestionAnswer("wrong");
      else if(action==="answer-guessed")saveQuestionAnswer("guessed");
      else if(action==="fix-repair"){const item=repairs.items.find(i=>i.id===t.closest(".sf-repair-item")?.querySelector("[data-repair-id-value]")?.value);if(item){item.status="fixed";item.fixedAt=isoNow();item.reviewStage=0;save(REPAIR_KEY,repairs);renderRepairs();}}
      else if(action==="review-repair"){const item=repairs.items.find(i=>i.id===t.closest(".sf-repair-item")?.querySelector("[data-repair-id-value]")?.value);if(item){item.reviewStage=Math.min(4,(Number(item.reviewStage)||0)+1);save(REPAIR_KEY,repairs);renderRepairs();}}
      else if(action==="start-reading-focus"){const chapter=chapterById(reading.session.chapterId);if(chapter){const focusSessionId=window.AscentFocus?window.AscentFocus.startLinkedSession(chapter.title,25*60,"reading",chapter.id):null;repairs.focusLink={version:1,type:"reading",linkId:chapter.id,title:chapter.title,focusSessionId,startedAt:new Date().toISOString()};save(REPAIR_KEY,repairs);toast("Focus started for "+chapter.title+".");}}
      else if(action==="start-reading"){reading.session.step="read";reading.session.lastActiveAt=Date.now();reading.session.elapsedSeconds=reading.session.elapsedSeconds||0;save(READING_KEY,reading);renderReading();}
      else if(action==="to-questions"){reading.session.step="questions";reading.session.questionIndex=0;reading.session.feedback=null;save(READING_KEY,reading);renderReading();}
      else if(action==="next-question"){reading.session.questionIndex++;reading.session.feedback=null;save(READING_KEY,reading);renderReading();}
      else if(action==="reveal-chapter"){const chapter=chapterById(reading.session.chapterId);if(chapter&&!reading.completed.includes(chapter.id))reading.completed.push(chapter.id);reading.session.step="reveal";updateStreak();save(READING_KEY,reading);renderReading();}
      else if(action==="keep-reading"){reading.session.warned15=true;reading.session.warned20=true;reading.session.prompt15=false;reading.session.prompt20=false;save(READING_KEY,reading);renderReading();}
      else if(action==="stop-reading"){reading.session.warned15=true;save(READING_KEY,reading);location.hash="reading";}
      else if(action==="recover-streak"){reading.streak.freezeUsed=true;const d=new Date();d.setDate(d.getDate()-1);reading.streak.lastDate=d.toISOString().slice(0,10);save(READING_KEY,reading);renderReadingMap();}
    } else if(t.dataset.deleteMock){
      if(confirm("Delete this mock result and its recorded score? Repair items already created from it will remain.")){mocks.records=mocks.records.filter(r=>r.id!==t.dataset.deleteMock);save(MOCK_KEY,mocks);renderMockHistory();}
    } else if(t.dataset.repairId){
      if(confirm("Delete this repair item?")){repairs.items=repairs.items.filter(i=>i.id!==t.dataset.repairId);save(REPAIR_KEY,repairs);renderRepairs();}
    } else if(t.dataset.startRepair){startRepairFocus(t.dataset.startRepair);}
    else if(t.dataset.readWord){
      const chapter=chapterById(t.dataset.readChapter), entry=chapter?meaningFor(chapter,t.dataset.readWord):{meaning:"Saved for review.",example:""};
      addWord(t.dataset.readWord,entry.meaning,entry.example,"reading");
      alert(t.dataset.readWord + "\n\n" + entry.meaning + (entry.example ? "\n\n" + entry.example : ""));
    } else if(t.dataset.targetWord){addWord(t.dataset.targetWord,t.dataset.targetMeaning,"","reading");alert(t.dataset.targetWord+"\n\n"+t.dataset.targetMeaning);}
    else if(t.dataset.readingAnswer!=null){
      const chapter=chapterById(reading.session.chapterId), q=chapter&&chapter.questions[reading.session.questionIndex];if(!q||reading.session.feedback)return;
      const correct=Number(t.dataset.readingAnswer)===q.answer;
      reading.session.feedback={correct,selected:Number(t.dataset.readingAnswer)};
      reading.answers.push({date:isoNow(),skill:q.skill,correct,chapterId:chapter.id});
      save(READING_KEY,reading);renderReading();
    } else if(t.dataset.storyChoice){
      const chapter=chapterById(reading.session.chapterId);if(chapter&&chapter.choice){reading.choices[chapter.arc]=t.dataset.storyChoice;save(READING_KEY,reading);renderReading();}
    } else if(t.dataset.wordRecall!=null){
      const item=reading.words[Number(t.dataset.wordRecall)];if(item){if(!item.recallDays.includes(isoNow()))item.recallDays.push(isoNow());if(item.recallDays.length>=2)item.status="mastered";else item.status="learning";save(READING_KEY,reading);renderWordCollection();}
    } else if(t.dataset.wordReview!=null){const item=reading.words[Number(t.dataset.wordReview)];if(item){item.status="learning";save(READING_KEY,reading);renderWordCollection();}}
    else if(t.dataset.sentenceStatus!=null){const i=Number(t.dataset.sentenceStatus);const field=root.querySelector('[data-word-sentence="'+i+'"]');reading.sentenceChecks[i]={sentence:field?field.value:"",status:t.dataset.status,checkedAt:isoNow()};save(READING_KEY,reading);renderWordCollection();}
    else if(t.dataset.dismissBackup){localStorage.setItem("ascent.backup-dismiss.v1",JSON.stringify({version:1,until:Date.now()+3*86400000}));const banner=t.closest(".backup-banner");if(banner)banner.hidden=true;}
  });
  function onActivity(){if(reading.session)reading.session.lastActiveAt=Date.now();}
  ["pointerdown","keydown","touchstart"].forEach(type=>document.addEventListener(type,onActivity,{passive:true}));
  document.addEventListener("visibilitychange",function(){if(document.hidden){save(READING_KEY,reading);}else onActivity();});
  setInterval(function(){
    if(mocks.active&&mocks.active.running){
      if(Date.now()>=mocks.active.sectionEndsAt){finishSectionTimer();}
      else {const clock=root.querySelector("[data-sf-clock]");if(clock){const n=Math.ceil((mocks.active.sectionEndsAt-Date.now())/1000);clock.textContent=String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}}
    }
    const route=currentRoute();
    if(route[0]==="reading"&&route[1]&&reading.session&&reading.session.chapterId&&!document.hidden){
      if(reading.session.dayKey!==isoNow()){reading.session.dayKey=isoNow();reading.session.daySeconds=0;}
      reading.session.daySeconds=(reading.session.daySeconds||0)+1;
      reading.session.elapsedSeconds=(reading.session.elapsedSeconds||0)+1;
      if(reading.session.elapsedSeconds>=1200&&!reading.session.warned20&&!reading.session.prompt20){reading.session.prompt20=true;root.dataset.studyFeatureRoute="";renderReading();}
      else if(reading.session.elapsedSeconds>=900&&!reading.session.warned15&&!reading.session.prompt15){reading.session.prompt15=true;root.dataset.studyFeatureRoute="";renderReading();}
      if(reading.session.daySeconds%60===0){reading.sessions=reading.sessions||[];let day=reading.sessions.find(x=>x.date===isoNow());if(!day){day={date:isoNow(),minutes:0};reading.sessions.push(day);}day.minutes++;save(READING_KEY,reading);}
      else if(reading.session.elapsedSeconds%10===0)save(READING_KEY,reading);
    }
  },1000);
  const observer=new MutationObserver(()=>setTimeout(renderCurrent,90));
  observer.observe(root,{childList:true,subtree:false});
  window.addEventListener("hashchange",()=>setTimeout(renderCurrent,170));
  setTimeout(renderCurrent,180);
})();