/**
 * Why a purchase cannot be refunded, and the words we use to say so.
 *
 * Deliberately free of any database import: the course page shows these to a
 * learner in the browser, and the refund action sends the same strings back
 * as error bodies. One set of words, so the page and the server can never
 * explain the same refusal differently.
 *
 * Vocabulary is pinned by GLOSSARY.md — Refund, Refund Request, Refund
 * Window. Never "reversal", never "chargeback".
 */

/** The fourteen whole days after a purchase in which a request may be raised. */
export const REFUND_WINDOW_DAYS = 14;

/**
 * How much of a course a learner may consume and still ask for their money
 * back. They live here rather than beside the eligibility test because the
 * review screen shows a learner's watch time and completion against these
 * very limits — and a second copy of "two hours" could disagree with the
 * first.
 */
export const WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const COMPLETION_LIMIT = 0.5;

export enum RefundBlocker {
  NotPurchased = "not_purchased",
  AlreadyRequested = "already_requested",
  /** The learner holds a seat their team bought. The money was never theirs. */
  TeamSeatHolder = "team_seat_holder",
  /** The learner bought a team licence and seats on it have been claimed. */
  TeamSeatsClaimed = "team_seats_claimed",
  WindowClosed = "window_closed",
  WatchedTooMuch = "watched_too_much",
  CompletedTooMuch = "completed_too_much",
}

export const REFUND_BLOCKER_MESSAGES: Record<RefundBlocker, string> = {
  [RefundBlocker.NotPurchased]: "You have not bought this course.",
  [RefundBlocker.AlreadyRequested]:
    "You already have a refund request open on this purchase.",
  [RefundBlocker.TeamSeatHolder]:
    "Your team bought this seat, so only they can ask for a refund.",
  [RefundBlocker.TeamSeatsClaimed]:
    "Seats on this team licence have already been claimed, so it cannot be refunded.",
  [RefundBlocker.WindowClosed]: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
  [RefundBlocker.WatchedTooMuch]:
    "You have watched too much of this course to refund it.",
  [RefundBlocker.CompletedTooMuch]:
    "You have completed too much of this course to refund it.",
};
