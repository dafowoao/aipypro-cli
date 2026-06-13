function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff = [];
  const lcs = longestCommonSubsequence(oldLines, newLines);
  let oldIdx = 0, newIdx = 0, lcsIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (lcsIdx < lcs.length) {
      while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
        diff.push({ type: 'remove', line: oldLines[oldIdx], oldLine: oldIdx + 1 });
        oldIdx++;
      }
      while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
        diff.push({ type: 'add', line: newLines[newIdx], newLine: newIdx + 1 });
        newIdx++;
      }
      if (lcsIdx < lcs.length) {
        diff.push({ type: 'same', line: lcs[lcsIdx], oldLine: oldIdx + 1, newLine: newIdx + 1 });
        oldIdx++; newIdx++; lcsIdx++;
      }
    } else {
      while (oldIdx < oldLines.length) {
        diff.push({ type: 'remove', line: oldLines[oldIdx], oldLine: oldIdx + 1 });
        oldIdx++;
      }
      while (newIdx < newLines.length) {
        diff.push({ type: 'add', line: newLines[newIdx], newLine: newIdx + 1 });
        newIdx++;
      }
    }
  }
  return diff;
}

function longestCommonSubsequence(a, b) {
  const m = a.length, n = b.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { lcs.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return lcs;
}

function formatDiff(diff, options = {}) {
  const { contextLines = 3, showLineNumbers = true } = options;
  const lines = [];
  let lastShownLine = -1;
  for (let i = 0; i < diff.length; i++) {
    const item = diff[i];
    if (item.type !== 'same') {
      const start = Math.max(0, i - contextLines);
      for (let j = start; j < i; j++) {
        if (diff[j].type === 'same' && diff[j].oldLine > lastShownLine) {
          lines.push(`  ${showLineNumbers ? String(diff[j].oldLine).padStart(4) + ' ' : ''}  ${diff[j].line}`);
          lastShownLine = diff[j].oldLine;
        }
      }
    }
    if (item.type === 'add') {
      lines.push(`+ ${showLineNumbers ? String(item.newLine).padStart(4) + ' ' : ''}${item.line}`);
    } else if (item.type === 'remove') {
      lines.push(`- ${showLineNumbers ? String(item.oldLine).padStart(4) + ' ' : ''}${item.line}`);
    } else if (item.type === 'same') {
      if (item.oldLine > lastShownLine) {
        lines.push(`  ${showLineNumbers ? String(item.oldLine).padStart(4) + ' ' : ''}  ${item.line}`);
        lastShownLine = item.oldLine;
      }
    }
  }
  return lines.join('\n');
}

function getDiffStats(diff) {
  let added = 0, removed = 0, unchanged = 0;
  for (const item of diff) {
    if (item.type === 'add') added++;
    else if (item.type === 'remove') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged, total: added + removed + unchanged };
}

module.exports = { computeDiff, formatDiff, getDiffStats };
