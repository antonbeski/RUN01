// ─────────────────────────────────────────────────────────────────────────────
// Hungarian Algorithm (Munkres) — O(n^3) optimal assignment
// Returns assignment: assignment[i] = j means row i is matched to column j,
// or -1 if row i is unmatched.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Solve the assignment problem.
 * @param costMatrix - 2D array [rows][cols], lower = better
 * @param maxCost - reject matches above this threshold
 * @returns [rowToCol, unmatchedRows, unmatchedCols]
 */
export function hungarian(
  costMatrix: number[][],
  maxCost = Infinity,
): [number[], number[], number[]] {
  const rows = costMatrix.length;
  if (rows === 0) return [[], [], []];
  const cols = costMatrix[0].length;
  if (cols === 0) return [Array.from({ length: rows }, (_, i) => i), [], []];

  // Pad to square
  const n = Math.max(rows, cols);
  // cost[i][j] with padding
  const cost: number[] = new Array(n * n).fill(0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      cost[i * n + j] = costMatrix[i][j];
    }
  }

  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1); // p[j] = row matched to col j (1-indexed)
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minVal = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        // row i0 (1-indexed), col j (1-indexed) -> cost[(i0-1)*n + (j-1)]
        const r = (i0 <= rows && j <= cols) ? cost[(i0 - 1) * n + (j - 1)] : 1e9;
        const cur = r - u[i0] - v[j];
        if (cur < minVal[j]) {
          minVal[j] = cur;
          way[j] = j0;
        }
        if (minVal[j] < delta) {
          delta = minVal[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minVal[j] -= delta;
        }
      }
      j0 = j1!;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Build assignment arrays (1-indexed -> 0-indexed)
  const assignment = new Array<number>(rows).fill(-1);
  const usedCols = new Set<number>();
  for (let j = 1; j <= cols; j++) {
    if (p[j] > 0 && p[j] <= rows) {
      const ci = costMatrix[p[j] - 1][j - 1];
      if (ci <= maxCost) {
        assignment[p[j] - 1] = j - 1;
        usedCols.add(j - 1);
      }
    }
  }

  const unmatchedRows: number[] = [];
  for (let i = 0; i < rows; i++) {
    if (assignment[i] === -1) unmatchedRows.push(i);
  }
  const unmatchedCols: number[] = [];
  for (let j = 0; j < cols; j++) {
    if (!usedCols.has(j)) unmatchedCols.push(j);
  }

  return [assignment, unmatchedRows, unmatchedCols];
}
