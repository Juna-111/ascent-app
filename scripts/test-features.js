"use strict";
const assert = require("node:assert/strict");
const rules = require("../app/src/main/assets/www/readiness.js");
const storage = require("../app/src/main/assets/www/storage.js");
const values = new Map();
const fakeStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};
const fallback = () => ({version:1,items:[]});
assert.deepEqual(storage.load("ascent.mock.v1", fallback, fakeStorage, 100), {version:1,items:[]});
values.set("ascent.mock.v1", "{broken json");
assert.deepEqual(storage.load("ascent.mock.v1", fallback, fakeStorage, 123), {version:1,items:[]});
assert.equal(values.get("ascent.mock.v1.corrupt.123"), "{broken json");
assert.equal(storage.save("ascent.mock.v1", {items:[1]}, fakeStorage), true);
assert.deepEqual(JSON.parse(values.get("ascent.mock.v1")), {items:[1],version:1});
const oldBackup = {settings:{},daily:{"2026-01-01":{tasks:{},sleep:{core:4,energy:2}}},weekly:{},units:{},setup:{},tests:[],errors:[]};
const cleanedBackup = storage.sanitizeImportedState(oldBackup);
assert.equal(Object.hasOwn(cleanedBackup.daily["2026-01-01"], "sleep"), false);
assert.equal(Object.hasOwn(oldBackup.daily["2026-01-01"], "sleep"), true);
assert.equal(rules.unitReadiness({mockAccuracy:80,practiceAccuracy:70,openRepairs:0,lastReviewedAt:"2026-10-28",today:"2026-10-29"}), 84);
assert.equal(rules.unitReadiness({mockAccuracy:0,practiceAccuracy:0,openRepairs:3,today:"2026-10-29"}), 0);
assert.equal(rules.repairDueDate({status:"open",createdAt:"2026-10-01"}), "2026-10-02");
assert.equal(rules.repairDueDate({status:"fixed",fixedAt:"2026-10-01",reviewStage:0}), "2026-10-02");
assert.equal(rules.repairDueDate({status:"fixed",fixedAt:"2026-10-01",reviewStage:1}), "2026-10-04");
assert.equal(rules.adaptiveRule([{skill:"inference",correct:true},{skill:"inference",correct:true},{skill:"inference",correct:true}],"inference"), "challenge");
assert.equal(rules.adaptiveRule([{skill:"grammar",correct:false},{skill:"grammar",correct:false}],"grammar"), "review");
assert.equal(rules.adaptiveRule([{skill:"grammar",correct:true},{skill:"grammar",correct:false}],"grammar"), "normal");
assert.equal(rules.streakRecovery("2026-10-27","2026-10-29",false).canRecover, true);
assert.equal(rules.streakRecovery("2026-10-27","2026-10-29",true).canRecover, false);
console.log("Feature rules OK");