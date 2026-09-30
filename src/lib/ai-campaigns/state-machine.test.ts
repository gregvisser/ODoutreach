import { describe, expect, it } from "vitest";

import { AI_CAMPAIGN_TICK_BACKOFF_MS } from "./policy";
import {
  aiCampaignSnapshot,
  decideAiCampaignTick,
  noteStageFailure,
  reduceAiCampaign,
  resolveAiCampaignTickFailure,
} from "./state-machine";

describe("AI campaign transitions", () => {
  it("returns the same decision when a tick is repeated without new facts", () => {
    const snapshot = aiCampaignSnapshot();
    expect(decideAiCampaignTick(snapshot)).toEqual(decideAiCampaignTick(snapshot));
    const sourced = reduceAiCampaign(snapshot, { type: "source" }, { contactsSourced: 3 });
    expect(decideAiCampaignTick(sourced)).toEqual({ type: "source" });
    expect(decideAiCampaignTick(sourced)).toEqual(decideAiCampaignTick(sourced));
  });

  it("moves from finding people to writing once the target is reached", () => {
    const snapshot = aiCampaignSnapshot({ contactsSourced: 20, targetContactCount: 20 });
    const decision = decideAiCampaignTick(snapshot);
    expect(decision).toEqual({ type: "write" });
    const written = reduceAiCampaign(snapshot, decision, { draftReady: true });
    expect(written.status).toBe("REVIEWING");
    expect(written.reviewScore).toBeNull();
  });

  it("still looks for this client's people when the credit balance is zero", () => {
    const snapshot = aiCampaignSnapshot({ creditsAllowed: 0, contactsSourced: 0, listExhausted: false });
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "source" });
  });

  it("holds for staff when the list is exhausted and nobody was found", () => {
    const snapshot = aiCampaignSnapshot({ creditsAllowed: 0, contactsSourced: 0, listExhausted: true });
    expect(decideAiCampaignTick(snapshot)).toMatchObject({ type: "needs_staff" });
  });

  it("writes what it has when the list runs out but some people were found", () => {
    const snapshot = aiCampaignSnapshot({ listExhausted: true, contactsSourced: 2, creditsAllowed: 5 });
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "write" });
  });
});

describe("review threshold loop", () => {
  it("revises while the score stays under 75 and stops after three checks", () => {
    let snapshot = aiCampaignSnapshot({ status: "REVIEWING", draftReady: true });
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "review" });

    snapshot = reduceAiCampaign(snapshot, { type: "review" }, { reviewScore: 70 });
    expect(snapshot.reviewRounds).toBe(1);
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "revise" });

    snapshot = reduceAiCampaign(snapshot, { type: "revise" });
    expect(snapshot.status).toBe("REVISING");
    expect(snapshot.reviewScore).toBeNull();
    snapshot = reduceAiCampaign(snapshot, { type: "write" }, { draftReady: true });
    snapshot = reduceAiCampaign(snapshot, { type: "review" }, { reviewScore: 60 });
    expect(snapshot.reviewRounds).toBe(2);
    expect(decideAiCampaignTick(snapshot).type).toBe("revise");

    snapshot = reduceAiCampaign(snapshot, { type: "revise" });
    snapshot = reduceAiCampaign(snapshot, { type: "write" }, { draftReady: true });
    snapshot = reduceAiCampaign(snapshot, { type: "review" }, { reviewScore: 74 });
    expect(snapshot.reviewRounds).toBe(3);
    expect(decideAiCampaignTick(snapshot)).toMatchObject({ type: "needs_staff" });
    expect(reduceAiCampaign(snapshot, decideAiCampaignTick(snapshot)).status).toBe("NEEDS_STAFF");
  });

  it("has no staff approval between a passing writing check and sending", () => {
    const steps: string[] = [];
    let snapshot = aiCampaignSnapshot({
      status: "REVIEWING",
      reviewScore: 76,
      reviewRounds: 1,
      draftReady: true,
      contactsSourced: 5,
      targetContactCount: 5,
      pendingWork: 5,
    });
    const outcomes = [
      { templatesApproved: true },
      { sequencePrepared: true },
      { introStarted: true },
    ];
    for (const outcome of outcomes) {
      const decision = decideAiCampaignTick(snapshot);
      steps.push(decision.type);
      expect(decision.type).not.toBe("needs_staff");
      snapshot = reduceAiCampaign(snapshot, decision, outcome);
    }
    expect(steps).toEqual(["approve", "prepare", "launch"]);
    expect(snapshot.status).toBe("RUNNING");
    expect(decideAiCampaignTick(snapshot).type).toBe("run");
  });

  it("approves once a later check reaches the threshold", () => {
    const reviewed = aiCampaignSnapshot({ status: "REVIEWING", reviewScore: 80, reviewRounds: 2, draftReady: true });
    const decision = decideAiCampaignTick(reviewed);
    expect(decision).toEqual({ type: "approve" });
    const prepared = reduceAiCampaign(reviewed, decision, { templatesApproved: true });
    expect(prepared.status).toBe("PREPARING");
    const launching = reduceAiCampaign(prepared, { type: "prepare" }, { sequencePrepared: true });
    expect(launching.status).toBe("LAUNCHING");
    const running = reduceAiCampaign(launching, { type: "launch" }, { introStarted: true });
    expect(running.status).toBe("RUNNING");
  });

  it("does not approve when the approval step did not succeed", () => {
    const reviewed = aiCampaignSnapshot({ status: "REVIEWING", reviewScore: 90, reviewRounds: 1 });
    expect(reduceAiCampaign(reviewed, { type: "approve" }, {}).status).toBe("REVIEWING");
  });
});

describe("pause, resume, stop, and the kill switch", () => {
  it("pauses and resumes the same stage", () => {
    const running = aiCampaignSnapshot({ status: "RUNNING", introStarted: true, pendingWork: 2 });
    const paused = reduceAiCampaign(running, decideAiCampaignTick(running, "pause"));
    expect(paused.status).toBe("PAUSED");
    expect(paused.resumeStatus).toBe("RUNNING");
    expect(decideAiCampaignTick(paused).type).toBe("idle");
    const resumed = reduceAiCampaign(paused, decideAiCampaignTick(paused, "resume"));
    expect(resumed.status).toBe("RUNNING");
    expect(resumed.resumeStatus).toBeNull();
  });

  it("stops from a pause and does not resume a stopped campaign", () => {
    const paused = aiCampaignSnapshot({ status: "PAUSED", resumeStatus: "SOURCING" });
    const stopped = reduceAiCampaign(paused, decideAiCampaignTick(paused, "stop"));
    expect(stopped.status).toBe("STOPPED");
    expect(decideAiCampaignTick(stopped, "resume").type).toBe("idle");
    expect(decideAiCampaignTick(stopped).type).toBe("idle");
  });

  it("holds the current stage when the kill switch is off and does not send", () => {
    const running = aiCampaignSnapshot({ status: "RUNNING", killSwitchOn: false, pendingWork: 4, introStarted: true });
    const decision = decideAiCampaignTick(running);
    expect(decision.type).toBe("hold");
    expect(reduceAiCampaign(running, decision).status).toBe("RUNNING");
  });

  it("still lets staff stop a campaign while the switch is off", () => {
    const running = aiCampaignSnapshot({ status: "RUNNING", killSwitchOn: false });
    expect(decideAiCampaignTick(running, "stop").type).toBe("stop");
  });
});

describe("running campaign stop conditions", () => {
  it("finishes when the end date has passed", () => {
    const running = aiCampaignSnapshot({
      status: "RUNNING",
      introStarted: true,
      pendingWork: 3,
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(decideAiCampaignTick(running)).toMatchObject({ type: "complete" });
  });

  it("tops up while people are still wanted and the ready pool is thin", () => {
    const running = aiCampaignSnapshot({
      status: "RUNNING",
      introStarted: true,
      contactsSourced: 4,
      targetContactCount: 20,
      unenrolledReady: 1,
      pendingWork: 1,
      creditsAllowed: 3,
    });
    expect(decideAiCampaignTick(running)).toEqual({ type: "source" });
  });

  it("keeps sending when people are still in the sequence", () => {
    const running = aiCampaignSnapshot({
      status: "RUNNING",
      introStarted: true,
      contactsSourced: 20,
      targetContactCount: 20,
      pendingWork: 5,
      unenrolledReady: 0,
    });
    expect(decideAiCampaignTick(running)).toEqual({ type: "run" });
  });

  it("finishes when the target is met and nobody is left to email", () => {
    const running = aiCampaignSnapshot({
      status: "RUNNING",
      introStarted: true,
      contactsSourced: 20,
      targetContactCount: 20,
      pendingWork: 0,
    });
    expect(decideAiCampaignTick(running).type).toBe("complete");
  });
});

describe("prepare before launch", () => {
  it("PREPARING with approved templates still prepares when no step sends exist yet", () => {
    const snapshot = aiCampaignSnapshot({
      status: "PREPARING",
      templatesApproved: true,
      sequencePrepared: false,
      draftReady: true,
      killSwitchOn: true,
      reviewScore: 76,
      reviewRounds: 1,
    });
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "prepare" });
  });

  it("PREPARING launches only after sequencePrepared is true", () => {
    const snapshot = aiCampaignSnapshot({
      status: "PREPARING",
      templatesApproved: true,
      sequencePrepared: true,
      draftReady: true,
      killSwitchOn: true,
      reviewScore: 76,
      reviewRounds: 1,
    });
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "launch" });
  });
});

describe("repeated failures", () => {
  it("asks for a person after the failure limit and not before", () => {
    let snapshot = aiCampaignSnapshot();
    const first = noteStageFailure(snapshot, "The writing service did not answer.");
    expect(first.snapshot.status).toBe("SOURCING");
    expect(first.snapshot.consecutiveFailures).toBe(1);
    snapshot = first.snapshot;
    snapshot = noteStageFailure(snapshot, "The writing service did not answer.").snapshot;
    const third = noteStageFailure(snapshot, "The writing service did not answer.");
    expect(third.snapshot.status).toBe("NEEDS_STAFF");
    expect(third.decision.type).toBe("needs_staff");
  });
});

const TRANSIENT_WRITING_FAILURES = [
  "xai_timeout: exceeded 180000ms",
  "xai_http_429: resource_exhausted",
  "xai_http_429: The model is at capacity due to high demand",
] as const;

describe("transient provider failures", () => {
  it("stays on WRITING through three capacity and timeout failures", () => {
    let snapshot = aiCampaignSnapshot({ status: "WRITING", draftReady: false, consecutiveFailures: 0 });
    const now = new Date("2026-09-30T12:00:00.000Z");
    for (const message of TRANSIENT_WRITING_FAILURES) {
      const noted = noteStageFailure(snapshot, message);
      expect(noted.snapshot.status).toBe("WRITING");
      expect(noted.snapshot.consecutiveFailures).toBe(0);
      expect(noted.decision.type).toBe("hold");
      if (noted.decision.type === "hold") {
        expect(noted.decision.reason).toMatch(/try this step again shortly/i);
        expect(noted.decision.reason).not.toMatch(/member of staff|xai_|429/i);
      }
      const plan = resolveAiCampaignTickFailure(snapshot, message, now);
      expect(plan.snapshot.status).toBe("WRITING");
      expect(plan.holdUnsentMail).toBe(false);
      expect(plan.jobError).toBeNull();
      expect(plan.eventKind).toBe("info");
      expect(plan.eventMessage).toMatch(/try this step again shortly/i);
      expect(plan.staffAlert).toBe(plan.eventMessage);
      expect(plan.nextActionAt?.toISOString()).toBe(
        new Date(now.getTime() + AI_CAMPAIGN_TICK_BACKOFF_MS).toISOString(),
      );
      snapshot = noted.snapshot;
    }
    expect(snapshot.status).toBe("WRITING");
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "write" });
  });

  it("keeps REVIEWING and REVISING on the same step when the provider is down", () => {
    for (const status of ["REVIEWING", "REVISING"] as const) {
      const snapshot = aiCampaignSnapshot({ status, draftReady: true, consecutiveFailures: 2 });
      const noted = noteStageFailure(snapshot, "xai_http_503: overloaded");
      expect(noted.snapshot.status).toBe(status);
      expect(noted.snapshot.consecutiveFailures).toBe(2);
      expect(noted.decision.type).toBe("hold");
      const plan = resolveAiCampaignTickFailure(snapshot, "xai_network: fetch failed ECONNRESET", snapshot.now);
      expect(plan.holdUnsentMail).toBe(false);
      expect(plan.snapshot.status).toBe(status);
    }
  });

  it("does not let transient failures use up the staff limit", () => {
    let snapshot = aiCampaignSnapshot({ status: "WRITING" });
    snapshot = noteStageFailure(snapshot, "xai_timeout: exceeded 180000ms").snapshot;
    snapshot = noteStageFailure(snapshot, "xai_http_503: unavailable").snapshot;
    snapshot = noteStageFailure(snapshot, "The emails could not be checked.").snapshot;
    expect(snapshot.status).toBe("WRITING");
    expect(snapshot.consecutiveFailures).toBe(1);
    snapshot = noteStageFailure(snapshot, "HTTP 429: resource-exhausted").snapshot;
    expect(snapshot.consecutiveFailures).toBe(1);
    snapshot = noteStageFailure(snapshot, "The emails could not be checked.").snapshot;
    const third = noteStageFailure(snapshot, "no_api_key");
    expect(third.snapshot.status).toBe("NEEDS_STAFF");
    expect(third.decision.type).toBe("needs_staff");
    const plan = resolveAiCampaignTickFailure(snapshot, "no_api_key", snapshot.now);
    expect(plan.holdUnsentMail).toBe(true);
    expect(plan.jobError).toBe("no_api_key");
    expect(plan.snapshot.status).toBe("NEEDS_STAFF");
  });

  it("treats timeouts, capacity, and 503 as retryable and leaves faults for staff", () => {
    const retryable = [
      "xai_timeout: exceeded 180000ms",
      "xai_http_429: resource-exhausted",
      "xai_http_429: model at capacity",
      "anthropic_http_503: overloaded",
      "xai_http_502: bad gateway",
      "xai_unreadable_body",
      "The operation was aborted due to timeout",
      "RocketReach search failed (HTTP 503): unavailable",
    ];
    for (const message of retryable) {
      expect(noteStageFailure(aiCampaignSnapshot({ status: "WRITING", consecutiveFailures: 2 }), message).snapshot.status).toBe(
        "WRITING",
      );
    }
    const faults = [
      "xai_http_401: invalid api key",
      "xai_http_400: request timeout field invalid",
      "xai_http_403: forbidden",
      "no_api_key",
      "ai_features_switched_off",
      "unusable_answer",
      "This person is on a do-not-contact list.",
      "No new email-sendable contacts to enroll.",
      "The mailbox has reached its daily limit.",
      "No admin is available to run this AI campaign.",
    ];
    for (const message of faults) {
      const noted = noteStageFailure(
        aiCampaignSnapshot({ status: "WRITING", consecutiveFailures: 2 }),
        message,
      );
      expect(noted.snapshot.status).toBe("NEEDS_STAFF");
    }
  });
});


