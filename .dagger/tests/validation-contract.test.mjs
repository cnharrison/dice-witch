import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { validateBuildTime } from "../src/validation.ts"

describe("Dagger deployment validation contract", () => {
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
