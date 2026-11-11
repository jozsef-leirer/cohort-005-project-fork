import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// refunds.server talks to the module-level database singleton, so the test
// database is swapped in underneath it.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");
  return { db: createTestDb() };
});

import { db } from "~/db";
import * as schema from "~/db/schema";
import { RefundRequestStatus } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  getRefundEligibility,
  listRefundRequests,
  RefundBlocker,
} from "./refunds.server";

function daysAgo(n: number) {
  const when = new Date();
  when.setDate(when.getDate() - n);
  return when.toISOString();
}

let learnerId: number;
let courseId: number;
let adminId: number;
let lessonIds: number[];
let seq = 0;

function makePurchase(amountPaid: number, createdAt: string) {
  return db
    .insert(schema.purchases)
    .values({ userId: learnerId, courseId, amountPaid, createdAt })
    .returning()
    .get();
}

function enroll() {
  db.insert(schema.enrollments)
    .values({ userId: learnerId, courseId })
    .run();
}

beforeEach(() => {
  // Fresh people and a fresh course per test; rows from earlier tests can
  // then never satisfy a query by accident.
  seq += 1;

  const learner = db
    .insert(schema.users)
    .values({
      name: "Learner",
      email: `learner${seq}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();

  const admin = db
    .insert(schema.users)
    .values({
      name: "Admin",
      email: `admin${seq}@example.com`,
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();

  const category = db
    .insert(schema.categories)
    .values({ name: `Cat ${seq}`, slug: `cat-${seq}` })
    .returning()
    .get();

  const course = db
    .insert(schema.courses)
    .values({
      title: "Test Course",
      slug: `test-course-${seq}`,
      description: "A test course",
      salesCopy: "Sales copy",
      instructorId: admin.id,
      categoryId: category.id,
      status: schema.CourseStatus.Published,
      price: 9999,
    })
    .returning()
    .get();

  const courseModule = db
    .insert(schema.modules)
    .values({ courseId: course.id, title: "Module", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3, 4].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({
          moduleId: courseModule.id,
          title: `Lesson ${position}`,
          position,
        })
        .returning()
        .get().id
  );

  learnerId = learner.id;
  adminId = admin.id;
  courseId = course.id;

  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("getRefundEligibility", () => {
  it("offers back exactly what was paid, not the course's current price", () => {
    makePurchase(2999, daysAgo(1));

    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility.eligible).toBe(true);
    if (!eligibility.eligible) return;
    // The course lists at 9999; this learner paid 2999.
    expect(eligibility.amountPaid).toBe(2999);
  });

  it("blocks a learner who has not bought the course", () => {
    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility).toEqual({
      eligible: false,
      blocker: RefundBlocker.NotPurchased,
    });
  });

  it("blocks a second request while one is awaiting review", () => {
    const purchase = makePurchase(2999, daysAgo(1));
    db.insert(schema.refundRequests)
      .values({ purchaseId: purchase.id, reason: "Not for me, sorry." })
      .run();

    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility).toEqual({
      eligible: false,
      blocker: RefundBlocker.AlreadyRequested,
    });
  });

  it("allows a new request once the previous one was declined", () => {
    const purchase = makePurchase(2999, daysAgo(1));
    db.insert(schema.refundRequests)
      .values({
        purchaseId: purchase.id,
        status: RefundRequestStatus.Declined,
        reason: "Not for me, sorry.",
        declineReason: "Outside the window.",
      })
      .run();

    expect(getRefundEligibility(learnerId, courseId).eligible).toBe(true);
  });

  it("blocks a purchase older than the refund window", () => {
    makePurchase(2999, daysAgo(15));

    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility).toEqual({
      eligible: false,
      blocker: RefundBlocker.WindowClosed,
    });
  });

  it("allows a purchase on the last day of the window", () => {
    makePurchase(2999, daysAgo(14));

    expect(getRefundEligibility(learnerId, courseId).eligible).toBe(true);
  });

  it("blocks the buyer of a licence whose seats have been claimed", () => {
    const purchase = makePurchase(2999, daysAgo(1));
    const team = db.insert(schema.teams).values({}).returning().get();
    const seatHolder = db
      .insert(schema.users)
      .values({
        name: "Seat holder",
        email: `seat${seq}@example.com`,
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-${seq}`,
        purchaseId: purchase.id,
        redeemedByUserId: seatHolder.id,
        redeemedAt: daysAgo(1),
      })
      .run();

    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility).toEqual({
      eligible: false,
      blocker: RefundBlocker.TeamSeatsClaimed,
    });
  });

  // The seat holder has an Enrollment and no purchase of their own, so the
  // purchase gate would otherwise tell them they never bought the course.
  it("tells a seat holder their team owns the seat, not that they never bought it", () => {
    const buyer = db
      .insert(schema.users)
      .values({
        name: "Buyer",
        email: `buyer${seq}@example.com`,
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: buyer.id,
        courseId,
        amountPaid: 29995,
        createdAt: daysAgo(1),
      })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();

    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-${seq}`,
        purchaseId: purchase.id,
        redeemedByUserId: learnerId,
        redeemedAt: daysAgo(1),
      })
      .run();
    enroll();

    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility).toEqual({
      eligible: false,
      blocker: RefundBlocker.TeamSeatHolder,
    });
  });

  // Buying seats for your team after buying the course yourself leaves two
  // purchases on it. The licence must not speak for your own copy.
  it("judges a learner on their own copy, not on a team licence they bought later", () => {
    makePurchase(2999, daysAgo(1));

    const licence = makePurchase(29995, daysAgo(0));
    const team = db.insert(schema.teams).values({}).returning().get();
    const seatHolder = db
      .insert(schema.users)
      .values({
        name: "Seat holder",
        email: `seat-later${seq}@example.com`,
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-LATER-${seq}`,
        purchaseId: licence.id,
        redeemedByUserId: seatHolder.id,
        redeemedAt: daysAgo(0),
      })
      .run();

    const eligibility = getRefundEligibility(learnerId, courseId);

    // The own copy, at what was paid for it — not the licence's 29995.
    expect(eligibility).toMatchObject({ eligible: true, amountPaid: 2999 });
  });

  it("falls back to a team licence when the learner bought nothing else", () => {
    const licence = makePurchase(29995, daysAgo(1));
    const team = db.insert(schema.teams).values({}).returning().get();

    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-ONLY-${seq}`,
        purchaseId: licence.id,
      })
      .run();

    expect(getRefundEligibility(learnerId, courseId)).toMatchObject({
      eligible: true,
      amountPaid: 29995,
    });
  });

  it("allows an unclaimed team seat", () => {
    const purchase = makePurchase(2999, daysAgo(1));
    const team = db.insert(schema.teams).values({}).returning().get();

    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-${seq}`,
        purchaseId: purchase.id,
      })
      .run();

    expect(getRefundEligibility(learnerId, courseId).eligible).toBe(true);
  });

  it("blocks a learner who has watched two hours or more", () => {
    makePurchase(2999, daysAgo(1));
    db.insert(schema.videoWatchEvents)
      .values({
        userId: learnerId,
        lessonId: lessonIds[0],
        eventType: "progress",
        positionSeconds: 2 * 60 * 60,
      })
      .run();

    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility).toEqual({
      eligible: false,
      blocker: RefundBlocker.WatchedTooMuch,
    });
  });

  it("blocks a learner who has completed half the lessons", () => {
    makePurchase(2999, daysAgo(1));
    for (const lessonId of lessonIds.slice(0, 2)) {
      db.insert(schema.lessonProgress)
        .values({
          userId: learnerId,
          lessonId,
          status: schema.LessonProgressStatus.Completed,
        })
        .run();
    }

    const eligibility = getRefundEligibility(learnerId, courseId);

    expect(eligibility).toEqual({
      eligible: false,
      blocker: RefundBlocker.CompletedTooMuch,
    });
  });

  it("allows a learner just under the completion limit", () => {
    makePurchase(2999, daysAgo(1));
    db.insert(schema.lessonProgress)
      .values({
        userId: learnerId,
        lessonId: lessonIds[0],
        status: schema.LessonProgressStatus.Completed,
      })
      .run();

    expect(getRefundEligibility(learnerId, courseId).eligible).toBe(true);
  });
});

function raiseRequest() {
  const purchase = makePurchase(2999, daysAgo(1));
  enroll();

  return db
    .insert(schema.refundRequests)
    .values({ purchaseId: purchase.id, reason: "Not what I expected." })
    .returning()
    .get();
}

/** A Team Licence the learner bought, with some of its seats claimed. */
function raiseLicenceRequest(seats: number, claimedSeats: number) {
  const purchase = makePurchase(29995, daysAgo(1));
  const team = db.insert(schema.teams).values({}).returning().get();

  for (let i = 0; i < seats; i += 1) {
    const claimed = i < claimedSeats;
    const holder = claimed
      ? db
          .insert(schema.users)
          .values({
            name: "Seat holder",
            email: `holder${seq}-${i}@example.com`,
            role: schema.UserRole.Student,
          })
          .returning()
          .get()
      : null;

    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-${seq}-${i}`,
        purchaseId: purchase.id,
        redeemedByUserId: holder?.id ?? null,
        redeemedAt: claimed ? daysAgo(0) : null,
      })
      .run();
  }

  const request = db
    .insert(schema.refundRequests)
    .values({ purchaseId: purchase.id, reason: "Bought too many seats." })
    .returning()
    .get();

  return { purchase, request };
}

function seatsOn(purchaseId: number) {
  return db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.purchaseId, purchaseId))
    .all();
}

function readRequest(id: number) {
  return db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, id))
    .get();
}

function isEnrolled() {
  return !!db
    .select()
    .from(schema.enrollments)
    .where(eq(schema.enrollments.userId, learnerId))
    .get();
}

describe("approveRefundRequest", () => {
  it("approves, records the reviewer, and revokes the enrollment", () => {
    const request = raiseRequest();

    expect(approveRefundRequest(request.id, adminId)).toBe("reviewed");

    const reviewed = readRequest(request.id);
    expect(reviewed?.status).toBe(RefundRequestStatus.Approved);
    expect(reviewed?.resolvedByUserId).toBe(adminId);
    expect(reviewed?.resolvedAt).not.toBeNull();
    expect(isEnrolled()).toBe(false);
  });

  it("refuses to review the same request twice", () => {
    const request = raiseRequest();

    expect(approveRefundRequest(request.id, adminId)).toBe("reviewed");
    expect(approveRefundRequest(request.id, adminId)).toBe("alreadyResolved");
    expect(declineRefundRequest(request.id, adminId, "Changed my mind.")).toBe(
      "alreadyResolved"
    );
  });

  it("refuses an unknown request", () => {
    expect(approveRefundRequest(999_999, adminId)).toBe("alreadyResolved");
  });

  // The money and the judgement never belong to the same person, even when
  // that person is staff.
  it("refuses a Platform Admin deciding their own request", () => {
    const request = raiseRequest();

    expect(approveRefundRequest(request.id, learnerId)).toBe("ownRequest");
    expect(
      declineRefundRequest(request.id, learnerId, "On reflection, no.")
    ).toBe("ownRequest");

    expect(readRequest(request.id)?.status).toBe(
      RefundRequestStatus.AwaitingReview
    );
    expect(isEnrolled()).toBe(true);
  });
});

describe("approving a Team Licence", () => {
  it("voids the unclaimed seats, so their codes stop working", () => {
    const { purchase, request } = raiseLicenceRequest(3, 0);

    expect(approveRefundRequest(request.id, adminId)).toBe("reviewed");
    expect(seatsOn(purchase.id)).toEqual([]);
  });

  it("leaves claimed seats alone", () => {
    const { purchase, request } = raiseLicenceRequest(3, 1);

    approveRefundRequest(request.id, adminId);

    const remaining = seatsOn(purchase.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].redeemedAt).not.toBeNull();
  });
});

describe("listRefundRequests", () => {
  it("shows progress against the limits that gated the request", () => {
    raiseRequest();
    db.insert(schema.lessonProgress)
      .values({
        userId: learnerId,
        lessonId: lessonIds[0],
        status: schema.LessonProgressStatus.Completed,
      })
      .run();
    db.insert(schema.videoWatchEvents)
      .values({
        userId: learnerId,
        lessonId: lessonIds[0],
        eventType: "progress",
        positionSeconds: 600,
      })
      .run();

    const row = listRefundRequests().find((r) => r.learnerId === learnerId);

    // One of four lessons done, ten minutes watched.
    expect(row?.review).toEqual({
      kind: "purchase",
      percentComplete: 25,
      secondsWatched: 600,
    });
  });

  // The buyer of a licence is never enrolled, so a progress bar there would
  // always read 0%. Seats are what a Platform Admin can actually judge.
  it("counts seats instead of progress for a Team Licence", () => {
    raiseLicenceRequest(4, 2);

    const row = listRefundRequests().find((r) => r.learnerId === learnerId);

    expect(row?.review).toEqual({
      kind: "teamLicence",
      seatsCut: 4,
      seatsClaimed: 2,
    });
  });
});

describe("declineRefundRequest", () => {
  it("declines with a reason and leaves the enrollment alone", () => {
    const request = raiseRequest();

    expect(
      declineRefundRequest(request.id, adminId, "You finished most of it.")
    ).toBe("reviewed");

    const reviewed = readRequest(request.id);
    expect(reviewed?.status).toBe(RefundRequestStatus.Declined);
    expect(reviewed?.declineReason).toBe("You finished most of it.");
    expect(reviewed?.resolvedByUserId).toBe(adminId);
    expect(isEnrolled()).toBe(true);
  });
});
