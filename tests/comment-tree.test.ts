import { expect, test } from "bun:test";
import { buildTree } from "@/lib/comment-tree";

test("buildTree nests by parentId and keeps order", () => {
  const t = buildTree([
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: null },
    { id: "e", parentId: "missing" },
  ]);
  expect(t.map((n) => n.id)).toEqual(["a", "d", "e"]);
  expect(t[0].children[0].children[0].id).toBe("c");
});
