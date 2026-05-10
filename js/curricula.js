// curricula.js — Built-in NCERT Class 5 & 6 curriculum topic maps
// No AI needed to use these; topics are pre-defined and load instantly.
//
// Source files (verified chapter names, NEP 2020 editions):
//   data/curricula/class5-maths-mela.json
//   data/curricula/class5-evs-our-wondrous-world.json
//   data/curricula/class6-ganita-prakash.json
//   data/curricula/class6-curiosity.json
//   data/curricula/class6-exploring-society.json
//
// subtopics are intentionally empty — verify against actual NCERT PDFs before filling.

export const CURRICULA = {

  // ── Class 5 ──────────────────────────────────────────────────────────────────

  // Source: data/curricula/class5-maths-mela.json
  // Book: Maths Mela (NCERT, Reprint 2026-27) — https://ncert.nic.in/textbook/pdf/eemm1ps.pdf
  "class5-math": {
    id: "class5-math", grade: 5, subject: "Mathematics",
    label: "Class 5 — Mathematics (Maths Mela)",
    aiHint: "NCERT Class 5 Mathematics — Maths Mela (NEP 2020, CBSE India)",
    topics: [
      { name: "We the Travellers — I",   chapter: 1,  subtopics: [], importance: "medium" },
      { name: "Fractions",               chapter: 2,  subtopics: [], importance: "high"   },
      { name: "Angles as Turns",         chapter: 3,  subtopics: [], importance: "high"   },
      { name: "We the Travellers — II",  chapter: 4,  subtopics: [], importance: "medium" },
      { name: "Far and Near",            chapter: 5,  subtopics: [], importance: "medium" },
      { name: "The Dairy Farm",          chapter: 6,  subtopics: [], importance: "medium" },
      { name: "Shapes and Patterns",     chapter: 7,  subtopics: [], importance: "high"   },
      { name: "Weight and Capacity",     chapter: 8,  subtopics: [], importance: "high"   },
      { name: "Coconut Farm",            chapter: 9,  subtopics: [], importance: "medium" },
      { name: "Symmetrical Designs",     chapter: 10, subtopics: [], importance: "medium" },
      { name: "Grandmother's Quilt",     chapter: 11, subtopics: [], importance: "medium" },
      { name: "Racing Seconds",          chapter: 12, subtopics: [], importance: "medium" },
      { name: "Animal Jumps",            chapter: 13, subtopics: [], importance: "medium" },
      { name: "Maps and Locations",      chapter: 14, subtopics: [], importance: "high"   },
      { name: "Data Through Pictures",   chapter: 15, subtopics: [], importance: "high"   },
    ],
  },

  // Source: data/curricula/class5-evs-our-wondrous-world.json
  // Book: Our Wondrous World (NCERT, 2025-26) — https://ncert.nic.in/textbook/pdf/eeww1ps.pdf
  "class5-evs": {
    id: "class5-evs", grade: 5, subject: "Environmental Studies",
    label: "Class 5 — EVS (Our Wondrous World)",
    aiHint: "NCERT Class 5 Environmental Studies — Our Wondrous World (NEP 2020, CBSE India)",
    topics: [
      { name: "Water — The Essence of Life",    chapter: 1,  subtopics: [], importance: "high"   },
      { name: "Journey of a River",             chapter: 2,  subtopics: [], importance: "high"   },
      { name: "The Mystery of Food",            chapter: 3,  subtopics: [], importance: "high"   },
      { name: "Our School — A Happy Place",     chapter: 4,  subtopics: [], importance: "medium" },
      { name: "Our Vibrant Country",            chapter: 5,  subtopics: [], importance: "high"   },
      { name: "Some Unique Places",             chapter: 6,  subtopics: [], importance: "medium" },
      { name: "Energy — How Things Work",       chapter: 7,  subtopics: [], importance: "high"   },
      { name: "Clothes — How Things are Made",  chapter: 8,  subtopics: [], importance: "medium" },
      { name: "Rhythms of Nature",              chapter: 9,  subtopics: [], importance: "high"   },
      { name: "Earth — Our Shared Home",        chapter: 10, subtopics: [], importance: "high"   },
    ],
  },

  // ── Class 6 ──────────────────────────────────────────────────────────────────

  // Source: data/curricula/class6-ganita-prakash.json
  // Book: Ganita Prakash (NCERT, Reprint 2026-27) — https://ncert.nic.in/textbook/pdf/fegp1ps.pdf
  "class6-math": {
    id: "class6-math", grade: 6, subject: "Mathematics",
    label: "Class 6 — Mathematics (Ganita Prakash)",
    aiHint: "NCERT Class 6 Mathematics — Ganita Prakash (NEP 2020, CBSE India)",
    topics: [
      { name: "Patterns in Mathematics",        chapter: 1,  subtopics: [], importance: "high"   },
      { name: "Lines and Angles",               chapter: 2,  subtopics: [], importance: "high"   },
      { name: "Number Play",                    chapter: 3,  subtopics: [], importance: "high"   },
      { name: "Data Handling and Presentation", chapter: 4,  subtopics: [], importance: "high"   },
      { name: "Prime Time",                     chapter: 5,  subtopics: [], importance: "high"   },
      { name: "Perimeter and Area",             chapter: 6,  subtopics: [], importance: "high"   },
      { name: "Fractions",                      chapter: 7,  subtopics: [], importance: "high"   },
      { name: "Playing with Constructions",     chapter: 8,  subtopics: [], importance: "medium" },
      { name: "Symmetry",                       chapter: 9,  subtopics: [], importance: "medium" },
      { name: "The Other Side of Zero",         chapter: 10, subtopics: [], importance: "high"   },
    ],
  },

  // Source: data/curricula/class6-curiosity.json
  // Book: Curiosity (NCERT, Reprint 2026-27) — https://ncert.nic.in/textbook/pdf/fecu1ps.pdf
  "class6-science": {
    id: "class6-science", grade: 6, subject: "Science",
    label: "Class 6 — Science (Curiosity)",
    aiHint: "NCERT Class 6 Science — Curiosity (NEP 2020, CBSE India)",
    topics: [
      { name: "The Wonderful World of Science",              chapter: 1,  subtopics: [], importance: "medium" },
      { name: "Diversity in the Living World",               chapter: 2,  subtopics: [], importance: "high"   },
      { name: "Mindful Eating: A Path to a Healthy Body",    chapter: 3,  subtopics: [], importance: "high"   },
      { name: "Exploring Magnets",                           chapter: 4,  subtopics: [], importance: "high"   },
      { name: "Measurement of Length and Motion",            chapter: 5,  subtopics: [], importance: "high"   },
      { name: "Materials Around Us",                         chapter: 6,  subtopics: [], importance: "high"   },
      { name: "Temperature and its Measurement",             chapter: 7,  subtopics: [], importance: "high"   },
      { name: "A Journey through States of Water",           chapter: 8,  subtopics: [], importance: "high"   },
      { name: "Methods of Separation in Everyday Life",      chapter: 9,  subtopics: [], importance: "high"   },
      { name: "Living Creatures: Exploring their Characteristics", chapter: 10, subtopics: [], importance: "high" },
      { name: "Nature's Treasures",                          chapter: 11, subtopics: [], importance: "medium" },
      { name: "Beyond Earth",                                chapter: 12, subtopics: [], importance: "medium" },
    ],
  },

  // Source: data/curricula/class6-exploring-society.json
  // Book: Exploring Society: India and Beyond (NCERT, 2026-27) — https://ncert.nic.in/textbook/pdf/fess1ps.pdf
  // Replaces Our Pasts I, The Earth Our Habitat, and Social and Political Life I
  "class6-social-science": {
    id: "class6-social-science", grade: 6, subject: "Social Science",
    label: "Class 6 — Social Science (Exploring Society)",
    aiHint: "NCERT Class 6 Social Science — Exploring Society: India and Beyond (NEP 2020, CBSE India). Covers Geography, History, Governance and Civics, and Economy and Society.",
    topics: [
      // Geography
      { name: "Locating Places on the Earth",                                    chapter: 1,  subtopics: [], importance: "high"   },
      { name: "Oceans and Continents",                                           chapter: 2,  subtopics: [], importance: "high"   },
      { name: "Landforms and Life",                                              chapter: 3,  subtopics: [], importance: "high"   },
      // History
      { name: "Timeline and Sources of History",                                 chapter: 4,  subtopics: [], importance: "high"   },
      { name: "India, That Is Bharat",                                           chapter: 5,  subtopics: [], importance: "high"   },
      { name: "The Beginnings of Indian Civilisation",                           chapter: 6,  subtopics: [], importance: "high"   },
      { name: "India's Cultural Roots",                                          chapter: 7,  subtopics: [], importance: "high"   },
      // Governance and Civics
      { name: "Unity in Diversity, or 'Many in the One'",                       chapter: 8,  subtopics: [], importance: "high"   },
      { name: "Family and Community",                                            chapter: 9,  subtopics: [], importance: "medium" },
      { name: "Grassroots Democracy — Part 1: Governance",                      chapter: 10, subtopics: [], importance: "high"   },
      { name: "Grassroots Democracy — Part 2: Local Government in Rural Areas", chapter: 11, subtopics: [], importance: "high"   },
      { name: "Grassroots Democracy — Part 3: Local Government in Urban Areas", chapter: 12, subtopics: [], importance: "high"   },
      // Economy and Society
      { name: "The Value of Work",                                               chapter: 13, subtopics: [], importance: "medium" },
      { name: "Economic Activities Around Us",                                   chapter: 14, subtopics: [], importance: "high"   },
    ],
  },
};

export const SUBJECTS_BY_GRADE = {
  5: [
    { id: "class5-math", label: "Mathematics"                 },
    { id: "class5-evs",  label: "Environmental Studies (EVS)" },
  ],
  6: [
    { id: "class6-math",           label: "Mathematics"    },
    { id: "class6-science",        label: "Science"        },
    { id: "class6-social-science", label: "Social Science" },
  ],
};
