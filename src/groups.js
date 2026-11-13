// Synthetic key for the chart's "Other" slice. It never reaches the API: clicking it opens a
// breakdown of the small groups it swallowed (`members`) instead.
export const OTHER_KEY = "__other__";

const OTHER_THRESHOLD_PERCENT = 2;
// at most this many slices including "Other", so the donut stays readable
const MAX_SLICES = 5;

// Slices below the threshold are merged into one "Other" slice that remembers its members.
export function groupSmallSlices(data) {
  const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
  const threshold = (OTHER_THRESHOLD_PERCENT / 100) * total;

  const sorted = [...data].sort((a, b) => b.totalAmount - a.totalAmount);
  let kept;
  let members;
  if (sorted.length <= MAX_SLICES) {
    kept = sorted.filter((item) => item.totalAmount >= threshold);
    members = sorted.filter((item) => item.totalAmount < threshold);
  } else {
    // too many groups: top (MAX_SLICES - 1) named slices + "Other" = MAX_SLICES slices
    kept = sorted.slice(0, MAX_SLICES - 1).filter((item) => item.totalAmount >= threshold);
    members = sorted.slice(kept.length);
  }

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
