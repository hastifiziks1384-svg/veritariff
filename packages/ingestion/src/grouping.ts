/**
 * Clusters documents into shipment groups by shared reference candidates
 * (union-find over reference overlap). Documents with no detectable
 * reference fall back to a single batch group — refined further in Phase 2,
 * when extraction supplies shipper/consignee + date for proximity grouping.
 */
export interface GroupableDoc {
  references: string[];
}

export interface DocumentGroup<T extends GroupableDoc> {
  /** Best reference for the group (most frequent, then earliest-ranked); null for the no-reference batch group. */
  reference: string | null;
  /** All references seen in the group, ranked by frequency then first appearance. */
  references: string[];
  docs: T[];
}

export function groupByReference<T extends GroupableDoc>(docs: T[]): DocumentGroup<T>[] {
  const parent = docs.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    parent[i] = r;
    return r;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  // Union documents sharing any reference candidate.
  const byRef = new Map<string, number>();
  docs.forEach((doc, i) => {
    for (const ref of doc.references) {
      const first = byRef.get(ref);
      if (first === undefined) byRef.set(ref, i);
      else union(i, first);
    }
  });

  // No-reference documents form one batch group together.
  let firstUnreferenced: number | null = null;
  docs.forEach((doc, i) => {
    if (doc.references.length === 0) {
      if (firstUnreferenced === null) firstUnreferenced = i;
      else union(i, firstUnreferenced);
    }
  });

  const groups = new Map<number, T[]>();
  docs.forEach((doc, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(doc);
    groups.set(root, list);
  });

  return [...groups.values()].map((groupDocs) => {
    // Rank references by frequency across documents; ties keep the order the
    // extractor emitted (shipment-level labels come before document-local ones).
    const counts = new Map<string, number>();
    for (const doc of groupDocs) {
      for (const ref of doc.references) counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
    const ranked = [...counts.entries()];
    const order = new Map(ranked.map(([ref], i) => [ref, i]));
    ranked.sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!);
    const references = ranked.map(([ref]) => ref);
    return { reference: references[0] ?? null, references, docs: groupDocs };
  });
}
