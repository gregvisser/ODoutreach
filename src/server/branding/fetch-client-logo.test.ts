import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { fetchClientLogoBytes } from "./fetch-client-logo";

const publicLookup = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);

function responseFor(args: {
  status: number;
  body: string | Uint8Array;
  contentType: string;
}): Response {
  const bytes = typeof args.body === "string" ? new TextEncoder().encode(args.body) : args.body;
  return new Response(Buffer.from(bytes), {
    status: args.status,
    headers: { "content-type": args.contentType },
  });
}

beforeEach(() => {
  publicLookup.mockClear();
});

describe("fetchClientLogoBytes", () => {
  it("returns a png when the host and bytes are public image data", async () => {
    const png = new Uint8Array(16);
    png[0] = 0x89;
    png[1] = 0x50;
    const fetchImpl = vi.fn(async () =>
      responseFor({ status: 200, body: png, contentType: "image/png" }),
    );

    const logo = await fetchClientLogoBytes("https://cdn.example/logo.png", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupImpl: publicLookup as never,
    });

    expect(logo?.contentType).toBe("image/png");
    expect(logo?.body[0]).toBe(0x89);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null when the customer site refuses the image", async () => {
    const fetchImpl = vi.fn(async () =>
      responseFor({ status: 403, body: "forbidden", contentType: "text/html" }),
    );
    const logo = await fetchClientLogoBytes(
      "https://renewabletemporarypower.co.uk/wp-content/uploads/2022/05/rtp-logo.svg",
      { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicLookup as never },
    );
    expect(logo).toBeNull();
  });

  it("returns null when DNS resolves to a private address", async () => {
    const fetchImpl = vi.fn();
    const logo = await fetchClientLogoBytes("https://cdn.example/logo.png", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupImpl: vi.fn(async () => [{ address: "10.1.2.3", family: 4 }]) as never,
    });
    expect(logo).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an svg that contains a script", async () => {
    const fetchImpl = vi.fn(async () =>
      responseFor({
        status: 200,
        body: "<svg><script>alert(1)</script></svg>",
        contentType: "image/svg+xml",
      }),
    );
    const logo = await fetchClientLogoBytes("https://cdn.example/logo.svg", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupImpl: publicLookup as never,
    });
    expect(logo).toBeNull();
  });
});
