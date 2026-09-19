// Minimal RFC-4180 CSV parser: no dependency, small enough to own outright
// (ponytail: stdlib beats a library for ~60 lines). Handles quoted fields that
// contain commas, newlines and escaped quotes ("" inside a quoted field means
// one literal quote), and both \n and \r\n line endings.

export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1; // swallowed; the following \n (or end of record) closes the line
      continue;
    }
    if (c === "\n") {
      pushRecord();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || record.length > 0) pushRecord();

  // A blank line parses to a single empty field; none of our tables are
  // single-column, so drop those as line-ending noise rather than data rows.
  const cleaned = records.filter((r) => !(r.length === 1 && r[0] === ""));

  if (cleaned.length === 0) return { header: [], rows: [] };
  const [header, ...rows] = cleaned;
  return { header, rows };
}
