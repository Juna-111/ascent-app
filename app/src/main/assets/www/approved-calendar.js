/* Approved ESSLCE calendar: source-of-truth schedule, task completion and progress. */
(function () {
  "use strict";
  const root = document.getElementById("view-root");
  if (!root) return;
  const KEY = "ascent.approved-calendar.v1";
  const PROGRESS_KEY = "ascent.approved-progress.v1";
  const START = "2026-10-31";
  const END = "2027-03-29";
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let calendar = loadCalendar();
  let progress = loadProgress();
  let renderToken = 0;

  function loadCalendar() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "null");
      return value && value.version === 1 && Array.isArray(value.events) ? value : null;
    } catch (_) { return null; }
  }
  function loadProgress() {
    try {
      const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
      return value && typeof value.records === "object" ? value : { version: 1, records: {} };
    } catch (_) { return { version: 1, records: {} }; }
  }
  function saveProgress() {
    try {
      progress.version = 1;
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
      return true;
    } catch (_) {
      toast("Device storage is full. Export your Ascent backup before continuing.");
      return false;
    }
  }
  function saveCalendar(events) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, importedAt: new Date().toISOString(), events }));
      calendar = { version: 1, events };
      return true;
    } catch (_) {
      toast("The calendar is too large for this device's available storage. Free storage and import again.");
      return false;
    }
  }
  function toast(message) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    region.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[c]));
  }
  function decodeText(value) {
    return String(value || "")
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }
  function parseDateTime(line) {
    const value = String(line || "").split(":").slice(1).join(":").trim();
    const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
    if (!match) return null;
    return {
      date: match[1] + "-" + match[2] + "-" + match[3],
      time: match[4] ? match[4] + ":" + (match[5] || "00") : "All day",
      stamp: match[1] + match[2] + match[3] + (match[4] || "00") + (match[5] || "00")
    };
  }
  function parseICS(source) {
    const unfolded = String(source || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
    const lines = unfolded.split("\n");
    const events = [];
    let current = null;
    lines.forEach(line => {
      if (line === "BEGIN:VEVENT") { current = {}; return; }
      if (line === "END:VEVENT") {
        if (current && current.uid && current.start && current.title) events.push(current);
        current = null;
        return;
      }
      if (!current) return;
      const colon = line.indexOf(":");
      if (colon < 1) return;
      const left = line.slice(0, colon);
      const key = left.split(";")[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (key === "UID") current.uid = decodeText(value);
      else if (key === "SUMMARY") current.title = decodeText(value);
      else if (key === "DESCRIPTION") current.description = decodeText(value);
      else if (key === "DTSTART") current.start = parseDateTime(line);
      else if (key === "DTEND") current.end = parseDateTime(line);
    });
    events.sort((a, b) => a.start.date.localeCompare(b.start.date) || a.start.stamp.localeCompare(b.start.stamp));
    return events;
  }
  function isoDate(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function todayISO() {
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < 320) now.setDate(now.getDate() - 1);
    return isoDate(now);
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const d = new Date(value + "T12:00:00");
    return !Number.isNaN(d.getTime()) && isoDate(d) === value;
  }
  function shiftDate(value, amount) {
    const date = new Date(value + "T12:00:00");
    date.setDate(date.getDate() + amount);
    return isoDate(date);
  }
  function formatDate(value, options) {
    const date = new Date(value + "T12:00:00");
    return date.toLocaleDateString("en-GB", options || { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function activeDate() {
    const match = location.hash.match(/^#\/?(?:today|journey)\/(\d{4}-\d{2}-\d{2})$/);
    return match && validDate(match[1]) ? match[1] : todayISO();
  }
  function routeName() {
    return location.hash.replace(/^#\/?/, "").split("/")[0] || "home";
  }
  function dayEvents(date) {
    return calendar ? calendar.events.filter(event => event.start.date === date) : [];
  }
  function recordFor(uid) {
    if (!progress.records[uid] || typeof progress.records[uid] !== "object") progress.records[uid] = { done: false, steps: {} };
    const record = progress.records[uid];
    if (!record.steps || typeof record.steps !== "object") record.steps = {};
    return record;
  }
  function stepsFor(event) {
    const description = event.description || "";
    const matches = [];
    const pattern = /Step\s+(\d+)\s*\(([^)]*)\):\s*/gi;
    let match;
    while ((match = pattern.exec(description))) matches.push({ number: Number(match[1]), label: match[2], start: pattern.lastIndex, header: match.index });
    return matches.map((item, index) => ({
      id: "step-" + item.number,
      title: "Step " + item.number + " · " + item.label,
      detail: description.slice(item.start, index + 1 < matches.length ? matches[index + 1].header : description.length).trim()
    })).filter(step => step.detail);
  }
  function isDone(event) {
    const record = recordFor(event.uid);
    const steps = stepsFor(event);
    return !!record.done || (steps.length > 0 && steps.every(step => !!record.steps[step.id]));
  }
  function progressFor(events) {
    const total = events.length;
    const done = events.filter(isDone).length;
    return { total, done, percent: total ? Math.round(done / total * 100) : 0 };
  }
  function titleCategory(title) {
    const parts = String(title || "").split("·").map(part => part.trim());
    return parts.length > 1 ? parts[1] : (parts[0] || "Other");
  }
  function eventCard(event, index) {
    const record = recordFor(event.uid);
    const steps = stepsFor(event);
    const done = isDone(event);
    const time = event.start.time + (event.end && event.end.time !== "All day" ? "–" + event.end.time : "");
    const stepMarkup = steps.length ? '<details class="approved-steps"><summary>Learning steps <span>' + steps.filter(step => record.steps[step.id]).length + '/' + steps.length + ' complete</span></summary><div class="approved-step-list">' +
      steps.map(step => '<label class="approved-step"><input type="checkbox" data-approved-step="' + esc(step.id) + '" data-event-id="' + esc(event.uid) + '" ' + (record.steps[step.id] ? "checked" : "") + '><span><strong>' + esc(step.title) + '</strong><small>' + esc(step.detail) + '</small></span></label>').join("") +
      '</div></details>' : "";
    const desc = event.description && !steps.length ? '<p class="approved-event-description">' + esc(event.description) + '</p>' : "";
    return '<article class="approved-event ' + (done ? "is-complete" : "") + '" style="--event-index:' + Math.min(index, 20) + '"><div class="approved-event-time">' + esc(time) + '</div><label class="approved-event-check"><input type="checkbox" data-approved-done="' + esc(event.uid) + '" ' + (done ? "checked" : "") + '><span aria-hidden="true"></span></label><div class="approved-event-body"><div class="approved-event-heading"><h3>' + esc(event.title) + '</h3><span class="approved-event-status">' + (done ? "Completed" : "Pending") + '</span></div>' + desc + stepMarkup + '</div></article>';
  }
  function dateControls(date) {
    return '<div class="approved-date-controls"><button type="button" data-date-shift="-1" aria-label="Previous day">‹</button><label><span>Choose any date</span><input type="date" min="' + START + '" max="' + END + '" value="' + esc(date) + '" data-approved-date></label><button type="button" data-date-shift="1" aria-label="Next day">›</button><button type="button" class="approved-today-button" data-go-today>Today</button></div>';
  }
  function importPanel() {
    return '<section class="approved-import"><div class="approved-import-icon">↥</div><div><h2>Load your approved five-month calendar</h2><p>Import <strong>ESSLCE-2027-Approved-Calendar.ics</strong> once. Ascent will keep all scheduled activities, original times and descriptions on this device. Your completion records remain separate.</p><label class="approved-import-button">Choose calendar file<input type="file" accept=".ics,text/calendar,text/plain" data-approved-import></label><p class="approved-import-note">The file is processed on your device. No upload or internet connection is used.</p></div></section>';
  }
  function dayMarkup(date) {
    const events = dayEvents(date);
    const stats = progressFor(events);
    const byTime = events.map(eventCard).join("");
    const isToday = date === todayISO();
    const empty = '<section class="approved-empty"><h2>No activities found for this date</h2><p>Choose another date within the approved plan.</p></section>';
    return '<div class="approved-page">' +
      '<header class="approved-header"><span class="approved-eyebrow">YOUR APPROVED ESSLCE 2027 CALENDAR</span><h1>' + (isToday ? "Today’s mission" : "Daily mission") + '</h1><p>' + esc(formatDate(date)) + '</p>' + dateControls(date) + '</header>' +
      '<section class="approved-day-progress"><div><strong>' + stats.percent + '%</strong><span>of this day completed</span></div><div class="approved-progress-track"><span style="width:' + stats.percent + '%"></span></div><small>' + stats.done + ' of ' + stats.total + ' activities completed · ' + (events.reduce((sum, e) => sum + stepsFor(e).length, 0)) + ' guided learning steps</small></section>' +
      (events.length ? '<div class="approved-timeline">' + byTime + '</div>' : empty) +
      '<footer class="approved-day-footer"><span>Consistency, not perfection.</span><a href="#journey/' + date + '">Open this week →</a></footer></div>';
  }
  function weekMarkup(date) {
    const selected = new Date(date + "T12:00:00");
    const mondayOffset = (selected.getDay() + 6) % 7;
    const monday = shiftDate(date, -mondayOffset);
    const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i)).filter(d => d >= START && d <= END);
    const weekEvents = days.flatMap(dayEvents);
    const stats = progressFor(weekEvents);
    return '<div class="approved-page"><header class="approved-header"><span class="approved-eyebrow">WEEKLY OVERVIEW</span><h1>Your week, clearly mapped.</h1><p>' + esc(formatDate(days[0], { day: "numeric", month: "long" })) + ' – ' + esc(formatDate(days[days.length - 1], { day: "numeric", month: "long", year: "numeric" })) + '</p>' + dateControls(date) + '</header>' +
      '<section class="approved-day-progress"><div><strong>' + stats.percent + '%</strong><span>weekly completion</span></div><div class="approved-progress-track"><span style="width:' + stats.percent + '%"></span></div><small>' + stats.done + ' of ' + stats.total + ' scheduled activities completed</small></section>' +
      '<div class="approved-week-grid">' + days.map(day => {
        const events = dayEvents(day), dayStats = progressFor(events);
        const active = day === date;
        return '<a href="#today/' + day + '" class="approved-week-day ' + (active ? "is-selected" : "") + '"><span>' + esc(formatDate(day, { weekday: "short" })) + '</span><strong>' + Number(day.slice(-2)) + '</strong><small>' + dayStats.done + '/' + dayStats.total + ' done</small><i><b style="width:' + dayStats.percent + '%"></b></i></a>';
      }).join("") + '</div><div class="approved-week-actions"><a href="#today/' + days[0] + '">Open first day</a><a href="#today/' + days[days.length - 1] + '">Open last day</a></div></div>';
  }
  function progressMarkup() {
    const all = calendar.events;
    const overall = progressFor(all);
    const categories = {};
    all.forEach(event => {
      const key = titleCategory(event.title);
      if (!categories[key]) categories[key] = [];
      categories[key].push(event);
    });
    const categoryRows = Object.keys(categories).sort().map(name => {
      const stats = progressFor(categories[name]);
      return '<div class="approved-category-row"><div><strong>' + esc(name) + '</strong><span>' + stats.done + '/' + stats.total + ' · ' + stats.percent + '%</span></div><i><b style="width:' + stats.percent + '%"></b></i></div>';
    }).join("");
    const byDate = {};
    all.forEach(event => { (byDate[event.start.date] || (byDate[event.start.date] = [])).push(event); });
    const activeDays = Object.keys(byDate).sort();
    const completedDays = activeDays.filter(date => progressFor(byDate[date]).percent === 100).length;
    return '<div class="approved-page"><header class="approved-header"><span class="approved-eyebrow">REAL COMPLETION, NOT TIME SPENT</span><h1>Your progress is earned.</h1><p>Every number below comes from the activities and learning steps you actually complete.</p></header>' +
      '<section class="approved-progress-hero"><div class="approved-progress-number"><strong>' + overall.percent + '%</strong><span>overall plan completion</span></div><div class="approved-progress-track"><span style="width:' + overall.percent + '%"></span></div><div class="approved-progress-facts"><span><strong>' + overall.done.toLocaleString() + '</strong> completed</span><span><strong>' + (overall.total - overall.done).toLocaleString() + '</strong> remaining</span><span><strong>' + completedDays + '</strong> fully completed days</span></div></section>' +
      '<section class="approved-progress-panel"><div class="approved-panel-heading"><h2>Progress by activity type</h2><span>From the approved calendar</span></div>' + categoryRows + '</section>' +
      '<section class="approved-progress-panel"><div class="approved-panel-heading"><h2>Plan coverage</h2><span>' + esc(formatDate(START, { day: "numeric", month: "short" })) + ' – ' + esc(formatDate(END, { day: "numeric", month: "short", year: "numeric" })) + '</span></div><div class="approved-coverage-grid"><div><strong>' + activeDays.length + '</strong><span>scheduled days</span></div><div><strong>' + all.length.toLocaleString() + '</strong><span>activities</span></div><div><strong>' + all.reduce((sum, event) => sum + stepsFor(event).length, 0).toLocaleString() + '</strong><span>guided study steps</span></div></div></section></div>';
  }
  function homeMarkup() {
    const date = todayISO();
    const events = dayEvents(date);
    const stats = progressFor(events);
    return '<div class="approved-page"><header class="approved-header approved-home-header"><span class="approved-eyebrow">ASCENT · ESSLCE 2027</span><h1>One completed task at a time.</h1><p>Your approved calendar is the plan. Your checkmarks are the evidence.</p></header>' +
      '<section class="approved-home-card"><div><span class="approved-eyebrow">TODAY · ' + esc(formatDate(date, { weekday: "long", day: "numeric", month: "long" })) + '</span><h2>' + stats.done + ' of ' + stats.total + ' activities completed</h2><div class="approved-progress-track"><span style="width:' + stats.percent + '%"></span></div><p>' + stats.percent + '% complete. Every activity counts, including the small routines that keep the study day working.</p><a href="#today/' + date + '" class="approved-action">Open today’s mission <span>→</span></a></div><div class="approved-home-ring" style="--approved-pct:' + stats.percent + '%"><strong>' + stats.percent + '%</strong></div></section>' +
      '<div class="approved-home-links"><a href="#journey/' + date + '"><strong>Explore the week</strong><span>Open any day in the schedule →</span></a><a href="#progress"><strong>Track your progress</strong><span>See completion across all five months →</span></a></div></div>';
  }
  function render() {
    const route = routeName();
    if (!["home", "today", "journey", "progress"].includes(route)) return;
    const token = ++renderToken;
    if (!calendar) {
      root.innerHTML = '<div class="approved-page"><header class="approved-header"><span class="approved-eyebrow">APPROVED STUDY PLAN</span><h1>Let’s load your real timetable.</h1><p>Ascent is ready. Import the approved calendar to activate every daily activity and progress checker.</p></header>' + importPanel() + '</div>';
      return;
    }
    const date = activeDate();
    const html = route === "progress" ? progressMarkup() : route === "journey" ? weekMarkup(date) : route === "home" ? homeMarkup() : dayMarkup(date);
    if (token !== renderToken) return;
    root.innerHTML = html;
    if (!reducedMotion) {
      root.querySelectorAll(".approved-event").forEach((node, index) => {
        node.style.animationDelay = Math.min(index * 22, 240) + "ms";
      });
    }
  }
  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const events = parseICS(reader.result);
        if (events.length < 3000 || !events.some(event => event.start.date === START) || !events.some(event => event.start.date === END)) {
          throw new Error("This does not look like the complete approved ESSLCE calendar.");
        }
        if (!saveCalendar(events)) return;
        toast("Approved calendar loaded: " + events.length.toLocaleString() + " activities.");
        render();
      } catch (error) {
        toast(error && error.message ? error.message : "Could not read this calendar file.");
      }
    };
    reader.onerror = () => toast("The calendar file could not be read.");
    reader.readAsText(file);
  }
  document.addEventListener("change", function (event) {
    const target = event.target;
    if (target.matches("[data-approved-import]")) {
      importFile(target.files && target.files[0]);
      target.value = "";
      return;
    }
    if (target.matches("[data-approved-done]")) {
      const record = recordFor(target.dataset.approvedDone);
      record.done = target.checked;
      if (target.checked) {
        const activity = calendar.events.find(item => item.uid === target.dataset.approvedDone);
        if (activity) stepsFor(activity).forEach(step => { record.steps[step.id] = true; });
      } else {
        record.steps = {};
      }
      saveProgress();
      render();
      if (target.checked) toast("Activity completed. Keep the momentum.");
      return;
    }
    if (target.matches("[data-approved-step]")) {
      const uid = target.dataset.eventId;
      const record = recordFor(uid);
      record.steps[target.dataset.approvedStep] = target.checked;
      const activity = calendar.events.find(item => item.uid === uid);
      const steps = activity ? stepsFor(activity) : [];
      record.done = steps.length > 0 && steps.every(step => !!record.steps[step.id]);
      saveProgress();
      render();
      return;
    }
    if (target.matches("[data-approved-date]") && validDate(target.value)) {
      location.hash = "#today/" + target.value;
    }
  });
  document.addEventListener("click", function (event) {
    const shift = event.target.closest("[data-date-shift]");
    if (shift) {
      const next = shiftDate(activeDate(), Number(shift.dataset.dateShift));
      if (next >= START && next <= END) location.hash = (routeName() === "journey" ? "#journey/" : "#today/") + next;
      return;
    }
    if (event.target.closest("[data-go-today]")) {
      location.hash = "#today/" + todayISO();
      return;
    }
  });
  const observer = new MutationObserver(() => {
    const route = routeName();
    if (["home", "today", "journey", "progress"].includes(route) && root.dataset.approvedRendered !== route) {
      root.dataset.approvedRendered = route;
      window.setTimeout(render, 30);
    }
  });
  observer.observe(root, { childList: true });
  window.addEventListener("hashchange", () => {
    root.dataset.approvedRendered = "";
    window.setTimeout(render, 120);
  });
  window.setTimeout(render, 260);
})();