export type TreeNode<T> = T & { children: TreeNode<T>[] };

export function buildTree<T extends { id: string; parentId: string | null }>(
  items: T[],
): TreeNode<T>[] {
  const nodes = new Map(
    items.map((i) => [i.id, { ...i, children: [] as TreeNode<T>[] }]),
  );
  const roots: TreeNode<T>[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  return roots;
}
