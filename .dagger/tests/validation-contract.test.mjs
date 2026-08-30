import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"

import { validateBuildTime } from "../src/validation.ts"

const moduleSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8")

describe("Dagger deployment validation contract", () => {
  it("unmounts dependency caches before secret-bearing execution", () => {
    const validationInput = moduleSource.slice(
      moduleSource.indexOf("  private validationInput("),
      moduleSource.indexOf("  private validationCommand("),
    )
    assert.match(validationInput, /\.withoutMount\("\/root\/\.npm"\)/)
  })

  it("requires an explicit UTC build timestamp", () => {
    const timestamp = "2026-07-25T04:21:05.000Z"
    assert.equal(validateBuildTime(timestamp), timestamp)

    for (const invalid of [
      "",
      "2026-07-25",
      "2026-07-25T04:21:05+01:00",
      "not-a-date",
    ]) {
      assert.throws(() => validateBuildTime(invalid), /UTC build timestamp/)
    }
  })
})
