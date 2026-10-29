/* Placeholder mock-exam settings. Verify every duration and item count against official ESSLCE material before relying on it. Nothing here is an official blueprint. */
(function () {
  "use strict";
  window.ASCENT_EXAM_CONFIG = {
    version: 1,
    status: "PLACEHOLDER_VERIFY_OFFICIAL_ESSLCE_MATERIAL",
    note: "Practice estimate, not an official score. Section lengths, question counts and marking below are placeholders and must be checked against official ESSLCE material.",
    subjects: {
      math: { label: "Mathematics", sections: [{ id: "core", label: "Mixed practice", minutes: 60, questions: 40, marksPerQuestion: 1 }] },
      physics: { label: "Physics", sections: [{ id: "core", label: "Mixed practice", minutes: 60, questions: 40, marksPerQuestion: 1 }] },
      chemistry: { label: "Chemistry", sections: [{ id: "core", label: "Mixed practice", minutes: 60, questions: 40, marksPerQuestion: 1 }] },
      biology: { label: "Biology", sections: [{ id: "core", label: "Mixed practice", minutes: 60, questions: 40, marksPerQuestion: 1 }] },
      english: { label: "English", sections: [{ id: "core", label: "Skills practice", minutes: 60, questions: 40, marksPerQuestion: 1 }] },
      aptitude: { label: "Aptitude", sections: [{ id: "core", label: "Reasoning practice", minutes: 45, questions: 30, marksPerQuestion: 1 }] }
    },
    fullSetOrder: ["math", "physics", "chemistry", "biology", "english", "aptitude"]
  };
})();