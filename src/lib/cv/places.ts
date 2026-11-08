/** A CV part that is only a place is dropped: the writing rules forbid town and county. */

const PLACES = new Set(
  [
    "london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "liverpool", "bristol", "sheffield", "newcastle",
    "newcastle upon tyne", "nottingham", "leicester", "cardiff", "belfast", "coventry", "bradford", "southampton", "portsmouth",
    "brighton", "hull", "plymouth", "stoke", "stoke-on-trent", "wolverhampton", "derby", "swansea", "aberdeen", "dundee",
    "reading", "milton keynes", "northampton", "norwich", "york", "oxford", "cambridge", "exeter", "bath", "chester",
    "preston", "blackpool", "bolton", "sunderland", "middlesbrough", "huddersfield", "ipswich", "luton", "slough",
    "swindon", "gloucester", "cheltenham", "worcester", "lincoln", "carlisle", "inverness", "stirling", "perth",
    "bedfordshire", "berkshire", "buckinghamshire", "cambridgeshire", "cheshire", "cornwall", "cumbria", "derbyshire",
    "devon", "dorset", "durham", "county durham", "essex", "gloucestershire", "hampshire", "herefordshire",
    "hertfordshire", "kent", "lancashire", "leicestershire", "lincolnshire", "merseyside", "norfolk", "northamptonshire",
    "northumberland", "nottinghamshire", "oxfordshire", "rutland", "shropshire", "somerset", "staffordshire", "suffolk",
    "surrey", "sussex", "east sussex", "west sussex", "warwickshire", "wiltshire", "worcestershire", "yorkshire",
    "north yorkshire", "south yorkshire", "west yorkshire", "east yorkshire", "greater manchester", "greater london",
    "west midlands", "tyne and wear", "isle of wight", "fife", "lothian", "lanarkshire", "ayrshire", "gwynedd",
    "powys", "pembrokeshire", "antrim", "uk", "united kingdom", "england", "scotland", "wales", "northern ireland",
  ],
);

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export function isPlaceOnly(part: string): boolean {
  const text = part.replace(/[.()]/g, "").trim().toLowerCase();
  if (!text) return false;
  return PLACES.has(text) || POSTCODE.test(text) || OUTWARD.test(text);
}

/** Split a header on its separators and drop parts that are only a place. Unchanged lines stay verbatim. */
export function withoutPlaces(line: string): string | null {
  const parts = line.split(/\s*[|·•]\s*|,\s+/).map((part) => part.trim()).filter(Boolean);
  const kept = parts.filter((part) => !isPlaceOnly(part));
  if (kept.length === parts.length) return line.replace(/\s*\|\s*/g, " · ");
  if (kept.length === 0) return null;
  return kept.join(" · ");
}
