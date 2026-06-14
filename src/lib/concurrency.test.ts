import { describe, expect, it } from "vitest";

import { createLimiter } from "./concurrency";

// Flush both the microtask queue and one macrotask turn so every task the
// limiter is willing to start has reached its manual gate.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createLimiter", () => {
  it("runs at most `limit` tasks at once and never over-subscribes", async () => {
    const limit = 3;
    const run = createLimiter(limit);
    let active = 0;
    let maxActive = 0;
    const gates: Array<() => void> = [];

    const tasks = Array.from({ length: 10 }, (_, i) =>
      run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => {
          gates.push(resolve);
        });
        active -= 1;
        return i;
      }),
    );

    await tick();
    // Only `limit` tasks should have started; the rest wait for a slot.
    expect(gates.length).toBe(limit);
    expect(active).toBe(limit);

    // Releasing the earliest-started task must admit exactly one more, and
    // in-flight count must never exceed the limit at any point.
    for (let released = 0; released < tasks.length; released += 1) {
      gates[released]?.();
      await tick();
      expect(active).toBeLessThanOrEqual(limit);
    }

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxActive).toBe(limit);
  });

  it("runs everything concurrently when limit >= task count", async () => {
    const run = createLimiter(10);
    let active = 0;
    let maxActive = 0;
    const gates: Array<() => void> = [];

    Array.from({ length: 4 }, () =>
      run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => {
          gates.push(resolve);
        });
        active -= 1;
      }),
    );

    await tick();
    expect(maxActive).toBe(4);
    gates.forEach((g) => g());
  });

  it("clamps a non-positive limit to 1 (serial execution)", async () => {
    const run = createLimiter(0);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return i;
      }),
    );

    expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(1);
  });

  it("releases the slot when a task rejects so queued tasks still run", async () => {
    const run = createLimiter(1);
    const ran: string[] = [];

    const failing = run(async () => {
      throw new Error("boom");
    });
    const following = run(async () => {
      ran.push("b");
      return "b";
    });

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("b");
    expect(ran).toEqual(["b"]);
  });

  it("preserves result order regardless of completion order", async () => {
    const run = createLimiter(2);
    const out = await Promise.all(
      [30, 10, 20, 0].map((delay, i) =>
        run(
          () =>
            new Promise<number>((resolve) => {
              setTimeout(() => resolve(i), delay);
            }),
        ),
      ),
    );
    expect(out).toEqual([0, 1, 2, 3]);
  });
});
