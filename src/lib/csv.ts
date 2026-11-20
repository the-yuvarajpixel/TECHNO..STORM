/**
 * RFC 4180 CSV serializer with spreadsheet formula-injection protection and UTF-8 BOM
 * for audit log exports from Sentinel Overview and Log Vault views.
 */
function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Prevent CSV formula injection in spreadsheet tools
  if (/^[=+@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): void {
  const csv = buildCsvContent(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatAuditExportDate(): string {
  return new Date().toISOString().slice(0, 10);
}
