type EventLinkData = {
  id: string;
  name: string;
  startsAt: Date | string;
  venue?: {
    name?: string | null;
    location?: string | null;
  } | null;
};

export function eventHref(event: EventLinkData) {
  const date = new Date(event.startsAt).toISOString().slice(0, 10);
  const slug = [event.name, event.venue?.name, event.venue?.location, date]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `/events/${slug || "event"}--${event.id}`;
}