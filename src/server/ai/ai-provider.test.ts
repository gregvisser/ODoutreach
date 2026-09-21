import { afterEach, describe, expect, it } from "vitest";

import { XAI_CHAT_MODELS } from "@/lib/ai/model-catalog";

import {
  DEFAULT_XAI_MODEL,
  isProductAiConfigured,
  resolveProductAiApiKey,
  resolveProductAiModel,
  resolveProductAiProvider,
} from "./ai-provider";

function clearAiEnv(): void {
  delete process.env.AI_MODEL_PROVIDER;
  delete process.env.XAI_API_KEY;
  delete process.env.XAI_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
}

afterEach(() => {
  clearAiEnv();
});

describe("resolveProductAiProvider", () => {
  it("defaults to anthropic when no xAI key is configured", () => {
    expect(resolveProductAiProvider()).toBe("anthropic");
  });

  it("selects xai when AI_MODEL_PROVIDER=xai", () => {
    process.env.AI_MODEL_PROVIDER = "xai";
    expect(resolveProductAiProvider()).toBe("xai");
  });

  it("selects xai when XAI_API_KEY is set and provider is not forced anthropic", () => {
    process.env.XAI_API_KEY = "secret";
    expect(resolveProductAiProvider()).toBe("xai");
  });

  it("keeps anthropic when explicitly forced even if XAI_API_KEY is set", () => {
    process.env.AI_MODEL_PROVIDER = "anthropic";
    process.env.XAI_API_KEY = "secret";
    expect(resolveProductAiProvider()).toBe("anthropic");
  });
});

describe("resolveProductAiApiKey", () => {
  it("reads XAI_API_KEY for xai provider without Anthropic", () => {
    process.env.AI_MODEL_PROVIDER = "xai";
    process.env.XAI_API_KEY = "xai-key";
    expect(resolveProductAiApiKey()).toBe("xai-key");
    expect(resolveProductAiApiKey()).not.toBe(undefined);
  });

  it("reads ANTHROPIC_API_KEY for anthropic provider", () => {
    process.env.AI_MODEL_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "ant-key";
    expect(resolveProductAiApiKey()).toBe("ant-key");
  });
});

describe("isProductAiConfigured", () => {
  it("is true when the active provider has a key", () => {
    process.env.AI_MODEL_PROVIDER = "xai";
    process.env.XAI_API_KEY = "xai-key";
    expect(isProductAiConfigured()).toBe(true);
  });

  it("is false when the active provider has no key", () => {
    process.env.AI_MODEL_PROVIDER = "xai";
    expect(isProductAiConfigured()).toBe(false);
  });
});

describe("resolveProductAiModel", () => {
  it("uses XAI_MODEL or default for xai", () => {
    process.env.AI_MODEL_PROVIDER = "xai";
    expect(resolveProductAiModel("claude-haiku-4-5-20251001")).toBe(DEFAULT_XAI_MODEL);
    process.env.XAI_MODEL = XAI_CHAT_MODELS.GROK_4;
    expect(resolveProductAiModel("claude-haiku-4-5-20251001")).toBe(XAI_CHAT_MODELS.GROK_4);
  });

  it("passes through catalog model id for anthropic", () => {
    process.env.AI_MODEL_PROVIDER = "anthropic";
    expect(resolveProductAiModel("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
  });
});
