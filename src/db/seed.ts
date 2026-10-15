// Demo seed data. Runs as superuser (DATABASE_ADMIN_URL) so it bypasses RLS
// and can truncate everything first — idempotent, safe to run repeatedly on
// a dev DB. Never run against production data.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import { hashStudentId } from "@/server/student-id";
import { truncateAll } from "./reset";
import * as schema from "./schema";

const client = postgres(env.DATABASE_ADMIN_URL, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

const PASSWORD = "password123";
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

// ---- 1. reset ----
const resetDb = () => truncateAll(db);

// ---- 2. universities ----
async function seedUniversities() {
  const [nub] = await db
    .insert(schema.university)
    .values({
      name: "Northern University Bangladesh",
      slug: "nub",
      emailDomain: "nub.ac.bd",
    })
    .returning();
  const [dtu] = await db
    .insert(schema.university)
    .values({
      name: "Demo Tech University",
      slug: "dtu",
      emailDomain: "demo.edu",
    })
    .returning();
  return { nub, dtu };
}

// ---- 3. NUB roster (200 IDs, batches 2018-2029, 4 departments) ----
const DEPTS = ["CSE", "EEE", "BBA", "LLB"] as const;
const BATCHES = Array.from({ length: 12 }, (_, i) => 2018 + i); // 2018..2029
const GRAD_CUTOFF = 2026; // graduated = batch < GRAD_CUTOFF

type RosterRow = {
  raw: string;
  batch: number;
  dept: string;
  graduated: boolean;
};

// Student IDs reserved for the seeded users below, so their sign-up/roster
// link is real and those IDs read as "used" to the live demo.
const RESERVED: RosterRow[] = [
  { raw: "NUB-20180002", batch: 2018, dept: "CSE", graduated: true }, // admin
  { raw: "NUB-20190001", batch: 2019, dept: "EEE", graduated: true }, // mod
  { raw: "NUB-20180001", batch: 2018, dept: "CSE", graduated: true }, // alumni: rahim
  { raw: "NUB-20190002", batch: 2019, dept: "EEE", graduated: true }, // alumni: karim
  { raw: "NUB-20200001", batch: 2020, dept: "BBA", graduated: true }, // alumni: salma
  { raw: "NUB-20220001", batch: 2022, dept: "LLB", graduated: true }, // alumni: nusrat
  { raw: "NUB-20240001", batch: 2024, dept: "CSE", graduated: true }, // alumni: tanvir
  { raw: "NUB-20260001", batch: 2026, dept: "CSE", graduated: false }, // student: mim
  { raw: "NUB-20260002", batch: 2026, dept: "EEE", graduated: false }, // student: fahim
  { raw: "NUB-20270001", batch: 2027, dept: "BBA", graduated: false }, // student: rafi
  { raw: "NUB-20270002", batch: 2027, dept: "LLB", graduated: false }, // student: ayesha
  { raw: "NUB-20280001", batch: 2028, dept: "CSE", graduated: false }, // student: imran
  { raw: "NUB-20290001", batch: 2029, dept: "EEE", graduated: false }, // student: lamia
];

function buildRoster(): RosterRow[] {
  const reservedRaw = new Set(RESERVED.map((r) => r.raw));
  const rows: RosterRow[] = [...RESERVED];
  let i = 0;
  while (rows.length < 200) {
    const batch = BATCHES[i % BATCHES.length];
    const dept = DEPTS[i % DEPTS.length];
    const seq = 100 + Math.floor(i / BATCHES.length);
    const raw = `NUB-${batch}${String(seq).padStart(4, "0")}`;
    i++;
    if (reservedRaw.has(raw)) continue;
    rows.push({ raw, batch, dept, graduated: batch < GRAD_CUTOFF });
  }
  return rows;
}

async function seedRoster(universityId: string, rows: RosterRow[]) {
  await db.insert(schema.rosterEntry).values(
    rows.map((r) => ({
      universityId,
      studentIdHash: hashStudentId(universityId, r.raw),
      batchYear: r.batch,
      department: r.dept,
      graduated: r.graduated,
    })),
  );
}

// ---- 4. users ----
type SeedUser = {
  email: string;
  name: string;
  role: schema.Role;
  batch: number;
  dept: string;
  raw?: string; // roster-backed student id (hashed into studentIdHash); omit for DTU
};

const NUB_USERS: SeedUser[] = [
  {
    email: "admin@nub.ac.bd",
    name: "Admin Rahman",
    role: "ADMIN",
    batch: 2018,
    dept: "CSE",
    raw: "NUB-20180002",
  },
  {
    email: "mod@nub.ac.bd",
    name: "Moderator Haque",
    role: "MODERATOR",
    batch: 2019,
    dept: "EEE",
    raw: "NUB-20190001",
  },
  {
    email: "rahim.alumni@nub.ac.bd",
    name: "Rahim Uddin",
    role: "ALUMNUS",
    batch: 2018,
    dept: "CSE",
    raw: "NUB-20180001",
  },
  {
    email: "karim.alumni@nub.ac.bd",
    name: "Karim Hossain",
    role: "ALUMNUS",
    batch: 2019,
    dept: "EEE",
    raw: "NUB-20190002",
  },
  {
    email: "salma.alumni@nub.ac.bd",
    name: "Salma Khatun",
    role: "ALUMNUS",
    batch: 2020,
    dept: "BBA",
    raw: "NUB-20200001",
  },
  {
    email: "nusrat.alumni@nub.ac.bd",
    name: "Nusrat Jahan",
    role: "ALUMNUS",
    batch: 2022,
    dept: "LLB",
    raw: "NUB-20220001",
  },
  {
    email: "tanvir.alumni@nub.ac.bd",
    name: "Tanvir Ahmed",
    role: "ALUMNUS",
    batch: 2024,
    dept: "CSE",
    raw: "NUB-20240001",
  },
  {
    email: "mim.student@nub.ac.bd",
    name: "Mim Akter",
    role: "STUDENT",
    batch: 2026,
    dept: "CSE",
    raw: "NUB-20260001",
  },
  {
    email: "fahim.student@nub.ac.bd",
    name: "Fahim Reza",
    role: "STUDENT",
    batch: 2026,
    dept: "EEE",
    raw: "NUB-20260002",
  },
  {
    email: "rafi.student@nub.ac.bd",
    name: "Rafi Islam",
    role: "STUDENT",
    batch: 2027,
    dept: "BBA",
    raw: "NUB-20270001",
  },
  {
    email: "ayesha.student@nub.ac.bd",
    name: "Ayesha Siddika",
    role: "STUDENT",
    batch: 2027,
    dept: "LLB",
    raw: "NUB-20270002",
  },
  {
    email: "imran.student@nub.ac.bd",
    name: "Imran Kabir",
    role: "STUDENT",
    batch: 2028,
    dept: "CSE",
    raw: "NUB-20280001",
  },
  {
    email: "lamia.student@nub.ac.bd",
    name: "Lamia Noor",
    role: "STUDENT",
    batch: 2029,
    dept: "EEE",
    raw: "NUB-20290001",
  },
];
// indices: 0 admin, 1 mod, 2-6 alumni, 7-12 students

const DTU_USERS: SeedUser[] = [
  {
    email: "admin@demo.edu",
    name: "DTU Admin",
    role: "ADMIN",
    batch: 2015,
    dept: "General",
  },
  {
    email: "student@demo.edu",
    name: "DTU Student",
    role: "STUDENT",
    batch: 2026,
    dept: "General",
  },
];
// indices: 0 admin, 1 student

async function seedUsers(universityId: string, users: SeedUser[]) {
  const passwordHash = await hashPassword(PASSWORD);
  const ids: string[] = [];
  for (const u of users) {
    const id = randomUUID();
    ids.push(id);
    await db.insert(schema.user).values({
      id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      universityId,
      role: u.role,
      batchYear: u.batch,
      department: u.dept,
      studentIdHash: u.raw ? hashStudentId(universityId, u.raw) : null,
      status: "ACTIVE",
    });
    await db.insert(schema.account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
  }
  return ids;
}

// ---- 5. posts, tags, comments, votes, bookmarks, follows, report ----
type LocalComment = { author: number; body: string; parent?: number };
type SeedPost = {
  author: number;
  title: string;
  body: string;
  tags: string[];
  comments: LocalComment[];
};

const NUB_POSTS: SeedPost[] = [
  {
    author: 7,
    title: "Which CSE electives should I pick in 3rd year?",
    body: "Trying to plan my electives for next semester. Looking at Computer Networks, Distributed Systems, and Compiler Design — any recommendations from people who've taken them?",
    tags: ["course-advice", "cse"],
    comments: [
      {
        author: 2,
        body: "I took Computer Networks and Distributed Systems — both helped a lot with internship interviews.",
      },
      {
        author: 1,
        body: "Agreed, Distributed Systems projects look great on a resume too.",
        parent: 0,
      },
      { author: 8, body: "Is Compiler Design worth it or too theoretical?" },
      {
        author: 6,
        body: "Compiler Design is tough but very respected by recruiters who care about fundamentals.",
        parent: 2,
      },
    ],
  },
  {
    author: 11,
    title: "Looking for a thesis supervisor in Machine Learning",
    body: "Final year is coming up and I want to do my thesis in ML. Does anyone have recommendations for a supervisor who's active in this area?",
    tags: ["thesis", "cse"],
    comments: [
      {
        author: 6,
        body: "Dr. Karim's lab did great ML thesis work when I was there, worth reaching out.",
      },
      { author: 12, body: "Seconded, he's very responsive over email." },
      {
        author: 1,
        body: "Make sure to check the thesis proposal deadline next month.",
      },
    ],
  },
  {
    author: 3,
    title: "Internship experience at a local software company",
    body: "Just wrapped up a 4-month internship doing backend work. Happy to answer questions if anyone's applying this season.",
    tags: ["internship", "career"],
    comments: [
      {
        author: 9,
        body: "How did you land the internship — campus placement or cold apply?",
      },
      {
        author: 3,
        body: "Cold apply, then a referral from a senior helped a lot.",
        parent: 0,
      },
      { author: 10, body: "Thanks for sharing, really motivating!" },
    ],
  },
  {
    author: 2,
    title: "How to prepare for software engineering interviews",
    body: "Sharing what worked for me: consistent DSA practice, mock interviews, and reading up on system design basics for the final rounds.",
    tags: ["interview-prep", "career", "cse"],
    comments: [
      { author: 7, body: "Any book recommendations for DSA prep?" },
      {
        author: 2,
        body: "Cracking the Coding Interview plus LeetCode easy/medium sets.",
        parent: 0,
      },
      {
        author: 4,
        body: "Also practice mock interviews with friends, it helps with nerves.",
        parent: 1,
      },
      { author: 8, body: "Bookmarking this thread." },
    ],
  },
  {
    author: 1,
    title: "Scholarship opportunities for CSE students",
    body: "Compiling a list of scholarships current CSE students can apply for. Please add any you know about in the comments.",
    tags: ["scholarship", "cse"],
    comments: [
      {
        author: 5,
        body: "NUB merit scholarship renews every semester if CGPA stays above 3.5.",
      },
      { author: 11, body: "Does it cover lab fees too?" },
      {
        author: 5,
        body: "Yes, full waiver including lab fees in my batch.",
        parent: 1,
      },
    ],
  },
  {
    author: 8,
    title: "Campus life: best spots to study on NUB campus",
    body: "Looking for quiet spots on campus to study between classes — the usual library floor gets packed fast.",
    tags: ["campus-life"],
    comments: [
      {
        author: 10,
        body: "The 3rd floor library corner is quiet in the mornings.",
      },
      { author: 4, body: "Miss that library corner honestly." },
      { author: 12, body: "The cafeteria rooftop is nice in the evening too." },
    ],
  },
  {
    author: 8,
    title: "EEE thesis topics suggestions for 2026 batch",
    body: "Starting to think about thesis topics for next year. Anything in power systems or renewable energy worth exploring?",
    tags: ["thesis", "eee"],
    comments: [
      {
        author: 3,
        body: "Renewable energy integration topics are hot right now, got good feedback from reviewers.",
      },
      {
        author: 1,
        body: "Also check the power systems lab's ongoing projects for ideas.",
      },
    ],
  },
  {
    author: 9,
    title: "BBA internship vs higher studies — what next?",
    body: "Graduating this year and torn between taking an internship offer or applying for a master's program abroad. How did others decide?",
    tags: ["career", "bba"],
    comments: [
      {
        author: 4,
        body: "I went straight to internship, don't regret it — real experience opened doors.",
      },
      { author: 10, body: "How long until you got a full-time offer?" },
      {
        author: 4,
        body: "About 4 months after the internship started.",
        parent: 1,
      },
      { author: 1, body: "Both paths work, depends on your goals." },
    ],
  },
  {
    author: 10,
    title: "LLB moot court competition prep tips",
    body: "Our team made it to the inter-university moot court round. Looking for tips on oral argument prep from anyone who's competed before.",
    tags: ["course-advice", "llb"],
    comments: [
      {
        author: 5,
        body: "Practice oral arguments in front of friends, timing really matters.",
      },
      {
        author: 6,
        body: "Good luck, moot court looks great on your CV for law firms.",
      },
      {
        author: 0,
        body: "NUB law society is organizing a workshop next week on this.",
      },
    ],
  },
  {
    author: 11,
    title: "Anyone doing GRE/IELTS prep groups?",
    body: "Planning to take the GRE in a few months — would love to join or start a study group.",
    tags: ["course-advice"],
    comments: [
      { author: 12, body: "I'm in, let's set up a study group chat." },
      { author: 7, body: "Count me in too." },
    ],
  },
  {
    author: 12,
    title: "Best hostels near NUB campus",
    body: "Moving to campus next semester — which hostels nearby are actually worth it for price and food?",
    tags: ["campus-life"],
    comments: [
      { author: 8, body: "Green View hostel is close and affordable." },
      { author: 2, body: "I stayed there in my 2nd year, decent food too." },
    ],
  },
  {
    author: 3,
    title: "How I landed a job at a telecom company after graduation",
    body: "A few people asked about this after my last post, so here's the short version of how I got into telecom straight out of EEE.",
    tags: ["career", "alumni", "eee"],
    comments: [
      {
        author: 9,
        body: "Congrats! What skills mattered most in the interview?",
      },
      {
        author: 3,
        body: "Strong fundamentals in signal processing and good communication.",
        parent: 0,
      },
      {
        author: 5,
        body: "Telecom sector is hiring a lot lately, good to know.",
      },
    ],
  },
  {
    author: 7,
    title: "CSE vs EEE – which has better job market in Bangladesh?",
    body: "Trying to decide between the two for a minor. Curious how the job markets compare right now.",
    tags: ["career", "cse", "eee"],
    comments: [
      {
        author: 2,
        body: "CSE has more opportunities right now, especially in software/fintech.",
      },
      {
        author: 3,
        body: "EEE still strong in telecom and power sector, don't count it out.",
      },
      {
        author: 1,
        body: "Good point, hybrid skills (embedded + software) are in demand too.",
        parent: 1,
      },
      { author: 8, body: "This is helpful, thanks both!" },
    ],
  },
  {
    author: 9,
    title: "Need advice: double major or minor in Economics?",
    body: "Considering adding Economics alongside my BBA. Is a minor enough or should I go for a full double major?",
    tags: ["course-advice", "bba"],
    comments: [
      {
        author: 4,
        body: "A minor is usually enough unless you want grad school in Econ.",
      },
      { author: 10, body: "Makes sense, thanks!" },
    ],
  },
  {
    author: 11,
    title: "Campus WiFi issues — anyone else facing this?",
    body: "WiFi has been dropping constantly near the engineering building this week. Is this just me?",
    tags: ["campus-life"],
    comments: [
      { author: 12, body: "Yes, especially near the engineering building." },
      { author: 0, body: "Reported to IT, should be fixed by next week." },
    ],
  },
  {
    author: 6,
    title: "Alumni meetup planning for December",
    body: "Thinking of organizing an informal alumni meetup on campus this December. Who's interested?",
    tags: ["alumni", "campus-life"],
    comments: [
      { author: 2, body: "Count me in, would love to reconnect." },
      { author: 5, body: "Same here, let's pick a weekend." },
      { author: 1, body: "I can help coordinate a venue on campus." },
      { author: 4, body: "That would be great, thanks!", parent: 2 },
    ],
  },
  {
    author: 7,
    title: "Resume review request before internship applications",
    body: "Applying for internships this cycle — would appreciate a quick resume review from anyone willing.",
    tags: ["internship", "interview-prep"],
    comments: [
      { author: 2, body: "Happy to take a look, send it over." },
      { author: 3, body: "Keep it to one page, recruiters skim fast." },
      { author: 7, body: "Good tip, will trim it down.", parent: 1 },
      {
        author: 2,
        body: "Also quantify your project impact where you can.",
        parent: 2,
      },
    ],
  },
  {
    author: 4,
    title: "Transitioning from BBA to an MBA abroad",
    body: "A couple of juniors asked how I'm preparing for an MBA abroad after BBA — sharing my timeline here.",
    tags: ["career", "bba", "alumni"],
    comments: [
      { author: 9, body: "What test did you need, GMAT or GRE?" },
      {
        author: 4,
        body: "GMAT, started prep about 6 months before applying.",
        parent: 0,
      },
      { author: 10, body: "Good to know, thanks for sharing your timeline." },
    ],
  },
  {
    author: 5,
    title: "LLB bar council exam prep resources",
    body: "Starting bar council exam prep soon — would appreciate any resource recommendations from those who've been through it.",
    tags: ["course-advice", "llb", "alumni"],
    comments: [
      { author: 10, body: "Any recommended books for the written part?" },
      {
        author: 5,
        body: "Stick to the standard bar council manual plus past papers.",
        parent: 0,
      },
      { author: 1, body: "Our library has copies on reserve for these." },
    ],
  },
  {
    author: 8,
    title: "Final year project ideas in web development",
    body: "Need ideas for a final year web dev project that's substantial but doable in one semester.",
    tags: ["course-advice", "cse"],
    comments: [
      {
        author: 2,
        body: "A small SaaS clone with auth and payments teaches a lot end-to-end.",
      },
      { author: 7, body: "Love this idea, might do a campus marketplace app." },
      {
        author: 6,
        body: "That's a great scope — keep it focused on 2-3 core features.",
        parent: 1,
      },
      { author: 12, body: "Following this thread for inspiration.", parent: 2 },
    ],
  },
];

const DTU_POSTS: SeedPost[] = [
  {
    author: 0,
    title: "Welcome to Demo Tech University Alumni Connect!",
    body: "This is DTU's space on Alumni Connect — a separate tenant from NUB to show off university isolation.",
    tags: ["campus-life"],
    comments: [
      { author: 1, body: "Excited to see this community get started!" },
    ],
  },
  {
    author: 1,
    title: "Any DTU students interested in a coding club?",
    body: "Thinking of starting a small coding club for DTU students. Would anyone join weekly meetups?",
    tags: ["course-advice"],
    comments: [
      { author: 0, body: "Great idea, let's organize a kickoff meeting." },
    ],
  },
];

async function seedTags(universityId: string, names: string[]) {
  if (names.length === 0) return new Map<string, string>();
  const unique = [...new Set(names)];
  const rows = await db
    .insert(schema.tag)
    .values(unique.map((name) => ({ universityId, name })))
    .returning({ id: schema.tag.id, name: schema.tag.name });
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** Random votes on a target from voters excluding the author; mostly upvotes. */
function pickVoters(authorIdx: number, poolSize: number, count: number) {
  const pool = Array.from({ length: poolSize }, (_, i) => i).filter(
    (i) => i !== authorIdx,
  );
  const chosen: number[] = [];
  while (chosen.length < Math.min(count, pool.length)) {
    const i = pool[Math.floor(Math.random() * pool.length)];
    if (!chosen.includes(i)) chosen.push(i);
  }
  return chosen;
}

async function seedPostsForUniversity(
  universityId: string,
  userIds: string[],
  posts: SeedPost[],
  startDaysAgo: number,
) {
  const allTagNames = posts.flatMap((p) => p.tags);
  const tagIds = await seedTags(universityId, allTagNames);

  const votes: {
    universityId: string;
    userId: string;
    targetType: "POST" | "COMMENT";
    targetId: string;
    value: number;
  }[] = [];

  for (const [i, p] of posts.entries()) {
    const createdAt = ago(startDaysAgo - i);
    const [row] = await db
      .insert(schema.post)
      .values({
        universityId,
        authorId: userIds[p.author],
        title: p.title,
        body: p.body,
        createdAt,
      })
      .returning({ id: schema.post.id });

    if (p.tags.length > 0) {
      await db.insert(schema.postTag).values(
        [...new Set(p.tags)].map((name) => ({
          universityId,
          postId: row.id,
          // biome-ignore lint/style/noNonNullAssertion: every tag name was just inserted above
          tagId: tagIds.get(name)!,
        })),
      );
    }

    for (const voter of pickVoters(
      p.author,
      userIds.length,
      3 + Math.floor(Math.random() * 5),
    )) {
      votes.push({
        universityId,
        userId: userIds[voter],
        targetType: "POST",
        targetId: row.id,
        value: Math.random() < 0.85 ? 1 : -1,
      });
    }

    const commentIds: string[] = [];
    for (const [j, c] of p.comments.entries()) {
      const [crow] = await db
        .insert(schema.comment)
        .values({
          universityId,
          postId: row.id,
          parentId: c.parent !== undefined ? commentIds[c.parent] : null,
          authorId: userIds[c.author],
          body: c.body,
          createdAt: new Date(createdAt.getTime() + (j + 1) * 3600_000),
        })
        .returning({ id: schema.comment.id });
      commentIds.push(crow.id);

      for (const voter of pickVoters(
        c.author,
        userIds.length,
        Math.floor(Math.random() * 4),
      )) {
        votes.push({
          universityId,
          userId: userIds[voter],
          targetType: "COMMENT",
          targetId: crow.id,
          value: Math.random() < 0.85 ? 1 : -1,
        });
      }
    }
  }

  if (votes.length > 0) await db.insert(schema.vote).values(votes);
}

/** Recompute score/commentCount from the rows just inserted, same formula the app uses. */
async function recomputeScores() {
  await db.execute(sql`
    update post set score = coalesce(
      (select sum(value) from vote where target_type = 'POST' and target_id = post.id), 0)`);
  await db.execute(sql`
    update comment set score = coalesce(
      (select sum(value) from vote where target_type = 'COMMENT' and target_id = comment.id), 0)`);
  await db.execute(sql`
    update post set comment_count = coalesce(
      (select count(*) from comment where comment.post_id = post.id and comment.deleted_at is null), 0)`);
}

async function main() {
  await resetDb();
  const { nub, dtu } = await seedUniversities();

  const roster = buildRoster();
  await seedRoster(nub.id, roster);

  const nubUserIds = await seedUsers(nub.id, NUB_USERS);
  const dtuUserIds = await seedUsers(dtu.id, DTU_USERS);

  await seedPostsForUniversity(nub.id, nubUserIds, NUB_POSTS, NUB_POSTS.length);
  await seedPostsForUniversity(dtu.id, dtuUserIds, DTU_POSTS, DTU_POSTS.length);
  await recomputeScores();

  // bookmarks: a couple, within NUB
  const [p1, p3, p16] = await db
    .select({ id: schema.post.id })
    .from(schema.post)
    .where(sql`university_id = ${nub.id}`)
    .orderBy(schema.post.createdAt)
    .offset(0)
    .limit(20)
    .then((rows) => [rows[1].id, rows[3].id, rows[16].id]);
  await db.insert(schema.bookmark).values([
    { universityId: nub.id, userId: nubUserIds[7], postId: p1 },
    { universityId: nub.id, userId: nubUserIds[11], postId: p3 },
    { universityId: nub.id, userId: nubUserIds[3], postId: p16 },
  ]);

  // follows: a couple of each kind
  await db.insert(schema.followUser).values([
    {
      universityId: nub.id,
      followerId: nubUserIds[7],
      followeeId: nubUserIds[2],
    },
    {
      universityId: nub.id,
      followerId: nubUserIds[9],
      followeeId: nubUserIds[4],
    },
  ]);
  const nubTagRows = await db
    .select({ id: schema.tag.id, name: schema.tag.name })
    .from(schema.tag)
    .where(sql`university_id = ${nub.id}`);
  const tagByName = new Map(nubTagRows.map((t) => [t.name, t.id]));
  const cseTag = tagByName.get("cse");
  const internshipTag = tagByName.get("internship");
  if (cseTag && internshipTag) {
    await db.insert(schema.followTag).values([
      { universityId: nub.id, userId: nubUserIds[8], tagId: cseTag },
      { universityId: nub.id, userId: nubUserIds[1], tagId: internshipTag },
    ]);
  }

  // one OPEN report, on the GRE/IELTS post (index 9 among NUB_POSTS)
  const [reportTarget] = await db
    .select({ id: schema.post.id })
    .from(schema.post)
    .where(sql`university_id = ${nub.id}`)
    .orderBy(schema.post.createdAt)
    .offset(9)
    .limit(1);
  await db.insert(schema.report).values({
    universityId: nub.id,
    reporterId: nubUserIds[12],
    targetType: "POST",
    targetId: reportTarget.id,
    reason: "This looks like spam / off-topic",
    status: "OPEN",
  });

  // audit trail of this run
  await db.insert(schema.auditLog).values([
    {
      universityId: nub.id,
      actorId: null,
      action: "seed.run",
      meta: {
        users: NUB_USERS.length,
        posts: NUB_POSTS.length,
        roster: roster.length,
      },
    },
    {
      universityId: dtu.id,
      actorId: null,
      action: "seed.run",
      meta: { users: DTU_USERS.length, posts: DTU_POSTS.length },
    },
  ]);

  const unused = roster.filter(
    (r) => !RESERVED.some((res) => res.raw === r.raw),
  );
  const sample = [
    unused.find((r) => r.graduated),
    unused.find((r) => !r.graduated),
    unused.filter((r) => !r.graduated)[1],
  ].filter((r): r is RosterRow => !!r);

  console.log("\nSeed complete.");
  console.log(
    `  Universities: ${nub.name} (${nub.slug}), ${dtu.name} (${dtu.slug})`,
  );
  console.log(`  NUB roster entries: ${roster.length}`);
  console.log(
    `  NUB users: ${NUB_USERS.length}, DTU users: ${DTU_USERS.length}`,
  );
  console.log(
    `  NUB posts: ${NUB_POSTS.length}, DTU posts: ${DTU_POSTS.length}`,
  );
  console.log(`  All demo passwords: ${PASSWORD}`);
  console.log("\n  3 unused NUB roster IDs for the live sign-up demo:");
  for (const r of sample) {
    console.log(
      `    ${r.raw}  (batch ${r.batch}, ${r.dept}, ${r.graduated ? "graduated" : "current student"})`,
    );
  }
  console.log();
}

await main();
await client.end();
