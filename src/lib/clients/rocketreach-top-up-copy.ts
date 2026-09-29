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
  "Before any RocketReach credit is spent, it looks in Universe for people this client already sourced who match the plan. People sourced only for another client are not copied onto this list.",
  "People already on the list, do-not-contact, blocked companies, and the 10-day cooldown are left out. New people from Universe are labelled Re-harvested from Universe with the date.",
  "Preview top-up shows a Universe count and the RocketReach credits the shortfall would take. It does not spend credits.",
  "Find matches in Universe is free. It previews, then a person can add those matches to the list. It does not enrol and it does not send.",
].join(" ");
