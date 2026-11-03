// Builds a CSV string of pets that have a special_needs alert (the text shown at
// every check-in) and triggers a browser download.

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    // Collapse newlines/tabs to " | " so each alert stays on one spreadsheet row.
    const cleaned = String(value).replace(/[\r\n\t]+/g, ' | ').trim();
    if (/[",]/.test(cleaned)) {
        return `"${cleaned.replace(/"/g, '""')}"`;
    }
    return cleaned;
}

export function exportPetsAlertsCsv(pets) {
    const withAlerts = pets
        .filter(p => p.special_needs && p.special_needs.trim())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const header = ['Pet', 'Owner', 'Species', 'Checked In', 'Alert'];
    const rows = withAlerts.map(p => [
        p.name,
        p.owner_name,
        p.species,
        p.is_checked_in ? 'Yes' : 'No',
        p.special_needs,
    ]);

    const csv = [header, ...rows]
        .map(row => row.map(csvEscape).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const today = new Date().toISOString().slice(0, 10);
    link.download = `pet-alerts-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return withAlerts.length;
}