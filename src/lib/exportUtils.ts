import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface AdditionalTable {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface ExportData {
  filename: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  summaryStats?: Record<string, string | number>;
  shopName?: string;
  additionalTables?: AdditionalTable[];
}

/**
 * Exports tabular data to native Microsoft Excel (.xlsx)
 */
export function exportToExcel({ filename, title, headers, rows, summaryStats, additionalTables }: ExportData): void {
  const wb = XLSX.utils.book_new();

  const sheetData: (string | number)[][] = [];

  // Title header
  sheetData.push([title]);
  sheetData.push([`Exported on: ${new Date().toLocaleString()}`]);
  sheetData.push([]);

  // Summary statistics if available
  if (summaryStats && Object.keys(summaryStats).length > 0) {
    sheetData.push(['--- SUMMARY METRICS ---']);
    for (const [key, val] of Object.entries(summaryStats)) {
      sheetData.push([key, val]);
    }
    sheetData.push([]);
  }

  // Table data
  sheetData.push(headers);
  for (const row of rows) {
    sheetData.push(row);
  }

  // Additional tables if available
  if (additionalTables && additionalTables.length > 0) {
    for (const tbl of additionalTables) {
      sheetData.push([]);
      if (tbl.title) {
        sheetData.push([`--- ${tbl.title.toUpperCase()} ---`]);
      }
      sheetData.push(tbl.headers);
      for (const row of tbl.rows) {
        sheetData.push(row);
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Auto-fit column widths approximately
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    for (const r of rows) {
      const cellVal = String(r[i] ?? '');
      if (cellVal.length > maxLen) maxLen = cellVal.length;
    }
    return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Exports data to Microsoft Word (.doc format readable by MS Word, LibreOffice, Google Docs)
 */
export function exportToWord({
  filename,
  title,
  subtitle,
  headers,
  rows,
  summaryStats,
  shopName = 'Karobit Enterprise',
  additionalTables,
}: ExportData): void {
  let statsHtml = '';
  if (summaryStats && Object.keys(summaryStats).length > 0) {
    statsHtml = `
      <div style="margin: 18px 0; padding: 14px; background-color: #f1f5f9; border-radius: 6px; border: 1px solid #cbd5e1;">
        <h3 style="margin: 0 0 10px 0; color: #0f172a; font-size: 14pt;">Summary Highlights</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${Object.entries(summaryStats)
            .map(
              ([k, v]) => `
              <tr>
                <td style="padding: 4px 8px; font-weight: bold; color: #475569; width: 40%;">${k}:</td>
                <td style="padding: 4px 8px; color: #0f172a; font-weight: 600;">${v}</td>
              </tr>
            `
            )
            .join('')}
        </table>
      </div>
    `;
  }

  const tableHeadersHtml = headers
    .map(
      (h) =>
        `<th style="background-color: #1e293b; color: #ffffff; padding: 8px 12px; text-align: left; font-size: 10pt; border: 1px solid #94a3b8;">${h}</th>`
    )
    .join('');

  const tableRowsHtml = rows
    .map(
      (r, idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        ${r
          .map(
            (c) =>
              `<td style="padding: 8px 12px; font-size: 9.5pt; color: #1e293b; border: 1px solid #cbd5e1;">${c}</td>`
          )
          .join('')}
      </tr>
    `
    )
    .join('');

  let additionalTablesHtml = '';
  if (additionalTables && additionalTables.length > 0) {
    for (const tbl of additionalTables) {
      const hdrs = tbl.headers
        .map(
          (h) =>
            `<th style="background-color: #334155; color: #ffffff; padding: 8px 12px; text-align: left; font-size: 10pt; border: 1px solid #94a3b8;">${h}</th>`
        )
        .join('');
      const rws = tbl.rows
        .map(
          (r, idx) => `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          ${r
            .map(
              (c) =>
                `<td style="padding: 8px 12px; font-size: 9.5pt; color: #1e293b; border: 1px solid #cbd5e1;">${c}</td>`
            )
            .join('')}
        </tr>
      `
        )
        .join('');
      additionalTablesHtml += `
        ${tbl.title ? `<h3 style="margin: 24px 0 8px 0; color: #0f172a; font-size: 13pt;">${tbl.title}</h3>` : ''}
        <table class="data" style="margin-bottom: 20px;">
          <thead>
            <tr>${hdrs}</tr>
          </thead>
          <tbody>
            ${rws}
          </tbody>
        </table>
      `;
    }
  }

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; margin: 30px; }
        h1 { color: #0f172a; font-size: 20pt; margin-bottom: 4px; }
        p.sub { color: #64748b; font-size: 11pt; margin-top: 0; }
        table.data { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .footer { margin-top: 30px; font-size: 9pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 15px;">
        <div style="font-size: 12pt; font-weight: bold; color: #3b82f6; text-transform: uppercase;">${shopName}</div>
        <h1>${title}</h1>
        ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
        <div style="font-size: 9.5pt; color: #64748b;">Report Generated: ${new Date().toLocaleString()}</div>
      </div>

      ${statsHtml}

      <table class="data">
        <thead>
          <tr>${tableHeadersHtml}</tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      ${additionalTablesHtml}

      <div class="footer">
        Generated automatically by Karobit Wholesale Enterprise ERP · Bellanix Tech Platform
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', htmlContent], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports data to professional PDF document using jsPDF & autoTable
 */
export function exportToPdf({
  filename,
  title,
  subtitle,
  headers,
  rows,
  summaryStats,
  shopName = 'Karobit Enterprise',
  additionalTables,
}: ExportData): void {
  // Use landscape if more than 5 columns
  const orientation = headers.length > 5 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 55, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(56, 189, 248); // sky blue
  doc.text(shopName.toUpperCase(), 30, 24);

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 30, 44);

  let currentY = 75;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 30, currentY);
    currentY += 16;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 30, currentY);
  currentY += 18;

  // Summary Metrics Box if available
  if (summaryStats && Object.keys(summaryStats).length > 0) {
    const statEntries = Object.entries(summaryStats);
    const boxWidth = pageWidth - 60;
    const boxHeight = 24 + statEntries.length * 14;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(30, currentY, boxWidth, boxHeight, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text('Key Summary Metrics', 40, currentY + 16);

    let statY = currentY + 30;
    doc.setFontSize(9);
    for (const [k, v] of statEntries) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(`${k}:`, 40, statY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(String(v), 160, statY);
      statY += 14;
    }

    currentY += boxHeight + 15;
  }

  const pageFooter = () => {
    const pageNumber = (doc as any).internal.getCurrentPageInfo().pageNumber;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Karobit ERP · Page ${pageNumber}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 15,
      { align: 'center' }
    );
  };

  // AutoTable render
  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: rows,
    theme: 'striped',
    margin: { left: 30, right: 30, bottom: 40 },
    headStyles: {
      fillColor: [30, 41, 59], // dark slate
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: () => {
      pageFooter();
    },
  });

  if (additionalTables && additionalTables.length > 0) {
    for (const tbl of additionalTables) {
      let nextY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 28 : currentY;
      if (nextY > doc.internal.pageSize.getHeight() - 90) {
        doc.addPage();
        nextY = 40;
      }
      if (tbl.title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(tbl.title, 30, nextY);
        nextY += 10;
      }
      autoTable(doc, {
        startY: nextY,
        head: [tbl.headers],
        body: tbl.rows,
        theme: 'striped',
        margin: { left: 30, right: 30, bottom: 40 },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'left',
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: [15, 23, 42],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        didDrawPage: () => {
          pageFooter();
        },
      });
    }
  }

  doc.save(`${filename}.pdf`);
}

/**
 * Universal export function for any format
 */
export function exportDataset(format: 'excel' | 'word' | 'pdf', data: ExportData): void {
  if (format === 'excel') {
    exportToExcel(data);
  } else if (format === 'word') {
    exportToWord(data);
  } else if (format === 'pdf') {
    exportToPdf(data);
  }
}
