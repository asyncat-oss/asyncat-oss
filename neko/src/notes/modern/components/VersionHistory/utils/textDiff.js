// Text diff utility using Myers algorithm for word-level comparison
// This provides Google Docs-style diff behavior with smart grouping

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

/**
 * Main diff function
 * Compares two texts and returns an array of diff operations
 */
function diff(text1, text2) {
  // No character-level optimization - go straight to word-level comparison
  const diffs = computeDiff(text1, text2);

  // Group consecutive changes for better readability
  const grouped = cleanupDiffs(diffs);

  return grouped;
}

/**
 * Compute diff using dynamic programming (LCS-based algorithm) at word level
 */
function computeDiff(text1, text2) {
  const words1 = splitIntoWords(text1);
  const words2 = splitIntoWords(text2);

  const n = words1.length;
  const m = words2.length;

  // DP table for LCS (Longest Common Subsequence)
  const dp = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));

  // Fill DP table
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (words1[i - 1] === words2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Traceback to construct diff by following the DP table
  const diffs = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    // Check if words match
    if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) {
      // Words are equal - move diagonally
      diffs.unshift([DIFF_EQUAL, words1[i - 1]]);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Insert from text2 (move left in DP table)
      diffs.unshift([DIFF_INSERT, words2[j - 1]]);
      j--;
    } else if (i > 0) {
      // Delete from text1 (move up in DP table)
      diffs.unshift([DIFF_DELETE, words1[i - 1]]);
      i--;
    }
  }

  return diffs;
}

/**
 * Split text into words, preserving whitespace and punctuation
 * Each word, space, and punctuation mark is a separate token
 */
function splitIntoWords(text) {
  if (!text) return [];

  // Pattern matches:
  // - [\w]+ : word characters (letters, digits, underscore)
  // - [^\w\s] : non-word, non-space (punctuation, symbols)
  // - \s+ : whitespace
  const pattern = /[\w]+|[^\w\s]|\s+/gu;
  return text.match(pattern) || [];
}

/**
 * Clean up and group diffs for better readability
 * Groups consecutive DELETE and INSERT operations separated by small EQUAL sections
 * This creates the Google Docs-style behavior where entire phrases are grouped together
 */
function cleanupDiffs(diffs) {
  if (!diffs || diffs.length === 0) return diffs;

  // First pass: Merge adjacent operations of the same type
  const merged = [];
  let currentOp = null;
  let currentText = "";

  for (const [op, text] of diffs) {
    if (op === currentOp) {
      currentText += text;
    } else {
      if (currentOp !== null) {
        merged.push([currentOp, currentText]);
      }
      currentOp = op;
      currentText = text;
    }
  }
  if (currentOp !== null) {
    merged.push([currentOp, currentText]);
  }

  // Second pass: Don't group - keep individual operations separate for accurate diff display
  // The DiffViewer will handle grouping visually while showing accurate changes
  return merged;
}

/**
 * Calculate similarity between two texts (0-100%)
 * Used for determining diff strategy
 */
function calculateSimilarity(text1, text2) {
  if (!text1 && !text2) return 100;
  if (!text1 || !text2) return 0;

  const words1 = splitIntoWords(text1);
  const words2 = splitIntoWords(text2);

  const longer = Math.max(words1.length, words2.length);
  if (longer === 0) return 100;

  // Calculate edit distance
  const distance = levenshteinDistance(words1, words2);
  return ((longer - distance) / longer) * 100;
}

/**
 * Levenshtein distance for arrays
 */
function levenshteinDistance(arr1, arr2) {
  const dp = Array(arr1.length + 1)
    .fill(null)
    .map(() => Array(arr2.length + 1).fill(0));

  for (let i = 0; i <= arr1.length; i++) dp[i][0] = i;
  for (let j = 0; j <= arr2.length; j++) dp[0][j] = j;

  for (let i = 1; i <= arr1.length; i++) {
    for (let j = 1; j <= arr2.length; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[arr1.length][arr2.length];
}

export { diff, calculateSimilarity, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL };
export default diff;
