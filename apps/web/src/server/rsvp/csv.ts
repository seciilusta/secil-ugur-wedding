const FORMULA_PREFIX = /^[=+\-@\t\r]/u;

export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';

  let text = String(value);
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsvValue).join(",");
}

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return `\uFEFF${[toCsvRow(headers), ...rows.map(toCsvRow)].join("\r\n")}\r\n`;
}
