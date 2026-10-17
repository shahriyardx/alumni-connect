import { beforeEach, expect, test } from "bun:test";
import { callerFor, makeUniversity, makeUser, resetDb } from "./helpers";

let uniA: string;
let uniB: string;
let student: { id: string };

beforeEach(async () => {
  await resetDb();
  uniA = (await makeUniversity()).id;
  uniB = (await makeUniversity()).id;
  student = await makeUser(uniA, {
    role: "STUDENT",
    department: "CSE",
    graduationYear: new Date().getFullYear() + 1,
  });
});

test("alumniInMyDepartment: ACTIVE ALUMNUS only, department match case-insensitively, newest grad year first", async () => {
  const newer = await makeUser(uniA, {
    role: "ALUMNUS",
    department: "cse",
    graduationYear: 2022,
    status: "ACTIVE",
  });
  const older = await makeUser(uniA, {
    role: "ALUMNUS",
    department: "CSE",
    graduationYear: 2018,
    status: "ACTIVE",
  });
  // Excluded: wrong department, wrong role, PENDING status, other tenant.
  await makeUser(uniA, {
    role: "ALUMNUS",
    department: "EEE",
    graduationYear: 2020,
  });
  await makeUser(uniA, { role: "STUDENT", department: "CSE" });
  await makeUser(uniA, {
    role: "ALUMNUS",
    department: "CSE",
    graduationYear: 2019,
    status: "PENDING",
  });
  await makeUser(uniB, {
    role: "ALUMNUS",
    department: "CSE",
    graduationYear: 2023,
  });

  const res = await callerFor(student.id).people.alumniInMyDepartment({});
  expect(res.items.map((i) => i.id)).toEqual([newer.id, older.id]);
  expect(res.nextCursor).toBeNull();
});

test("alumniInMyDepartment: counts the caller's answers (non-deleted comments)", async () => {
  const alum = await makeUser(uniA, {
    role: "ALUMNUS",
    department: "CSE",
    graduationYear: 2020,
  });
  const author = callerFor(alum.id);
  const { id: postId } = await author.post.create({
    title: "A question for alumni",
    body: "Body",
    tags: [],
  });
  await author.comment.create({ postId, body: "First answer" });
  const second = await author.comment.create({ postId, body: "Second answer" });
  await author.comment.remove({ id: second.id });

  const res = await callerFor(student.id).people.alumniInMyDepartment({});
  expect(res.items).toHaveLength(1);
  expect(res.items[0]).toMatchObject({ id: alum.id, answerCount: 1 });
});

test("alumniInMyDepartment: empty when the caller has no department or no alumni match", async () => {
  const noDept = await makeUser(uniA, { department: null });
  expect(await callerFor(noDept.id).people.alumniInMyDepartment({})).toEqual({
    items: [],
    nextCursor: null,
  });

  expect(await callerFor(student.id).people.alumniInMyDepartment({})).toEqual({
    items: [],
    nextCursor: null,
  });
});
