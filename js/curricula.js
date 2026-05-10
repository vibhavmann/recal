// curricula.js — Built-in NCERT Class 5 & 6 curriculum topic maps
// No AI needed to use these; topics are pre-defined and load instantly.

export const CURRICULA = {

  // ── Class 5 ──────────────────────────────────────────────────────────────────

  "class5-math": {
    id: "class5-math", grade: 5, subject: "Mathematics",
    label: "Class 5 — Mathematics",
    aiHint: "NCERT Class 5 Mathematics (Math-Magic textbook, CBSE India)",
    topics: [
      { name: "The Fish Tale",                    chapter: 1,  subtopics: ["Large numbers", "Multiplication strategies", "Estimation", "Word problems"],                         importance: "medium" },
      { name: "Shapes and Angles",                chapter: 2,  subtopics: ["Types of angles", "Measuring angles", "Shapes and their properties"],                               importance: "high"   },
      { name: "How Many Squares?",               chapter: 3,  subtopics: ["Area of irregular shapes", "Counting unit squares", "Grid patterns"],                               importance: "medium" },
      { name: "Parts and Wholes",                 chapter: 4,  subtopics: ["Fractions of a whole", "Equivalent fractions", "Adding and subtracting fractions", "Mixed numbers"], importance: "high"   },
      { name: "Does It Look the Same?",           chapter: 5,  subtopics: ["Line of symmetry", "Reflection symmetry", "Rotational symmetry"],                                   importance: "medium" },
      { name: "Be My Multiple, I'll Be Your Factor", chapter: 6, subtopics: ["Factors and multiples", "LCM and HCF", "Prime numbers", "Divisibility rules"],                   importance: "high"   },
      { name: "Can You See the Pattern?",         chapter: 7,  subtopics: ["Number patterns", "Shape patterns", "Rules for patterns", "Sequences"],                             importance: "medium" },
      { name: "Mapping Your Way",                 chapter: 8,  subtopics: ["Reading maps", "Scale and direction", "Compass directions", "Grid maps"],                           importance: "medium" },
      { name: "Boxes and Sketches",               chapter: 9,  subtopics: ["3D shapes", "Nets of 3D shapes", "Faces, edges, vertices"],                                         importance: "medium" },
      { name: "Tenths and Hundredths",            chapter: 10, subtopics: ["Decimal notation", "Place value", "Adding and subtracting decimals", "Comparing decimals"],         importance: "high"   },
      { name: "Area and Its Boundary",            chapter: 11, subtopics: ["Perimeter of shapes", "Area of rectangles", "Area vs perimeter", "Unit conversion"],               importance: "high"   },
      { name: "Smart Charts",                     chapter: 12, subtopics: ["Reading bar graphs", "Making bar graphs", "Interpreting data"],                                     importance: "medium" },
      { name: "Ways to Multiply and Divide",      chapter: 13, subtopics: ["Long multiplication", "Long division", "Estimation strategies", "Checking answers"],               importance: "high"   },
      { name: "How Big? How Heavy?",              chapter: 14, subtopics: ["Volume of cuboids", "Weight and mass", "Capacity", "Unit conversion"],                             importance: "medium" },
    ],
  },

  "class5-evs": {
    id: "class5-evs", grade: 5, subject: "Environmental Studies",
    label: "Class 5 — EVS (Looking Around)",
    aiHint: "NCERT Class 5 Environmental Studies — Looking Around (CBSE India)",
    topics: [
      { name: "Super Senses",                   chapter: 1,  subtopics: ["Animal senses", "Smell and taste", "Sight and hearing", "Touch and vibration"],                    importance: "medium" },
      { name: "From Tasting to Digesting",      chapter: 3,  subtopics: ["Teeth and their types", "Saliva and taste", "Digestive system", "Nutrients in food"],              importance: "high"   },
      { name: "Seeds and Seeds",                chapter: 5,  subtopics: ["Seed dispersal methods", "Seed structure", "Germination", "Fruits and seeds"],                     importance: "high"   },
      { name: "Every Drop Counts",              chapter: 6,  subtopics: ["Water sources", "Water scarcity", "Traditional water storage", "Water conservation"],             importance: "high"   },
      { name: "Experiments with Water",         chapter: 7,  subtopics: ["Properties of water", "Soluble and insoluble", "Evaporation", "Condensation"],                    importance: "high"   },
      { name: "A Treat for Mosquitoes",         chapter: 8,  subtopics: ["Malaria and dengue", "Mosquito life cycle", "Disease prevention"],                               importance: "medium" },
      { name: "Sunita in Space",                chapter: 11, subtopics: ["Space and gravity", "Life in space", "Solar system basics", "Indian astronauts"],                  importance: "high"   },
      { name: "What if it Finishes…?",          chapter: 12, subtopics: ["Non-renewable resources", "Fossil fuels", "Conservation", "Alternative energy"],                  importance: "high"   },
      { name: "A Shelter So High!",             chapter: 13, subtopics: ["Houses in different climates", "Building materials by region", "Nomadic shelters"],                importance: "medium" },
      { name: "When the Earth Shook!",          chapter: 14, subtopics: ["Earthquakes", "Causes of earthquakes", "Safety during earthquakes", "Richter scale"],             importance: "high"   },
      { name: "Blow Hot, Blow Cold",            chapter: 15, subtopics: ["Heating and cooling of air", "Convection", "Wind formation", "Breathing and air"],                importance: "medium" },
      { name: "Who Will Do This Work?",         chapter: 16, subtopics: ["Dignity of labour", "Different occupations", "Sanitation workers", "Social issues"],              importance: "medium" },
      { name: "A Seed Tells a Farmer's Story",  chapter: 19, subtopics: ["Agriculture in India", "Traditional farming", "Seeds and farmers' rights", "Modern farming"],     importance: "high"   },
      { name: "Whose Forests?",                 chapter: 20, subtopics: ["Forest communities", "Deforestation", "Tribal rights", "Forest conservation"],                    importance: "high"   },
    ],
  },

  // ── Class 6 ──────────────────────────────────────────────────────────────────

  "class6-math": {
    id: "class6-math", grade: 6, subject: "Mathematics",
    label: "Class 6 — Mathematics",
    aiHint: "NCERT Class 6 Mathematics textbook (CBSE India)",
    topics: [
      { name: "Knowing Our Numbers",             chapter: 1,  subtopics: ["Indian and international number system", "Comparing numbers", "Estimation", "Roman numerals"],                importance: "high"   },
      { name: "Whole Numbers",                   chapter: 2,  subtopics: ["Natural numbers vs whole numbers", "Number line", "Operations on whole numbers", "Properties"],              importance: "high"   },
      { name: "Playing with Numbers",            chapter: 3,  subtopics: ["Factors and multiples", "Prime and composite numbers", "Divisibility tests", "HCF and LCM"],                importance: "high"   },
      { name: "Basic Geometrical Ideas",         chapter: 4,  subtopics: ["Points, lines, and rays", "Angles", "Polygons", "Circles"],                                                 importance: "high"   },
      { name: "Understanding Elementary Shapes", chapter: 5,  subtopics: ["Measuring line segments", "Acute, obtuse, reflex angles", "Perpendicular and parallel lines", "3D shapes"], importance: "high"   },
      { name: "Integers",                        chapter: 6,  subtopics: ["Negative numbers", "Number line with integers", "Addition and subtraction of integers"],                    importance: "high"   },
      { name: "Fractions",                       chapter: 7,  subtopics: ["Types of fractions", "Equivalent fractions", "Simplest form", "Comparing and operating fractions"],        importance: "high"   },
      { name: "Decimals",                        chapter: 8,  subtopics: ["Decimal notation", "Comparing decimals", "Addition and subtraction of decimals"],                          importance: "high"   },
      { name: "Data Handling",                   chapter: 9,  subtopics: ["Recording data", "Pictographs", "Bar graphs", "Mean and range"],                                           importance: "medium" },
      { name: "Mensuration",                     chapter: 10, subtopics: ["Perimeter of polygons", "Perimeter of rectangles and squares", "Area of rectangles and squares"],          importance: "high"   },
      { name: "Algebra",                         chapter: 11, subtopics: ["Variables", "Expressions", "Simple equations", "Patterns with matchsticks"],                              importance: "high"   },
      { name: "Ratio and Proportion",            chapter: 12, subtopics: ["Ratio", "Equivalent ratios", "Proportion", "Unitary method"],                                             importance: "high"   },
      { name: "Symmetry",                        chapter: 13, subtopics: ["Line symmetry", "Lines of symmetry in shapes", "Mirror reflection"],                                      importance: "medium" },
      { name: "Practical Geometry",              chapter: 14, subtopics: ["Drawing circles", "Constructing perpendiculars", "Constructing angles"],                                  importance: "medium" },
    ],
  },

  "class6-science": {
    id: "class6-science", grade: 6, subject: "Science",
    label: "Class 6 — Science",
    aiHint: "NCERT Class 6 Science textbook (CBSE India)",
    topics: [
      { name: "Food: Where Does It Come From?",             chapter: 1,  subtopics: ["Sources of food", "Plant and animal products", "Omnivores, herbivores, carnivores"],                         importance: "medium" },
      { name: "Components of Food",                         chapter: 2,  subtopics: ["Carbohydrates, proteins, fats", "Vitamins and minerals", "Balanced diet", "Deficiency diseases"],             importance: "high"   },
      { name: "Fibre to Fabric",                            chapter: 3,  subtopics: ["Natural and synthetic fibres", "Cotton and jute", "Spinning and weaving"],                                   importance: "medium" },
      { name: "Sorting Materials Into Groups",              chapter: 4,  subtopics: ["Properties of materials", "Transparent, translucent, opaque", "Soluble and insoluble"],                      importance: "high"   },
      { name: "Separation of Substances",                   chapter: 5,  subtopics: ["Sieving, filtration, evaporation", "Sedimentation and decantation", "Condensation"],                        importance: "high"   },
      { name: "Changes Around Us",                          chapter: 6,  subtopics: ["Reversible and irreversible changes", "Physical and chemical changes", "Rusting and burning"],               importance: "high"   },
      { name: "Getting to Know Plants",                     chapter: 7,  subtopics: ["Types of plants", "Parts of a plant", "Root types", "Leaf structure", "Flowers"],                           importance: "high"   },
      { name: "Body Movements",                             chapter: 8,  subtopics: ["Bones and joints", "Types of joints", "Muscles and movement", "Movement in animals"],                       importance: "high"   },
      { name: "The Living Organisms — Characteristics and Habitats", chapter: 9, subtopics: ["Characteristics of living things", "Habitat and adaptation", "Desert and aquatic habitats"],         importance: "high"   },
      { name: "Motion and Measurement of Distances",        chapter: 10, subtopics: ["Standard units", "Measuring length", "Types of motion", "SI units"],                                        importance: "high"   },
      { name: "Light, Shadows and Reflections",             chapter: 11, subtopics: ["Sources of light", "Transparent and opaque objects", "Shadow formation", "Reflection", "Mirrors"],          importance: "high"   },
      { name: "Electricity and Circuits",                   chapter: 12, subtopics: ["Electric cell and bulb", "Electric circuit", "Conductors and insulators"],                                  importance: "high"   },
      { name: "Fun with Magnets",                           chapter: 13, subtopics: ["Properties of magnets", "Magnetic materials", "Poles of a magnet", "Magnetic compass"],                    importance: "medium" },
      { name: "Water",                                      chapter: 14, subtopics: ["Water cycle", "Evaporation and condensation", "Groundwater", "Rainwater harvesting"],                       importance: "high"   },
      { name: "Air Around Us",                              chapter: 15, subtopics: ["Composition of air", "Properties of air", "Wind", "Air pollution"],                                         importance: "high"   },
      { name: "Garbage In, Garbage Out",                    chapter: 16, subtopics: ["Garbage disposal", "Composting", "Landfills", "Recycling"],                                                 importance: "medium" },
    ],
  },

  "class6-history": {
    id: "class6-history", grade: 6, subject: "History",
    label: "Class 6 — History (Our Pasts I)",
    aiHint: "NCERT Class 6 History — Our Pasts I (CBSE India)",
    topics: [
      { name: "What, Where, How and When?",                chapter: 1,  subtopics: ["Sources of history", "Manuscripts and inscriptions", "Archaeology", "BCE/CE dates"],                        importance: "high"   },
      { name: "From Hunting-Gathering to Growing Food",    chapter: 2,  subtopics: ["Early hunter-gatherers", "Stone tools", "Beginning of agriculture", "Neolithic age"],                       importance: "high"   },
      { name: "In the Earliest Cities",                    chapter: 3,  subtopics: ["Harappan civilisation", "Town planning", "Trade and crafts", "Decline of Harappa"],                         importance: "high"   },
      { name: "What Books and Burials Tell Us",            chapter: 4,  subtopics: ["The Vedas and Rig Veda", "Megaliths", "The Mahabharata", "Vedic life"],                                     importance: "high"   },
      { name: "Kingdoms, Kings and an Early Republic",     chapter: 5,  subtopics: ["Janapadas and Mahajanapadas", "Vajji republic", "Magadha", "Role of iron"],                                 importance: "high"   },
      { name: "New Questions and Ideas",                   chapter: 6,  subtopics: ["Upanishads", "Buddhism — life of Buddha", "Jainism — Mahavira", "Sanghas"],                                  importance: "high"   },
      { name: "Ashoka, The Emperor Who Gave Up War",       chapter: 7,  subtopics: ["Maurya empire", "Chandragupta Maurya", "Kalinga war", "Dhamma", "Ashoka's edicts"],                         importance: "high"   },
      { name: "Vital Villages, Thriving Towns",            chapter: 8,  subtopics: ["Iron tools in agriculture", "Irrigation", "Craft production", "Punch-marked coins"],                        importance: "medium" },
      { name: "Traders, Kings and Pilgrims",               chapter: 9,  subtopics: ["Silk route", "Trade with Rome", "Buddhist pilgrimages", "Fa Xian"],                                         importance: "medium" },
      { name: "New Empires and Kingdoms",                  chapter: 10, subtopics: ["Gupta empire", "Samudragupta", "Prashastis", "Pallavas and Chalukyas"],                                     importance: "high"   },
      { name: "Buildings, Paintings and Books",            chapter: 11, subtopics: ["Stupas and temples", "Ajanta caves", "Sanskrit literature", "Aryabhata", "Kalidasa"],                       importance: "medium" },
    ],
  },

  "class6-geography": {
    id: "class6-geography", grade: 6, subject: "Geography",
    label: "Class 6 — Geography (The Earth: Our Habitat)",
    aiHint: "NCERT Class 6 Geography — The Earth: Our Habitat (CBSE India)",
    topics: [
      { name: "The Earth in the Solar System",      chapter: 1, subtopics: ["Solar system", "Planets", "Stars and constellations", "Moon", "Earth as unique"],      importance: "high"   },
      { name: "Globe: Latitudes and Longitudes",    chapter: 2, subtopics: ["Globe as Earth model", "Equator, tropics, poles", "Prime meridian", "Time zones"],      importance: "high"   },
      { name: "Motions of the Earth",               chapter: 3, subtopics: ["Rotation and day-night", "Revolution and seasons", "Solstice and equinox", "Leap year"], importance: "high"   },
      { name: "Maps",                               chapter: 4, subtopics: ["Types of maps", "Scale, direction, symbols", "Sketch maps", "Atlas"],                   importance: "high"   },
      { name: "Major Domains of the Earth",         chapter: 5, subtopics: ["Lithosphere", "Hydrosphere", "Atmosphere", "Biosphere", "Oceans and continents"],       importance: "high"   },
      { name: "Major Landforms of the Earth",       chapter: 6, subtopics: ["Mountains", "Plateaus", "Plains", "Formation of landforms"],                            importance: "high"   },
      { name: "Our Country — India",                chapter: 7, subtopics: ["Location and size of India", "States and union territories", "Neighbouring countries"],  importance: "high"   },
      { name: "India: Climate, Vegetation and Wildlife", chapter: 8, subtopics: ["Indian seasons", "Natural vegetation types", "Wildlife in India", "Conservation"],  importance: "high"   },
    ],
  },

  "class6-civics": {
    id: "class6-civics", grade: 6, subject: "Civics",
    label: "Class 6 — Civics (Social and Political Life I)",
    aiHint: "NCERT Class 6 Civics — Social and Political Life I (CBSE India)",
    topics: [
      { name: "Understanding Diversity",                   chapter: 1, subtopics: ["India's diversity", "Regional diversity", "Language and culture", "Unity in diversity"],       importance: "high"   },
      { name: "Diversity and Discrimination",              chapter: 2, subtopics: ["Prejudice and stereotypes", "Caste discrimination", "Gender discrimination", "Equality"],      importance: "high"   },
      { name: "What is Government?",                       chapter: 3, subtopics: ["Need for government", "Types of government", "Levels of government", "Laws"],                  importance: "high"   },
      { name: "Key Elements of a Democratic Government",  chapter: 4, subtopics: ["Participation and elections", "Equality and justice", "Rights of citizens"],                   importance: "high"   },
      { name: "Panchayati Raj",                            chapter: 5, subtopics: ["Three levels of Panchayati Raj", "Gram Sabha", "Panchayat functions"],                         importance: "high"   },
      { name: "Rural Administration",                      chapter: 6, subtopics: ["Patwari and revenue records", "Police system", "Tehsildar"],                                   importance: "medium" },
      { name: "Urban Administration",                      chapter: 7, subtopics: ["Municipal council/corporation", "Ward councillors", "Urban services", "Mayor"],               importance: "medium" },
      { name: "Rural Livelihoods",                         chapter: 8, subtopics: ["Agriculture as livelihood", "Farm labourers", "Small vs large farmers", "Non-farm work"],     importance: "high"   },
      { name: "Urban Livelihoods",                         chapter: 9, subtopics: ["Street vendors and hawkers", "Workers in markets", "Fixed jobs vs casual work"],              importance: "high"   },
    ],
  },
};

export const SUBJECTS_BY_GRADE = {
  5: [
    { id: "class5-math", label: "Mathematics"                },
    { id: "class5-evs",  label: "Environmental Studies (EVS)" },
  ],
  6: [
    { id: "class6-math",      label: "Mathematics" },
    { id: "class6-science",   label: "Science"     },
    { id: "class6-history",   label: "History"     },
    { id: "class6-geography", label: "Geography"   },
    { id: "class6-civics",    label: "Civics"      },
  ],
};
