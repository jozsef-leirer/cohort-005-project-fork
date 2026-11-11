import { useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/admin.refund-requests";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { UserRole, RefundRequestStatus, users } from "~/db/schema";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import {
  approveRefundRequest,
  declineRefundRequest,
  listRefundRequests,
  type ReviewContext,
} from "~/lib/refunds.server";
import { COMPLETION_LIMIT, WATCH_LIMIT_SECONDS } from "~/lib/refund-blockers";
import { CourseProgress } from "~/components/course-progress";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Skeleton } from "~/components/ui/skeleton";
import { AlertTriangle, Receipt } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { formatDuration, formatPrice } from "~/lib/utils";

const reviewActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    requestId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    requestId: z.coerce.number().int(),
    declineReason: z
      .string()
      .trim()
      .min(10, "Tell the learner why, in at least a sentence.")
      .max(1000, "Please keep the reason under 1000 characters."),
  }),
]);

function requireAdmin(currentUserId: number) {
  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can review refund requests.", { status: 403 });
  }

  return currentUser;
}

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Review learner refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to review refund requests.", {
      status: 401,
    });
  }

  requireAdmin(currentUserId);

  return { refundRequests: listRefundRequests() };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  requireAdmin(currentUserId);

  const formData = await request.formData();
  const parsed = parseFormData(formData, reviewActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const outcome =
    parsed.data.intent === "approve"
      ? approveRefundRequest(parsed.data.requestId, currentUserId)
      : declineRefundRequest(
          parsed.data.requestId,
          currentUserId,
          parsed.data.declineReason
        );

  if (outcome === "alreadyResolved") {
    return data({ error: "That request has already been reviewed." }, {
      status: 409,
    });
  }

  if (outcome === "ownRequest") {
    return data(
      {
        error:
          "You can't decide your own refund request. Ask another Platform Admin to review it.",
      },
      { status: 403 }
    );
  }

  return {
    success: true,
    message:
      parsed.data.intent === "approve"
        ? "Refund approved. The learner has been emailed and their enrollment is revoked."
        : "Refund request declined. The learner has been emailed your reason.",
  };
}

const STATUS_LABELS: Record<RefundRequestStatus, string> = {
  [RefundRequestStatus.AwaitingReview]: "Awaiting review",
  [RefundRequestStatus.Approved]: "Approved",
  [RefundRequestStatus.Declined]: "Declined",
};

const STATUS_CLASSES: Record<RefundRequestStatus, string> = {
  [RefundRequestStatus.AwaitingReview]:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  [RefundRequestStatus.Approved]:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  [RefundRequestStatus.Declined]:
    "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: RefundRequestStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

type RefundRequestRow = ReturnType<typeof listRefundRequests>[number];

function ReviewControls({ requestId }: { requestId: number }) {
  const fetcher = useFetcher<{ error?: string; message?: string }>();
  const [isDeclining, setIsDeclining] = useState(false);
  const isSubmitting = fetcher.state !== "idle";

  if (fetcher.state === "idle" && fetcher.data?.error) {
    toast.error(fetcher.data.error);
  }

  if (isDeclining) {
    return (
      <fetcher.Form method="post" className="mt-3 space-y-2">
        <input type="hidden" name="intent" value="decline" />
        <input type="hidden" name="requestId" value={requestId} />
        <Textarea
          name="declineReason"
          rows={3}
          required
          placeholder="Why can't we approve this? The learner reads this word for word."
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Decline and email the learner"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsDeclining(false)}
          >
            Back
          </Button>
        </div>
      </fetcher.Form>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="approve" />
        <input type="hidden" name="requestId" value={requestId} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          Approve refund
        </Button>
      </fetcher.Form>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsDeclining(true)}
        disabled={isSubmitting}
      >
        Decline
      </Button>
    </div>
  );
}

function watchedLabel(seconds: number) {
  return formatDuration(Math.floor(seconds / 60), true, false, false);
}

/**
 * How much of the course the learner took, in whichever measure the purchase
 * actually has. A Team Licence buyer is never enrolled, so a progress bar
 * there would always read 0% — what decides a licence is its Seats.
 */
function ReviewContextPanel({ review }: { review: ReviewContext }) {
  if (review.kind === "teamLicence") {
    return (
      <p className="mt-3 text-sm">
        <span className="font-medium">
          {review.seatsClaimed} of {review.seatsCut} seats claimed
        </span>
        <span className="text-muted-foreground">
          {review.seatsClaimed > 0
            ? " — approving voids the unclaimed seats; the claimed ones keep their courses."
            : " — approving voids every seat code on this licence."}
        </span>
      </p>
    );
  }

  return (
    <div className="mt-3">
      <CourseProgress percent={review.percentComplete} />
      <p className="mt-2 text-xs text-muted-foreground">
        {watchedLabel(review.secondsWatched)} watched of a{" "}
        {watchedLabel(WATCH_LIMIT_SECONDS)} limit ·{" "}
        {Math.round(COMPLETION_LIMIT * 100)}% completion limit
      </p>
    </div>
  );
}

function RefundRequestCard({ refundRequest }: { refundRequest: RefundRequestRow }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              to={`/courses/${refundRequest.courseSlug}`}
              className="font-medium hover:underline"
            >
              {refundRequest.courseTitle}
            </Link>
            <p className="text-sm text-muted-foreground">
              {refundRequest.learnerName} · {refundRequest.learnerEmail}
            </p>
          </div>
          <StatusBadge status={refundRequest.status} />
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          {formatPrice(refundRequest.amountPaid)} paid · asked for{" "}
          {new Date(refundRequest.requestedAt).toLocaleDateString()}
          {refundRequest.resolvedAt
            ? ` · reviewed ${new Date(refundRequest.resolvedAt).toLocaleDateString()}`
            : null}
        </p>

        <ReviewContextPanel review={refundRequest.review} />

        <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
          {refundRequest.reason}
        </p>

        {refundRequest.declineReason && (
          <p className="mt-2 text-sm">
            <span className="font-medium">Declined because: </span>
            {refundRequest.declineReason}
          </p>
        )}

        {refundRequest.status === RefundRequestStatus.AwaitingReview && (
          <ReviewControls requestId={refundRequest.id} />
        )}
      </CardContent>
    </Card>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-2 h-5 w-72" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function AdminRefundRequests({
  loaderData,
}: Route.ComponentProps) {
  const { refundRequests } = loaderData;
  const awaitingReview = refundRequests.filter(
    (r) => r.status === RefundRequestStatus.AwaitingReview
  );
  const reviewed = refundRequests.filter(
    (r) => r.status !== RefundRequestStatus.AwaitingReview
  );

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Approving a request refunds the learner the amount they paid and ends
          their access to the course. Declining moves no money.
        </p>
      </div>

      {refundRequests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Receipt className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">No refund requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Awaiting review ({awaitingReview.length})
            </h2>
            {awaitingReview.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is waiting on you.
              </p>
            ) : (
              <div className="space-y-4">
                {awaitingReview.map((refundRequest) => (
                  <RefundRequestCard
                    key={refundRequest.id}
                    refundRequest={refundRequest}
                  />
                ))}
              </div>
            )}
          </section>

          {reviewed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Reviewed ({reviewed.length})
              </h2>
              <div className="space-y-4">
                {reviewed.map((refundRequest) => (
                  <RefundRequestCard
                    key={refundRequest.id}
                    refundRequest={refundRequest}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message =
    "An unexpected error occurred while loading refund requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
