import { formatPrice } from "~/lib/utils";

/**
 * Everything Cadence says to a learner about a Refund Request, in one place.
 * The vocabulary here is fixed by GLOSSARY.md: a learner raises a Refund
 * Request, we approve or decline it, and an approved request produces a
 * Refund of the Amount Paid. Never "reversal", never "chargeback".
 *
 * There is no mail transport wired up yet, so a built message goes to the
 * server log via `sendRefundEmail`.
 */
export type RefundEmail = {
  to: string;
  subject: string;
  body: string;
};

type Learner = {
  name: string;
  email: string;
};

function compose(
  learner: Learner,
  subject: string,
  lines: string[]
): RefundEmail {
  return {
    to: learner.email,
    subject,
    body: [`Hi ${learner.name},`, "", ...lines, "", "— The Cadence team"].join(
      "\n"
    ),
  };
}

export function buildRefundRequestReceivedEmail(input: {
  learner: Learner;
  courseTitle: string;
  amountPaid: number;
}): RefundEmail {
  return compose(
    input.learner,
    `We got your refund request — ${input.courseTitle}`,
    [
      `We have your refund request for "${input.courseTitle}".`,
      `If we approve it, you will get back ${formatPrice(input.amountPaid)} — the amount you paid.`,
      "",
      "Someone on our team reads every refund request. You do not need to do anything else — we will email you again once it has been reviewed.",
    ]
  );
}

export function buildRefundApprovedEmail(input: {
  learner: Learner;
  courseTitle: string;
  amountPaid: number;
}): RefundEmail {
  return compose(
    input.learner,
    `Your refund is on its way — ${input.courseTitle}`,
    [
      `We have approved your refund request for "${input.courseTitle}".`,
      `${formatPrice(input.amountPaid)} is on its way back to the card you paid with. How long it takes to appear is up to your bank.`,
      "",
      "Your access to the course has now ended. If you want it again, you are welcome to buy it back at any time.",
    ]
  );
}

export function buildRefundDeclinedEmail(input: {
  learner: Learner;
  courseTitle: string;
  declineReason: string;
}): RefundEmail {
  return compose(
    input.learner,
    `About your refund request — ${input.courseTitle}`,
    [
      `We have looked at your refund request for "${input.courseTitle}", and we are not able to approve it.`,
      "",
      `Here is why: ${input.declineReason}`,
      "",
      "No money has moved, and you still have full access to the course. If you think we have got this wrong, reply to this email and a person will read it.",
    ]
  );
}

export function sendRefundEmail(email: RefundEmail) {
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}
