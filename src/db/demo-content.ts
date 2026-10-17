// Demo content for the LIVE `alumni` dev database. Adds realistic posts,
// comments, votes and users to Northern University Bangladesh WITHOUT
// touching the existing university/department/batch/user rows. Never
// truncates.
//
// Idempotency: demo users are marked by email pattern `*.demo@nub.ac.bd`.
// On a plain run, if any such user already exists, the script logs that
// and exits without touching anything (safe to re-run `bun run db:demo`
// after the first successful run).
//
// To wipe and regenerate demo content, pass --fresh-demo: it deletes only
// rows authored by (or voted/followed/notified by) demo users, then reseeds
// from scratch. It never touches ceo@nub.ac.bd, tanvir@nub.ac.bd,
// ac@shahriyar.dev, or the pre-existing university/department/batch rows.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

const PASSWORD = "password123";
const DEMO_EMAIL_LIKE = "%.demo@nub.ac.bd";
const DAY = 24 * 60 * 60 * 1000;
const FRESH = process.argv.includes("--fresh-demo");

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[rand(0, arr.length - 1)];
function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < Math.min(n, pool.length)) {
    out.push(pool.splice(rand(0, pool.length - 1), 1)[0]);
  }
  return out;
}
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

// ---- fresh-demo cleanup: only rows tied to demo users ----
// ponytail: flattens all comment.parent_id in the tenant before deleting,
// and clears votes/notifications/follows tenant-wide rather than tracing
// exactly which ones touch demo content. Safe here because this script is
// the only thing that ever creates those rows for NUB; revisit with a
// precise per-row trace if non-demo users start voting/following for real.
async function cleanupDemo(universityId: string) {
  await db.execute(sql`
    update comment set parent_id = null
    where university_id = ${universityId} and parent_id is not null`);
  await db.execute(sql`
    update post set accepted_comment_id = null
    where university_id = ${universityId} and accepted_comment_id is not null`);
  await db.execute(
    sql`delete from notification where university_id = ${universityId}`,
  );
  await db.execute(sql`delete from vote where university_id = ${universityId}`);
  await db.execute(
    sql`delete from follow_user where university_id = ${universityId}`,
  );
  await db.execute(sql`
    delete from comment where university_id = ${universityId}
    and author_id in (select id from "user" where email like ${DEMO_EMAIL_LIKE})`);
  await db.execute(sql`
    delete from post where university_id = ${universityId}
    and author_id in (select id from "user" where email like ${DEMO_EMAIL_LIKE})`);
  await db.execute(sql`
    delete from account where user_id in
    (select id from "user" where email like ${DEMO_EMAIL_LIKE})`);
  await db.execute(sql`delete from "user" where email like ${DEMO_EMAIL_LIKE}`);
}

// ---- departments & batches ----
const DEPT_NAMES = ["CSE", "EEE", "BBA", "English", "LLB"];
// number -> graduation year, per the task spec (NUB's existing numbering
// isn't a fixed formula, e.g. batch 45 already means 2000).
const ALUMNI_BATCHES = [
  { number: 40, graduationYear: 2021 },
  { number: 41, graduationYear: 2022 },
  { number: 42, graduationYear: 2023 },
  { number: 43, graduationYear: 2024 },
  { number: 44, graduationYear: 2025 },
];
const STUDENT_BATCHES = [
  { number: 46, graduationYear: 2027 },
  { number: 47, graduationYear: 2028 },
];

async function ensureDepartments(universityId: string) {
  const existing = await db
    .select({ name: schema.department.name })
    .from(schema.department)
    .where(eq(schema.department.universityId, universityId));
  const have = new Set(existing.map((r) => r.name.toLowerCase()));
  const missing = DEPT_NAMES.filter((n) => !have.has(n.toLowerCase()));
  if (missing.length === 0) return;
  await db
    .insert(schema.department)
    .values(missing.map((name) => ({ universityId, name })))
    .onConflictDoNothing();
}

async function ensureBatches(universityId: string) {
  const existing = await db
    .select({ number: schema.batch.number })
    .from(schema.batch)
    .where(eq(schema.batch.universityId, universityId));
  const have = new Set(existing.map((r) => r.number));
  const missing = [...ALUMNI_BATCHES, ...STUDENT_BATCHES].filter(
    (b) => !have.has(b.number),
  );
  if (missing.length === 0) return;
  await db
    .insert(schema.batch)
    .values(missing.map((b) => ({ universityId, ...b })))
    .onConflictDoNothing();
}

// ---- demo users ----
type DemoUser = {
  email: string;
  name: string;
  role: schema.Role;
  dept: string | null;
  batchNumber: number | null;
  graduationYear: number | null;
  title?: string;
  bio?: string;
};

const ALUMNI: DemoUser[] = [
  {
    email: "mahmudul.hasan.demo@nub.ac.bd",
    name: "Mahmudul Hasan",
    role: "ALUMNUS",
    dept: "CSE",
    batchNumber: 40,
    graduationYear: 2021,
    title: "Software Engineer at Pathao",
    bio: "Backend engineer working on Pathao's dispatch systems. Happy to help juniors with internship prep.",
  },
  {
    email: "farzana.akter.demo@nub.ac.bd",
    name: "Farzana Akter",
    role: "ALUMNUS",
    dept: "EEE",
    batchNumber: 41,
    graduationYear: 2022,
    title: "Data Analyst at bKash",
    bio: "Moved from power systems to data analytics after a data science bootcamp. Ask me about the transition.",
  },
  {
    email: "shakil.ahmed.demo@nub.ac.bd",
    name: "Shakil Ahmed",
    role: "ALUMNUS",
    dept: "BBA",
    batchNumber: 40,
    graduationYear: 2021,
    title: "Marketing Executive at Grameenphone",
    bio: "Handling brand campaigns at GP. Always glad to talk career paths in telecom marketing.",
  },
  {
    email: "nazia.islam.demo@nub.ac.bd",
    name: "Nazia Islam",
    role: "ALUMNUS",
    dept: "English",
    batchNumber: 42,
    graduationYear: 2023,
    title: "Content Writer at The Business Standard",
    bio: "Writing business and tech features. English majors do have options outside teaching!",
  },
  {
    email: "rezaul.karim.demo@nub.ac.bd",
    name: "Rezaul Karim",
    role: "ALUMNUS",
    dept: "LLB",
    batchNumber: 41,
    graduationYear: 2022,
    title: "Associate at Doulah & Doulah",
    bio: "Corporate law associate, two years in. Took the bar exam right after graduating.",
  },
  {
    email: "tania.sultana.demo@nub.ac.bd",
    name: "Tania Sultana",
    role: "ALUMNUS",
    dept: "CSE",
    batchNumber: 43,
    graduationYear: 2024,
    title: "Backend Developer at Therap BD",
    bio: "Working on healthcare software. Mostly Java and SQL day to day.",
  },
  {
    email: "imtiaz.hossain.demo@nub.ac.bd",
    name: "Imtiaz Hossain",
    role: "ALUMNUS",
    dept: "EEE",
    batchNumber: 42,
    graduationYear: 2023,
    title: "Network Engineer at Robi Axiata",
    bio: "RF and core network planning. Can talk about telecom career paths for EEE grads.",
  },
  {
    email: "jannatul.ferdous.demo@nub.ac.bd",
    name: "Jannatul Ferdous",
    role: "ALUMNUS",
    dept: "BBA",
    batchNumber: 44,
    graduationYear: 2025,
    title: "HR Associate at Unilever Bangladesh",
    bio: "Fresh into corporate HR, happy to share how campus recruiting actually works.",
  },
  {
    email: "sabbir.rahman.demo@nub.ac.bd",
    name: "Sabbir Rahman",
    role: "ALUMNUS",
    dept: "CSE",
    batchNumber: 44,
    graduationYear: 2025,
    title: "QA Engineer at Brain Station 23",
    bio: "Manual + automation QA. Switched into tech from a non-CS background originally.",
  },
  {
    email: "afsana.mim.demo@nub.ac.bd",
    name: "Afsana Mim",
    role: "ALUMNUS",
    dept: "LLB",
    batchNumber: 43,
    graduationYear: 2024,
    title: "Legal Associate at BRAC",
    bio: "Working on BRAC's legal aid programs. LLB doesn't have to mean litigation.",
  },
];

const STUDENTS: DemoUser[] = [
  {
    email: "rakib.hasan.demo@nub.ac.bd",
    name: "Rakib Hasan",
    role: "STUDENT",
    dept: "CSE",
    batchNumber: 46,
    graduationYear: 2027,
  },
  {
    email: "tasnim.jahan.demo@nub.ac.bd",
    name: "Tasnim Jahan",
    role: "STUDENT",
    dept: "EEE",
    batchNumber: 47,
    graduationYear: 2028,
  },
  {
    email: "fahim.muntasir.demo@nub.ac.bd",
    name: "Fahim Muntasir",
    role: "STUDENT",
    dept: "CSE",
    batchNumber: 47,
    graduationYear: 2028,
  },
  {
    email: "sadia.afrin.demo@nub.ac.bd",
    name: "Sadia Afrin",
    role: "STUDENT",
    dept: "BBA",
    batchNumber: 46,
    graduationYear: 2027,
  },
  {
    email: "naimur.rahman.demo@nub.ac.bd",
    name: "Naimur Rahman",
    role: "STUDENT",
    dept: "LLB",
    batchNumber: 47,
    graduationYear: 2028,
  },
  {
    email: "mehjabin.chowdhury.demo@nub.ac.bd",
    name: "Mehjabin Chowdhury",
    role: "STUDENT",
    dept: "English",
    batchNumber: 46,
    graduationYear: 2027,
  },
  {
    email: "arafat.hossain.demo@nub.ac.bd",
    name: "Arafat Hossain",
    role: "STUDENT",
    dept: "CSE",
    batchNumber: 47,
    graduationYear: 2028,
  },
  {
    email: "promi.akter.demo@nub.ac.bd",
    name: "Promi Akter",
    role: "STUDENT",
    dept: "BBA",
    batchNumber: 46,
    graduationYear: 2027,
  },
  {
    email: "shanto.das.demo@nub.ac.bd",
    name: "Shanto Das",
    role: "STUDENT",
    dept: "EEE",
    batchNumber: 47,
    graduationYear: 2028,
  },
  {
    email: "ruponti.islam.demo@nub.ac.bd",
    name: "Ruponti Islam",
    role: "STUDENT",
    dept: "CSE",
    batchNumber: 46,
    graduationYear: 2027,
  },
];

const STAFF: DemoUser[] = [
  {
    email: "mahbubur.rahman.demo@nub.ac.bd",
    name: "Dr. Mahbubur Rahman",
    role: "STAFF",
    dept: "CSE",
    batchNumber: null,
    graduationYear: null,
    title: "Assistant Professor",
  },
  {
    email: "nasrin.sultana.demo@nub.ac.bd",
    name: "Nasrin Sultana",
    role: "STAFF",
    dept: "EEE",
    batchNumber: null,
    graduationYear: null,
    title: "Lecturer",
  },
];

const MOD_ADMIN: DemoUser[] = [
  {
    email: "jahidul.islam.demo@nub.ac.bd",
    name: "Jahidul Islam",
    role: "MODERATOR",
    dept: null,
    batchNumber: null,
    graduationYear: null,
  },
  {
    email: "farhana.yesmin.demo@nub.ac.bd",
    name: "Farhana Yesmin",
    role: "ADMIN",
    dept: null,
    batchNumber: null,
    graduationYear: null,
  },
];

const ALL_DEMO_USERS = [...ALUMNI, ...STUDENTS, ...STAFF, ...MOD_ADMIN];

type CreatedUser = DemoUser & { id: string };

async function createDemoUsers(universityId: string): Promise<CreatedUser[]> {
  const passwordHash = await hashPassword(PASSWORD);
  const created: CreatedUser[] = [];
  for (const u of ALL_DEMO_USERS) {
    const id = randomUUID();
    await db.insert(schema.user).values({
      id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      universityId,
      role: u.role,
      graduationYear: u.graduationYear,
      batchNumber: u.batchNumber,
      department: u.dept,
      title: u.title ?? null,
      bio: u.bio ?? null,
      status: "ACTIVE",
      createdAt: daysAgo(rand(10, 120)),
    });
    await db.insert(schema.account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
    created.push({ ...u, id });
  }
  return created;
}

async function createFollows(universityId: string, users: CreatedUser[]) {
  const rows: {
    universityId: string;
    followerId: string;
    followeeId: string;
  }[] = [];
  const seen = new Set<string>();
  while (rows.length < 20) {
    const a = pick(users);
    const b = pick(users);
    if (a.id === b.id) continue;
    const key = `${a.id}:${b.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ universityId, followerId: a.id, followeeId: b.id });
  }
  await db.insert(schema.followUser).values(rows);
}

// ---- tags ----
const TAG_NAMES = [
  "cse",
  "career",
  "internship",
  "thesis",
  "higher-studies",
  "python",
  "javascript",
  "sql",
  "campus-life",
  "exams",
  "clubs",
  "eee",
  "bba",
  "llb",
  "english",
];

async function ensureTags(universityId: string): Promise<Map<string, string>> {
  const existing = await db
    .select({ id: schema.tag.id, name: schema.tag.name })
    .from(schema.tag)
    .where(eq(schema.tag.universityId, universityId));
  const have = new Set(existing.map((r) => r.name));
  const missing = TAG_NAMES.filter((n) => !have.has(n));
  if (missing.length > 0) {
    await db
      .insert(schema.tag)
      .values(missing.map((name) => ({ universityId, name })))
      .onConflictDoNothing();
  }
  const rows = await db
    .select({ id: schema.tag.id, name: schema.tag.name })
    .from(schema.tag)
    .where(eq(schema.tag.universityId, universityId));
  return new Map(rows.map((r) => [r.name, r.id]));
}

// ---- post content bank ----
const CODE: Record<string, string[]> = {
  python: [
    "```python\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint(fib(10))\n```",
    '```python\nimport pandas as pd\n\ndf = pd.read_csv("scores.csv")\nprint(df.groupby("dept")["score"].mean())\n```',
  ],
  javascript: [
    "```js\nfunction debounce(fn, delay) {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), delay);\n  };\n}\n```",
    "```js\nconst nums = [1, 2, 3, 4, 5];\nconst sum = nums.reduce((a, b) => a + b, 0);\nconsole.log(sum);\n```",
  ],
  sql: [
    "```sql\nSELECT department, COUNT(*) AS total\nFROM student\nGROUP BY department\nORDER BY total DESC;\n```",
    "```sql\nSELECT s.name, AVG(g.marks) AS avg_marks\nFROM student s\nJOIN grades g ON g.student_id = s.id\nGROUP BY s.name\nHAVING AVG(g.marks) > 80;\n```",
  ],
  java: [
    "```java\npublic class Main {\n    public static void main(String[] args) {\n        int[] arr = {5, 3, 8, 1};\n        Arrays.sort(arr);\n        System.out.println(Arrays.toString(arr));\n    }\n}\n```",
  ],
  cpp: [
    '```cpp\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    vector<int> v = {4, 2, 7, 1};\n    sort(v.begin(), v.end());\n    for (int x : v) cout << x << " ";\n}\n```',
  ],
};

type PostSeed = {
  kind: schema.PostKind;
  title: string;
  body: string;
  tags: string[];
  role: "STUDENT" | "ALUMNUS" | "STAFF" | "ANNOUNCER";
  hasCode?: boolean;
};

const COMPANIES = [
  "Pathao",
  "bKash",
  "Grameenphone",
  "Therap BD",
  "Brain Station 23",
  "Robi Axiata",
  "Banglalink",
  "Nagad",
  "Samsung R&D Bangladesh",
  "Enosis Solutions",
  "Kaz Software",
  "Vivasoft",
  "SELISE",
  "REVE Systems",
];
const ABROAD = [
  "University of Melbourne",
  "NUS Singapore",
  "University of Alberta",
  "TU Munich",
  "KTH Sweden",
  "University of Malaya",
];

function courseQuestions(): PostSeed[] {
  const byDept: { dept: string; tag: string; courses: string[] }[] = [
    {
      dept: "CSE",
      tag: "cse",
      courses: [
        "Computer Networks",
        "Distributed Systems",
        "Compiler Design",
        "Artificial Intelligence",
        "Database Systems",
        "Operating Systems",
      ],
    },
    {
      dept: "EEE",
      tag: "eee",
      courses: [
        "Digital Signal Processing",
        "Microprocessors",
        "VLSI Design",
        "Power Electronics",
      ],
    },
    {
      dept: "BBA",
      tag: "bba",
      courses: [
        "International Business",
        "Corporate Finance",
        "Organizational Behavior",
      ],
    },
    {
      dept: "LLB",
      tag: "llb",
      courses: ["Constitutional Law", "Jurisprudence"],
    },
  ];
  const out: PostSeed[] = [];
  let i = 0;
  for (const { tag, courses } of byDept) {
    for (const course of courses) {
      i++;
      out.push({
        kind: "QUESTION",
        title: `Is ${course} worth taking as an elective?`,
        body: `Planning next semester's electives and ${course} is on the list. Can anyone who's taken it share how heavy the workload is and whether it's useful afterward?\n\nAlso curious which instructor's section is better if there's a choice.`,
        tags: i % 2 === 0 ? [tag, "exams"] : [tag],
        role: i % 4 === 0 ? "ALUMNUS" : "STUDENT",
      });
    }
  }
  return out;
}

function thesisQuestions(): PostSeed[] {
  const topics = [
    ["Machine Learning", "cse"],
    ["Renewable Energy Systems", "eee"],
    ["Natural Language Processing", "cse"],
    ["Corporate Governance", "bba"],
    ["Human Rights Law", "llb"],
    ["Computer Vision", "cse"],
    ["Power Grid Stability", "eee"],
    ["Postcolonial Literature", "english"],
  ];
  return topics.map(([topic, tag]) => ({
    kind: "QUESTION" as const,
    title: `Looking for a thesis supervisor in ${topic}`,
    body: `Final year is coming up and I'd like to do my thesis in ${topic}. Does anyone have recommendations for a supervisor who's active in this area, and what the proposal process looked like for you?`,
    tags: [tag, "thesis"],
    role: "STUDENT" as const,
  }));
}

function internshipQuestions(): PostSeed[] {
  const out: PostSeed[] = [];
  const roles = [
    "backend development",
    "data analysis",
    "QA/testing",
    "digital marketing",
    "network operations",
  ];
  for (let i = 0; i < 10; i++) {
    const company = COMPANIES[i % COMPANIES.length];
    const role = roles[i % roles.length];
    out.push({
      kind: "QUESTION",
      title:
        i % 2 === 0
          ? `How to get a ${role} internship at a place like ${company}?`
          : `Just wrapped up my internship in ${role} — ask me anything`,
      body:
        i % 2 === 0
          ? `Applying for internships this cycle and ${company} is on my list. Did anyone here get in through campus placement, cold apply, or a referral?`
          : `Finished a 4-month internship doing ${role} at a company similar to ${company}. Happy to answer questions if you're applying this season.`,
      tags: ["internship", "career"],
      role: i % 2 === 0 ? "STUDENT" : "ALUMNUS",
    });
  }
  return out;
}

function jobQuestions(): PostSeed[] {
  const out: PostSeed[] = [];
  const subjects = [
    "software engineering interviews",
    "data analyst interviews",
    "marketing executive interviews",
    "network engineer interviews",
    "legal associate interviews",
    "QA engineer interviews",
  ];
  for (let i = 0; i < 12; i++) {
    const subject = subjects[i % subjects.length];
    const company = COMPANIES[(i + 3) % COMPANIES.length];
    out.push({
      kind: "QUESTION",
      title:
        i % 3 === 0
          ? `How I prepared for ${subject}`
          : `Any tips for ${subject} at a company like ${company}?`,
      body:
        i % 3 === 0
          ? `Sharing what worked for me when I was preparing for ${subject}: consistent practice, mock interviews, and reading up on the fundamentals for the final round. Happy to go into more detail if useful.`
          : `Have an interview coming up for a role similar to what's open at ${company}. Anyone been through their process recently? What should I expect in the technical/case round?`,
      tags: ["career"],
      role: i % 3 === 0 ? "ALUMNUS" : "STUDENT",
    });
  }
  return out;
}

function higherStudiesQuestions(): PostSeed[] {
  const out: PostSeed[] = [];
  for (let i = 0; i < 8; i++) {
    const uni = ABROAD[i % ABROAD.length];
    out.push({
      kind: "QUESTION",
      title:
        i % 2 === 0
          ? "Anyone doing GRE/IELTS prep groups?"
          : `Applying to ${uni} for a master's — advice?`,
      body:
        i % 2 === 0
          ? "Planning to take the GRE and IELTS in a few months and would love to join or start a study group. Which prep books/resources worked for people here?"
          : `Shortlisting programs and ${uni} is near the top of my list. If anyone from NUB has studied there or applied recently, how competitive is admission and what should the SOP focus on?`,
      tags: ["higher-studies"],
      role: "STUDENT",
    });
  }
  return out;
}

function campusLifeQuestions(): PostSeed[] {
  const bodies = [
    "The usual library floor gets packed fast between classes. Any quieter spots on campus worth knowing about?",
    "Moving to campus next semester — which hostels nearby are actually worth it for price and food?",
    "WiFi has been dropping constantly near the engineering building this week. Is this just me?",
    "Thinking of organizing an informal alumni-student meetup on campus this semester. Who'd be interested?",
    "What's the best place on or near campus to get lunch between back-to-back classes?",
    "Does anyone know if the gym on campus is open to all students or just a specific department?",
    "Looking for a roommate near campus for next semester, preferably another CSE or EEE student.",
    "How early should I register for next semester's courses to avoid the ones filling up?",
    "Is the new cafeteria rooftop seating actually open now or still under renovation?",
    "Any recommendations for part-time tutoring gigs near campus for extra income?",
  ];
  return bodies.map((body, i) => ({
    kind: "QUESTION" as const,
    title:
      body.split(".")[0].length > 60
        ? body.slice(0, 55)
        : `${body.split("?")[0]}?`,
    body,
    tags: ["campus-life"],
    role: (i % 5 === 0 ? "ALUMNUS" : "STUDENT") as "ALUMNUS" | "STUDENT",
  }));
}

function codingQuestions(): PostSeed[] {
  const defs: {
    title: string;
    body: string;
    lang: keyof typeof CODE;
    code: boolean;
  }[] = [
    {
      title: "Python: why does my recursive Fibonacci get so slow?",
      body: "I wrote a recursive Fibonacci function for an assignment and it crawls past n=35. What's the standard fix — memoization, or should I just rewrite it iteratively?",
      lang: "python",
      code: true,
    },
    {
      title: "Pandas groupby not giving the average I expect",
      body: "Trying to get the average score per department from a CSV but the numbers look off. Here's roughly what I have:",
      lang: "python",
      code: true,
    },
    {
      title: "Best way to debounce an input handler in JavaScript?",
      body: "Our search box fires a request on every keystroke and it's hammering the API. What's a clean debounce implementation without pulling in lodash?",
      lang: "javascript",
      code: true,
    },
    {
      title:
        "Array.reduce vs a plain for loop — does it matter for a class project?",
      body: "Professor marked down my JS assignment for using reduce instead of a loop, saying it's 'harder to read'. Is that a fair critique or just a style preference?",
      lang: "javascript",
      code: true,
    },
    {
      title: "SQL: GROUP BY with HAVING isn't filtering correctly",
      body: "Trying to find students whose average marks are above 80, grouped by name, but HAVING doesn't seem to apply after the join. Query below:",
      lang: "sql",
      code: true,
    },
    {
      title: "How do I write a query to rank students within each department?",
      body: "Need a SQL query that ranks students by score within their own department, not globally. Is this a window function thing?",
      lang: "sql",
      code: true,
    },
    {
      title: "Java: Arrays.sort() vs Collections.sort() for a lab assignment",
      body: "Our data structures lab wants us to sort an int array. Is Arrays.sort() acceptable or are we expected to implement our own sort?",
      lang: "java",
      code: true,
    },
    {
      title: "C++ vector sort throwing a weird comparator error",
      body: "Getting a compile error on a custom comparator for sorting a vector of pairs. Here's a minimal version of what I'm trying:",
      lang: "cpp",
      code: true,
    },
    {
      title: "Memory leak in a C++ assignment using raw pointers",
      body: "Valgrind is flagging a leak in my linked list implementation but I can't find where. Should I just switch to smart pointers for this assignment?",
      lang: "cpp",
      code: true,
    },
    {
      title:
        "Python: list comprehension vs map/filter — which is more Pythonic?",
      body: "Our TA keeps rewriting our map/filter chains as list comprehensions in code review. Is there an actual performance difference, or just style?",
      lang: "python",
      code: true,
    },
    {
      title: "JavaScript: async/await vs .then chains for an assignment",
      body: "Assignment requires fetching data from three endpoints in sequence. Is async/await considered better practice than chaining .then() these days?",
      lang: "javascript",
      code: true,
    },
    {
      title:
        "SQL indexes: when do they actually help on a small class database?",
      body: "We're asked to add an index to speed up a query but our assignment database only has a few thousand rows. Does it even matter at that scale?",
      lang: "sql",
      code: true,
    },
    {
      title: "Recursion vs iteration for a tree traversal assignment",
      body: "Our DSA assignment wants an in-order traversal. Is recursive the expected answer, or should I implement it iteratively with an explicit stack?",
      lang: "java",
      code: true,
    },
    {
      title:
        "Python virtual environments — do I need one for a single-file script?",
      body: "Working on a small script for a stats course. Is it overkill to set up a venv, or is that just good habit regardless of project size?",
      lang: "python",
      code: true,
    },
    {
      title: "Best resources to actually understand pointers in C++?",
      body: "Pointers and references keep tripping me up in our systems programming course. Any book or video series that finally made it click for you?",
      lang: "cpp",
      code: true,
    },
    {
      title: "Git merge conflicts keep breaking our group project",
      body: "Our group project repo keeps hitting merge conflicts on the same files. Is there a workflow (branching strategy, smaller PRs) that would help a team of 4 CS students?",
      lang: "javascript",
      code: false,
    },
    {
      title: "Which language should I learn first for competitive programming?",
      body: "Seniors recommend C++ for contests but I'm more comfortable in Python. Is the speed difference actually going to matter at the level we compete at?",
      lang: "cpp",
      code: false,
    },
    {
      title:
        "How much SQL do I actually need to know before a backend internship?",
      body: "Internship interviews keep asking SQL questions beyond basic SELECT/JOIN. What's the realistic depth expected for an entry-level backend role?",
      lang: "sql",
      code: false,
    },
    {
      title: "Is it worth learning TypeScript before graduating?",
      body: "Most job postings for junior roles mention TypeScript alongside JavaScript. Is it worth picking up now, or can it wait until I actually need it on the job?",
      lang: "javascript",
      code: false,
    },
    {
      title: "Final year project ideas in web development",
      body: "Need ideas for a final year web dev project that's substantial but doable in one semester. A small SaaS clone with auth and payments sounds appealing but might be too much scope.",
      lang: "javascript",
      code: false,
    },
  ];
  return defs.map((d) => ({
    kind: "QUESTION" as const,
    title: d.title,
    body: d.code ? `${d.body}\n\n${pick(CODE[d.lang])}` : d.body,
    tags: d.lang === "cpp" || d.lang === "java" ? ["cse"] : ["cse", d.lang],
    role: "STUDENT" as const,
    hasCode: d.code,
  }));
}

function examQuestions(): PostSeed[] {
  const bodies = [
    "Midterms are two weeks out — how is everyone splitting study time across four courses?",
    "Does the CSE department release previous semesters' question papers anywhere?",
    "Any tips for surviving back-to-back finals on the same day?",
    "Is the makeup exam policy the same across departments or does it vary?",
    "How strict is the attendance requirement for sitting the final exam this semester?",
    "Looking for a study group for the upcoming Database Systems final.",
    "What's a realistic way to catch up if you've fallen behind in a course a month before finals?",
    "Does anyone know when the exam routine for this semester gets published?",
  ];
  return bodies.map((body) => ({
    kind: "QUESTION" as const,
    title: body,
    body: `${body} Would appreciate any advice from people who've been through this semester's load before.`,
    tags: ["exams"],
    role: "STUDENT" as const,
  }));
}

function clubQuestions(): PostSeed[] {
  const bodies = [
    "How do I join the NUB debate club as a first-year student?",
    "Is the programming club still doing weekly contest practice this semester?",
    "Looking to start a photography club — is there a process for getting a new club approved?",
    "Does the business club do real case competitions or mostly guest talks?",
  ];
  return bodies.map((body) => ({
    kind: "QUESTION" as const,
    title: body,
    body: `${body} Would love to hear from anyone currently involved.`,
    tags: ["clubs"],
    role: "STUDENT" as const,
  }));
}

function announcements(): PostSeed[] {
  return [
    {
      kind: "ANNOUNCEMENT",
      title: "Midterm exam schedule published",
      body: "The midterm exam schedule for this semester is now posted on the notice board and department pages. Please check your seat and room assignments carefully — any conflicts should be reported to the registry within a week.",
      tags: ["exams"],
      role: "ANNOUNCER",
    },
    {
      kind: "ANNOUNCEMENT",
      title: "Annual career fair — registration now open",
      body: "This year's career fair will host over 20 companies across CSE, EEE, BBA and LLB tracks. Students interested in attending should register through the career office by the end of the month. Bring printed copies of your CV.",
      tags: ["career"],
      role: "ANNOUNCER",
    },
    {
      kind: "ANNOUNCEMENT",
      title: "Club recruitment week starts Monday",
      body: "All student clubs — debate, programming, business, photography and more — will be running recruitment booths in the main plaza starting Monday. New members are welcome regardless of year or department.",
      tags: ["clubs"],
      role: "ANNOUNCER",
    },
    {
      kind: "ANNOUNCEMENT",
      title: "Extended library hours during finals week",
      body: "The central library will stay open until midnight during finals week, with extra seating added on the ground floor. Please keep noise to a minimum in the designated quiet zones.",
      tags: ["campus-life", "exams"],
      role: "ANNOUNCER",
    },
    {
      kind: "ANNOUNCEMENT",
      title: "Thesis proposal submission deadline reminder",
      body: "Final year students planning to submit a thesis proposal this semester must do so through their department office by the posted deadline. Late submissions will not be accepted without prior written approval from the department head.",
      tags: ["thesis"],
      role: "ANNOUNCER",
    },
    {
      kind: "ANNOUNCEMENT",
      title: "Campus WiFi maintenance this weekend",
      body: "IT will be performing scheduled maintenance on the campus network this weekend. Expect intermittent outages near the engineering building and library on Saturday morning.",
      tags: ["campus-life"],
      role: "ANNOUNCER",
    },
    {
      kind: "ANNOUNCEMENT",
      title: "Alumni mentorship program — sign up for Spring cohort",
      body: "The alumni mentorship program is accepting sign-ups for the Spring cohort. Students in their final two years are encouraged to apply and will be matched with an alumnus in a related field.",
      tags: ["career"],
      role: "ANNOUNCER",
    },
    {
      kind: "ANNOUNCEMENT",
      title: "New elective courses added for next semester",
      body: "Based on student feedback, two new electives have been added to next semester's course catalog, covering cloud computing and applied machine learning. Registration opens next week.",
      tags: ["cse", "exams"],
      role: "ANNOUNCER",
    },
  ];
}

function buildPostBank(): PostSeed[] {
  return [
    ...courseQuestions(),
    ...thesisQuestions(),
    ...internshipQuestions(),
    ...jobQuestions(),
    ...higherStudiesQuestions(),
    ...campusLifeQuestions(),
    ...codingQuestions(),
    ...examQuestions(),
    ...clubQuestions(),
    ...announcements(),
  ];
}

// ---- comment content bank ----
const ANSWER_INTROS = [
  "From my experience,",
  "What worked for me was",
  "Speaking as someone who's been through this,",
  "Happy to share —",
  "A few things that helped:",
];
const ANSWER_BODIES = [
  "focus on the fundamentals first, the rest follows with practice.",
  "talk to at least two seniors who've done it before you decide.",
  "it's more about consistency than cramming everything at once.",
  "the department office is usually more helpful than the FAQ page.",
  "don't underestimate how much a good referral helps.",
  "start earlier than you think you need to.",
];
const SHORT_REPLIES = [
  "Thanks, this is really helpful!",
  "Agreed, same experience here.",
  "Good point, hadn't thought of that.",
  "+1, can confirm.",
  "Appreciate you sharing this.",
  "Following this thread.",
  "Bookmarking this.",
  "This matches what I heard too.",
];
const PUSHBACK_REPLIES = [
  "Interesting, though I'd add it depends a lot on the specific professor/team.",
  "Mostly agree, but worth checking if that's still accurate this semester.",
  "That was true a couple of years ago, not sure if it still holds.",
];

function answerFor(post: { body: string }): string {
  const intro = pick(ANSWER_INTROS);
  const body = pick(ANSWER_BODIES);
  let text = `${intro} ${body}`;
  const codeMatch = post.body.match(/```(\w+)/);
  if (codeMatch && Math.random() < 0.4) {
    const lang = codeMatch[1] === "js" ? "javascript" : codeMatch[1];
    const snippets = CODE[lang];
    if (snippets) text += `\n\n${pick(snippets)}`;
  }
  return text;
}

// ---- main seeding ----
async function main() {
  const [nub] = await db
    .select({ id: schema.university.id })
    .from(schema.university)
    .where(eq(schema.university.name, "Northern University Bangladesh"));
  if (!nub) {
    throw new Error(
      "Northern University Bangladesh not found — run the app's normal setup first.",
    );
  }

  if (FRESH) {
    console.log("--fresh-demo: removing existing demo-authored content...");
    await cleanupDemo(nub.id);
  }

  const [existingDemo] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`email like ${DEMO_EMAIL_LIKE}`)
    .limit(1);
  if (existingDemo) {
    console.log(
      "Demo users already present — skipping (safe re-run). Use --fresh-demo to reset.",
    );
    await client.end();
    return;
  }

  await ensureDepartments(nub.id);
  await ensureBatches(nub.id);

  const demoUsers = await createDemoUsers(nub.id);
  await createFollows(nub.id, demoUsers);

  const [tanvir] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, "tanvir@nub.ac.bd"));
  const [ceo] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, "ceo@nub.ac.bd"));

  const alumni = demoUsers.filter((u) => u.role === "ALUMNUS");
  const students = demoUsers.filter((u) => u.role === "STUDENT");
  const staff = demoUsers.filter((u) => u.role === "STAFF");
  const mod = demoUsers.find((u) => u.role === "MODERATOR");
  const admin = demoUsers.find((u) => u.role === "ADMIN");

  const alumniPool = tanvir ? [...alumni, { id: tanvir.id }] : alumni;
  const announcerPool = [
    ...staff,
    ...(mod ? [mod] : []),
    ...(admin ? [admin] : []),
    ...(ceo ? [{ id: ceo.id }] : []),
  ];
  const voterPool = [
    ...demoUsers.map((u) => u.id),
    ...(tanvir ? [tanvir.id] : []),
    ...(ceo ? [ceo.id] : []),
  ];

  function pickAuthorId(role: PostSeed["role"]): string {
    if (role === "ANNOUNCER") return pick(announcerPool).id;
    if (role === "ALUMNUS") return pick(alumniPool).id;
    if (role === "STAFF") return pick(staff).id;
    return pick(students).id;
  }

  function pickCommenterId(excludeId: string): string {
    const r = Math.random();
    const pool =
      r < 0.55
        ? alumniPool
        : r < 0.8
          ? students
          : [...staff, ...(mod ? [mod] : []), ...(admin ? [admin] : [])];
    const filtered = pool.filter((u) => u.id !== excludeId);
    if (filtered.length === 0) {
      return pick(demoUsers.filter((u) => u.id !== excludeId)).id;
    }
    return pick(filtered).id;
  }

  const tagMap = await ensureTags(nub.id);
  const postBank = buildPostBank();

  // Give tanvir 3 question posts of his own (existing user, keep profile non-empty).
  const tanvirSlots = tanvir
    ? pickN(
        postBank.filter((p) => p.kind === "QUESTION"),
        3,
      )
    : [];

  const votesToInsert: {
    universityId: string;
    userId: string;
    targetType: "POST" | "COMMENT";
    targetId: string;
    value: number;
  }[] = [];
  const notificationsToInsert: {
    universityId: string;
    userId: string;
    type: (typeof schema.NOTIFICATION_TYPES)[number];
    actorId: string | null;
    postId: string;
    commentId: string | null;
  }[] = [];

  let postIndex = 0;
  const totalDays = 60;
  for (const seed of postBank) {
    postIndex++;
    const createdAt = daysAgo(rand(0, totalDays));
    const authorId = tanvirSlots.includes(seed)
      ? (tanvir as { id: string }).id
      : pickAuthorId(seed.role);

    const [row] = await db
      .insert(schema.post)
      .values({
        universityId: nub.id,
        authorId,
        kind: seed.kind,
        title: seed.title,
        body: seed.body,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: schema.post.id });

    const tagIds = [...new Set(seed.tags)]
      .map((n) => tagMap.get(n))
      .filter((id): id is string => !!id);
    if (tagIds.length > 0) {
      await db.insert(schema.postTag).values(
        tagIds.map((tagId) => ({
          universityId: nub.id,
          postId: row.id,
          tagId,
        })),
      );
    }

    // votes on the post
    for (const voterId of pickN(
      voterPool.filter((id) => id !== authorId),
      rand(3, 15),
    )) {
      votesToInsert.push({
        universityId: nub.id,
        userId: voterId,
        targetType: "POST",
        targetId: row.id,
        value: Math.random() < 0.85 ? 1 : -1,
      });
    }

    // comments
    const isAnnouncement = seed.kind === "ANNOUNCEMENT";
    const commentCount = isAnnouncement
      ? rand(0, 4)
      : Math.random() < 0.25
        ? 0
        : Math.random() < 0.8
          ? rand(1, 4)
          : rand(5, 10);

    const commentIds: string[] = [];
    const commentDepths: number[] = [];
    const commentAuthors: string[] = [];
    for (let j = 0; j < commentCount; j++) {
      const authorExclude = authorId;
      const cAuthor = pickCommenterId(authorExclude);
      let parentId: string | null = null;
      let depth = 0;
      if (j > 0 && Math.random() < 0.3) {
        const eligible = commentIds.filter((_, k) => commentDepths[k] < 2);
        if (eligible.length > 0) {
          const idx = commentIds.indexOf(pick(eligible));
          parentId = commentIds[idx];
          depth = commentDepths[idx] + 1;
        }
      }
      const isAlumnusAnswer =
        alumniPool.some((u) => u.id === cAuthor) && depth === 0;
      const body = isAlumnusAnswer
        ? answerFor(seed)
        : depth > 0
          ? pick([...SHORT_REPLIES, ...PUSHBACK_REPLIES])
          : pick(SHORT_REPLIES);
      const commentCreatedAt = new Date(
        createdAt.getTime() + (j + 1) * rand(1, 48) * 3600_000,
      );
      const [crow] = await db
        .insert(schema.comment)
        .values({
          universityId: nub.id,
          postId: row.id,
          parentId,
          authorId: cAuthor,
          body,
          createdAt: commentCreatedAt,
          updatedAt: commentCreatedAt,
        })
        .returning({ id: schema.comment.id });
      commentIds.push(crow.id);
      commentDepths.push(depth);
      commentAuthors.push(cAuthor);

      for (const voterId of pickN(
        voterPool.filter((id) => id !== cAuthor),
        rand(0, 6),
      )) {
        votesToInsert.push({
          universityId: nub.id,
          userId: voterId,
          targetType: "COMMENT",
          targetId: crow.id,
          value: Math.random() < 0.85 ? 1 : -1,
        });
      }

      // notify the existing owner/alumnus if a demo user replied to them
      if (
        (authorId === tanvir?.id || authorId === ceo?.id) &&
        depth === 0 &&
        cAuthor !== authorId
      ) {
        notificationsToInsert.push({
          universityId: nub.id,
          userId: authorId,
          type: "REPLY_POST",
          actorId: cAuthor,
          postId: row.id,
          commentId: crow.id,
        });
      }
    }

    // ~35% of answered questions get an accepted answer (top-level alumnus comment)
    if (!isAnnouncement && commentIds.length > 0 && Math.random() < 0.35) {
      const candidates = commentIds.filter(
        (_id, k) =>
          commentDepths[k] === 0 &&
          alumniPool.some((u) => u.id === commentAuthors[k]) &&
          commentAuthors[k] !== authorId,
      );
      if (candidates.length > 0) {
        const acceptedId = pick(candidates);
        await db
          .update(schema.post)
          .set({ acceptedCommentId: acceptedId })
          .where(eq(schema.post.id, row.id));
        const acceptedAuthor = commentAuthors[commentIds.indexOf(acceptedId)];
        if (acceptedAuthor === tanvir?.id) {
          notificationsToInsert.push({
            universityId: nub.id,
            userId: acceptedAuthor,
            type: "ACCEPTED_ANSWER",
            actorId: authorId,
            postId: row.id,
            commentId: acceptedId,
          });
        }
      }
    }

    if (postIndex % 20 === 0)
      console.log(`  ...${postIndex}/${postBank.length} posts`);
  }

  // chunk vote inserts to keep statements reasonably sized
  for (let i = 0; i < votesToInsert.length; i += 500) {
    await db.insert(schema.vote).values(votesToInsert.slice(i, i + 500));
  }
  if (notificationsToInsert.length > 0) {
    await db.insert(schema.notification).values(notificationsToInsert);
  }

  // keep post.score / comment.score / post.comment_count consistent with the rows above
  await db.execute(sql`
    update post set score = coalesce(
      (select sum(value) from vote where target_type = 'POST' and target_id = post.id), 0)
    where university_id = ${nub.id}`);
  await db.execute(sql`
    update comment set score = coalesce(
      (select sum(value) from vote where target_type = 'COMMENT' and target_id = comment.id), 0)
    where university_id = ${nub.id}`);
  await db.execute(sql`
    update post set comment_count = coalesce(
      (select count(*) from comment where comment.post_id = post.id and comment.deleted_at is null), 0)
    where university_id = ${nub.id}`);

  console.log("\nDemo content seeded.");
  console.log(`  Departments ensured: ${DEPT_NAMES.join(", ")}`);
  console.log(
    `  Batches ensured: ${[...ALUMNI_BATCHES, ...STUDENT_BATCHES].map((b) => b.number).join(", ")}`,
  );
  console.log(`  Demo users: ${demoUsers.length}`);
  console.log(`  Posts: ${postBank.length}`);
  console.log(`  All demo passwords: ${PASSWORD}`);
  await client.end();
}

await main();
