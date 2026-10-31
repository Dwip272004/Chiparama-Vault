import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { num, money, amountInWords } from './invoicePdf.js';

// Monthly invoice raised BY a team member TO Chiplabs Solutions Pvt Ltd.
// Uses the snapshots stored on the invoice (payee + bill_to), so the PDF never changes after submission.
const INK = [17, 17, 17], GRAY = [100, 102, 108], LIGHT = [150, 152, 158], RULE = [222, 222, 218], BAND = [246, 243, 237], LIME = [200, 240, 40];
const fmtDate = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const monthName = (m) => (m ? new Date(m.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');

/**
 * @param inv     row from pay_invoices
 * @param extra   { email, approvedBy } – the payee's login email and the approver's name, if any
 */
export function buildPayeeInvoicePdf(inv, extra = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, R = W - M;
  const p = inv.payee || {};
  const to = inv.bill_to || {};
  const cur = inv.currency || 'INR';
  const items = inv.items || [];
  const total = Number(inv.total) || items.reduce((s, x) => s + Number(x.amount || 0), 0);
  const period = monthName(inv.month);
  doc.setProperties({ title: `Invoice ${inv.invoice_number}`, author: p.full_name || '', subject: `Invoice to ${to.legal_name || 'Chiplabs Solutions Pvt Ltd'} for ${period}` });

  const text = (s, x, y, o = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : o.italic ? 'italic' : 'normal');
    doc.setFontSize(o.size || 9); doc.setTextColor(...(o.color || INK));
    doc.text(String(s ?? ''), x, y, { align: o.align || 'left' });
  };
  const label = (s, x, y, align) => text(s.toUpperCase(), x, y, { size: 7, bold: true, color: LIGHT, align });
  const wrap = (s, w, size = 9) => { doc.setFontSize(size); return doc.splitTextToSize(String(s || ''), w); };

  // ---- header: the person issuing the invoice ----
  doc.setFillColor(...LIME); doc.rect(M, 14.2, 4.6, 4.6, 'F');
  text(p.full_name || 'Name not set', M + 7, 18.6, { size: 15, bold: true });
  if (p.designation) text(p.designation, M + 7, 24, { size: 8.5, color: GRAY });
  text('INVOICE', R, 19.5, { size: 22, bold: true, align: 'right' });
  text(inv.invoice_number || '', R, 26, { size: 10, color: GRAY, align: 'right' });
  const stamp = {
    paid: ['PAID', [23, 112, 63]], approved: ['APPROVED', [23, 112, 63]], submitted: ['PENDING APPROVAL', [138, 83, 0]],
    rejected: ['SENT BACK', [180, 35, 35]], withdrawn: ['WITHDRAWN', [100, 102, 108]],
  }[inv.status];
  if (stamp) {
    doc.setDrawColor(...stamp[1]); doc.setLineWidth(0.4);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); const sw = doc.getTextWidth(stamp[0]) + 6;
    doc.roundedRect(R - sw, 29, sw, 5.5, 1, 1, 'S');
    text(stamp[0], R - sw / 2, 32.8, { size: 8, bold: true, color: stamp[1], align: 'center' });
  }
  doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(M, 38, R, 38);

  // ---- parties + details ----
  let y = 46;
  const colW = 56, c1 = M, c2 = M + 62, c3 = 136;
  label('From', c1, y); label('Bill to', c2, y); label('Invoice details', c3, y);
  let y1 = y + 5.5;
  for (const l of wrap(p.full_name, colW, 9.5)) { text(l, c1, y1, { bold: true, size: 9.5 }); y1 += 4.6; }
  for (const line of [...wrap(p.address, colW, 8.5), p.phone, extra.email].filter(Boolean)) { text(line, c1, y1, { size: 8.5, color: GRAY }); y1 += 4; }
  if (p.pan) { y1 += 1; text(`PAN ${p.pan}`, c1, y1, { size: 7.5, color: LIGHT }); y1 += 3.6; }

  let y2 = y + 5.5;
  for (const l of wrap(to.legal_name || 'Chiplabs Solutions Pvt Ltd', colW, 9.5)) { text(l, c2, y2, { bold: true, size: 9.5 }); y2 += 4.6; }
  for (const line of [...wrap(to.address, colW, 8.5), to.email, to.phone, to.website].filter(Boolean)) { text(line, c2, y2, { size: 8.5, color: GRAY }); y2 += 4; }
  const ids = [to.gstin && `GSTIN ${to.gstin}`, to.pan && `PAN ${to.pan}`].filter(Boolean);
  if (ids.length) { y2 += 1; for (const l of ids) { text(l, c2, y2, { size: 7.5, color: LIGHT }); y2 += 3.6; } }

  let y3 = y + 5.5;
  const det = [['Invoice no.', inv.invoice_number], ['Invoice date', fmtDate(inv.issue_date)], ['Billing period', period], ['Currency', cur === 'INR' ? 'INR – Indian Rupee' : cur]];
  if (p.start_date) det.push(['Engaged since', fmtDate(p.start_date)]);
  for (const [k, v] of det) {
    text(k, c3, y3, { size: 8, color: GRAY });
    text(v, R, y3, { size: 8.5, bold: k === 'Invoice no.' || k === 'Billing period', align: 'right' });
    y3 += 4.6;
  }
  y = Math.max(y1, y2, y3) + 6;

  // ---- amount band ----
  doc.setFillColor(...BAND); doc.rect(M, y, R - M, 13, 'F');
  label('Amount payable', M + 4, y + 5.2);
  text(money(total, cur), M + 4, y + 10.6, { size: 13, bold: true });
  label('For', 110, y + 5.2); text(period, 110, y + 10.6, { size: 10, bold: true });
  y += 20;

  // ---- items ----
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 24 },
    head: [['#', 'Description', `Amount (${cur})`]],
    body: items.map((it, i) => [String(i + 1), it.description,num(it.amount, cur)]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 2.8, bottom: 2.8, left: 2.2, right: 2.2 }, lineColor: RULE, valign: 'top' },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 7.8 },
    bodyStyles: { lineWidth: { bottom: 0.2 } },
    columnStyles: { 0: { cellWidth: 10, halign: 'center', textColor: GRAY }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => { if (d.section === 'head') d.cell.styles.halign = d.column.index === 2 ? 'right' : d.column.index === 0 ? 'center' : 'left'; },
  });
  y = doc.lastAutoTable.finalY + 6;
  if (y > 230) { doc.addPage(); y = 20; }

  // ---- totals + words ----
  const tx = 120;
  doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(tx, y, R, y);
  text('Total', tx, y + 6, { size: 10.5, bold: true }); text(money(total, cur), R, y + 6, { size: 10.5, bold: true, align: 'right' });
  label('Amount in words', M, y + 3);
  const words = wrap(amountInWords(total, cur), 96, 8.8);
  words.forEach((l, i) => text(l, M, y + 8 + i * 4.2, { size: 8.8, italic: true }));
  y = Math.max(y + 12, y + 8 + words.length * 4.2) + 6;

  // ---- bank + notes ----
  const bank = [['Account holder', p.bank_account_name || p.full_name], ['Bank', p.bank_name], ['Branch', p.bank_branch], ['Account no.', p.bank_account_no], ['IFSC', p.bank_ifsc]].filter(([, v]) => v);
  const notes = [inv.notes].filter(Boolean).join('\n\n');
  const noteLines = wrap(notes, 78, 8.2);
  if (y + Math.max(bank.length * 4.6, noteLines.length * 3.9) + 16 > 297 - 50) { doc.addPage(); y = 20; }
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, y, R, y);
  label('Please pay to', M, y + 6);
  let by = y + 11;
  for (const [k, v] of bank) { text(k, M, by, { size: 8.2, color: GRAY }); text(v, M + 27, by, { size: 8.2, bold: k === 'Account no.' || k === 'IFSC' }); by += 4.6; }
  if (notes) { label('Notes', 112, y + 6); noteLines.forEach((l, i) => text(l, 112, y + 11 + i * 3.9, { size: 8.2, color: GRAY })); }
  y = Math.max(by, y + 11 + noteLines.length * 3.9) + 4;

  // ---- approval record ----
  if (['approved', 'paid'].includes(inv.status) && inv.decided_at) {
    const line = `Approved${extra.approvedBy ? ` by ${extra.approvedBy}` : ''} for ${to.legal_name || 'Chiplabs Solutions Pvt Ltd'} on ${fmtDate(inv.decided_at)}`
      + (inv.status === 'paid' ? ` · Paid on ${fmtDate(inv.paid_on)}${inv.payment_ref ? ` (ref. ${inv.payment_ref})` : ''}` : '');
    doc.setFillColor(236, 247, 240); doc.rect(M, y, R - M, 8, 'F');
    text(line, M + 3, y + 5.3, { size: 8, color: [23, 112, 63], bold: true });
    y += 12;
  }

  // ---- declaration + signature ----
  let sY;
  if (y > 258) { doc.addPage(); sY = 24; } else sY = Math.max(y, 250);
  wrap(`I confirm that the services above were rendered to ${to.legal_name || 'Chiplabs Solutions Pvt Ltd'} during ${period} and that the details in this invoice are correct.`, 100, 7.8)
    .forEach((l, i) => text(l, M, sY + 3 + i * 3.6, { size: 7.8, color: GRAY }));
  text(`For ${p.full_name || ''}`, R, sY + 3, { size: 8.2, bold: true, align: 'right' });
  doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(R - 60, sY + 17, R, sY + 17);
  text('Signature', R, sY + 21, { size: 7.5, color: GRAY, align: 'right' });

  // ---- footer ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.2); doc.line(M, 284, R, 284);
    text(`${p.full_name || ''} · Invoice to ${to.legal_name || 'Chiplabs Solutions Pvt Ltd'}`, M, 288.5, { size: 7, color: LIGHT });
    text(`${inv.invoice_number}   ·   Page ${i} of ${pages}`, R, 288.5, { size: 7, color: LIGHT, align: 'right' });
  }
  return doc;
}

export const payeeFileName = (inv) => `Invoice_${(inv.invoice_number || '').replace(/[^\w-]+/g, '-')}_${(inv.payee?.full_name || '').replace(/\s+/g, '_')}.pdf`;
export function downloadPayeeInvoice(inv, extra) { buildPayeeInvoicePdf(inv, extra).save(payeeFileName(inv)); }
