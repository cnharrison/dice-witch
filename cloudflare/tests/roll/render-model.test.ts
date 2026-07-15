import { describe, expect, it } from "vitest";
import { validateRenderRequest } from "../../packages/dice-svg/src/validate";
import { buildRollRenderRequest } from "../../packages/roll-render-model/src";
import { executeRoll } from "../../packages/roll-domain/src";

function outcome(notation: string[], seed = 0) {
  return executeRoll({ notation, seed });
}

describe("buildRollRenderRequest", () => {
  it("reproduces every visual choice from the persisted render seed", () => {
    const roll = outcome(["4d6k3", "d%", "4dF"]);

    const first = buildRollRenderRequest(roll, 0x1234_abcd);
    const replay = buildRollRenderRequest(roll, 0x1234_abcd);

    expect(replay).toEqual(first);
    expect(() => validateRenderRequest(first)).not.toThrow();
    expect(first.groups.map((group) => group.length)).toEqual([4, 2, 4]);
  });

  it("changes styling, but not faces or icons, with a different render seed", () => {
    const roll = outcome(["10d6!", "4d20min10"]);
    const first = buildRollRenderRequest(roll, 1);
    const second = buildRollRenderRequest(roll, 2);

    expect(second).not.toEqual(first);
    expect(
      second.groups.map((group) =>
        group.map(({ sides, rolled, icons }) => ({ sides, rolled, icons })),
      ),
    ).toEqual(
      first.groups.map((group) =>
        group.map(({ sides, rolled, icons }) => ({ sides, rolled, icons })),
      ),
    );
  });

  it("maps production modifier names to renderer icons in legacy order", () => {
    const roll = outcome([
      "4d1k2",
      "1d1cs=1",
      "1d1cf=1",
      "10d6!p",
      "4d20min10",
      "4d20max10",
      "10d6=6",
      "8d6u",
    ]);
    const request = buildRollRenderRequest(roll, 1);
    const icons = request.groups.flatMap((group) =>
      group.flatMap((die) => die.icons),
    );

    expect(icons).toContain("trashcan");
    expect(icons).toContain("critical-success");
    expect(icons).toContain("critical-failure");
    expect(icons).toContain("penetrate");
    expect(icons).not.toContain("explosion");
    expect(icons).toContain("chevronUp");
    expect(icons).toContain("chevronDown");
    expect(icons).toContain("target-success");
    expect(icons).toContain("unique");
  });

  it("uses legacy critical colors regardless of the render seed", () => {
    const request = buildRollRenderRequest(
      outcome(["1d1cs=1", "1d1cf=1"]),
      1,
    );

    expect(request.groups[0]?.[0]?.color).toBe("#ffcc00");
    expect(request.groups[1]?.[0]?.color).toBe("#ff3333");
  });

  it("keeps compound Fudge results renderable with legacy blank overflow faces", () => {
    const roll = outcome(["4dF!!"], 2);
    const request = buildRollRenderRequest(roll, 1);

    expect(() => validateRenderRequest(request)).not.toThrow();
  });

  it("rejects a roll result without renderable dice", () => {
    expect(() =>
      buildRollRenderRequest(outcome(["not-dice"]), 1),
    ).toThrow("Roll result has no renderable dice");
  });
});
