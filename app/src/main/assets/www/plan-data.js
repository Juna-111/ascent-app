/*!
 * Ascent — ESSLCE 2027
 * Seed data transcribed from "The 7-Month ESSLCE Plan".
 * This file contains no personal progress. All user data lives in localStorage.
 */
(function () {
  "use strict";

  const SUBJECTS = [
    {
      id: "math",
      name: "Mathematics",
      short: "Math",
      color: "#2f6b57",
      tint: "#e6f0e9",
      pages: 1668,
      paper: "Reported 60 items",
      note: "Largest book load. The most trainable paper.",
    },
    {
      id: "physics",
      name: "Physics",
      short: "Physics",
      color: "#49688f",
      tint: "#e8edf5",
      pages: 968,
      paper: "Reported 60 items",
      note: "Fewer pages, high return. Diagrams decide marks.",
    },
    {
      id: "chemistry",
      name: "Chemistry",
      short: "Chem",
      color: "#a6533a",
      tint: "#f4e8e2",
      pages: 1130,
      paper: "Reported 80 items",
      note: "Predictable calculations and finite organic families.",
    },
    {
      id: "biology",
      name: "Biology",
      short: "Biology",
      color: "#627238",
      tint: "#eff0e2",
      pages: 1000,
      paper: "Reported 100 items",
      note: "The longest paper. Broad, steady coverage wins.",
    },
    {
      id: "english",
      name: "English",
      short: "English",
      color: "#9a6f2d",
      tint: "#f5ecdc",
      pages: 1116,
      paper: "100 marks · skills",
      note: "Frequency and error correction beat memorisation.",
    },
    {
      id: "aptitude",
      name: "Aptitude",
      short: "Aptitude",
      color: "#73547f",
      tint: "#f0e9f3",
      pages: 0,
      paper: "Reported ~60 items",
      note: "100 marks, no textbook. Highest return per hour.",
    },
  ];

  const REVISION_BY_GRADE = { 9: 22, 10: 23, 11: 24 };

  function defaultRevision(subject, grade, no) {
    if (REVISION_BY_GRADE[grade]) return REVISION_BY_GRADE[grade];
    if (grade !== 12) return 24;

    if (subject === "english") {
      if (no <= 2) return 22;
      if (no <= 4) return 23;
      if (no <= 6) return 24;
      if (no <= 8) return 25;
      return 26;
    }
    if (subject === "biology") {
      if (no <= 2) return 22;
      if (no === 3) return 23;
      if (no === 4) return 24;
      return 25;
    }
    if (no <= 2) return 22;
    if (no === 3) return 23;
    if (no === 4) return 24;
    return 25;
  }

  function makeBook(subject, grade, pages, rawUnits) {
    return {
      id: subject + "-g" + grade,
      subject: subject,
      grade: grade,
      pages: pages,
      title: SUBJECTS.find(function (s) { return s.id === subject; }).name,
      units: rawUnits.map(function (u) {
        return {
          id: subject + "-g" + grade + "-u" + u[0],
          no: u[0],
          name: u[1],
          week: u[2],
          tier: u[3],
          revisionWeek: u[4] || defaultRevision(subject, grade, u[0]),
          skills: subject === "english",
        };
      }),
    };
  }

  function englishBook(grade, pages, themes, firstWeek) {
    const raw = themes.map(function (theme, index) {
      return [index + 1, theme, firstWeek + Math.floor(index / 2), 2];
    });
    return makeBook("english", grade, pages, raw);
  }

  const BOOKS = [
    makeBook("math", 9, 375, [
      [1, "Further on Sets", 1, 1],
      [2, "The Number System", 2, 1],
      [3, "Solving Equations", 3, 1],
      [4, "Solving Inequalities", 4, 1],
      [5, "Introduction to Trigonometry", 4, 1],
      [6, "Regular Polygons", 5, 2],
      [7, "Congruency and Similarity", 6, 2],
      [8, "Vectors in Two Dimensions", 7, 2],
      [9, "Statistics and Probability", 8, 2],
    ]),
    makeBook("math", 10, 373, [
      [1, "Relations and Functions", 9, 1],
      [2, "Polynomial Functions", 10, 1],
      [3, "Exponential and Logarithmic Functions", 10, 1],
      [4, "Trigonometric Functions", 11, 1],
      [5, "Circles", 12, 2],
      [6, "Solid Figures", 13, 2],
      [7, "Coordinate Geometry", 14, 1],
    ]),
    makeBook("math", 11, 494, [
      [1, "Relations and Functions", 15, 1],
      [2, "Rational Expressions and Rational Functions", 16, 2],
      [3, "Matrices", 16, 1],
      [4, "Determinants and Their Properties", 17, 1],
      [5, "Vectors", 18, 1],
      [6, "Transformations of the Plane", 19, 2],
      [7, "Statistics", 20, 1],
      [8, "Probability", 21, 1],
    ]),
    makeBook("math", 12, 426, [
      [1, "Sequences and Series", 3, 1],
      [2, "Introduction to Calculus", 7, 1],
      [3, "Statistics", 11, 1],
      [4, "Introduction to Linear Programming", 15, 1],
      [5, "Mathematical Applications in Business", 19, 1],
    ]),

    makeBook("physics", 9, 183, [
      [1, "Physics and Human Society", 1, 2],
      [2, "Physical Quantities", 2, 2],
      [3, "Motion in a Straight Line", 3, 1],
      [4, "Force, Work, Energy and Power", 4, 1],
      [5, "Simple Machines", 5, 1],
      [6, "Mechanical Oscillation and Sound Wave", 6, 1],
      [7, "Temperature and Thermometry", 7, 1],
    ]),
    makeBook("physics", 10, 261, [
      [1, "Vector Quantities", 8, 1],
      [2, "Uniformly Accelerated Motion", 9, 1],
      [3, "Elasticity and Static Equilibrium of Rigid Body", 10, 2],
      [4, "Static and Current Electricity", 11, 1],
      [5, "Magnetism", 12, 1],
      [6, "Electromagnetic Waves and Geometrical Optics", 13, 1],
    ]),
    makeBook("physics", 11, 338, [
      [1, "Physics and Human Society", 14, 2],
      [2, "Vectors", 15, 1],
      [3, "Motion in One and Two Dimensions", 16, 1],
      [4, "Dynamics", 17, 1],
      [5, "Heat Conduction and Calorimetry", 18, 1],
      [6, "Electrostatics and Electric Circuit", 19, 1],
      [7, "Nuclear Physics", 20, 2],
    ]),
    makeBook("physics", 12, 186, [
      [1, "Application of Physics in Other Fields", 3, 2],
      [2, "Two-Dimensional Motion", 7, 1],
      [3, "Fluid Mechanics", 11, 1],
      [4, "Electromagnetism", 15, 1],
      [5, "Basics of Electronics", 19, 1],
    ]),

    makeBook("chemistry", 9, 183, [
      [1, "Chemistry and Its Importance", 1, 2],
      [2, "Measurements and Scientific Methods", 2, 2],
      [3, "Structure of the Atom", 3, 1],
      [4, "Periodic Classification of Elements", 4, 1],
      [5, "Chemical Bonding", 5, 1],
    ]),
    makeBook("chemistry", 10, 307, [
      [1, "Chemical Reactions and Stoichiometry", 6, 1],
      [2, "Solutions", 7, 1],
      [3, "Important Inorganic Compounds", 8, 2],
      [4, "Energy Changes and Electrochemistry", 9, 1],
      [5, "Metals and Nonmetals", 10, 1],
      [6, "Hydrocarbons and Their Natural Sources", 11, 1],
    ]),
    makeBook("chemistry", 11, 342, [
      [1, "Atomic Structure and Periodic Properties", 12, 1],
      [2, "Chemical Bonding", 13, 1],
      [3, "Physical States of Matter", 14, 1],
      [4, "Chemical Kinetics", 15, 2],
      [5, "Chemical Equilibrium", 16, 1],
      [6, "Some Important Oxygen-Containing Organic Compounds", 17, 1],
    ]),
    makeBook("chemistry", 12, 298, [
      [1, "Acid-Base Equilibria", 3, 1],
      [2, "Electrochemistry", 7, 1],
      [3, "Industrial Chemistry", 11, 1],
      [4, "Polymers", 15, 1],
      [5, "Introduction to Environmental Chemistry", 19, 2],
    ]),

    makeBook("biology", 9, 171, [
      [1, "Introduction to Biology", 1, 2],
      [2, "Characteristics and Classification of Organisms", 2, 2],
      [3, "Cells", 3, 1],
      [4, "Reproduction", 4, 1],
      [5, "Human Health, Nutrition, and Disease", 5, 1],
      [6, "Ecology", 6, 1],
    ]),
    makeBook("biology", 10, 177, [
      [1, "Sub-Fields of Biology", 7, 2],
      [2, "Plants", 8, 1],
      [3, "Biochemical Molecules", 9, 1],
      [4, "Cell Division / Cell Cycle", 10, 1],
      [5, "Human Biology", 11, 1],
      [6, "Ecological Interactions", 12, 1],
    ]),
    makeBook("biology", 11, 294, [
      [1, "Biology and Technology", 13, 2],
      [2, "Animals", 14, 2],
      [3, "Enzymes", 15, 1],
      [4, "Genetics", 16, 1],
      [5, "The Human Body Systems", 17, 1],
      [6, "Population and Natural Resources", 18, 2],
    ]),
    makeBook("biology", 12, 358, [
      [1, "Application of Biology", 3, 2],
      [2, "Microorganisms", 6, 1],
      [3, "Energy Transformation", 9, 1],
      [4, "Evolution", 12, 1],
      [5, "Human Body System", 15, 1],
      [6, "Climate Change", 19, 1],
    ]),

    englishBook(9, 237, [
      "Living in Urban Areas",
      "Study Skills",
      "Traffic Accident",
      "National Parks",
      "Horticulture",
      "Poverty in Ethiopia",
      "Community Services",
      "Communicable Diseases",
      "Fairness and Equity",
      "The Internet",
    ], 6),
    englishBook(10, 319, [
      "Population Growth",
      "Travel Behaviors",
      "Punctuality",
      "Tourist Attractions",
      "Honey Processing",
      "Migration",
      "Branding Ethiopia and National Identity",
      "The Healing Power of Plants",
      "Multilingualism",
      "Digital vs Satellite Television",
    ], 11),
    englishBook(11, 290, [
      "Environmental Hazards",
      "Civilization",
      "Causes of Road Traffic Accidents",
      "People and Natural Resources",
      "Irrigation",
      "Global Warming",
      "Patriotism",
      "Efficiency of Health Services",
      "Indigenous Conflict Resolution",
      "Artificial Intelligence",
    ], 16),
    englishBook(12, 270, [
      "Sustainable Development",
      "Time Management",
      "Evidence on Traffic Accident",
      "Natural Resource Management",
      "Mechanized Agriculture",
      "Green Economies",
      "National Pride",
      "Telemedicine",
      "Conflict Management",
      "Robotics",
    ], 1),
  ];

  const PHASES = [
    {
      id: "calibration",
      n: 0,
      name: "Calibration",
      startWeek: 1,
      endWeek: 1,
      dates: "26 Oct – 1 Nov 2026",
      mission: "Diagnostic tests, past-paper item analysis, and the tools that make the plan run.",
      value: "Every later hour targets a real gap instead of a guessed one.",
    },
    {
      id: "foundation",
      n: 1,
      name: "Foundation",
      startWeek: 2,
      endWeek: 8,
      dates: "2 Nov – 20 Dec 2026",
      mission: "Finish Grade 9 core, consolidate Grade 12 Units 1–2, start English and Aptitude.",
      value: "Recovers easy marks and prevents downstream failure.",
    },
    {
      id: "bridge",
      n: 2,
      name: "Bridge",
      startWeek: 9,
      endWeek: 14,
      dates: "21 Dec 2026 – 31 Jan 2027",
      mission: "Finish Grade 10 core, consolidate Grade 12 Units 3–4, take the first full mock.",
      value: "Finds subject-level leaks while there is still time to fix them.",
    },
    {
      id: "ascent",
      n: 3,
      name: "Ascent",
      startWeek: 15,
      endWeek: 21,
      dates: "1 Feb – 21 Mar 2027",
      mission: "Finish Grade 11 and every Grade 12 book; take the second full mock.",
      value: "Completes all 20 books with nine weeks left for score conversion.",
    },
    {
      id: "conversion",
      n: 4,
      name: "Conversion",
      startWeek: 22,
      endWeek: 26,
      dates: "22 Mar – 25 Apr 2027",
      mission: "Spaced revision of Grades 9–12, mocks 3–4, and systematic error elimination.",
      value: "Turns coverage into accuracy, speed, and stamina.",
    },
    {
      id: "simulation",
      n: 5,
      name: "Simulation",
      startWeek: 27,
      endWeek: 30,
      dates: "26 Apr – 23 May 2027",
      mission: "Mocks 5–6, top-topic revision, timing, and taper.",
      value: "Turns knowledge into an exam-day performance.",
    },
  ];

  const WEEK_META = [
    { n: 1, focus: "Calibrate. Map every paper. Build the machine.", assessment: "Six diagnostics + baseline", milestone: "Calibration kit complete" },
    { n: 2, focus: "Settle into the five-pass loop.", assessment: "Weekly mixed test", milestone: "First full week at plan pace" },
    { n: 3, focus: "Protect the morning. Win the night.", assessment: "Weekly mixed test", milestone: "" },
    { n: 4, focus: "First honest feedback: Math and English subject tests.", assessment: "Math + English subject tests · full Aptitude paper", milestone: "Baseline score sheet" },
    { n: 5, focus: "Consolidate the Grade 9 core.", assessment: "Weekly mixed test", milestone: "" },
    { n: 6, focus: "Repair what the first tests exposed.", assessment: "Weekly mixed test", milestone: "" },
    { n: 7, focus: "Close Grade 9 strong.", assessment: "Weekly mixed test", milestone: "Grade 9 core nearly complete" },
    { n: 8, focus: "Mock 0: meet the format before it matters.", assessment: "Mock 0 · Math, Physics, Chemistry, Aptitude · G9 unit tests", milestone: "Grade 9 core complete", mockId: "mock-0" },
    { n: 9, focus: "Bridge into Grade 10.", assessment: "Weekly mixed test", milestone: "" },
    { n: 10, focus: "Build on the base. Carry no gaps forward.", assessment: "Weekly mixed test", milestone: "" },
    { n: 11, focus: "Grade 10 is the hinge. Turn it.", assessment: "Weekly mixed test", milestone: "" },
    { n: 12, focus: "Tighten accuracy. Expand coverage.", assessment: "Weekly mixed test · full Aptitude paper", milestone: "" },
    { n: 13, focus: "Finish Grade 10. Reach toward Grade 11.", assessment: "Weekly mixed test", milestone: "Grade 10 nearly complete" },
    { n: 14, focus: "Mock 1: the first full six-paper mirror.", assessment: "Mock 1 · all six papers", milestone: "First full mock autopsy", mockId: "mock-1" },
    { n: 15, focus: "The ascent begins: Grade 11 and Grade 12 at full weight.", assessment: "Weekly mixed test", milestone: "" },
    { n: 16, focus: "Density is the test. Stay sequential.", assessment: "Subject tests · full Aptitude paper", milestone: "" },
    { n: 17, focus: "Close Grade 11's hardest stretch.", assessment: "Weekly mixed test", milestone: "" },
    { n: 18, focus: "Retrieval over rereading.", assessment: "Weekly mixed test", milestone: "Grade 11 core nearly complete" },
    { n: 19, focus: "All Grade 12 books must be closing.", assessment: "Weekly mixed test", milestone: "Grade 12 checkpoints complete" },
    { n: 20, focus: "Mock 2: prove the first pass.", assessment: "Mock 2 · all six papers · full Aptitude paper", milestone: "End of first-pass phase", mockId: "mock-2" },
    { n: 21, focus: "Finish all 20 books.", assessment: "Subject tests", milestone: "All 20 books first pass complete" },
    { n: 22, focus: "Return to Grade 9. Convert coverage into score.", assessment: "Five 30-question subject tests", milestone: "Grade 9 revision complete" },
    { n: 23, focus: "Mock 3: Grade 10 revision under pressure.", assessment: "Mock 3 · all six · Grade 10 revision", milestone: "Grade 10 gaps list", mockId: "mock-3" },
    { n: 24, focus: "Find the repeat errors. End them.", assessment: "Full Aptitude paper · subject tests", milestone: "Repeat-error list built" },
    { n: 25, focus: "Consolidate Grade 12. Repair the red list.", assessment: "Weekly mixed test", milestone: "Grade 12 revision complete" },
    { n: 26, focus: "Mock 4: mixed retrieval and exam stamina.", assessment: "Mock 4 · all six", milestone: "Mock 4 autopsy", mockId: "mock-4" },
    { n: 27, focus: "Top topics. Timing. No new books.", assessment: "Two timed subject papers per day", milestone: "Timing stable" },
    { n: 28, focus: "Mock 5: trust the evidence, repair the gaps.", assessment: "Mock 5 · all six · full Aptitude paper", milestone: "Final score estimate", mockId: "mock-5" },
    { n: 29, focus: "Mock 6: dress rehearsal.", assessment: "Mock 6 · all six", milestone: "Exam-day plan ready", mockId: "mock-6" },
    { n: 30, focus: "Taper. Protect the score. Be ready.", assessment: "Light timed sections only", milestone: "Calm, rested, ready" },
  ];

  const REVISION_FOCUS = {
    21: "Finish Math G11 U8 and English G11 U9–10. Start Grade 12 revision. All 20 books first pass complete.",
    22: "Grade 9 all subjects + Grade 12 Units 1–2. Five 30-question subject tests; update the error log.",
    23: "Grade 10 all subjects + Grade 12 Unit 3 + Mock 3. Autopsy the mock; build the Grade 10 gaps list.",
    24: "Grade 11 all subjects + Grade 12 Unit 4. Build the Grade 11 gaps list and repeat-error list.",
    25: "Grade 12 Units 5–6 + the weakest Grades 9–11 topics. Finish red-list repairs.",
    26: "All-subject mixed revision + Mock 4. Autopsy; identify the top 20 errors per subject.",
    27: "Exam-map top topics; two timed subject papers per day. No new textbooks.",
    28: "Greatest-hits sheets + Mock 5. Estimate the final score; make the final gap list.",
    29: "Mock 6 + autopsy. Write the exam-day plan and logistics checklist.",
    30: "Final repair only. No new material. Taper.",
  };

  const MOCK_SCHEDULE = [
    { id: "mock-0", week: 8, name: "Mock 0", papers: ["math", "physics", "chemistry", "aptitude"], purpose: "Early calibration; exposes format shock." },
    { id: "mock-1", week: 14, name: "Mock 1", papers: ["math", "physics", "chemistry", "biology", "english", "aptitude"], purpose: "First full stamina and timing test." },
    { id: "mock-2", week: 20, name: "Mock 2", papers: ["math", "physics", "chemistry", "biology", "english", "aptitude"], purpose: "Measures the end of the first-pass phase." },
    { id: "mock-3", week: 23, name: "Mock 3", papers: ["math", "physics", "chemistry", "biology", "english", "aptitude"], purpose: "Tests the first revision cycle." },
    { id: "mock-4", week: 26, name: "Mock 4", papers: ["math", "physics", "chemistry", "biology", "english", "aptitude"], purpose: "Tests mixed retrieval and error repair." },
    { id: "mock-5", week: 28, name: "Mock 5", papers: ["math", "physics", "chemistry", "biology", "english", "aptitude"], purpose: "Final readiness check." },
    { id: "mock-6", week: 29, name: "Mock 6", papers: ["math", "physics", "chemistry", "biology", "english", "aptitude"], purpose: "Dress rehearsal under exam conditions." },
  ];

  const FULL_APTITUDE_WEEKS = [4, 8, 12, 16, 20, 24, 28];

  const CALIBRATION = [
    { id: "diag-math", group: "Diagnostics", title: "Mathematics diagnostic", detail: "Full paper, exact timing, no notes." },
    { id: "diag-physics", group: "Diagnostics", title: "Physics diagnostic", detail: "Full paper, exact timing, no notes." },
    { id: "diag-chemistry", group: "Diagnostics", title: "Chemistry diagnostic", detail: "Full paper, exact timing, no notes." },
    { id: "diag-biology", group: "Diagnostics", title: "Biology diagnostic", detail: "Full paper, exact timing, no notes." },
    { id: "diag-english", group: "Diagnostics", title: "English diagnostic", detail: "Full paper, exact timing, no notes." },
    { id: "diag-aptitude", group: "Diagnostics", title: "Aptitude diagnostic", detail: "Full paper, exact timing, no notes." },
    { id: "map-math", group: "Exam maps", title: "Mathematics exam map", detail: "One page: units, item frequency, priority, target score." },
    { id: "map-physics", group: "Exam maps", title: "Physics exam map", detail: "One page: units, item frequency, diagrams, priority." },
    { id: "map-chemistry", group: "Exam maps", title: "Chemistry exam map", detail: "One page: calculations, families, item frequency." },
    { id: "map-biology", group: "Exam maps", title: "Biology exam map", detail: "One page: systems, diagrams, high-frequency topics." },
    { id: "map-english", group: "Exam maps", title: "English exam map", detail: "Skills map: comprehension, grammar, vocabulary, writing." },
    { id: "map-aptitude", group: "Exam maps", title: "Aptitude exam map", detail: "Question families, traps, and a 90-second rule." },
    { id: "system-baseline", group: "System", title: "Baseline score sheet", detail: "Record every diagnostic. This is the starting line." },
    { id: "system-errors", group: "System", title: "Error log ready", detail: "Date, source, answer, cause code, fix, retest date." },
    { id: "system-cards", group: "System", title: "Flashcard system ready", detail: "One deck per subject; 10 cards per unit." },
    { id: "system-sleep", group: "System", title: "Sleep log started", detail: "Track core sleep, nap, and morning energy against accuracy." },
  ];

  const WEEKLY_TASKS = [
    { id: "timed-paper", group: "Assessment", title: "Timed paper or mock section", detail: "Exact timing, no notes, phone off." },
    { id: "mixed-test", group: "Assessment", title: "Weekly mixed test", detail: "20–30 questions from this week plus old units." },
    { id: "english-paper", group: "Skills", title: "English past-paper section", detail: "One timed reading/grammar section." },
    { id: "aptitude-1", group: "Aptitude", title: "Aptitude session 1", detail: "30 minutes — verbal reasoning." },
    { id: "aptitude-2", group: "Aptitude", title: "Aptitude session 2", detail: "30 minutes — numerical and logical reasoning." },
    { id: "aptitude-3", group: "Aptitude", title: "Aptitude session 3", detail: "30 minutes — spatial and data interpretation." },
    { id: "teacher", group: "Support", title: "Teacher question session", detail: "Bring the five hardest unresolved questions." },
    { id: "sunday-review", group: "Review", title: "90-minute Sunday review", detail: "Error log, flashcards, next-week plan." },
    { id: "nation-note", group: "Review", title: "Nation Note", detail: "Five lines connecting this week's learning to Ethiopia." },
    { id: "sat-sleep", group: "Recovery", title: "Saturday — 8 hours sleep", detail: "Protect the weekend sleep floor." },
    { id: "sun-sleep", group: "Recovery", title: "Sunday — 8 hours sleep", detail: "Protect the weekend sleep floor." },
  ];

  const WEEKLY_MINIMUMS = [
    { id: "math", title: "Mathematics", target: 6.5, why: "Largest page load; most trainable paper." },
    { id: "physics", title: "Physics", target: 4.5, why: "Application and diagrams need repetition." },
    { id: "chemistry", title: "Chemistry", target: 4.5, why: "Calculation types and organic families fade." },
    { id: "biology", title: "Biology", target: 4.5, why: "The broadest paper rewards steady coverage." },
    { id: "english", title: "English", target: 3.5, why: "Skills grow with frequency, not one long session." },
    { id: "aptitude", title: "Aptitude", target: 2, why: "100 marks; highest return per hour." },
    { id: "g12", title: "Grade 12 consolidation", target: 7, why: "Class is the first pass; this makes it usable." },
    { id: "tests", title: "Tests and autopsy", target: 4, why: "Retrieval and error repair are highest-yield." },
    { id: "review", title: "Weekly review and planning", target: 1.5, why: "Prevents drift and repeated mistakes." },
    { id: "buffer", title: "Buffer", target: 2, why: "Absorbs the inevitable slippage." },
  ];

  const REVIEW_QUESTIONS = [
    "Which units did I finish? Which slipped?",
    "What did I get wrong repeatedly?",
    "Which error type cost me the most marks?",
    "What did I learn from the timed paper?",
    "Which subject needs the next weekend's deep block?",
    "What is the one thing I will do differently next week?",
    "Did I sleep enough to encode what I studied?",
    "Did I ask a teacher at least five questions?",
    "What is my Nation Note insight?",
    "What is the first task for Monday?",
  ];

  const NATION_PROMPTS = [
    "What concept did I learn this week?",
    "Where does it touch Ethiopia?",
    "What problem does it connect to?",
    "What would a competent leader need to know?",
    "What question would I ask a practitioner?",
  ];

  const NIGHT_ROTATION = {
    1: { night1: "Mathematics · new unit", night2: "Chemistry · new unit", night3: "Recall + error log" },
    2: { night1: "Physics · new unit", night2: "Biology · new unit", night3: "Recall + flashcards" },
    3: { night1: "Mathematics · problem set", night2: "English or Aptitude + error log", night3: "Light recall + plan" },
    4: { night1: "Chemistry · problem set", night2: "Physics · problem set", night3: "Recall + error log" },
    5: { night1: "Biology · new unit", night2: "Mathematics · weak topic", night3: "Weekly test + error review" },
  };

  const DEFAULT_DAY = [
    { id: "prayer", time: "5:20–6:00", title: "Prayer", detail: "Start grounded. Leave the phone behind.", group: "Morning" },
    { id: "activation", time: "6:00–6:20", title: "Recall + walk", detail: "Retrieve yesterday's three key facts; walk and stretch.", group: "Morning" },
    { id: "hygiene", time: "6:20–7:00", title: "Hygiene + preparation", detail: "Wash, dress, pack. Remove morning friction.", group: "Morning" },
    { id: "breakfast", time: "7:00–7:40", title: "Breakfast + vocabulary", detail: "Eat properly; 10 minutes of vocabulary cards.", group: "Morning" },
    { id: "preview", time: "7:40–8:00", title: "Preview Grade 12", detail: "Skim today's topics; write three questions.", group: "Morning" },
    { id: "morning-class", time: "8:00–12:25", title: "Morning classes · active protocol", detail: "Three-line summary per class; mark “?”; solve examples before the teacher.", group: "Class" },
    { id: "lunch", time: "12:25–13:20", title: "Lunch + rest", detail: "Eat, walk, no screens.", group: "Class" },
    { id: "drill-1", time: "13:20–14:20", title: "Daylight Drill 1", detail: "15–20 timed MCQs + 20-minute error review + flashcards.", group: "Daylight" },
    { id: "afternoon-class", time: "14:20–16:00", title: "Afternoon classes · active protocol", detail: "Second exposure; ask at least one real question.", group: "Daylight" },
    { id: "drill-2", time: "16:00–17:00", title: "Daylight Drill 2", detail: "Grade 12 homework; resolve the morning's “?”; preview Night Block 1.", group: "Daylight" },
    { id: "nap", time: "17:00–18:30", title: "Strategic nap · 90 min", detail: "Protect it. Memory consolidation and night stamina.", group: "Recovery" },
    { id: "dinner", time: "18:30–19:10", title: "Dinner", detail: "No study.", group: "Recovery" },
    { id: "setup", time: "19:10–20:20", title: "Setup", detail: "15-min error review, 20-min night plan, 20-min flashcards, 15-min walk.", group: "Recovery" },
    { id: "night-1", time: "20:20–21:50", title: "Night Block 1 · hardest work", detail: "Your best attention goes to the hardest material.", group: "Night" },
    { id: "break-1", time: "21:50–22:05", title: "Break", detail: "Walk, water, no screens.", group: "Night" },
    { id: "night-2", time: "22:05–23:35", title: "Night Block 2", detail: "Second subject or a past-paper section.", group: "Night" },
    { id: "break-2", time: "23:35–23:50", title: "Break", detail: "Walk, water. Reset posture and attention.", group: "Night" },
    { id: "night-3", time: "23:50–00:30", title: "Night Block 3 · consolidate", detail: "Retrieval, error log, flashcards, next-day preview.", group: "Night" },
    { id: "scripture", time: "00:30–01:00", title: "Scripture", detail: "Bible reading and reflection. The bridge to sleep.", group: "Night" },
    { id: "sleep", time: "01:00–05:20", title: "Core sleep · lights out", detail: "Option B. Phone out of reach.", group: "Night" },
  ];

  const WEDNESDAY = [
    { id: "prayer", time: "5:20–6:00", title: "Prayer", detail: "Start grounded.", group: "Morning" },
    { id: "activation", time: "6:00–6:20", title: "Recall + walk", detail: "Retrieve yesterday's three key facts.", group: "Morning" },
    { id: "hygiene", time: "6:20–7:00", title: "Hygiene + preparation", detail: "Wash, dress, pack.", group: "Morning" },
    { id: "breakfast", time: "7:00–7:40", title: "Breakfast + vocabulary", detail: "Ten minutes of vocabulary cards.", group: "Morning" },
    { id: "preview", time: "7:40–8:00", title: "Preview Grade 12", detail: "Skim today's topics; write three questions.", group: "Morning" },
    { id: "morning-class", time: "8:00–12:25", title: "Morning classes · active protocol", detail: "Three-line summary per class; mark “?”.", group: "Class" },
    { id: "lunch", time: "12:25–13:20", title: "Lunch + rest", detail: "Eat, walk, no screens.", group: "Class" },
    { id: "drill-1", time: "13:20–14:20", title: "English + Grade 12", detail: "40 minutes of English reading/grammar + 20 minutes of Grade 12 homework.", group: "Daylight" },
    { id: "afternoon-class", time: "14:20–16:00", title: "Afternoon classes · active protocol", detail: "Second exposure; ask questions.", group: "Daylight" },
    { id: "fellowship", time: "16:00–18:00", title: "Fellowship", detail: "Church and community worship. This is support infrastructure.", group: "Recovery" },
    { id: "walk", time: "18:00–18:30", title: "Walk + quiet", detail: "No study.", group: "Recovery" },
    { id: "dinner", time: "18:30–19:10", title: "Dinner", detail: "No study.", group: "Recovery" },
    { id: "nap", time: "19:10–19:50", title: "Nap · 40 min", detail: "Enough to protect Thursday and Friday.", group: "Recovery" },
    { id: "setup", time: "19:50–20:20", title: "Setup", detail: "Plan the night; flashcards.", group: "Recovery" },
    { id: "night-1", time: "20:20–21:50", title: "Mathematics problem set", detail: "Lighter than a new unit. Accuracy over volume.", group: "Night" },
    { id: "break-1", time: "21:50–22:00", title: "Break", detail: "Walk, water.", group: "Night" },
    { id: "night-2", time: "22:00–23:15", title: "English or Aptitude + error log", detail: "Skills practice, then close the loops.", group: "Night" },
    { id: "close-out", time: "23:15–23:45", title: "Close-out", detail: "Next-day plan; pack.", group: "Night" },
    { id: "scripture", time: "23:45–00:15", title: "Scripture", detail: "Bible reading and reflection.", group: "Night" },
    { id: "sleep", time: "00:15–05:20", title: "Core sleep · lights out", detail: "5 h 05 + 40-minute nap = 5 h 45 total.", group: "Night" },
  ];

  const SATURDAY = [
    { id: "prayer", time: "5:20–6:00", title: "Prayer", detail: "Start grounded.", group: "Morning" },
    { id: "exercise", time: "6:00–6:40", title: "Exercise", detail: "Walk, run, or bodyweight session.", group: "Morning" },
    { id: "hygiene", time: "6:40–7:10", title: "Hygiene", detail: "Wash and dress.", group: "Morning" },
    { id: "breakfast", time: "7:10–8:00", title: "Breakfast", detail: "Eat properly.", group: "Morning" },
    { id: "block-a", time: "8:00–12:00", title: "Block A · timed paper + autopsy", detail: "Three hours exact timing + one hour autopsy. Phone off.", group: "Daylight" },
    { id: "lunch", time: "12:00–13:30", title: "Lunch + rest", detail: "Eat, walk, rest.", group: "Daylight" },
    { id: "nap", time: "13:30–14:00", title: "Nap · 30 min", detail: "Reset before the deep dive.", group: "Recovery" },
    { id: "block-b", time: "14:00–17:30", title: "Block B · weakest subject", detail: "Deep dive + past-paper repair. This is where gaps close.", group: "Daylight" },
    { id: "dinner", time: "17:30–18:30", title: "Dinner", detail: "No study.", group: "Recovery" },
    { id: "block-c", time: "18:30–21:30", title: "Block C · Grade 12 + English/Aptitude", detail: "Catch up on school; keep skills circulating.", group: "Night" },
    { id: "shutdown", time: "21:30–22:00", title: "Shutdown", detail: "Pack, journal, plan Sunday.", group: "Night" },
    { id: "sleep", time: "22:00–06:00", title: "Sleep · 8 hours", detail: "The weekend sleep floor is part of the work.", group: "Night" },
  ];

  const SUNDAY = [
    { id: "prayer", time: "5:20–6:00", title: "Prayer", detail: "Start grounded.", group: "Morning" },
    { id: "church", time: "6:00–8:00", title: "Church / walk + breakfast", detail: "Depending on the service schedule. Protect it.", group: "Morning" },
    { id: "block-d", time: "8:00–12:00", title: "Block D · unit completion + backlog", detail: "Finish the week's units and clear the backlog.", group: "Daylight" },
    { id: "lunch", time: "12:00–13:30", title: "Lunch + rest", detail: "Eat, walk, rest.", group: "Daylight" },
    { id: "nap", time: "13:30–14:00", title: "Nap · 30 min", detail: "Reset before the subject test.", group: "Recovery" },
    { id: "block-e", time: "14:00–16:30", title: "Block E · subject test + autopsy", detail: "One timed subject test, then a written autopsy.", group: "Daylight" },
    { id: "block-f", time: "16:30–18:00", title: "Block F · weekly review", detail: "Error log, next-week plan, and Nation Note. Non-negotiable.", group: "Recovery" },
    { id: "dinner", time: "18:00–19:00", title: "Dinner", detail: "No study.", group: "Recovery" },
    { id: "light", time: "19:00–20:30", title: "Light English or rest", detail: "No new hard material.", group: "Night" },
    { id: "sleep", time: "20:30–05:20", title: "Sleep · about 8 h 50", detail: "Start the next week with a rested brain.", group: "Night" },
  ];

  const DAILY_SCHEDULES = {
    default: DEFAULT_DAY,
    wednesday: WEDNESDAY,
    saturday: SATURDAY,
    sunday: SUNDAY,
  };

  const DEFAULT_SETTINGS = {
    name: "Hobby",
    startDate: "2026-10-26",
    examDate: "2027-06-28",
    workbook: "B",
    targetScore: 85,
    weekStartsMonday: true,
    lastBackupAt: null,
  };

  const EXAM_NOTES = {
    readinessDate: "2027-05-26",
    assumedWindow: "Late June 2027 (unconfirmed)",
    totalMarks: 600,
    subjects: 6,
    caveat: "The 2027 timetable and exact paper format are not confirmed. The plan is built for time per question, topic frequency, and textbook coverage; verify the official timetable when it is released.",
  };

  const PLAN_STATS = {
    weeks: 30,
    books: BOOKS.length,
    units: BOOKS.reduce(function (sum, book) { return sum + book.units.length; }, 0),
    pages: BOOKS.reduce(function (sum, book) { return sum + book.pages; }, 0),
    effectivePages: 4832,
  };

  window.PLAN_DATA = {
    subjects: SUBJECTS,
    books: BOOKS,
    phases: PHASES,
    weeks: WEEK_META,
    revisionFocus: REVISION_FOCUS,
    mocks: MOCK_SCHEDULE,
    fullAptitudeWeeks: FULL_APTITUDE_WEEKS,
    calibration: CALIBRATION,
    weeklyTasks: WEEKLY_TASKS,
    weeklyMinimums: WEEKLY_MINIMUMS,
    reviewQuestions: REVIEW_QUESTIONS,
    nationPrompts: NATION_PROMPTS,
    nightRotation: NIGHT_ROTATION,
    dailySchedules: DAILY_SCHEDULES,
    defaultSettings: DEFAULT_SETTINGS,
    examNotes: EXAM_NOTES,
    stats: PLAN_STATS,
  };
})();
