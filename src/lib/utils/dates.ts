const MS_PER_DAY = 86_400_000;

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  return Math.max(1, Math.round((end - start) / MS_PER_DAY));
}

export function formatDateShort(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatDateLong(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateRange(checkIn: string, checkOut: string): string {
  return `${formatDateShort(checkIn)} – ${formatDateShort(checkOut)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatSegmentSchedule(
  departure: string,
  arrival: string,
  origin: string,
  destination: string,
): string {
  const depDay = formatDateShort(departure);
  const arrDay = formatDateShort(arrival);
  const timeRange = `${formatTime(departure)} ${origin} → ${formatTime(arrival)} ${destination}`;
  return depDay === arrDay ? timeRange : `${timeRange} · ${depDay}–${arrDay}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
