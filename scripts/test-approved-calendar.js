"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const root = { innerHTML: "", dataset: {}, querySelectorAll: () => [], insertAdjacentHTML() {} };
const storage = new Map();
const window = {
  matchMedia: () => ({ matches: true }),
  setTimeout() {},
  addEventListener() {},
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  }
};
const document = {
  getElementById() { return root; },
  addEventListener() {}
};
class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}
const context = { window, document, localStorage: window.localStorage, location: { hash: "" }, MutationObserver, console };
vm.runInNewContext(fs.readFileSync("app/src/main/assets/www/approved-calendar.js", "utf8"), context, { filename: "approved-calendar.js", timeout: 2000 });

const fixture = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:study-1@example.test",
  "DTSTART;TZID=Africa/Addis_Ababa:20261101T080000",
  "DTEND;TZID=Africa/Addis_Ababa:20261101T093000",
  "SUMMARY:STUDY · Physics · Tier B",
  "DESCRIPTION:Step 1 (10 min\\, recall): Recall three ideas.\\nStep 2 (25 min\\, learn): Read the lesson and write a summary.",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:rest-1@example.test",
  "DTSTART;TZID=Africa/Addis_Ababa:20261101T093000",
  "DTEND;TZID=Africa/Addis_Ababa:20261101T094000",
  "SUMMARY:BREAK",
  "DESCRIPTION:Rest and reset.",
  "END:VEVENT",
  "END:VCALENDAR"
].join("\r\n");

const api = window.AscentApprovedCalendar;
assert.ok(api, "approved calendar API should load");
const events = api.parseICS(fixture);
assert.equal(events.length, 2);
assert.equal(events[0].uid, "study-1@example.test");
assert.equal(events[0].start.date, "2026-11-01");
assert.equal(events[0].start.time, "08:00");
assert.equal(events[0].end.time, "09:30");
assert.equal(events[0].description, "Step 1 (10 min, recall): Recall three ideas.\nStep 2 (25 min, learn): Read the lesson and write a summary.");
const steps = api.stepsFor(events[0]);
assert.equal(steps.length, 2);
assert.equal(steps[0].title, "Step 1 · 10 min, recall");
assert.equal(steps[0].detail, "Recall three ideas.");
assert.equal(steps[1].detail, "Read the lesson and write a summary.");
assert.equal(api.stepsFor(events[1]).length, 0);
console.log("Approved calendar parser OK: dates, local times, escaped text, and study steps.");
