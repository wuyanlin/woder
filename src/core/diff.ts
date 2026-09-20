/**
 * 行级 diff - 供右侧「审阅」面板展示文件改动
 */

export type DiffKind = 'add' | 'del' | 'ctx';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

export function diffLines(oldText: string, newText: string, path: string): FileDiff {
  const a = oldText.split('\n');
  const b = newText.split('\n');

  // LCS 动态规划表
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let additions = 0;
  let deletions = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'ctx', text: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'del', text: a[i], oldNo: i + 1, newNo: null });
      deletions++;
      i++;
    } else {
      lines.push({ kind: 'add', text: b[j], oldNo: null, newNo: j + 1 });
      additions++;
      j++;
    }
  }
  while (i < a.length) {
    lines.push({ kind: 'del', text: a[i], oldNo: i + 1, newNo: null });
    deletions++;
    i++;
  }
  while (j < b.length) {
    lines.push({ kind: 'add', text: b[j], oldNo: null, newNo: j + 1 });
    additions++;
    j++;
  }

  return { path, additions, deletions, lines: collapseContext(lines) };
}

/**
 * 未改动的上下文只保留首尾各 3 行，中间折叠，避免长文件刷屏
 */
function collapseContext(lines: DiffLine[]): DiffLine[] {
  const KEEP = 3;
  const changed = lines
    .map((l, idx) => (l.kind === 'ctx' ? -1 : idx))
    .filter(idx => idx >= 0);

  if (changed.length === 0) return [];

  const keep = new Set<number>();
  for (const idx of changed) {
    for (let k = idx - KEEP; k <= idx + KEEP; k++) keep.add(k);
  }

  const out: DiffLine[] = [];
  let skipped = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    if (keep.has(idx)) {
      if (skipped > 0) {
        out.push({ kind: 'ctx', text: `⋯ 省略 ${skipped} 行未改动 ⋯`, oldNo: null, newNo: null });
        skipped = 0;
      }
      out.push(lines[idx]);
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    out.push({ kind: 'ctx', text: `⋯ 省略 ${skipped} 行未改动 ⋯`, oldNo: null, newNo: null });
  }
  return out;
}
