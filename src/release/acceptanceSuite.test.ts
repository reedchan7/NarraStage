import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  acceptanceAssetFixtures,
  acceptanceCaseSha256,
  acceptanceFixtureBytes,
  acceptanceProfiles,
  type AcceptanceCase,
} from "@/release/acceptanceSuite";
import { releaseTargets } from "@/release/supportMatrix";

describe("frozen provider product acceptance suite", () => {
  test("binds every declared asset fixture to its checked-in bytes", async () => {
    for (const [fixtureId, fixture] of Object.entries(acceptanceAssetFixtures)) {
      expect(
        createHash("sha256")
          .update(
            await acceptanceFixtureBytes(
              process.cwd(),
              fixtureId as keyof typeof acceptanceAssetFixtures,
            ),
          )
          .digest("hex"),
      ).toBe(fixture.sha256);
    }
  });

  test("covers every release target with unique complete case definitions", () => {
    for (const target of releaseTargets) {
      const profile = acceptanceProfiles[target.offeringId];
      expect(profile).toBeDefined();
      expect(new Set(profile.cases.map((entry) => entry.id)).size).toBe(profile.cases.length);
      for (const acceptanceCase of profile.cases) {
        expect(acceptanceCase.input.prompt.length).toBeGreaterThan(0);
        expect(acceptanceCase.expectedFacts.length).toBeGreaterThan(0);
        expect(acceptanceCase.deterministicAssertions.length).toBeGreaterThan(0);
        expect(acceptanceCase.hardFailureDefinitions.length).toBeGreaterThan(0);
        expect(acceptanceCaseSha256(acceptanceCase)).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  test("freezes tools, Search, Omni continuation, and Veo control cases", () => {
    expect(
      acceptanceProfiles["google:gemini-3.7-flash:official"].cases.map((entry) => entry.id),
    ).toEqual(
      expect.arrayContaining(["tool-call-weather", "search-grounding", "video-understanding"]),
    );
    expect(
      acceptanceProfiles["google:gemini-3.7-flash:official"].cases.map((entry) => entry.id),
    ).toEqual(expect.arrayContaining(["audio-understanding", "pdf-understanding"]));
    expect(
      acceptanceProfiles["google:gemini-omni-flash:official"].cases.map(
        (entry) => entry.input.mode,
      ),
    ).toEqual(expect.arrayContaining(["text", "images", "edit"]));
    expect(
      acceptanceProfiles["google:veo-3.1:official"].cases.map((entry) => entry.input.mode),
    ).toEqual(expect.arrayContaining(["text", "keyframes", "reference", "extend"]));
    expect(
      acceptanceProfiles["google:veo-3.1-lite:official"].cases.map((entry) => entry.input.mode),
    ).not.toEqual(expect.arrayContaining(["reference", "extend"]));
  });

  test("changes the case digest when a frozen prompt or expected fact changes", () => {
    const source = acceptanceProfiles["deepseek:v4-pro:official"].cases[0]!;
    const changed = {
      ...source,
      input: { ...source.input, prompt: `${source.input.prompt} changed` },
    } as AcceptanceCase;
    expect(acceptanceCaseSha256(changed)).not.toBe(acceptanceCaseSha256(source));
  });
});
