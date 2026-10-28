#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
for (const file of ["plan-data.js", "portion-data.js"]) {
  const source = fs.readFileSync(path.join(root, "app/src/main/assets/www", file), "utf8");
  vm.runInNewContext(source, context, { filename: file, timeout: 2000 });
}
const data = context.window.PLAN_DATA;
const portions = context.window.PORTION_DATA && context.window.PORTION_DATA.units;
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(data && Array.isArray(data.subjects), "PLAN_DATA subjects are missing");
assert(data && data.subjects.length === 6, "Expected six ESSLCE subjects");
assert(data && data.books.length === 20, "Expected 20 textbook records");
const ids = new Set();
const units = [];
for (const book of (data.books || [])) {
  assert(book && book.id && Array.isArray(book.units), "Book is missing an ID or units list");
  for (const unit of (book.units || [])) {
    units.push({ book, unit });
    assert(!ids.has(unit.id), "Duplicate unit ID: " + unit.id);
    ids.add(unit.id);
    assert(Number.isInteger(unit.week) && unit.week >= 1 && unit.week <= 30, "Invalid scheduled week: " + unit.id);
    assert(Number.isInteger(unit.no) && unit.no > 0, "Invalid unit number: " + unit.id);
    if (book.subject === "english") assert(unit.skills === true, "English unit must use skills mode: " + unit.id);
    assert(portions && portions[unit.id], "Missing printed-page mapping: " + unit.id);
    const range = portions && portions[unit.id];
    if (range) assert(Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 1 && range.end >= range.start, "Invalid printed-page range: " + unit.id);
  }
}
assert(units.length === 140, "Expected 140 textbook units, found " + units.length);
if (portions) {
  for (const id of Object.keys(portions)) assert(ids.has(id), "Orphan page mapping: " + id);
  assert(Object.keys(portions).length === ids.size, "Every unit should have exactly one printed-page mapping");
}
if (errors.length) {
  console.error("Study data validation failed:");
  errors.forEach(error => console.error(" - " + error));
  process.exit(1);
}
console.log("Study data OK: 6 subjects, 20 books, 140 unique units, 140 valid page ranges, English skills mode enabled.");
