import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_SKILLS_INDEX_JSON } from "../src/agent-skills";

/**
 * The published skills index carries a sha256 digest per skill. Those digests are
 * hand-maintained, so editing a SKILL.md without updating the index would
 * silently publish a digest that never matches the served file. This test
 * recomputes each digest from disk — the same drift guard the llms artifacts have.
 */

interface PublishedSkill {
  name: string;
  url: string;
  sha256: string;
}

const publishedSkills = (JSON.parse(AGENT_SKILLS_INDEX_JSON) as { skills: PublishedSkill[] }).skills;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("Agent skills index integrity", () => {
  it("publishes at least one skill", () => {
    expect(publishedSkills.length).toBeGreaterThan(0);
  });

  it.each(publishedSkills.map((skill) => [skill.name, skill.sha256] as const))(
    "publishes the real sha256 digest for %s",
    async (name, digest) => {
      const body = readFileSync(
        new URL(`../../web/public/.well-known/agent-skills/${name}/SKILL.md`, import.meta.url),
        "utf8"
      );
      expect(body.length).toBeGreaterThan(0);
      expect(await sha256Hex(body)).toBe(digest);
    }
  );
});
