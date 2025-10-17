import { normalizeLineEndings } from "./shared";

type CsvRecord = Record<string, string>;

type CsvOptions = {
  delimiter?: string;
  skipPrefix?: string;
};

export function parseCsv(content: string, options: CsvOptions = {}): CsvRecord[] {
  const delimiter = options.delimiter ?? ";";
  const skipPrefix = options.skipPrefix ?? "";

  const normalized = normalizeLineEndings(content);
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return [];
  }

  let headerLineIndex = 0;
  if (skipPrefix) {
    const [firstLine] = lines;
    if (firstLine?.trim().toUpperCase().startsWith(skipPrefix.toUpperCase())) {
      headerLineIndex = 1;
    }
  }

  const headerLine = lines[headerLineIndex];
  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split(delimiter).map((header) => header.trim());
  const records: CsvRecord[] = [];

  for (let index = headerLineIndex + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine || !rawLine.trim()) {
      continue;
    }

    const fragments = rawLine.split(delimiter);
    const record: CsvRecord = {};

    headers.forEach((header, position) => {
      const value = fragments[position] ?? "";
      record[header] = value.trim();
    });

    records.push(record);
  }

  return records;
}
