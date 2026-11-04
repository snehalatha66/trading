const MARKET_TIME_ZONE = "Asia/Kolkata";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT_DATE = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?(?:Z|\+00:00)$/;

export function marketDateOnly(value) {
  if (typeof value !== "string") return false;
  return DATE_ONLY.test(value) || UTC_MIDNIGHT_DATE.test(value);
}

export function formatMarketTime(value, { includeTime = true } = {}) {
  if (value === null || value === undefined || value === "") return null;

  let dateValue = value;
  if (typeof value === "number") {
    dateValue = value < 1e12 ? value * 1000 : value;
  } else if (typeof value === "string" && UTC_MIDNIGHT_DATE.test(value)) {
    dateValue = value.slice(0, 10);
  }

  if (typeof dateValue === "string" && DATE_ONLY.test(dateValue)) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 6));
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeZone: MARKET_TIME_ZONE,
    }).format(date);
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
    timeZone: MARKET_TIME_ZONE,
  }).format(parsed);
}
