import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import PDFDocument from 'pdfkit';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Parse JSON request bodies
app.use(express.json());

/**
 * PDF Generation Endpoint for USDC Invoices
 */
app.post('/api/invoice/pdf', (req, res) => {
  try {
    const {
      invoiceNumber,
      senderName,
      senderEmail,
      senderWallet,
      clientName,
      clientEmail,
      dueDate,
      createdAt,
      items,
    } = req.body;

    if (!senderName || !clientName || !items || !Array.isArray(items)) {
      res.status(400).json({ error: 'Missing required invoice details: freelancer name, client name, and items list are required.' });
      return;
    }

    // Create a new PDF document, A4 format
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Set Response Headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Invoice-${invoiceNumber || 'FLOWPAY'}.pdf"`
    );

    // Pipe the PDF directly to the Express response stream
    doc.pipe(res);

    // Header Branding
    doc.fillColor('#09090b').font('Courier-Bold').fontSize(24).text('FLOWPAY', 50, 50);
    doc.fillColor('#10b981').font('Courier-Bold').fontSize(10).text('USDC INVOICING ENGINE', 50, 75);

    // Invoice Meta Right Column
    doc.fillColor('#09090b').font('Courier-Bold').fontSize(14).text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(10).font('Courier').text(`No: ${invoiceNumber || 'FP-1001'}`, 400, 70, { align: 'right' });
    doc.text(`Date: ${createdAt || new Date().toISOString().split('T')[0]}`, 400, 85, { align: 'right' });
    doc.text(`Due Date: ${dueDate || 'Upon Receipt'}`, 400, 100, { align: 'right' });

    // Dividers
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#e4e4e7').lineWidth(1).stroke();

    // From (Freelancer) Details
    doc.fillColor('#09090b').font('Courier-Bold').fontSize(11).text('FROM (FREELANCER)', 50, 140);
    doc.font('Courier').fontSize(10).fillColor('#27272a');
    doc.text(senderName, 50, 160);
    doc.text(`Email: ${senderEmail || 'N/A'}`, 50, 175);
    doc.fillColor('#10b981').text(`Arc Wallet: ${senderWallet || 'N/A'}`, 50, 190);

    // To (Client) Details
    doc.fillColor('#09090b').font('Courier-Bold').fontSize(11).text('TO (CLIENT)', 300, 140);
    doc.font('Courier').fontSize(10).fillColor('#27272a');
    doc.text(clientName, 300, 160);
    doc.text(`Email: ${clientEmail || 'N/A'}`, 300, 175);

    doc.moveTo(50, 220).lineTo(545, 220).strokeColor('#e4e4e7').lineWidth(1).stroke();

    // Items table header
    doc.fillColor('#09090b').font('Courier-Bold').fontSize(10);
    doc.text('DESCRIPTION', 50, 240);
    doc.text('QTY', 280, 240, { width: 40, align: 'right' });
    doc.text('RATE (USDC)', 340, 240, { width: 90, align: 'right' });
    doc.text('AMOUNT (USDC)', 450, 240, { width: 95, align: 'right' });

    doc.moveTo(50, 255).lineTo(545, 255).strokeColor('#09090b').lineWidth(1.5).stroke();

    let currentY = 270;
    let total = 0;

    items.forEach((item: { description: string; quantity: number | string; rate: number | string }) => {
      const quantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity || '0')) || 0;
      const rate = typeof item.rate === 'number' ? item.rate : parseFloat(String(item.rate || '0')) || 0;
      const amount = quantity * rate;
      total += amount;

      doc.fillColor('#27272a').font('Courier').fontSize(10);
      
      // Handle potential long descriptions wrapping
      doc.text(item.description || 'Consulting / Development', 50, currentY, { width: 220 });
      doc.text(String(quantity), 280, currentY, { width: 40, align: 'right' });
      doc.text(rate.toFixed(2), 340, currentY, { width: 90, align: 'right' });
      doc.text(amount.toFixed(2), 450, currentY, { width: 95, align: 'right' });

      currentY += 25;
    });

    doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor('#e4e4e7').lineWidth(1).stroke();

    currentY += 15;

    // Total USDC
    doc.fillColor('#09090b').font('Courier-Bold').fontSize(12);
    doc.text('TOTAL:', 300, currentY, { width: 140, align: 'right' });
    doc.fillColor('#10b981').fontSize(14).text(`${total.toFixed(2)} USDC`, 450, currentY - 2, { width: 95, align: 'right' });

    currentY += 45;

    // Call to Action Box
    doc.rect(50, currentY, 495, 65).fillColor('#f4f4f5').strokeColor('#e4e4e7').lineWidth(1).fillAndStroke();
    
    doc.fillColor('#09090b').font('Courier-Bold').fontSize(9).text('PAYMENT METRICS & DESTINATION', 60, currentY + 10);
    doc.font('Courier').fontSize(8).fillColor('#27272a');
    doc.text('This invoice was settled digitally via Solana/Polygon. Direct deposits are processed in real-time.', 60, currentY + 25);
    doc.fillColor('#10b981').font('Courier-Bold').text(`USDC Deposit Wallet: ${senderWallet || 'N/A'}`, 60, currentY + 40);

    // Footer signature
    doc.fillColor('#71717a').font('Courier').fontSize(8).text('Thank you for choosing FlowPay. Settlement is automated & real-time.', 50, 750, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
