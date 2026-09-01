/** Minimal, deliberately strict CSV writer for the RSVP export. */

/** Excel treats a leading =, +, -, @, tab or CR as the start of a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/u;

/**
 * Quotes and escapes a single cell.
 *
 * Every value is quoted rather than only the ones that need it: it keeps the
 * output unambiguous, and Turkish notes routinely contain the semicolons and
 * commas that would otherwise split a column. A value that could be read as a
 * formula is prefixed with an apostrophe so a spreadsheet shows the text instead
 * of evaluating it.
 */
export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';

  let text = String(value);

  /* Strip control characters that would corrupt the row structure. Matching
     control characters is the whole point here, so the rule does not apply.
     \t, \n and \r are deliberately left in: they are legal inside a quoted
     field and a guest's note may contain line breaks. */
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");

  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/gu, '""')}"`;
}

/** Joins one row. */
export function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsvValue).join(",");
}

/**
 * Builds a complete CSV document.
 *
 * CRLF line endings and a UTF-8 byte order mark, because that is what a Turkish
 * Windows Excel needs in order to show ğ, ş and ı instead of mojibake.
 */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
