import { describe, expect, it } from "vitest";
import {
  buildRefundApprovedEmail,
  buildRefundDeclinedEmail,
  buildRefundRequestReceivedEmail,
} from "./refund-emails.server";

const learner = { name: "Sophia", email: "sophia@example.com" };

// The words GLOSSARY.md retires. Nothing Cadence sends a learner may use
// them — "chargeback" in particular means a bank dispute, not this.
const RETIRED_WORDS = ["chargeback", "reversal", "cancellation", "cancel"];

const ALL_EMAILS = [
  buildRefundRequestReceivedEmail({
    learner,
    courseTitle: "Advanced TypeScript",
    amountPaid: 4999,
  }),
  buildRefundApprovedEmail({
    learner,
    courseTitle: "Advanced TypeScript",
    amountPaid: 4999,
  }),
  buildRefundDeclinedEmail({
    learner,
    courseTitle: "Advanced TypeScript",
    declineReason: "You finished most of the course before asking.",
  }),
];

describe("refund emails", () => {
  it.each(ALL_EMAILS)("addresses the learner and signs off ($subject)", (email) => {
    expect(email.to).toBe("sophia@example.com");
    expect(email.body).toMatch(/^Hi Sophia,/);
    expect(email.body).toMatch(/— The Cadence team$/);
  });

  it.each(ALL_EMAILS)("uses no retired vocabulary ($subject)", (email) => {
    const text = `${email.subject} ${email.body}`.toLowerCase();
    for (const word of RETIRED_WORDS) {
      expect(text).not.toContain(word);
    }
  });

  it.each(ALL_EMAILS)("names the course ($subject)", (email) => {
    expect(email.subject).toContain("Advanced TypeScript");
    expect(email.body).toContain("Advanced TypeScript");
  });
});

describe("buildRefundRequestReceivedEmail", () => {
  it("quotes the amount paid without promising it", () => {
    const email = buildRefundRequestReceivedEmail({
      learner,
      courseTitle: "Advanced TypeScript",
      amountPaid: 4999,
    });

    expect(email.body).toContain("$49.99");
    expect(email.body).toContain("If we approve it");
  });
});

describe("buildRefundApprovedEmail", () => {
  it("states the amount and that access has ended", () => {
    const email = buildRefundApprovedEmail({
      learner,
      courseTitle: "Advanced TypeScript",
      amountPaid: 4999,
    });

    expect(email.body).toContain("$49.99");
    expect(email.body).toContain("access to the course has now ended");
  });
});

describe("buildRefundDeclinedEmail", () => {
  it("passes the reviewer's reason through verbatim", () => {
    const email = buildRefundDeclinedEmail({
      learner,
      courseTitle: "Advanced TypeScript",
      declineReason: "You finished most of the course before asking.",
    });

    expect(email.body).toContain("You finished most of the course before asking.");
  });

  it("says no money moved and access is intact", () => {
    const email = buildRefundDeclinedEmail({
      learner,
      courseTitle: "Advanced TypeScript",
      declineReason: "Outside the window.",
    });

    expect(email.body).toContain("No money has moved");
    expect(email.body).toContain("still have full access");
  });
});
