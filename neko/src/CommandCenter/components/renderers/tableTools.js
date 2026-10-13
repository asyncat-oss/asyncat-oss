// Sorting, filtering and copying the tables in answers (InteractiveTable).

/** A cell's plain text: markdown emphasis, code ticks and links reduced to their words. */
export function cellText(cell) {
  return String(cell ?? '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** The number a cell holds ("$1,200.50", "12%", "-3"), or null. */
export function cellNumber(cell) {
  const text = cellText(cell).replace(/^[$€£¥₹]\s*/, '').replace(/\s*%$/, '').replace(/,(?=\d{3}\b)/g, '');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

/** Numbers compare as numbers, the rest as words ("item 2" before "item 10"). */
export function compareCells(a, b) {
  const na = cellNumber(a);
  const nb = cellNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return cellText(a).localeCompare(cellText(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Rows sorted by one column ('asc' | 'desc'), empty cells last; the order is stable. */
export function sortRows(rows, column, direction = 'asc') {
  if (column === null || column === undefined) return rows;
  const sign = direction === 'desc' ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = x.row[column];
      const b = y.row[column];
      const emptyA = !cellText(a);
      const emptyB = !cellText(b);
      if (emptyA !== emptyB) return emptyA ? 1 : -1;
      return compareCells(a, b) * sign || x.index - y.index;
    })
    .map(({ row }) => row);
}

/** Rows with any cell containing every word of the query. */
export function filterRows(rows, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((row) => {
    const text = row.map(cellText).join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

function csvField(value) {
  const text = cellText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The table as CSV (header first). */
export function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
}
