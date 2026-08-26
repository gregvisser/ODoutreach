import { describe, expect, it } from "vitest";

import {
  buildGettingStartedViewModel,
  type GettingStartedInput,
} from "./getting-started-view-model";

function baseInput(overrides: Partial<GettingStartedInput> = {}): GettingStartedInput {
  return {
    clientId: "c1",
    clientStatus: "ONBOARDING",
    briefStatus: "empty",
    connectedSendingCount: 0,
    suppressionSheetCount: 0,
    contactsTotal: 0,
    enrolledContactsCount: 0,
    hasProductionLaunchableSequence: false,
    outreachPilotRunnable: false,
    ...overrides,
  };
}

describe("buildGettingStartedViewModel", () => {
  it("returns all 8 steps with none done for a fresh onboarding client", () => {
    const vm = buildGettingStartedViewModel(baseInput());
    expect(vm.totalCount).toBe(8);
    expect(vm.completedCount).toBe(0);
    expect(vm.shouldRender).toBe(true);
    expect(vm.items.every((i) => !i.done)).toBe(true);
  });

  it("links each item under the client workspace base path", () => {
    const vm = buildGettingStartedViewModel(baseInput({ clientId: "abc" }));
    for (const item of vm.items) {
      expect(item.href.startsWith("/clients/abc")).toBe(true);
    }
  });

  it("marks brief done when brief status is ready", () => {
    const vm = buildGettingStartedViewModel(baseInput({ briefStatus: "ready" }));
    const brief = vm.items.find((i) => i.id === "brief");
    expect(brief?.done).toBe(true);
  });

  it("marks partial brief as not done", () => {
    const vm = buildGettingStartedViewModel(baseInput({ briefStatus: "partial" }));
    const brief = vm.items.find((i) => i.id === "brief");
    expect(brief?.done).toBe(false);
  });

  it("marks mailboxes done only when at least one is connected", () => {
    expect(
      buildGettingStartedViewModel(baseInput({ connectedSendingCount: 0 })).items.find(
        (i) => i.id === "mailboxes",
      )?.done,
    ).toBe(false);
    expect(
      buildGettingStartedViewModel(baseInput({ connectedSendingCount: 1 })).items.find(
        (i) => i.id === "mailboxes",
      )?.done,
    ).toBe(true);
  });

  it("marks suppression, contacts, templates, sequences, enrollments independently", () => {
    const vm = buildGettingStartedViewModel(
      baseInput({
        suppressionSheetCount: 1,
        contactsTotal: 20,
        hasProductionLaunchableSequence: true,
        enrolledContactsCount: 5,
      }),
    );
    const byId = Object.fromEntries(vm.items.map((i) => [i.id, i]));
    expect(byId.suppression?.done).toBe(true);
    expect(byId.contacts?.done).toBe(true);
    expect(byId.templates?.done).toBe(true);
    expect(byId.sequences?.done).toBe(true);
    expect(byId.enrollments?.done).toBe(true);
  });

  /**
   * CORRECTED 2026-08-26. This test used to be "launch item reflects
   * outreachPilotRunnable" and asserted `done: true` for a client with NO
   * launchable sequence and NO enrolments — because item 8 keyed off a mailbox
   * signal alone. That is how the bidlowai overview came to say "5 / 8
   * complete, workspace setup is incomplete" and "Ready to launch" on the same
   * card. Item 8 is now the same predicate as the readiness rail and the
   * launch gate.
   */
  describe("the launch checklist item cannot contradict the items above it", () => {
    const outreachLive = {
      briefStatus: "ready" as const,
      connectedSendingCount: 1,
      suppressionSheetCount: 1,
      contactsTotal: 3,
      outreachPilotRunnable: true,
    };

    it("is not done when there is no launchable sequence (the bidlowai case)", () => {
      const vm = buildGettingStartedViewModel(
        baseInput({
          ...outreachLive,
          hasProductionLaunchableSequence: false,
          enrolledContactsCount: 0,
        }),
      );
      const byId = Object.fromEntries(vm.items.map((i) => [i.id, i]));
      expect(byId.sequences?.done).toBe(false);
      expect(byId.enrollments?.done).toBe(false);
      // The contradiction: item 8 must not tick while 6 and 7 are untickd.
      expect(byId.launch?.done).toBe(false);
    });

    it("is not done when a sequence exists but nobody is enrolled", () => {
      expect(
        buildGettingStartedViewModel(
          baseInput({
            ...outreachLive,
            hasProductionLaunchableSequence: true,
            enrolledContactsCount: 0,
          }),
        ).items.find((i) => i.id === "launch")?.done,
      ).toBe(false);
    });

    it("is not done when the mailboxes cannot send, even with a full sequence", () => {
      expect(
        buildGettingStartedViewModel(
          baseInput({
            ...outreachLive,
            outreachPilotRunnable: false,
            hasProductionLaunchableSequence: true,
            enrolledContactsCount: 2,
          }),
        ).items.find((i) => i.id === "launch")?.done,
      ).toBe(false);
    });

    it("is done when all three are genuinely true", () => {
      expect(
        buildGettingStartedViewModel(
          baseInput({
            ...outreachLive,
            hasProductionLaunchableSequence: true,
            enrolledContactsCount: 2,
          }),
        ).items.find((i) => i.id === "launch")?.done,
      ).toBe(true);
    });
  });

  it("always renders while client status is ONBOARDING even if all items happen to be done", () => {
    const vm = buildGettingStartedViewModel(
      baseInput({
        clientStatus: "ONBOARDING",
        briefStatus: "ready",
        connectedSendingCount: 5,
        suppressionSheetCount: 2,
        contactsTotal: 100,
        hasProductionLaunchableSequence: true,
        enrolledContactsCount: 10,
        outreachPilotRunnable: true,
      }),
    );
    expect(vm.completedCount).toBe(8);
    expect(vm.shouldRender).toBe(true);
  });

  it("hides itself once client is ACTIVE and all items are done", () => {
    const vm = buildGettingStartedViewModel(
      baseInput({
        clientStatus: "ACTIVE",
        briefStatus: "ready",
        connectedSendingCount: 5,
        suppressionSheetCount: 2,
        contactsTotal: 100,
        hasProductionLaunchableSequence: true,
        enrolledContactsCount: 10,
        outreachPilotRunnable: true,
      }),
    );
    expect(vm.shouldRender).toBe(false);
  });

  it("still renders on ACTIVE when some items are incomplete", () => {
    const vm = buildGettingStartedViewModel(
      baseInput({
        clientStatus: "ACTIVE",
        briefStatus: "partial",
        connectedSendingCount: 1,
      }),
    );
    expect(vm.shouldRender).toBe(true);
  });
});
