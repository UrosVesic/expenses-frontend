// Synthetic key for the chart's "Other" slice. It never reaches the API: clicking it opens a
// breakdown of the small groups it swallowed (`members`) instead.
export const OTHER_KEY = "__other__";

const OTHER_THRESHOLD_PERCENT = 2;

// Slices below the threshold are merged into one "Other" slice that remembers its members.
export function groupSmallSlices(data) {
  const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
  const threshold = (OTHER_THRESHOLD_PERCENT / 100) * total;

  const kept = [];
  const members = [];

  data.forEach((item) => {
    if (item.totalAmount >= threshold) kept.push(item);
    else members.push(item);
  });

  // a single small slice is not worth hiding behind "Other"
  if (members.length === 1) return [...kept, members[0]];

  if (members.length > 1) {
    kept.push({
      group: OTHER_KEY,
      label: "Other",
      totalAmount: members.reduce((sum, m) => sum + m.totalAmount, 0),
      receiptCount: members.reduce((sum, m) => sum + (m.receiptCount || 0), 0),
      members: [...members].sort((a, b) => b.totalAmount - a.totalAmount),
    });
  }

  return kept;
}
