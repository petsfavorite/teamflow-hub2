import { jsPDF } from 'jspdf';
import moment from 'moment';

// Builds the visit report as real PDF text (not a screenshot), so long visits
// paginate cleanly, use little memory, and the text stays searchable.

// jsPDF's built-in fonts can't draw emoji or unusual symbols — drop them.
const clean = (value) =>
    String(value ?? '').replace(/[^\n\x20-\x7E -ÿ•–—‘’“”]/g, '');

const MARGIN = 15;

export function buildVisitReportPdf(pet, visit) {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const contentW = pageW - MARGIN * 2;
    let y = MARGIN;

    const ensureSpace = (needed) => {
        if (y + needed > pageH - MARGIN) {
            pdf.addPage();
            y = MARGIN;
            return true;
        }
        return false;
    };

    const text = (str, { size = 10, bold = false, color = [40, 40, 40], x = MARGIN, width = contentW, gap = 1.5 } = {}) => {
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        const lineH = size * 0.42;
        pdf.splitTextToSize(clean(str), width).forEach(line => {
            ensureSpace(lineH);
            pdf.text(line, x, y + lineH * 0.8);
            y += lineH;
        });
        y += gap;
    };

    const table = (headers, rows, widths) => {
        const total = widths.reduce((a, b) => a + b, 0);
        const colW = widths.map(w => (w / total) * contentW);
        const drawHeader = () => {
            ensureSpace(8);
            pdf.setFillColor(245, 245, 244);
            pdf.rect(MARGIN, y, contentW, 6.5, 'F');
            let x = MARGIN;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(120, 113, 108);
            headers.forEach((h, i) => { pdf.text(h, x + 2, y + 4.4); x += colW[i]; });
            y += 6.5;
        };
        drawHeader();
        rows.forEach(row => {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            const cells = row.map((cell, i) => pdf.splitTextToSize(clean(cell) || '-', colW[i] - 4));
            const lines = Math.max(...cells.map(c => c.length));
            const rowH = lines * 3.8 + 2.4;
            // Whole rows move to the next page, so a row is never cut in half.
            if (ensureSpace(rowH)) drawHeader();
            let x = MARGIN;
            pdf.setTextColor(60, 60, 60);
            cells.forEach((c, i) => { pdf.text(c, x + 2, y + 4); x += colW[i]; });
            pdf.setDrawColor(231, 229, 228);
            pdf.line(MARGIN, y + rowH, MARGIN + contentW, y + rowH);
            y += rowH;
        });
        y += 5;
    };

    const checkIn = moment(visit.check_in_time);
    const checkOut = moment();
    const hours = checkOut.diff(checkIn, 'hours', true);

    text("Pet's Favorite Vet Doggie Daycare", { size: 18, bold: true, gap: 0 });
    text('Visit Report', { size: 11, color: [120, 113, 108], gap: 3 });
    pdf.setDrawColor(245, 158, 11);
    pdf.setLineWidth(0.6);
    pdf.line(MARGIN, y, MARGIN + contentW, y);
    y += 6;

    text(pet.name, { size: 15, bold: true, gap: 0.5 });
    text([pet.breed, pet.gender].filter(Boolean).join(' - '), { size: 10, color: [87, 83, 78], gap: 0.5 });
    text(`Owner: ${pet.owner_name || ''}`, { size: 10, color: [120, 113, 108], gap: 5 });

    text('Visit Details', { size: 11, bold: true, gap: 2 });
    text(`Check In: ${checkIn.format('MMM D, YYYY h:mm A')}`, { gap: 0.5 });
    text(`Check Out: ${checkOut.format('MMM D, YYYY h:mm A')}`, { gap: 0.5 });
    text(`Duration: ${hours.toFixed(1)} hours`, { gap: 0.5 });
    text(`Type: ${visit.visit_type === 'boarding' ? 'Boarding' : 'Play Camp'}`, { gap: 6 });

    const done = (visit.scheduled_tasks || []).filter(t => t.completed);
    if (done.length > 0) {
        text('Completed Tasks', { size: 11, bold: true, gap: 2 });
        table(
            ['Time', 'Task', 'Status'],
            done.map(t => [
                t.time,
                t.type === 'Medication' ? t.medication_name : t.type,
                `${t.completed_at || ''} (${t.completed_by || ''})`,
            ]),
            [2, 4, 4]
        );
    }

    if ((visit.care_log || []).length > 0) {
        text('Activity Log', { size: 11, bold: true, gap: 2 });
        table(
            ['Time', 'Activity', 'Notes'],
            visit.care_log.map(l => [l.time, l.activity, l.notes]),
            [2, 4, 4]
        );
    }

    return pdf.output('blob');
}
