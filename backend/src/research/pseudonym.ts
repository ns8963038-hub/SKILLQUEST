// Pseudonymisation for the admin view and research exports (Backend Schema §5.1):
// participants appear as P01, P02… in sign-up order — never names, emails or USNs.

export function participantCode(index: number): string {
  return `P${String(index + 1).padStart(2, '0')}`;
}

// Enough of an email for the team to recognise a tester, not enough to expose it.
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return '•••';
  return `${user.slice(0, 2)}•••@${domain}`;
}

type Cell = string | number | boolean | null | undefined;

// Minimal RFC 4180 CSV: quote a cell when it contains a comma, quote or newline.
export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
