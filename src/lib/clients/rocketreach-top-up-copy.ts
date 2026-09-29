/**
 * Staff training copy for automatic list top-up.
 * Greg Visser is the only approver. The wording must not ask a client to approve it.
 */
export const AUTOMATIC_LIST_TOP_UP_TRAINING = [
  "Automatic list top-up adds people to this sequence's list when fewer than the chosen number are ready and not yet enrolled.",
  "It does not enrol anyone and it does not send email. Enrolment and the first email stay something a person starts, the same as today.",
  "It is off until a named member of staff turns it on. Greg Visser is the only approver.",
  "Two switches must both be on before any credits are spent: this sequence's top-up, and the server setting ROCKETREACH_AUTO_REFILL. The client must be Active and on Machine sending.",
  "A per-run credit cap, a daily budget, a monthly budget, and a balance floor stop the job before it can empty the RocketReach account.",
  "People added this way are labelled with the plan name and the date, so the source of the personal data is on the record.",
  "Preview top-up searches for free and shows who would be looked up. It does not spend credits.",
].join(" ");
