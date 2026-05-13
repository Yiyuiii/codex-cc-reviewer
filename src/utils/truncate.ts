export function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const markerFor = (omitted: number) => `\n\n[TRUNCATED ${omitted} chars from middle]\n\n`;
  const initialMarker = markerFor(value.length);
  const availableChars = Math.max(0, maxChars - initialMarker.length);
  const headChars = Math.ceil(availableChars * 0.6);
  const tailChars = Math.max(0, availableChars - headChars);
  const omitted = Math.max(0, value.length - headChars - tailChars);
  const marker = markerFor(omitted);

  return `${value.slice(0, headChars)}${marker}${tailChars ? value.slice(-tailChars) : ""}`;
}
