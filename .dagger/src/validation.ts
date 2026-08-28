const UTC_BUILD_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

export function validateBuildTime(buildTime: string): string {
  if (
    !UTC_BUILD_TIME_PATTERN.test(buildTime) ||
    Number.isNaN(Date.parse(buildTime))
  ) {
    throw new Error("build time must be an explicit UTC build timestamp")
  }
  return buildTime
}
