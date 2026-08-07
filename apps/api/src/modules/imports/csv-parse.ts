/**
 * Minimal RFC 4180 CSV parser: quoted fields, embedded commas/newlines, and `""` as an escaped
 * quote — the exact inverse of `reports/csv.ts`'s `toCsv`, so a file this system exported can
 * always be re-imported unchanged. The first row is always treated as the header.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const source = text.replace(/^\uFEFF/, '');

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell !== '')) rows.push(row);
    row = [];
  };

  while (i < source.length) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field !== '' || row.length > 0) pushRow();

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return { headers: [], rows: [] };
  return { headers: headerRow.map((heading) => heading.trim()), rows: dataRows };
}

/** Turn one CSV data row into a header-keyed record, trimming every value. */
export function rowToRecord(headers: readonly string[], row: readonly string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((heading, index) => {
    record[heading] = (row[index] ?? '').trim();
  });
  return record;
}
