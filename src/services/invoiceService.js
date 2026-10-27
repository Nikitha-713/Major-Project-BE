const { formatInr } = require('../utils/billingMath');

const fmtDate = (d) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(d));

// Streams a GST-style invoice PDF straight to the response. Everything printed comes from the
// snapshot stored on the payment, so reprinting an old invoice always gives the same document.
function streamInvoicePdf(payment, res) {
  const PDFDocument = require('pdfkit'); // loaded lazily so the server starts even before pdfkit is installed
  const inv = payment.invoice;
  const isTax = Boolean(inv.gstin) && inv.gstRatePercent > 0;
  const teal = '#1f6f78';
  const grey = '#555555';

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${inv.number}.pdf"`);
  doc.pipe(res);

  // Seller (left) and invoice details (right)
  doc.fillColor(teal).font('Helvetica-Bold').fontSize(20).text(inv.businessName || 'Invoice', 50, 50, { width: 290 });
  doc.fillColor(grey).font('Helvetica').fontSize(9);
  if (inv.address) doc.text(inv.address, 50, doc.y + 4, { width: 280 });
  if (inv.gstin) doc.text(`GSTIN: ${inv.gstin}`, 50, doc.y + 2);

  doc.fillColor(teal).font('Helvetica-Bold').fontSize(18).text(isTax ? 'TAX INVOICE' : 'INVOICE', 350, 50, { width: 195, align: 'right' });
  doc.fillColor(grey).font('Helvetica').fontSize(9);
  doc.text(`Invoice no: ${inv.number}`, 350, 78, { width: 195, align: 'right' });
  doc.text(`Date: ${fmtDate(inv.issuedAt)}`, 350, 92, { width: 195, align: 'right' });

  // Billed to
  doc.fillColor(grey).fontSize(9).text('BILLED TO', 50, 160);
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11).text(inv.clientName, 50, 175);
  doc.fillColor(grey).font('Helvetica').fontSize(9).text(inv.clientEmail, 50, 191);

  // Line item
  doc.moveTo(50, 235).lineTo(545, 235).strokeColor('#cccccc').stroke();
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
  doc.text('Description', 50, 243, { width: 330 });
  doc.text('Amount', 400, 243, { width: 145, align: 'right' });
  doc.moveTo(50, 262).lineTo(545, 262).stroke();
  doc.font('Helvetica').fontSize(10);
  doc.text(payment.description, 50, 272, { width: 330 });
  doc.text(formatInr(isTax ? inv.taxableAmount : payment.amount), 400, 272, { width: 145, align: 'right' });

  // Totals
  let y = 320;
  const line = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor('#000000');
    doc.text(label, 300, y, { width: 150 });
    doc.text(value, 450, y, { width: 95, align: 'right' });
    y += bold ? 22 : 18;
  };
  if (isTax) {
    const half = inv.gstRatePercent / 2;
    line('Taxable value', formatInr(inv.taxableAmount));
    line(`CGST @ ${half}%`, formatInr(inv.cgst));
    line(`SGST @ ${half}%`, formatInr(inv.sgst));
  }
  doc.moveTo(300, y).lineTo(545, y).strokeColor('#cccccc').stroke();
  y += 8;
  line('Total paid', formatInr(payment.amount), true);

  // Payment details
  doc.fillColor(grey).font('Helvetica').fontSize(9);
  doc.text(`Paid online${payment.method ? ` (${payment.method})` : ''} on ${fmtDate(payment.paidAt)}`, 50, y + 20);
  if (payment.gatewayPaymentId) doc.text(`Payment reference: ${payment.gatewayPaymentId}`, 50, doc.y + 2);
  if (isTax) doc.text('Amounts are inclusive of GST.', 50, doc.y + 2);

  doc.fontSize(8).text('This is a computer-generated invoice and does not need a signature.', 50, 770, { width: 495, align: 'center' });
  doc.end();
}

module.exports = { streamInvoicePdf };
