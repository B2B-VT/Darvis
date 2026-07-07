// Darvis Mock Data
export const MOCK = {
  currentUser: null,

  professors: [
    { id: "p1", name: "Dr. Godmar Back", dept: "CS", rmpRating: 4.2, rmpDifficulty: 3.8, rmpCount: 312, tags: ["Caring","Tough grader","Lectures go long"], bio: "Professor of Computer Science specializing in operating systems and systems programming." },
    { id: "p2", name: "Dr. Ali Butt", dept: "CS", rmpRating: 3.9, rmpDifficulty: 4.1, rmpCount: 187, tags: ["Clear lectures","Heavy workload","Research-focused"], bio: "Professor specializing in distributed systems and cloud computing." },
    { id: "p3", name: "Dr. Layne Watson", dept: "CS", rmpRating: 3.5, rmpDifficulty: 4.5, rmpCount: 224, tags: ["Brilliant","Very hard","Office hours helpful"], bio: "Professor of Computer Science and Mathematics with research in numerical analysis." },
    { id: "p4", name: "Dr. Barbara Ryder", dept: "CS", rmpRating: 4.5, rmpDifficulty: 3.2, rmpCount: 156, tags: ["Amazing teacher","Fair grader","Great feedback"], bio: "Professor specializing in program analysis and software engineering." },
    { id: "p5", name: "Dr. Calvin Ribbens", dept: "CS", rmpRating: 4.1, rmpDifficulty: 3.6, rmpCount: 203, tags: ["Organized","Good examples","Approachable"], bio: "Professor of Computer Science focusing on parallel computing." },
    { id: "p6", name: "Dr. Mark Embree", dept: "MATH", rmpRating: 4.4, rmpDifficulty: 3.9, rmpCount: 178, tags: ["Engaging","Proof-heavy","Inspiring"], bio: "Professor of Mathematics specializing in numerical linear algebra." },
    { id: "p7", name: "Dr. Peter Haskell", dept: "MATH", rmpRating: 3.8, rmpDifficulty: 4.2, rmpCount: 142, tags: ["Clear","Fast-paced","Notes essential"], bio: "Professor of Mathematics with expertise in operator algebras." },
    { id: "p8", name: "Dr. Ezra Brown", dept: "MATH", rmpRating: 4.7, rmpDifficulty: 3.4, rmpCount: 265, tags: ["Legendary","Fun lectures","Makes math click"], bio: "Professor Emeritus, beloved for making abstract math accessible and fun." },
    { id: "p9", name: "Dr. Kathleen Meehan", dept: "ECE", rmpRating: 3.6, rmpDifficulty: 4.3, rmpCount: 198, tags: ["Strict","Detailed","Exam heavy"], bio: "Professor of Electrical Engineering focusing on circuit design." },
    { id: "p10", name: "Dr. Joseph Tront", dept: "ECE", rmpRating: 4.0, rmpDifficulty: 3.7, rmpCount: 167, tags: ["Helpful","Good slides","Lab-focused"], bio: "Professor of Computer Engineering specializing in VLSI design." },
    { id: "p11", name: "Dr. Brenda Winkel", dept: "BIOL", rmpRating: 4.3, rmpDifficulty: 3.5, rmpCount: 289, tags: ["Passionate","Fair","Flipped classroom"], bio: "Professor of Biochemistry and molecular biology." },
    { id: "p12", name: "Dr. Robert Bodnar", dept: "BIOL", rmpRating: 3.7, rmpDifficulty: 4.0, rmpCount: 134, tags: ["Knowledgeable","Dense material","Great researcher"], bio: "Professor of Geosciences with focus on fluid inclusions." },
    { id: "p13", name: "Dr. Matthew Gabriele", dept: "HIST", rmpRating: 4.6, rmpDifficulty: 2.8, rmpCount: 312, tags: ["Hilarious","Easy A","Engaging stories"], bio: "Associate Professor of Medieval History and popular lecturer." },
    { id: "p14", name: "Dr. Elaine Fuller", dept: "PSYC", rmpRating: 4.2, rmpDifficulty: 2.9, rmpCount: 221, tags: ["Chill","Fair tests","Good listener"], bio: "Associate Professor of Psychology focusing on developmental psych." },
    { id: "p15", name: "Dr. Steven Holton", dept: "PHYS", rmpRating: 3.9, rmpDifficulty: 4.4, rmpCount: 176, tags: ["Clear explanations","Hard exams","Curved"], bio: "Professor of Physics specializing in quantum mechanics." },
  ],

  courses: [
    {
      id: "cs2114", subject: "CS", number: "2114", title: "Software Design & Data Structures",
      credits: 3, description: "Introduction to software design with emphasis on data structures. Topics include recursion, lists, stacks, queues, trees, hashing, and sorting algorithms.",
      avgGpa: 3.01, pathways: ["5a"], profIds: ["p1","p5"],
      gradeDistribution: { "A":28,"A-":15,"B+":14,"B":13,"B-":8,"C+":7,"C":6,"C-":4,"D+":2,"D":1,"D-":1,"F":1,"W":0 }
    },
    {
      id: "cs3114", subject: "CS", number: "3114", title: "Data Structures & Algorithms",
      credits: 3, description: "Advanced data structures including AVL trees, heaps, and graphs. Algorithm design paradigms and complexity analysis.",
      avgGpa: 2.87, pathways: [], profIds: ["p2","p3"],
      gradeDistribution: { "A":22,"A-":12,"B+":13,"B":14,"B-":10,"C+":8,"C":7,"C-":5,"D+":3,"D":2,"D-":2,"F":2,"W":0 }
    },
    {
      id: "cs3304", subject: "CS", number: "3304", title: "Comparative Languages",
      credits: 3, description: "Survey of programming language paradigms including functional, logic, and object-oriented programming. Language design and implementation.",
      avgGpa: 3.15, pathways: [], profIds: ["p1","p4"],
      gradeDistribution: { "A":32,"A-":16,"B+":13,"B":12,"B-":8,"C+":6,"C":5,"C-":3,"D+":2,"D":1,"D-":1,"F":1,"W":0 }
    },
    {
      id: "cs4234", subject: "CS", number: "4234", title: "Intro to Algorithms",
      credits: 3, description: "Algorithm design and analysis. Dynamic programming, greedy algorithms, network flow, NP-completeness, and approximation algorithms.",
      avgGpa: 2.95, pathways: [], profIds: ["p3","p5"],
      gradeDistribution: { "A":25,"A-":14,"B+":12,"B":13,"B-":10,"C+":9,"C":7,"C-":4,"D+":3,"D":2,"D-":1,"F":0,"W":0 }
    },
    {
      id: "cs4414", subject: "CS", number: "4414", title: "Systems & Networking Capstone",
      credits: 3, description: "Capstone course covering operating systems principles, computer networks, and distributed computing.",
      avgGpa: 3.22, pathways: [], profIds: ["p2","p1"],
      gradeDistribution: { "A":35,"A-":18,"B+":14,"B":12,"B-":7,"C+":5,"C":4,"C-":2,"D+":1,"D":1,"D-":1,"F":0,"W":0 }
    },
    {
      id: "math2114", subject: "MATH", number: "2114", title: "Introduction to Linear Algebra",
      credits: 3, description: "Systems of equations, matrix operations, determinants, vector spaces, eigenvalues and eigenvectors, orthogonality.",
      avgGpa: 2.92, pathways: ["5a"], profIds: ["p6","p7"],
      gradeDistribution: { "A":24,"A-":13,"B+":14,"B":15,"B-":10,"C+":8,"C":6,"C-":4,"D+":2,"D":2,"D-":1,"F":1,"W":0 }
    },
    {
      id: "math2224", subject: "MATH", number: "2224", title: "Multivariable Calculus",
      credits: 3, description: "Vectors, partial derivatives, multiple integrals, vector fields, line and surface integrals, Stokes and divergence theorems.",
      avgGpa: 2.78, pathways: ["5a"], profIds: ["p7","p8"],
      gradeDistribution: { "A":20,"A-":12,"B+":13,"B":15,"B-":11,"C+":9,"C":8,"C-":5,"D+":3,"D":2,"D-":1,"F":1,"W":0 }
    },
    {
      id: "math3134", subject: "MATH", number: "3134", title: "Combinatorics",
      credits: 3, description: "Counting techniques, pigeonhole principle, inclusion-exclusion, generating functions, recurrence relations, graph theory.",
      avgGpa: 3.28, pathways: ["5a"], profIds: ["p8","p6"],
      gradeDistribution: { "A":38,"A-":17,"B+":13,"B":11,"B-":7,"C+":5,"C":4,"C-":2,"D+":1,"D":1,"D-":1,"F":0,"W":0 }
    },
    {
      id: "math4564", subject: "MATH", number: "4564", title: "Operational Methods for Engineers",
      credits: 3, description: "Laplace transforms, Fourier series, boundary value problems, and partial differential equations.",
      avgGpa: 2.88, pathways: [], profIds: ["p6","p7"],
      gradeDistribution: { "A":23,"A-":13,"B+":14,"B":14,"B-":10,"C+":8,"C":7,"C-":4,"D+":3,"D":2,"D-":1,"F":1,"W":0 }
    },
    {
      id: "ece2504", subject: "ECE", number: "2504", title: "Introduction to Computer Engineering",
      credits: 3, description: "Digital logic, Boolean algebra, combinational and sequential circuits, computer architecture basics.",
      avgGpa: 2.81, pathways: [], profIds: ["p9","p10"],
      gradeDistribution: { "A":21,"A-":12,"B+":13,"B":15,"B-":11,"C+":9,"C":7,"C-":5,"D+":3,"D":2,"D-":1,"F":1,"W":0 }
    },
    {
      id: "ece3544", subject: "ECE", number: "3544", title: "Digital Design I",
      credits: 3, description: "Advanced digital design: VHDL, FPGAs, finite state machines, and hardware description languages.",
      avgGpa: 2.95, pathways: [], profIds: ["p10","p9"],
      gradeDistribution: { "A":25,"A-":14,"B+":13,"B":13,"B-":9,"C+":8,"C":7,"C-":4,"D+":3,"D":2,"D-":1,"F":1,"W":0 }
    },
    {
      id: "biol2104", subject: "BIOL", number: "2104", title: "Biology: Principles & Problems",
      credits: 3, description: "Survey of biological principles including cell biology, genetics, evolution, and ecology.",
      avgGpa: 3.05, pathways: ["4"], profIds: ["p11","p12"],
      gradeDistribution: { "A":30,"A-":15,"B+":13,"B":13,"B-":9,"C+":7,"C":5,"C-":3,"D+":2,"D":1,"D-":1,"F":1,"W":0 }
    },
    {
      id: "biol3604", subject: "BIOL", number: "3604", title: "Genetics",
      credits: 3, description: "Mendelian and molecular genetics, gene expression regulation, genomics, and genetic analysis.",
      avgGpa: 2.96, pathways: [], profIds: ["p11"],
      gradeDistribution: { "A":26,"A-":14,"B+":14,"B":13,"B-":9,"C+":8,"C":6,"C-":4,"D+":2,"D":2,"D-":1,"F":1,"W":0 }
    },
    {
      id: "hist1015", subject: "HIST", number: "1015", title: "World History to 1500",
      credits: 3, description: "Survey of world history from pre-history through the medieval period, examining major civilizations and their interactions.",
      avgGpa: 3.52, pathways: ["2"], profIds: ["p13"],
      gradeDistribution: { "A":48,"A-":18,"B+":12,"B":10,"B-":5,"C+":3,"C":2,"C-":1,"D+":0,"D":0,"D-":0,"F":1,"W":0 }
    },
    {
      id: "psyc1004", subject: "PSYC", number: "1004", title: "Introduction to Psychology",
      credits: 3, description: "Survey of major topics in psychology including perception, memory, development, personality, and social behavior.",
      avgGpa: 3.41, pathways: ["3"], profIds: ["p14"],
      gradeDistribution: { "A":43,"A-":18,"B+":13,"B":11,"B-":6,"C+":4,"C":2,"C-":1,"D+":0,"D":0,"D-":0,"F":1,"W":1 }
    },
    {
      id: "phys2305", subject: "PHYS", number: "2305", title: "Foundations of Physics I",
      credits: 4, description: "Mechanics, thermodynamics, and waves. Lab component included.",
      avgGpa: 2.74, pathways: ["4", "5a"], profIds: ["p15"],
      gradeDistribution: { "A":18,"A-":11,"B+":12,"B":15,"B-":12,"C+":10,"C":9,"C-":6,"D+":4,"D":2,"D-":1,"F":0,"W":0 }
    },
    {
      id: "phys2306", subject: "PHYS", number: "2306", title: "Foundations of Physics II",
      credits: 4, description: "Electricity, magnetism, optics, and modern physics. Lab component included.",
      avgGpa: 2.68, pathways: ["4"], profIds: ["p15"],
      gradeDistribution: { "A":16,"A-":10,"B+":12,"B":14,"B-":13,"C+":11,"C":10,"C-":6,"D+":4,"D":2,"D-":1,"F":1,"W":0 }
    },
    {
      id: "cs5114", subject: "CS", number: "5114", title: "Network Security",
      credits: 3, description: "Principles of network security, cryptographic protocols, intrusion detection, and secure system design.",
      avgGpa: 3.45, pathways: [], profIds: ["p2"],
      gradeDistribution: { "A":45,"A-":20,"B+":14,"B":10,"B-":5,"C+":3,"C":2,"C-":1,"D+":0,"D":0,"D-":0,"F":0,"W":0 }
    },
    {
      id: "cs4664", subject: "CS", number: "4664", title: "Introduction to Machine Learning",
      credits: 3, description: "Supervised and unsupervised learning, neural networks, model evaluation, and applications.",
      avgGpa: 3.38, pathways: [], profIds: ["p4","p5"],
      gradeDistribution: { "A":42,"A-":19,"B+":14,"B":11,"B-":6,"C+":4,"C":2,"C-":1,"D+":0,"D":0,"D-":0,"F":1,"W":0 }
    },
    {
      id: "math4625", subject: "MATH", number: "4625", title: "Applied Statistics",
      credits: 3, description: "Probability distributions, hypothesis testing, regression analysis, and statistical computing in R.",
      avgGpa: 3.12, pathways: ["5a"], profIds: ["p8","p6"],
      gradeDistribution: { "A":33,"A-":16,"B+":14,"B":13,"B-":8,"C+":6,"C":4,"C-":2,"D+":1,"D":1,"D-":1,"F":1,"W":0 }
    },
  ],

  sections: [
    // CS 2114
    { id: "s1", courseId: "cs2114", crn: "10421", profId: "p1", days: ["M","W","F"], startTime: "09:05", endTime: "09:55", location: "McBryde 100", seats: 120, enrolled: 118, waitlist: 5, term: "Fall 2025" },
    { id: "s2", courseId: "cs2114", crn: "10422", profId: "p5", days: ["T","R"], startTime: "11:00", endTime: "12:15", location: "Torgersen 1060", seats: 90, enrolled: 87, waitlist: 0, term: "Fall 2025" },
    { id: "s3", courseId: "cs2114", crn: "10423", profId: "p1", days: ["M","W","F"], startTime: "14:00", endTime: "14:50", location: "McBryde 100", seats: 120, enrolled: 102, waitlist: 0, term: "Fall 2025" },
    // CS 3114
    { id: "s4", courseId: "cs3114", crn: "10531", profId: "p2", days: ["T","R"], startTime: "09:30", endTime: "10:45", location: "McBryde 228", seats: 60, enrolled: 60, waitlist: 8, term: "Fall 2025" },
    { id: "s5", courseId: "cs3114", crn: "10532", profId: "p3", days: ["M","W","F"], startTime: "11:15", endTime: "12:05", location: "Torgersen 1080", seats: 75, enrolled: 71, waitlist: 0, term: "Fall 2025" },
    // CS 3304
    { id: "s6", courseId: "cs3304", crn: "10611", profId: "p1", days: ["T","R"], startTime: "14:00", endTime: "15:15", location: "McBryde 226", seats: 50, enrolled: 48, waitlist: 0, term: "Fall 2025" },
    { id: "s7", courseId: "cs3304", crn: "10612", profId: "p4", days: ["M","W","F"], startTime: "10:10", endTime: "11:00", location: "McBryde 228", seats: 50, enrolled: 50, waitlist: 3, term: "Fall 2025" },
    // CS 4664 ML
    { id: "s8", courseId: "cs4664", crn: "10891", profId: "p4", days: ["T","R"], startTime: "12:30", endTime: "13:45", location: "McBryde 100", seats: 100, enrolled: 98, waitlist: 12, term: "Fall 2025" },
    // MATH 2114
    { id: "s9", courseId: "math2114", crn: "20211", profId: "p6", days: ["M","W","F"], startTime: "08:00", endTime: "08:50", location: "Burruss 220", seats: 80, enrolled: 78, waitlist: 0, term: "Fall 2025" },
    { id: "s10", courseId: "math2114", crn: "20212", profId: "p7", days: ["T","R"], startTime: "09:30", endTime: "10:45", location: "McBryde 380", seats: 60, enrolled: 60, waitlist: 5, term: "Fall 2025" },
    { id: "s11", courseId: "math2114", crn: "20213", profId: "p8", days: ["M","W","F"], startTime: "13:00", endTime: "13:50", location: "Burruss 220", seats: 80, enrolled: 55, waitlist: 0, term: "Fall 2025" },
    // MATH 2224
    { id: "s12", courseId: "math2224", crn: "20321", profId: "p7", days: ["M","W","F"], startTime: "09:05", endTime: "09:55", location: "McBryde 380", seats: 70, enrolled: 70, waitlist: 2, term: "Fall 2025" },
    { id: "s13", courseId: "math2224", crn: "20322", profId: "p8", days: ["T","R"], startTime: "14:00", endTime: "15:15", location: "Burruss 130", seats: 65, enrolled: 58, waitlist: 0, term: "Fall 2025" },
    // PHYS 2305
    { id: "s14", courseId: "phys2305", crn: "30441", profId: "p15", days: ["M","W","F"], startTime: "11:15", endTime: "12:05", location: "Robeson 103", seats: 180, enrolled: 176, waitlist: 9, term: "Fall 2025" },
    { id: "s15", courseId: "phys2305", crn: "30442", profId: "p15", days: ["T","R"], startTime: "12:30", endTime: "13:45", location: "Robeson 103", seats: 180, enrolled: 162, waitlist: 0, term: "Fall 2025" },
    // BIOL 2104
    { id: "s16", courseId: "biol2104", crn: "40221", profId: "p11", days: ["T","R"], startTime: "11:00", endTime: "12:15", location: "Derring 1066", seats: 100, enrolled: 95, waitlist: 0, term: "Fall 2025" },
    // HIST 1015
    { id: "s17", courseId: "hist1015", crn: "50112", profId: "p13", days: ["T","R"], startTime: "14:00", endTime: "15:15", location: "Burruss 130", seats: 200, enrolled: 185, waitlist: 0, term: "Fall 2025" },
    // PSYC 1004
    { id: "s18", courseId: "psyc1004", crn: "60141", profId: "p14", days: ["M","W","F"], startTime: "10:10", endTime: "11:00", location: "Squires 345", seats: 150, enrolled: 143, waitlist: 0, term: "Fall 2025" },
    // CS 4234
    { id: "s19", courseId: "cs4234", crn: "10721", profId: "p3", days: ["T","R"], startTime: "15:30", endTime: "16:45", location: "McBryde 226", seats: 50, enrolled: 47, waitlist: 0, term: "Fall 2025" },
    // ECE 2504
    { id: "s20", courseId: "ece2504", crn: "70312", profId: "p9", days: ["M","W","F"], startTime: "12:20", endTime: "13:10", location: "Whittemore 355", seats: 75, enrolled: 74, waitlist: 1, term: "Fall 2025" },
    // CS 5114
    { id: "s21", courseId: "cs5114", crn: "10982", profId: "p2", days: ["T","R"], startTime: "16:00", endTime: "17:15", location: "McBryde 228", seats: 40, enrolled: 38, waitlist: 0, term: "Fall 2025" },
    // MATH 3134
    { id: "s22", courseId: "math3134", crn: "20512", profId: "p8", days: ["M","W","F"], startTime: "14:00", endTime: "14:50", location: "McBryde 380", seats: 55, enrolled: 42, waitlist: 0, term: "Fall 2025" },
  ],

  // Saved schedule for demo logged-in user
  demoSchedule: ["s2","s10","s14","s16","s17"],
  // s2: CS 2114 T/R 11:00, s10: MATH 2114 T/R 9:30, s14: PHYS 2305 MWF 11:15, s16: BIOL 2104 T/R 11:00 - conflict!
  // Let's fix: use s2 CS2114 T/R 11, s11 MATH 2114 MWF 1pm, s15 PHYS T/R 12:30, s17 HIST T/R 2pm, s18 PSYC MWF 10:10
  demoSchedule2: ["s2","s11","s15","s17","s18"],

  subjects: ["CS","MATH","ECE","BIOL","HIST","PSYC","PHYS"],
  terms: ["Fall 2025","Spring 2025","Fall 2024","Spring 2024"],

  // VT Pathways concepts (as of 2025-26). Concept 7 is suspended but kept for legacy data.
  pathwaysOptions: [
    { code: "1f", label: "Foundational Discourse",                             color: "#1a4480", bg: "#e8f0fe" },
    { code: "1a", label: "Advanced/Applied Discourse",                         color: "#1a4480", bg: "#dce8fd" },
    { code: "2",  label: "Critical Thinking in the Humanities",                color: "#6b21a8", bg: "#f3e8ff" },
    { code: "3",  label: "Reasoning in the Social Sciences",                   color: "#065f46", bg: "#d1fae5" },
    { code: "4",  label: "Reasoning in the Natural Sciences",                  color: "#14532d", bg: "#dcfce7" },
    { code: "5f", label: "Foundational Quantitative & Computational Thinking", color: "#92400e", bg: "#fef3c7" },
    { code: "5a", label: "Advanced/Applied Quantitative & Computational Thinking", color: "#78350f", bg: "#fde68a" },
    { code: "6a", label: "Critique and Practice in the Arts",                  color: "#9f1239", bg: "#ffe4e6" },
    { code: "6d", label: "Critique and Practice in Design",                    color: "#be185d", bg: "#fce7f3" },
    { code: "7",  label: "Critical Analysis of Identity & Equity in the U.S.", color: "#64748b", bg: "#f1f5f9", suspended: true },
    { code: "10", label: "Ethical Reasoning",                                  color: "#0f766e", bg: "#ccfbf1" },
    { code: "11", label: "Intercultural & Global Awareness",                   color: "#9a3412", bg: "#ffedd5" },
  ],
};

// Helper functions
MOCK.getCourse = (id) => MOCK.courses.find(c => c.id === id);
MOCK.getProf = (id) => MOCK.professors.find(p => p.id === id);
MOCK.getSections = (courseId) => MOCK.sections.filter(s => s.courseId === courseId);
MOCK.getProfSections = (profId) => MOCK.sections.filter(s => s.profId === profId);
MOCK.getProfCourses = (profId) => {
  const courseIds = [...new Set(MOCK.sections.filter(s => s.profId === profId).map(s => s.courseId))];
  return courseIds.map(id => MOCK.getCourse(id)).filter(Boolean);
};

MOCK.formatTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${m.toString().padStart(2,'0')} ${ampm}`;
};

MOCK.gpaColor = (gpa) => {
  if (gpa >= 3.5) return '#22843c';
  if (gpa >= 3.0) return '#3a8c44';
  if (gpa >= 2.5) return '#b45309';
  return '#c0392b';
};

MOCK.gradeColors = {
  "A":  { bg: "oklch(0.92 0.09 145)", text: "oklch(0.35 0.14 145)" },
  "A-": { bg: "oklch(0.92 0.07 145)", text: "oklch(0.35 0.12 145)" },
  "B+": { bg: "oklch(0.90 0.08 200)", text: "oklch(0.35 0.13 220)" },
  "B":  { bg: "oklch(0.91 0.06 200)", text: "oklch(0.35 0.11 220)" },
  "B-": { bg: "oklch(0.91 0.05 200)", text: "oklch(0.35 0.09 220)" },
  "C+": { bg: "oklch(0.94 0.10 80)",  text: "oklch(0.40 0.14 75)" },
  "C":  { bg: "oklch(0.94 0.09 80)",  text: "oklch(0.40 0.13 75)" },
  "C-": { bg: "oklch(0.93 0.10 60)",  text: "oklch(0.40 0.14 55)" },
  "D+": { bg: "oklch(0.92 0.11 40)",  text: "oklch(0.38 0.15 40)" },
  "D":  { bg: "oklch(0.91 0.12 35)",  text: "oklch(0.38 0.16 35)" },
  "D-": { bg: "oklch(0.90 0.12 30)",  text: "oklch(0.38 0.16 30)" },
  "F":  { bg: "oklch(0.92 0.11 20)",  text: "oklch(0.38 0.18 20)" },
  "W":  { bg: "oklch(0.93 0.03 270)", text: "oklch(0.38 0.05 270)" },
};
