import { describe, expect, it } from "vitest";

import { aiCampaignDecisionMessage } from "./copy";
import { AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT } from "./policy";
import {
  aiCampaignSnapshot,
  decideAiCampaignTick,
  noteStageFailure,
  reduceAiCampaign,
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
  it("keeps rewriting while the score stays under 75, including after three checks", () => {
    let snapshot = aiCampaignSnapshot({ status: "REVIEWING", draftReady: true });
    expect(snapshot.maxReviewRounds).toBe(AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT);
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "review" });

    const scores = [68, 70, 72, 74];
    for (const score of scores) {
      snapshot = reduceAiCampaign(snapshot, { type: "review" }, { reviewScore: score });
      expect(snapshot.reviewScore).toBe(score);
      const decision = decideAiCampaignTick(snapshot);
      expect(decision).toEqual({ type: "revise" });
      expect(decision.type).not.toBe("needs_staff");
      const timeline = aiCampaignDecisionMessage(decision);
      expect(timeline).toMatch(/below the line/);
      expect(timeline).toMatch(/rewritten/);
      expect(timeline).not.toMatch(/waiting for a member of staff/i);
      snapshot = reduceAiCampaign(snapshot, decision);
      expect(snapshot.status).toBe("REVISING");
      expect(snapshot.status).not.toBe("NEEDS_STAFF");
      snapshot = reduceAiCampaign(snapshot, { type: "write" }, { draftReady: true });
    }
    expect(snapshot.reviewRounds).toBe(4);
  });

  it("keeps rewriting a score of 72 after three or more checks", () => {
    for (const reviewRounds of [3, 4, 10]) {
      const snapshot = aiCampaignSnapshot({
        status: "REVIEWING",
        reviewScore: 72,
        reviewRounds,
        draftReady: true,
      });
      const decision = decideAiCampaignTick(snapshot);
      expect(decision).toEqual({ type: "revise" });
      expect(reduceAiCampaign(snapshot, decision).status).toBe("REVISING");
    }
  });

  it("asks for a person only after the runaway ceiling, not after a low score of 72", () => {
    const stillRewriting = aiCampaignSnapshot({
      status: "REVIEWING",
      reviewScore: 72,
      reviewRounds: AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT - 1,
      draftReady: true,
    });
    expect(decideAiCampaignTick(stillRewriting)).toEqual({ type: "revise" });

    const ceiling = aiCampaignSnapshot({
      status: "REVIEWING",
      reviewScore: 72,
      reviewRounds: AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT,
      draftReady: true,
    });
    const decision = decideAiCampaignTick(ceiling);
    expect(decision.type).toBe("needs_staff");
    expect(reduceAiCampaign(ceiling, decision).status).toBe("NEEDS_STAFF");
    if (decision.type === "needs_staff") {
      expect(decision.reason).toMatch(/below the line/);
      expect(decision.reason).toMatch(/were not sent/);
      expect(decision.reason).toMatch(new RegExp(`after ${String(AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT)} checks`));
    }
  });

  it("approves at 75 and never approves or sends below 75", () => {
    const passing = aiCampaignSnapshot({
      status: "REVIEWING",
      reviewScore: 75,
      reviewRounds: 4,
      draftReady: true,
    });
    expect(decideAiCampaignTick(passing)).toEqual({ type: "approve" });
    const prepared = reduceAiCampaign(passing, { type: "approve" }, { templatesApproved: true });
    expect(prepared.status).toBe("PREPARING");

    const latePass = aiCampaignSnapshot({
      status: "REVIEWING",
      reviewScore: 75,
      reviewRounds: AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT,
      draftReady: true,
    });
    expect(decideAiCampaignTick(latePass)).toEqual({ type: "approve" });

    const below = aiCampaignSnapshot({
      status: "REVIEWING",
      reviewScore: 74,
      reviewRounds: 12,
      draftReady: true,
    });
    expect(decideAiCampaignTick(below)).toEqual({ type: "revise" });
    const forced = reduceAiCampaign(below, { type: "approve" }, { templatesApproved: true });
    expect(forced.status).toBe("REVIEWING");
    expect(forced.templatesApproved).toBe(false);
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
    expect(first.retryable).toBe(false);
    expect(first.snapshot.status).toBe("SOURCING");
    expect(first.snapshot.consecutiveFailures).toBe(1);
    snapshot = first.snapshot;
    snapshot = noteStageFailure(snapshot, "The writing service did not answer.").snapshot;
    const third = noteStageFailure(snapshot, "The writing service did not answer.");
    expect(third.snapshot.status).toBe("NEEDS_STAFF");
    expect(third.decision.type).toBe("needs_staff");
    if (third.decision.type === "needs_staff") {
      expect(third.decision.reason).toMatch(/Waiting for a member of staff/);
      expect(third.decision.reason).toMatch(/The writing service did not answer/);
    }
  });

  it("stays on Writing when xAI returns 429 resource-exhausted and does not count it", () => {
    const writing = aiCampaignSnapshot({ status: "WRITING", consecutiveFailures: 2, draftReady: false });
    const noted = noteStageFailure(writing, "xai_http_429: resource-exhausted");
    expect(noted.retryable).toBe(true);
    expect(noted.snapshot.status).toBe("WRITING");
    expect(noted.snapshot.consecutiveFailures).toBe(2);
    expect(noted.decision).toMatchObject({ type: "hold" });
    if (noted.decision.type === "hold") {
      expect(noted.decision.reason).toMatch(/xAI busy, will retry/);
      expect(noted.decision.reason).toMatch(/capacity/);
    }
    expect(decideAiCampaignTick(noted.snapshot)).toEqual({ type: "write" });

    const running = aiCampaignSnapshot({
      status: "RUNNING",
      introStarted: true,
      pendingWork: 5,
      contactsSourced: 5,
      targetContactCount: 5,
    });
    const stillRunning = noteStageFailure(running, "xai_http_429: resource-exhausted");
    expect(stillRunning.retryable).toBe(true);
    expect(stillRunning.snapshot.status).toBe("RUNNING");
    expect(stillRunning.snapshot.consecutiveFailures).toBe(0);
    expect(decideAiCampaignTick(stillRunning.snapshot)).toEqual({ type: "run" });
  });

  it("stays Running when xAI times out and does not count it", () => {
    const running = aiCampaignSnapshot({
      status: "RUNNING",
      introStarted: true,
      pendingWork: 4,
      contactsSourced: 5,
      targetContactCount: 5,
      consecutiveFailures: 0,
    });
    const noted = noteStageFailure(running, "xai_timeout: exceeded 180000ms");
    expect(noted.retryable).toBe(true);
    expect(noted.snapshot.status).toBe("RUNNING");
    expect(noted.snapshot.consecutiveFailures).toBe(0);
    if (noted.decision.type === "hold") {
      expect(noted.decision.reason).toMatch(/xAI busy, will retry/);
      expect(noted.decision.reason).toMatch(/did not answer in time/);
    }
    expect(decideAiCampaignTick(noted.snapshot)).toEqual({ type: "run" });
  });

  it("does not ask for staff after many capacity and timeout failures", () => {
    let snapshot = aiCampaignSnapshot({ status: "WRITING" });
    const reasons = [
      "xai_http_429: resource-exhausted",
      "xai_timeout: exceeded 180000ms",
      "xai_http_429: model at capacity",
      "resource_exhausted",
      "xai_http_503: overloaded",
      "xai_network: fetch failed",
    ];
    for (const reason of reasons) {
      const noted = noteStageFailure(snapshot, reason);
      expect(noted.retryable).toBe(true);
      expect(noted.snapshot.status).toBe("WRITING");
      snapshot = noted.snapshot;
    }
    expect(snapshot.consecutiveFailures).toBe(0);
    expect(decideAiCampaignTick(snapshot)).toEqual({ type: "write" });
  });

  it("still asks for staff after three hard writing failures, including one between timeouts", () => {
    let snapshot = aiCampaignSnapshot({ status: "REVIEWING", draftReady: true });
    snapshot = noteStageFailure(snapshot, "unusable_answer").snapshot;
    snapshot = noteStageFailure(snapshot, "xai_timeout: exceeded 180000ms").snapshot;
    expect(snapshot.status).toBe("REVIEWING");
    expect(snapshot.consecutiveFailures).toBe(1);
    snapshot = noteStageFailure(snapshot, "xai_http_401: invalid api key").snapshot;
    const third = noteStageFailure(snapshot, "xai_http_400: invalid request");
    expect(third.retryable).toBe(false);
    expect(third.snapshot.status).toBe("NEEDS_STAFF");
    expect(third.snapshot.consecutiveFailures).toBe(3);
    expect(third.decision.type).toBe("needs_staff");
  });

  it("counts a mailbox capacity hold and an empty recipient list as hard failures", () => {
    const running = aiCampaignSnapshot({ status: "RUNNING", introStarted: true, pendingWork: 1 });
    const capacity = noteStageFailure(
      running,
      "Queued — sends automatically as mailbox capacity frees up.",
    );
    expect(capacity.retryable).toBe(false);
    expect(capacity.snapshot.status).toBe("RUNNING");
    expect(capacity.snapshot.consecutiveFailures).toBe(1);

    const empty = noteStageFailure(
      running,
      "No recipients are ready for this step. Open Review recipients, then launch again.",
    );
    expect(empty.retryable).toBe(false);
    expect(empty.snapshot.consecutiveFailures).toBe(1);
  });

  it("does not treat a rejected request that mentions timeout as capacity", () => {
    const writing = aiCampaignSnapshot({ status: "WRITING" });
    const noted = noteStageFailure(writing, "xai_http_400: request timeout field invalid");
    expect(noted.retryable).toBe(false);
    expect(noted.snapshot.status).toBe("WRITING");
    expect(noted.snapshot.consecutiveFailures).toBe(1);
  });
});


