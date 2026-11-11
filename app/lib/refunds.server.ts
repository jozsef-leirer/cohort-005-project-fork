import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  notExists,
  sql,
} from "drizzle-orm";
import { db } from "~/db";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  courses,
  coupons,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refundRequests,
  users,
  videoWatchEvents,
  LessonProgressStatus,
  RefundRequestStatus,
} from "~/db/schema";
import {
  buildRefundApprovedEmail,
  buildRefundDeclinedEmail,
  sendRefundEmail,
} from "~/lib/refund-emails.server";

import {
  COMPLETION_LIMIT,
  REFUND_WINDOW_DAYS,
  RefundBlocker,
  REFUND_BLOCKER_MESSAGES,
  WATCH_LIMIT_SECONDS,
} from "~/lib/refund-blockers";

// Re-exported so callers that already reach for the eligibility test get the
// vocabulary with it. The definitions live in a db-free module because the
// course page and the review screen render them in the browser.
export {
  COMPLETION_LIMIT,
  REFUND_WINDOW_DAYS,
  RefundBlocker,
  REFUND_BLOCKER_MESSAGES,
  WATCH_LIMIT_SECONDS,
};

type RefundEligibility =
  | {
      eligible: true;
      purchaseId: number;
      /** What the learner paid, and so exactly what a Refund returns. */
      amountPaid: number;
      lastDayInWindow: string;
    }
  | { eligible: false; blocker: RefundBlocker };

// Compare whole days, not hours — a purchase at 23:00 should still get its
// full fourteenth day.
function asDayString(when: Date) {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Seats were cut from this purchase, so it is a team licence, not a copy. */
function seatsCutFrom(purchaseId: AnySQLiteColumn) {
  return db
    .select({ one: sql`1` })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId));
}

/**
 * The learner's newest purchase of this course, preferring a copy they bought
 * for themselves over a team licence they bought for other people.
 *
 * Someone who buys the course and later buys seats for their team has two
 * purchases on it. Judging them on the newest would weigh their own copy
 * against a licence whose claimed seats block it, and tell them their own
 * copy cannot be refunded.
 */
function getPurchaseToJudge(userId: number, courseId: number) {
  const mine = and(
    eq(purchases.userId, userId),
    eq(purchases.courseId, courseId)
  );

  const ownCopy = db
    .select()
    .from(purchases)
    .where(and(mine, notExists(seatsCutFrom(purchases.id))))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();

  if (ownCopy) return ownCopy;

  return db
    .select()
    .from(purchases)
    .where(and(mine, exists(seatsCutFrom(purchases.id))))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getOpenRequest(purchaseId: number) {
  return db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.AwaitingReview)
      )
    )
    .get();
}

/** A seat on this purchase that somebody has claimed — the buyer's side. */
function getClaimedSeat(purchaseId: number) {
  return db
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt)))
    .get();
}

/**
 * A seat this learner redeemed for this course — the seat holder's side.
 * They have an Enrollment and no purchase of their own, because the money
 * came from whoever bought the licence.
 */
function getRedeemedSeat(userId: number, courseId: number) {
  return db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(
        eq(coupons.redeemedByUserId, userId),
        eq(coupons.courseId, courseId),
        isNotNull(coupons.redeemedAt)
      )
    )
    .get();
}

function getLessonIds(courseId: number): number[] {
  const rows = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all();

  return rows.map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({ furthest: sql<number>`max(${videoWatchEvents.positionSeconds})` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

/**
 * The whole Refund Eligibility test for one learner and one course. Both the
 * course page and the refund action go through here, so the form a learner
 * is shown and the request the server accepts can never disagree.
 */
export function getRefundEligibility(
  userId: number,
  courseId: number
): RefundEligibility {
  const purchase = getPurchaseToJudge(userId, courseId);

  // Checked before NotPurchased: a seat holder has no purchase of their own,
  // so without this they would be told they never bought the course — true,
  // but not the reason they cannot refund it.
  if (!purchase) {
    return getRedeemedSeat(userId, courseId)
      ? { eligible: false, blocker: RefundBlocker.TeamSeatHolder }
      : { eligible: false, blocker: RefundBlocker.NotPurchased };
  }

  if (getOpenRequest(purchase.id)) {
    return { eligible: false, blocker: RefundBlocker.AlreadyRequested };
  }

  // The buyer's side: a licence whose seats are in use cannot be handed back,
  // because refunding it would strip courses from the people using them.
  if (getClaimedSeat(purchase.id)) {
    return { eligible: false, blocker: RefundBlocker.TeamSeatsClaimed };
  }

  const windowEnd = new Date(purchase.createdAt);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  const lastDayInWindow = asDayString(windowEnd);
  const today = asDayString(new Date());

  if (today < asDayString(new Date(purchase.createdAt)) || today > lastDayInWindow) {
    return { eligible: false, blocker: RefundBlocker.WindowClosed };
  }

  const lessonIds = getLessonIds(courseId);

  if (lessonIds.length > 0) {
    const completed = getCompletedLessonCount(userId, lessonIds);
    if (completed / lessonIds.length >= COMPLETION_LIMIT) {
      return { eligible: false, blocker: RefundBlocker.CompletedTooMuch };
    }
  }

  if (getSecondsWatched(userId, lessonIds) >= WATCH_LIMIT_SECONDS) {
    return { eligible: false, blocker: RefundBlocker.WatchedTooMuch };
  }

  return {
    eligible: true,
    purchaseId: purchase.id,
    amountPaid: purchase.amountPaid,
    lastDayInWindow,
  };
}

/**
 * What a Platform Admin is shown in order to judge one Refund Request.
 *
 * A Team Licence buyer is never enrolled, so their progress through the
 * course is structurally zero rather than merely usually zero — a progress
 * bar there would be a number that cannot say anything. What matters on a
 * licence is how many Seats are already in somebody's hands.
 */
export type ReviewContext =
  | { kind: "purchase"; percentComplete: number; secondsWatched: number }
  | { kind: "teamLicence"; seatsCut: number; seatsClaimed: number };

function countSeats(purchaseId: number) {
  const row = db
    .select({
      cut: sql<number>`count(*)`,
      claimed: sql<number>`sum(case when ${coupons.redeemedAt} is null then 0 else 1 end)`,
    })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .get();

  // `sum` over no rows is null, not zero.
  return { cut: row?.cut ?? 0, claimed: row?.claimed ?? 0 };
}

/**
 * Seats cut from the purchase are what make it a Team Licence, so they also
 * decide which measure the review screen shows.
 */
function getReviewContext(
  purchaseId: number,
  userId: number,
  courseId: number
): ReviewContext {
  const seats = countSeats(purchaseId);

  if (seats.cut > 0) {
    return {
      kind: "teamLicence",
      seatsCut: seats.cut,
      seatsClaimed: seats.claimed,
    };
  }

  // Deliberately the same helpers the eligibility test uses: the numbers a
  // Platform Admin judges on cannot then drift from the numbers that decided
  // whether the learner could ask at all.
  const lessonIds = getLessonIds(courseId);
  const completed = getCompletedLessonCount(userId, lessonIds);

  return {
    kind: "purchase",
    percentComplete:
      lessonIds.length === 0
        ? 0
        : Math.round((completed / lessonIds.length) * 100),
    secondsWatched: getSecondsWatched(userId, lessonIds),
  };
}

/** One Refund Request with everything a Platform Admin needs to judge it. */
export function listRefundRequests() {
  const rows = db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      reason: refundRequests.reason,
      declineReason: refundRequests.declineReason,
      requestedAt: refundRequests.requestedAt,
      resolvedAt: refundRequests.resolvedAt,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .orderBy(sql`${refundRequests.requestedAt} desc`)
    .all();

  return rows.map((row) => ({
    ...row,
    review: getReviewContext(row.purchaseId, row.learnerId, row.courseId),
  }));
}

type ReviewTarget = {
  requestId: number;
  purchaseId: number;
  learner: { id: number; name: string; email: string };
  courseId: number;
  courseTitle: string;
  amountPaid: number;
};

/**
 * Why a review attempt changed nothing. `ownRequest` is its own answer
 * rather than a plain failure because the screen has to say which rule
 * stopped the Platform Admin, and "already reviewed" would be a lie.
 */
export type ReviewOutcome = "reviewed" | "alreadyResolved" | "ownRequest";

/**
 * Loads a request that is still Awaiting Review. Anything already resolved
 * comes back null — a request is reviewed once.
 */
function findRequestAwaitingReview(requestId: number): ReviewTarget | null {
  const row = db
    .select({
      requestId: refundRequests.id,
      purchaseId: purchases.id,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
      courseId: courses.id,
      courseTitle: courses.title,
      amountPaid: purchases.amountPaid,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      and(
        eq(refundRequests.id, requestId),
        eq(refundRequests.status, RefundRequestStatus.AwaitingReview)
      )
    )
    .get();

  if (!row) return null;

  return {
    requestId: row.requestId,
    purchaseId: row.purchaseId,
    learner: {
      id: row.learnerId,
      name: row.learnerName,
      email: row.learnerEmail,
    },
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    amountPaid: row.amountPaid,
  };
}

/**
 * Approves a Refund Request: the Refund is owed, the learner's Enrollment is
 * revoked, and any unclaimed Seats cut from the purchase are voided.
 *
 * A Platform Admin may not decide their own request. The money and the
 * judgement never belong to the same person, even when that person is staff.
 */
export function approveRefundRequest(
  requestId: number,
  reviewerId: number
): ReviewOutcome {
  const target = findRequestAwaitingReview(requestId);

  if (!target) return "alreadyResolved";
  if (target.learner.id === reviewerId) return "ownRequest";

  db.update(refundRequests)
    .set({
      status: RefundRequestStatus.Approved,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: reviewerId,
    })
    .where(eq(refundRequests.id, target.requestId))
    .run();

  // Enrollment Revoked. The row goes rather than gaining a flag, so no
  // access check anywhere can forget to filter on it. The approved request
  // is the record that the learner once had the course.
  db.delete(enrollments)
    .where(
      and(
        eq(enrollments.userId, target.learner.id),
        eq(enrollments.courseId, target.courseId)
      )
    )
    .run();

  // Seats Voided. Unclaimed Seats go for the same reason the Enrollment row
  // goes: a code that no longer exists cannot be redeemed by a check nobody
  // remembered to write. Claimed Seats are left alone — the people holding
  // them keep their courses.
  db.delete(coupons)
    .where(
      and(eq(coupons.purchaseId, target.purchaseId), isNull(coupons.redeemedAt))
    )
    .run();

  sendRefundEmail(
    buildRefundApprovedEmail({
      learner: target.learner,
      courseTitle: target.courseTitle,
      amountPaid: target.amountPaid,
    })
  );

  return "reviewed";
}

/**
 * Declines a Refund Request. No money moves and the learner keeps the
 * course. A Platform Admin may not decide their own request.
 */
export function declineRefundRequest(
  requestId: number,
  reviewerId: number,
  declineReason: string
): ReviewOutcome {
  const target = findRequestAwaitingReview(requestId);

  if (!target) return "alreadyResolved";
  if (target.learner.id === reviewerId) return "ownRequest";

  db.update(refundRequests)
    .set({
      status: RefundRequestStatus.Declined,
      declineReason,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: reviewerId,
    })
    .where(eq(refundRequests.id, target.requestId))
    .run();

  sendRefundEmail(
    buildRefundDeclinedEmail({
      learner: target.learner,
      courseTitle: target.courseTitle,
      declineReason,
    })
  );

  return "reviewed";
}
