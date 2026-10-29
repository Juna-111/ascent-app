/* Pure functions for local practice estimates. No network, clock, DOM, or storage access. */
(function (root) {
  "use strict";
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function daysBetween(from, to) {
    var a = Date.parse(String(from || "") + "T12:00:00Z");
    var b = Date.parse(String(to || "") + "T12:00:00Z");
    return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((b - a) / 86400000)) : 30;
  }
  function unitReadiness(input) {
    var x = input || {};
    var mock = Number.isFinite(Number(x.mockAccuracy)) ? clamp(Number(x.mockAccuracy), 0, 100) : 0;
    var practice = Number.isFinite(Number(x.practiceAccuracy)) ? clamp(Number(x.practiceAccuracy), 0, 100) : 0;
    var open = Math.max(0, Number(x.openRepairs) || 0);
    var penalty = clamp(open / 3, 0, 1);
    var age = daysBetween(x.lastReviewedAt, x.today);
    var recency = x.lastReviewedAt ? clamp(1 - age / 30, 0, 1) : 0;
    return Math.round(clamp(mock * 0.5 + practice * 0.2 + (1 - penalty) * 20 + recency * 10, 0, 100));
  }
  function repairDueDate(item) {
    var x = item || {};
    var base = x.status === "fixed" && x.fixedAt ? x.fixedAt : x.createdAt;
    var offset = x.status === "fixed" ? [1, 3, 7, 14][Math.max(0, Number(x.reviewStage) || 0)] : 1;
    var date = new Date(String(base || "") + "T12:00:00");
    if (!Number.isFinite(date.getTime())) return null;
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  }
  function dueRepairs(items, today) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      var due = repairDueDate(item);
      return due && due <= today && (item.status === "open" || (item.status === "fixed" && (Number(item.reviewStage) || 0) < 4));
    });
  }
  function adaptiveRule(answers, skill) {
    var list = (Array.isArray(answers) ? answers : []).filter(function (x) { return x && x.skill === skill; }).slice(-3);
    if (list.length >= 3 && list.every(function (x) { return x.correct === true; })) return "challenge";
    if (list.length >= 2 && list.slice(-2).every(function (x) { return x.correct === false; })) return "review";
    return "normal";
  }
  function streakRecovery(lastDate, today, freezeUsedInWindow) {
    if (!lastDate || !today) return { showWelcomeBack: false, canRecover: false };
    var gap = daysBetween(lastDate, today);
    return { showWelcomeBack: gap > 1, canRecover: gap === 2 && !freezeUsedInWindow, gapDays: gap };
  }
  var api = { unitReadiness: unitReadiness, repairDueDate: repairDueDate, dueRepairs: dueRepairs, adaptiveRule: adaptiveRule, streakRecovery: streakRecovery, daysBetween: daysBetween };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AscentReadiness = api;
})(typeof window !== "undefined" ? window : null);