# Cadence

Cadence sells video courses to students. This glossary covers the language around buying, taking and refunding courses, and telling people about it.

## Language

### People

**Student**:
Someone who takes courses on Cadence.
_Avoid_: Learner, User

**Instructor**:
A person who builds and owns courses, and sees the Students enrolled on them.
_Avoid_: Teacher, Author, Creator

**Platform Admin**:
A member of Cadence staff who runs the platform. Only a Platform Admin decides Refund Requests.
_Avoid_: Admin (on its own), the team, Staff

**Team Admin**:
A Student who buys and manages a Team Licence. A Team Admin has no say over Refund Requests.
_Avoid_: Admin (on its own)

### Enrollment

**Enrollment**:
A Student's place on a course, which lets them take it. A Student has at most one Enrollment per course, whether it came from an Individual Purchase or a Claimed Seat.
_Avoid_: Place on a course, Access

**Lapsed**:
A Student who has lost their Enrollment on a course but still has progress on it.

**Watched**:
Seconds of video a Student has actually played in a course: the furthest point reached in each lesson, added up. Not lessons opened.
_Avoid_: Viewed, Progress

### Discussions

**Discussion Question**:
A top-level comment on a lesson by anyone other than the course's Instructor.
_Avoid_: Question (on its own, which clashes with quiz questions), Thread

**Discussion Reply**:
A comment that answers a Discussion Question. Replies are one level deep.
_Avoid_: Reply (on its own), Answer

### Purchases

**Purchase**:
A single payment for a course. It is either an Individual Purchase or a Team Licence.
_Avoid_: Order, Transaction

**Individual Purchase**:
A Purchase a Student makes for themselves. It gives the buyer an Enrollment.

**Team Licence**:
A Purchase a Team Admin makes for others. It grants Seats, not an Enrollment; the buyer can't take the course through it.
_Avoid_: Team purchase, Bulk purchase

**Seat**:
One place on a Team Licence that a Student can claim to get an Enrollment.
_Avoid_: Coupon, Code, Voucher

**Unclaimed Seat**:
A Seat no Student has claimed yet.

**Claimed Seat**:
A Seat a Student has claimed. It belongs to that Student, so a Team Licence with any Claimed Seat can't be refunded.

### Refunds

**Refund Request**:
The buyer's ask, with their reason, to get back what they paid for one specific Purchase. A Platform Admin approves or declines it. One Purchase can have several Refund Requests over time, but only one can be undecided at once.
_Avoid_: Refund (for the ask itself), Cancellation, Reversal, Chargeback

**Open Refund Request**:
A Refund Request no Platform Admin has decided yet. The buyer keeps their Enrollment while it is open, and a Team Licence's Unclaimed Seats can't be claimed.
_Avoid_: Pending, Requested, Awaiting review

**Approved Refund Request**:
A Refund Request a Platform Admin has accepted. Approving it ends what the Purchase granted (the buyer's Enrollment for an Individual Purchase; its Unclaimed Seats, which can then never be claimed, for a Team Licence) and leads to a Refund.

**Declined Refund Request**:
A Refund Request a Platform Admin has turned down. Nothing the Purchase granted is lost, it has no Refund, and the buyer may raise a new Refund Request.

**Refund**:
The money returned to the buyer after their Refund Request is approved. It is always the full amount they paid. A declined Refund Request has no Refund.
_Avoid_: Reversal, Chargeback, Cancellation

**Pending Refund**:
A Refund whose Refund Request has been approved, where the money hasn't been confirmed as sent yet.
_Avoid_: Pending (for a Refund Request awaiting review)

**Issued Refund**:
A Refund where the money has been confirmed as sent back to the buyer.
_Avoid_: Completed, Paid out

**Failed Refund**:
A Refund where the money couldn't be sent. The Refund Request stays approved, because the decision hasn't changed.

**Watch Limit**:
The amount of Watched time on a course past which a Student can no longer get a Refund, because they've had the course.
_Avoid_: Watch cap, Viewing threshold

### Notifications

**Notification**:
A durable record telling one person that something outside their own actions happened, worded once when it is fired and never reworded afterwards. A person never gets one for something they did themselves.
_Avoid_: In-app notification, Alert, Message, Activity

**Notification Type**:
A kind of Notification: what triggers it, how it is worded, and the rule for whom it reaches. The catalogue is a list of these, not of individual Notifications.
_Avoid_: Event, Template, Category

**Notification Feed**:
The place inside Cadence where a Recipient sees their Notifications, newest first. It shows every Notification ever sent to them, whether or not they can still reach what it is about.
_Avoid_: Inbox, Activity feed, Notification centre

**Recipient**:
The one person a Notification is addressed to, always an existing Cadence user. A role decides who the Recipients are when a Notification is fired, but is not part of the Notification itself.
_Avoid_: Audience, Target, Subscriber

**Subject**:
The one thing a Notification is about, such as a Refund Request or a Discussion Question. Every Notification has one, and it is where the Notification leads when opened.
_Avoid_: Target, Entity, Resource

**Actor**:
The person whose action caused a Notification. Some Notification Types have no Actor, because nobody caused them.
_Avoid_: Sender, Author, Trigger

**Unread**:
A Notification its Recipient has not opened yet, and which still counts towards the Notification Feed's count. Seeing it in the Notification Feed does not make it Read.
_Avoid_: New, Seen, Unseen

**Read**:
A Notification its Recipient has opened, or has marked Read along with the rest. It cannot become Unread again.
_Avoid_: Acknowledged, Dismissed, Archived

**Toast**:
A message that appears briefly to tell someone how their own action went, and is never stored or counted. The opposite of a Notification in both who it is for and how long it lasts.
_Avoid_: In-app notification, Alert, Flash, Snackbar
