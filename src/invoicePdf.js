import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ---------- currencies ----------
export const INVOICE_CURRENCIES = {
  INR: { name: 'Indian Rupee', major: 'Indian Rupees', minor: 'Paise', locale: 'en-IN' },
  USD: { name: 'US Dollar', major: 'US Dollars', minor: 'Cents', locale: 'en-US' },
  EUR: { name: 'Euro', major: 'Euros', minor: 'Cents', locale: 'en-IE' },
  GBP: { name: 'British Pound', major: 'Pounds Sterling', minor: 'Pence', locale: 'en-GB' },
  SGD: { name: 'Singapore Dollar', major: 'Singapore Dollars', minor: 'Cents', locale: 'en-SG' },
  AED: { name: 'UAE Dirham', major: 'UAE Dirhams', minor: 'Fils', locale: 'en-AE' },
  AUD: { name: 'Australian Dollar', major: 'Australian Dollars', minor: 'Cents', locale: 'en-AU' },
  CAD: { name: 'Canadian Dollar', major: 'Canadian Dollars', minor: 'Cents', locale: 'en-CA' },
};

export function num(n, cur = 'INR') {
  const loc = INVOICE_CURRENCIES[cur]?.locale || 'en-US';
  return new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}
export const money = (n, cur = 'INR') => `${cur} ${num(n, cur)}`;

// ---------- totals (mirrors the database trigger) ----------
export function computeTotals(inv) {
  const lines = (inv.items || []).map((it) => Math.round((Number(it.qty) || 0) * (Number(it.rate) || 0) * 100) / 100);
  const subtotal = lines.reduce((a, b) => a + b, 0);
  const discount = Number(inv.discount) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const tax = Math.round(taxable * (Number(inv.tax_rate) || 0)) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;
  const paid = Number(inv.amount_paid) || 0;
  return { lines, subtotal, discount, taxable, tax, total, paid, balance: Math.round((total - paid) * 100) / 100 };
}

// ---------- amount in words ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  const parts = [];
  if (h) parts.push(ONES[h] + ' Hundred');
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : ''));
  return parts.join(' ');
}
function indian(n) {
  if (n === 0) return 'Zero';
  const out = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) out.push(indian(crore) + ' Crore');
  if (lakh) out.push(under1000(lakh) + ' Lakh');
  if (thousand) out.push(under1000(thousand) + ' Thousand');
  if (n) out.push(under1000(n));
  return out.join(' ');
}
function western(n) {
  if (n === 0) return 'Zero';
  const units = ['', ' Thousand', ' Million', ' Billion', ' Trillion'];
  const out = []; let i = 0;
  while (n > 0) { const chunk = n % 1000; if (chunk) out.unshift(under1000(chunk) + units[i]); n = Math.floor(n / 1000); i++; }
  return out.join(' ');
}
export function amountInWords(amount, cur = 'INR') {
  const c = INVOICE_CURRENCIES[cur] || { major: cur, minor: 'Cents' };
  const whole = Math.floor(Math.abs(amount) + 1e-9);
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const words = cur === 'INR' ? indian(whole) : western(whole);
  return `${c.major} ${words}${cents ? ` and ${cur === 'INR' ? indian(cents) : western(cents)} ${c.minor}` : ''} Only`;
}

const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// ---------- PDF ----------
const INK = [17, 17, 17], GRAY = [100, 102, 108], LIGHT = [150, 152, 158], RULE = [222, 222, 218], BAND = [246, 243, 237], LIME = [200, 240, 40];

export const PAYMENT_BANKS = { auto: 'Automatic', india: 'Indian account', us: 'US account (ACH & Fedwire)', both: 'Both accounts' };
export const hasUsBank = (c) => !!(c?.us_account_number || c?.us_ach_routing || c?.us_fedwire_routing);
// 'auto' prints the US account on USD invoices (when it is set up) and the Indian account otherwise.
export function resolvePaymentBank(inv, company) {
  const m = inv.payment_bank || 'auto';
  if (m !== 'auto') return m === 'us' && !hasUsBank(company) ? 'india' : m;
  return inv.currency === 'USD' && hasUsBank(company) ? 'us' : 'india';
}

export function buildInvoicePdf(inv, company = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, R = W - M;
  const t = computeTotals(inv);
  const cur = inv.currency || 'INR';
  doc.setProperties({ title: `Invoice ${inv.invoice_number || ''}`, author: company.legal_name || 'Chiplabs Solutions Pvt Ltd', subject: `Invoice for ${inv.client_name || ''}` });

  const text = (s, x, y, o = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : o.italic ? 'italic' : 'normal');
    doc.setFontSize(o.size || 9); doc.setTextColor(...(o.color || INK));
    doc.text(String(s ?? ''), x, y, { align: o.align || 'left', maxWidth: o.maxWidth, charSpace: o.charSpace });
  };
  const label = (s, x, y, align) => text(s.toUpperCase(), x, y, { size: 7, bold: true, color: LIGHT, align, charSpace: 0.3 });
  const wrap = (s, w, size = 9) => { doc.setFontSize(size); return doc.splitTextToSize(String(s || ''), w); };

  // ---- header ----
  doc.setFillColor(...LIME); doc.rect(M, 14.2, 4.6, 4.6, 'F');
  text(company.legal_name || 'Chiplabs Solutions Pvt Ltd', M + 7, 18.6, { size: 15, bold: true });
  if (company.tagline) text(company.tagline, M + 7, 24, { size: 8, italic: true, color: GRAY });
  text('INVOICE', R, 19.5, { size: 22, bold: true, align: 'right', charSpace: 0.6 });
  text(inv.invoice_number || 'DRAFT', R, 26, { size: 10, color: GRAY, align: 'right' });
  const stamp = inv.status === 'paid' ? ['PAID', [23, 112, 63]] : inv.status === 'cancelled' ? ['CANCELLED', [180, 35, 35]] : inv.status === 'draft' ? ['DRAFT', [138, 83, 0]] : null;
  if (stamp) {
    doc.setDrawColor(...stamp[1]); doc.setLineWidth(0.4);
    doc.setFontSize(8); const sw = doc.getTextWidth(stamp[0]) + 6;
    doc.roundedRect(R - sw, 29, sw, 5.5, 1, 1, 'S');
    text(stamp[0], R - sw / 2, 32.8, { size: 8, bold: true, color: stamp[1], align: 'center', charSpace: 0.4 });
  }
  doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(M, 38, R, 38);

  // ---- parties + details ----
  let y = 46;
  const colW = 56, c1 = M, c2 = M + 62, c3 = 136;
  label('From', c1, y); label('Bill to', c2, y); label('Invoice details', c3, y);
  // from
  let y1 = y + 5.5;
  text(company.legal_name || 'Chiplabs Solutions Pvt Ltd', c1, y1, { bold: true, size: 9.5 }); y1 += 4.6;
  for (const line of [...wrap(company.address, colW, 8.5), company.email, company.phone, company.website].filter(Boolean)) {
    text(line, c1, y1, { size: 8.5, color: GRAY }); y1 += 4;
  }
  const ids = [company.gstin && `GSTIN ${company.gstin}`, company.pan && `PAN ${company.pan}`, company.cin && `CIN ${company.cin}`].filter(Boolean);
  if (ids.length) { y1 += 1; for (const l of ids) { text(l, c1, y1, { size: 7.5, color: LIGHT }); y1 += 3.6; } }
  // bill to
  let y2 = y + 5.5;
  for (const l of wrap(inv.client_name, colW, 9.5)) { text(l, c2, y2, { bold: true, size: 9.5 }); y2 += 4.6; }
  for (const line of [inv.client_contact && `Attn: ${inv.client_contact}`, ...wrap(inv.client_address, colW, 8.5), inv.client_country, inv.client_email].filter(Boolean)) {
    text(line, c2, y2, { size: 8.5, color: GRAY }); y2 += 4;
  }
  if (inv.client_tax_id) { y2 += 1; text(`Tax ID ${inv.client_tax_id}`, c2, y2, { size: 7.5, color: LIGHT }); y2 += 3.6; }
  // details
  let y3 = y + 5.5;
  const det = [['Invoice no.', inv.invoice_number || 'Draft'], ['Issue date', fmtDate(inv.issue_date)], ['Due date', fmtDate(inv.due_date)],
    ['Currency', `${cur} – ${INVOICE_CURRENCIES[cur]?.name || cur}`], inv.service_period && ['Service period', inv.service_period], inv.po_number && ['PO / reference', inv.po_number],
    inv.export_lut && ['Place of supply', `Outside India${inv.client_country ? ` (${inv.client_country})` : ''}`]].filter(Boolean);
  for (const [k, v] of det) {
    text(k, c3, y3, { size: 8, color: GRAY });
    const vv = wrap(v, 36, 8.5);
    vv.forEach((l, i) => text(l, R, y3 + i * 3.8, { size: 8.5, bold: k === 'Due date' || k === 'Invoice no.', align: 'right' }));
    y3 += 4.6 + (vv.length - 1) * 3.8;
  }
  y = Math.max(y1, y2, y3) + 6;

  // ---- amount due band ----
  doc.setFillColor(...BAND); doc.rect(M, y, R - M, 13, 'F');
  label('Amount due', M + 4, y + 5.2);
  text(money(t.balance, cur), M + 4, y + 10.6, { size: 13, bold: true });
  label('Due date', 110, y + 5.2); text(fmtDate(inv.due_date), 110, y + 10.6, { size: 10, bold: true });
  if (inv.service_period) { label('For', 150, y + 5.2); text(wrap(inv.service_period, R - 150 - 3, 9)[0], 150, y + 10.6, { size: 9 }); }
  y += 20;

  // ---- items ----
  const shown = (inv.items || []).filter((it) => it.description || Number(it.rate));
  const hasSac = shown.some((it) => (it.sac || '').trim());
  const body = shown.map((it, i) => [
    String(i + 1),
    ...(hasSac ? [it.sac || ''] : []),
    { content: it.description + (it.details ? `\n${it.details}` : ''), _desc: it.description, _details: !!it.details },
    Number(it.qty || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }),
    it.unit || '',
    num(it.rate, cur),
    num(t.lines[(inv.items || []).indexOf(it)], cur),
  ]);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 24 },
    head: [['#', ...(hasSac ? ['SAC'] : []), 'Description', 'Qty', 'Unit', `Rate (${cur})`, `Amount (${cur})`]],
    body: body.length ? body : [['', ...(hasSac ? [''] : []), 'No line items', '', '', '', '']],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.8, textColor: INK, cellPadding: { top: 2.6, bottom: 2.6, left: 2.2, right: 2.2 }, lineColor: RULE, valign: 'top' },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 7.8, cellPadding: { top: 2.4, bottom: 2.4, left: 2.2, right: 2.2 } },
    bodyStyles: { lineWidth: { bottom: 0.2 } },
    columnStyles: hasSac
      ? { 0: { cellWidth: 8, halign: 'center', textColor: GRAY }, 1: { cellWidth: 17, textColor: GRAY }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 13, halign: 'right' }, 4: { cellWidth: 19 }, 5: { cellWidth: 26, halign: 'right' }, 6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } }
      : { 0: { cellWidth: 9, halign: 'center', textColor: GRAY }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 20 }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.section !== 'head') return;
      const k = d.column.index - (hasSac ? 1 : 0);
      if (d.column.index === 0) d.cell.styles.halign = 'center';
      else if (k === 2 || k >= 4) d.cell.styles.halign = 'right';
    },
    willDrawCell: (d) => {
      // render the optional detail line of a description in smaller grey text
      if (d.section === 'body' && d.column.index === (hasSac ? 2 : 1) && d.cell.raw?._details) {
        doc.setFontSize(8.8);
        const n = doc.splitTextToSize(d.cell.raw._desc, d.cell.width - 4.4).length;
        d.cell._rest = d.cell.text.slice(n);
        d.cell._n = n;
        d.cell.text = d.cell.text.slice(0, n);
      }
    },
    didDrawCell: (d) => {
      if (d.cell._rest?.length) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...GRAY);
        d.cell._rest.forEach((l, i) => doc.text(l, d.cell.x + 2.2, d.cell.y + 2.6 + 3.1 + d.cell._n * 3.6 + 0.4 + i * 3.4));
      }
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ---- totals ----
  const rows = [['Subtotal', num(t.subtotal, cur)]];
  if (t.discount) rows.push(['Discount', `– ${num(t.discount, cur)}`]);
  if (Number(inv.tax_rate)) rows.push([`${inv.tax_label || 'Tax'} (${Number(inv.tax_rate)}%)`, num(t.tax, cur)]);
  const needed = rows.length * 6 + 34 + (t.paid ? 14 : 0) + 40;
  if (y + needed > 297 - 24) { doc.addPage(); y = 20; }
  const tx = 120;
  let ty = y;
  for (const [k, v] of rows) { text(k, tx, ty + 4, { size: 8.8, color: GRAY }); text(v, R, ty + 4, { size: 8.8, align: 'right' }); ty += 6; }
  doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(tx, ty + 1, R, ty + 1);
  text('Total', tx, ty + 7, { size: 10.5, bold: true }); text(money(t.total, cur), R, ty + 7, { size: 10.5, bold: true, align: 'right' });
  ty += 10;
  if (t.paid) {
    text('Amount paid', tx, ty + 4, { size: 8.8, color: GRAY }); text(`– ${num(t.paid, cur)}`, R, ty + 4, { size: 8.8, align: 'right' }); ty += 6;
    doc.setFillColor(...BAND); doc.rect(tx - 2, ty, R - tx + 2, 8, 'F');
    text('Balance due', tx, ty + 5.4, { size: 9.5, bold: true }); text(money(t.balance, cur), R, ty + 5.4, { size: 9.5, bold: true, align: 'right' }); ty += 10;
  }
  // words (left of totals)
  label('Amount in words', M, y + 4);
  const words = wrap(amountInWords(t.total, cur), 92, 8.8);
  words.forEach((l, i) => text(l, M, y + 9 + i * 4.2, { size: 8.8, italic: true }));
  y = Math.max(ty, y + 9 + words.length * 4.2) + 8;

  // ---- GST export declaration (CGST Rule 46 wording) ----
  if (inv.export_lut) {
    const decl = 'SUPPLY MEANT FOR EXPORT UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX';
    const lut = [company.lut_arn && `LUT ARN: ${company.lut_arn}`, company.lut_fy && `FY ${company.lut_fy}`, company.gstin && `GSTIN: ${company.gstin}`].filter(Boolean).join('   ·   ');
    const dl = wrap(decl, R - M - 8, 8);
    const h = dl.length * 3.8 + (lut ? 4.6 : 0) + 5;
    if (y + h > 297 - 30) { doc.addPage(); y = 20; }
    doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.rect(M, y, R - M, h, 'S');
    dl.forEach((l, i) => text(l, M + 4, y + 5 + i * 3.8, { size: 8, bold: true }));
    if (lut) text(lut, M + 4, y + 5 + dl.length * 3.8 + 0.8, { size: 7.8, color: GRAY });
    y += h + 7;
  }

  // ---- payment + notes ----
  const mode = resolvePaymentBank(inv, company);
  const inBank = [['Account name', company.bank_account_name], ['Bank', company.bank_name], ['Branch', company.bank_branch], ['Account no.', company.bank_account_no], ['IFSC', company.bank_ifsc], ['SWIFT / BIC', company.bank_swift]].filter(([, v]) => v);
  const usBank = [['Beneficiary', company.us_beneficiary], ['Account no.', company.us_account_number], ['ACH routing', company.us_ach_routing], ['Fedwire ABA', company.us_fedwire_routing], ['Account type', company.us_account_type], ['Bank', company.us_bank_name], ['Bank address', company.us_bank_address]].filter(([, v]) => v);
  // rows: [label, value] or ['#', heading]
  const bank = mode === 'us' ? [['#', 'Bank transfer – ACH and Fedwire'], ...usBank]
    : mode === 'both' ? [...(inBank.length ? [['#', 'India (NEFT / RTGS / SWIFT)'], ...inBank] : []), ...(cur !== 'INR' && company.intl_payment_note ? [['~', company.intl_payment_note]] : []), ...(usBank.length ? [['#', 'US – ACH and Fedwire'], ...usBank] : [])]
    : inBank;
  const valLines = (k, v) => (k === '#' ? [v] : k === '~' ? wrap(v, 90, 7.8) : wrap(v, 66, 8.2));
  const tncText = inv.tnc === 'domestic' ? company.terms_domestic : inv.tnc === 'international' ? company.terms_international : '';
  const notes = [inv.notes, inv.terms, tncText && 'This invoice is subject to the Terms & Conditions on the following page.'].filter(Boolean).join('\n\n');
  const intl = cur !== 'INR' && mode === 'india' && company.intl_payment_note ? company.intl_payment_note : '';
  const leftH = bank.reduce((h, [k, v]) => h + valLines(k, v).length * 4.2 + (k === '#' ? 1.6 : 0.4), 0) + (intl ? wrap(intl, 78, 7.8).length * 3.6 + 3 : 0);
  const rightLines = wrap(notes, 78, 8.2);
  const boxH = Math.max(leftH, rightLines.length * 3.9) + 12;
  if (y + boxH > 297 - 24) { doc.addPage(); y = 20; }
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, y, R, y);
  label('Payment details', M, y + 6);
  let by = y + 11;
  if (bank.length) {
    bank.forEach(([k, v], idx) => {
      if (k === '#') { if (idx) by += 1.6; text(v, M, by, { size: 8.2, bold: true }); by += 4.6; return; }
      if (k === '~') { valLines(k, v).forEach((l) => { text(l, M, by, { size: 7.8, color: GRAY }); by += 3.6; }); by += 0.6; return; }
      text(k, M, by, { size: 8.2, color: GRAY });
      valLines(k, v).forEach((l, li) => text(l, M + 24, by + li * 4.2, { size: 8.2, bold: k === 'Account no.' }));
      by += valLines(k, v).length * 4.2 + 0.4;
    });
  } else { text('Bank details not set. Add them in Company details.', M, by, { size: 8.2, color: LIGHT, italic: true }); by += 4.6; }
  if (intl) { by += 1; wrap(intl, 78, 7.8).forEach((l) => { text(l, M, by, { size: 7.8, color: GRAY }); by += 3.6; }); }
  if (notes) {
    label('Notes & terms', 112, y + 6);
    rightLines.forEach((l, i) => text(l, 112, y + 11 + i * 3.9, { size: 8.2, color: GRAY }));
  }
  y = Math.max(by, y + 11 + rightLines.length * 3.9) + 6;

  // ---- authorised signatory (GST Rule 46 asks for the supplier's signature) ----
  const sigH = 24;
  if (y + sigH > 270) { doc.addPage(); y = 20; }
  const sy = Math.max(y, 270 - sigH);
  text(company.footer_note || 'Thank you for your business.', M, sy + 3, { size: 8.5, bold: true });
  text(`For ${company.legal_name || 'Chiplabs Solutions Pvt Ltd'}`, R, sy + 3, { size: 8.2, bold: true, align: 'right' });
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(R - 60, sy + 16, R, sy + 16);
  text([company.signatory_name, company.signatory_title].filter(Boolean).join(', ') || 'Authorised Signatory', R, sy + 20, { size: 8, align: 'right' });
  if (company.signatory_name) text('Authorised Signatory', R, sy + 23.6, { size: 7.2, color: GRAY, align: 'right' });

  // ---- optional Terms & Conditions page ----
  if (tncText) {
    doc.addPage();
    doc.setFillColor(...LIME); doc.rect(M, 14.2, 3.6, 3.6, 'F');
    text(company.legal_name || 'Chiplabs Solutions Pvt Ltd', M + 5.6, 17.6, { size: 11, bold: true });
    text('TERMS & CONDITIONS', R, 17.8, { size: 11, bold: true, align: 'right', charSpace: 0.4 });
    text(`${inv.tnc === 'international' ? 'International' : 'Domestic'} clients  ·  Invoice ${inv.invoice_number || 'Draft'}`, R, 23, { size: 8, color: GRAY, align: 'right' });
    doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(M, 28, R, 28);
    let py = 37;
    for (const para of tncText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      const m = para.match(/^(\d+\.\s*[^.]{1,40}\.)\s*([\s\S]*)$/); // "1. Payment. Body…"
      const head = m ? m[1] : '';
      const body = wrap(m ? m[2] : para, R - M - 10, 8.6);
      const need = (head ? 5 : 0) + body.length * 4.2 + 4;
      if (py + need > 272) { doc.addPage(); py = 22; }
      if (head) { text(head, M, py, { size: 8.8, bold: true }); py += 5; }
      body.forEach((l) => { text(l, head ? M + 4.5 : M, py, { size: 8.6, color: [60, 62, 66] }); py += 4.2; });
      py += 4;
    }
  }

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, 281, R, 281);
    const left = [company.legal_name || 'Chiplabs Solutions Pvt Ltd', company.cin && `CIN ${company.cin}`, company.website].filter(Boolean).join('  ·  ');
    text(left, M, 286, { size: 7, color: LIGHT });
    text(`${inv.invoice_number || 'Draft'}  ·  Page ${p} of ${pages}`, R, 286, { size: 7, color: LIGHT, align: 'right' });
  }
  return doc;
}

export function invoiceFileName(inv) {
  const safe = (s) => String(s || '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `Invoice_${safe(inv.invoice_number || 'Draft')}_${safe(inv.client_name)}.pdf`;
}
export function downloadInvoicePdf(inv, company) { buildInvoicePdf(inv, company).save(invoiceFileName(inv)); }
export function previewInvoicePdf(inv, company) { window.open(buildInvoicePdf(inv, company).output('bloburl'), '_blank'); }
