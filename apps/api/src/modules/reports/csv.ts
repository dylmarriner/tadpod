/**
 * Minimal RFC 4180 CSV serialization for report exports. Every reports endpoint accepts
 * `?format=csv` and reuses this — one escaping implementation, not one per report.
 */
export function toCsv(headings: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const escape = (value: string | number): string => {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [headings.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  return lines.join('\r\n') + '\r\n';
}
