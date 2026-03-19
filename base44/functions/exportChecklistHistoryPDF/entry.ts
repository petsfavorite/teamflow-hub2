import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import jsPDF from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { checklist_completion_id } = await req.json();

    if (!checklist_completion_id) {
      return Response.json({ error: 'Missing checklist_completion_id' }, { status: 400 });
    }

    const completion = await base44.asServiceRole.entities.ChecklistCompletion.get(checklist_completion_id);
    if (!completion) {
      return Response.json({ error: 'Completion not found' }, { status: 404 });
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(completion.checklist_title, margin, yPosition);
    yPosition += 10;

    // Metadata
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Completed by: ${completion.completed_by_name || completion.completed_by}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Date: ${completion.completion_date}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Status: ${completion.status}`, margin, yPosition);
    yPosition += 10;

    // Items table headers
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9);
    
    const colWidths = {
      checkbox: 12,
      item: contentWidth * 0.4,
      checkedBy: contentWidth * 0.3,
      checkedAt: contentWidth * 0.3
    };

    const headerY = yPosition;
    doc.rect(margin, headerY - 5, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    
    let xPos = margin + 2;
    doc.text('✓', xPos, headerY);
    xPos += colWidths.checkbox;
    doc.text('Item', xPos, headerY);
    xPos += colWidths.item;
    doc.text('Checked By', xPos, headerY);
    xPos += colWidths.checkedBy;
    doc.text('Checked At', xPos, headerY);

    yPosition += 10;
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);

    // Items
    (completion.completed_items || []).forEach((item, idx) => {
      // Check if we need a new page
      if (yPosition > pageHeight - margin - 10) {
        doc.addPage();
        yPosition = margin;
      }

      xPos = margin + 2;
      const itemColor = item.checked ? [0, 128, 0] : [255, 0, 0];
      doc.setTextColor(...itemColor);
      doc.text(item.checked ? '✓' : '✗', xPos, yPosition);
      
      doc.setTextColor(0, 0, 0);
      xPos += colWidths.checkbox;
      
      // Item label with wrapping
      const labelLines = doc.splitTextToSize(item.label || '', colWidths.item - 2);
      labelLines.forEach((line, lineIdx) => {
        doc.text(line, xPos, yPosition + lineIdx * 3);
      });
      
      // Checked by
      xPos += colWidths.item;
      const checkedByText = item.checked_by_name || item.checked_by_email || '—';
      doc.text(checkedByText, xPos, yPosition);
      
      // Checked at
      xPos += colWidths.checkedBy;
      const checkedAtText = item.checked_at ? new Date(item.checked_at).toLocaleString() : '—';
      const checkedAtLines = doc.splitTextToSize(checkedAtText, colWidths.checkedAt - 2);
      checkedAtLines.forEach((line, lineIdx) => {
        doc.text(line, xPos, yPosition + lineIdx * 3);
      });

      const maxLines = Math.max(labelLines.length, checkedAtLines.length);
      yPosition += maxLines * 3 + 5;

      // Notes if present
      if (item.notes) {
        if (yPosition > pageHeight - margin - 10) {
          doc.addPage();
          yPosition = margin;
        }
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(7);
        const noteLines = doc.splitTextToSize(`Note: ${item.notes}`, contentWidth - 10);
        noteLines.forEach(line => {
          doc.text(line, margin + 5, yPosition);
          yPosition += 2;
        });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        yPosition += 2;
      }
    });

    // Manager notes if present
    if (completion.manager_notes) {
      if (yPosition > pageHeight - margin - 15) {
        doc.addPage();
        yPosition = margin;
      }
      yPosition += 5;
      doc.setFont(undefined, 'bold');
      doc.setFontSize(9);
      doc.text('Manager Notes', margin, yPosition);
      yPosition += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      const noteLines = doc.splitTextToSize(completion.manager_notes, contentWidth);
      noteLines.forEach(line => {
        if (yPosition > pageHeight - margin - 5) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += 3;
      });
    }

    const pdfBytes = doc.output('arraybuffer');
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${completion.checklist_title.replace(/[^a-z0-9]/gi, '_')}_${completion.completion_date}.pdf"`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});