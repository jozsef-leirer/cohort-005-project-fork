/**
 * How far through a course somebody is, as a labelled bar.
 *
 * Shared by the course page and the Refund Request review screen so a
 * Platform Admin reads a learner's progress in exactly the shape the learner
 * sees it. Purely presentational: the caller decides what the percentage
 * means and where it came from.
 */
export function CourseProgress({ percent }: { percent: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{percent}% complete</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
