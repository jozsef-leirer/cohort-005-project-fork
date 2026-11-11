import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, refundRequests, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import {
  getRefundEligibility,
  RefundBlocker,
  REFUND_BLOCKER_MESSAGES,
} from "~/lib/refunds.server";
import {
  buildRefundRequestReceivedEmail,
  sendRefundEmail,
} from "~/lib/refund-emails.server";

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

const BLOCKER_STATUS: Record<RefundBlocker, number> = {
  [RefundBlocker.NotPurchased]: 403,
  [RefundBlocker.AlreadyRequested]: 409,
  [RefundBlocker.TeamSeatHolder]: 403,
  [RefundBlocker.TeamSeatsClaimed]: 403,
  [RefundBlocker.WindowClosed]: 403,
  [RefundBlocker.WatchedTooMuch]: 403,
  [RefundBlocker.CompletedTooMuch]: 403,
};

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundParamsSchema);
  const course = db.select().from(courses).where(eq(courses.slug, slug)).get();

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const learner = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!learner) {
    throw data("User not found", { status: 404 });
  }

  const eligibility = getRefundEligibility(currentUserId, course.id);

  if (!eligibility.eligible) {
    throw data(REFUND_BLOCKER_MESSAGES[eligibility.blocker], {
      status: BLOCKER_STATUS[eligibility.blocker],
    });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  db.insert(refundRequests)
    .values({
      purchaseId: eligibility.purchaseId,
      reason: parsed.data.reason,
    })
    .run();

  sendRefundEmail(
    buildRefundRequestReceivedEmail({
      learner,
      courseTitle: course.title,
      amountPaid: eligibility.amountPaid,
    })
  );

  return redirect("/settings");
}
