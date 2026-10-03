import { afterEach, describe, expect, it } from "vitest";

import { XAI_CHAT_MODELS } from "@/lib/ai/model-catalog";

import {
  DEFAULT_XAI_MODEL,
  isProductAiConfigured,
  resolveProductAiApiKey,
  resolveProductAiModel,
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

describe("resolveProductAiApiKey", () => {
  it("reads XAI_API_KEY", () => {
    process.env.XAI_API_KEY = "xai-key";
    expect(resolveProductAiApiKey()).toBe("xai-key");
  });

  it("never falls back to another vendor's key", () => {
    process.env.ANTHROPIC_API_KEY = "ant-key";
    process.env.AI_MODEL_PROVIDER = "anthropic";
    expect(resolveProductAiApiKey()).toBeUndefined();
  });

  it("ignores a provider override and still uses xAI", () => {
    process.env.AI_MODEL_PROVIDER = "anthropic";
    process.env.XAI_API_KEY = "xai-key";
    expect(resolveProductAiApiKey()).toBe("xai-key");
  });
});

describe("isProductAiConfigured", () => {
  it("is true when XAI_API_KEY is set", () => {
    process.env.XAI_API_KEY = "xai-key";
    expect(isProductAiConfigured()).toBe(true);
  });

  it("is false when XAI_API_KEY is unset, even if an Anthropic key exists", () => {
    process.env.ANTHROPIC_API_KEY = "ant-key";
    expect(isProductAiConfigured()).toBe(false);
  });
});

describe("resolveProductAiModel", () => {
  it("uses XAI_MODEL or the default", () => {
    expect(resolveProductAiModel()).toBe(DEFAULT_XAI_MODEL);
    process.env.XAI_MODEL = "grok-4-6";
    expect(resolveProductAiModel()).toBe(XAI_CHAT_MODELS.GROK_4_6);
    process.env.XAI_MODEL = XAI_CHAT_MODELS.GROK_4_7;
    expect(resolveProductAiModel()).toBe("grok-4.7");
  });
});
