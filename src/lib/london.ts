export function londonDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function londonDayStart(day = londonDay()): Date {
  // London midnight for the given civil date. The offset is only used for
  // "new today" counts, so a fixed parse of the ISO date is close enough
  // when we compare timestamptz values from Postgres using an explicit range.
  return new Date(`${day}T00:00:00+00:00`);
}
