import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Step 1: Get sheet metadata to find the actual sheet name and total row count
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const sheetProps = meta.sheets?.[0]?.properties;
    const sheetName = sheetProps?.title || "Sheet1";
    const totalRows = sheetProps?.gridProperties?.rowCount || 10000;

    // Step 2: Fetch ALL rows from column A (dates) — no row limit
    const rangeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName + "!A:A")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const rangeData = await rangeRes.json();
    const allValues = rangeData.values || [];

    // Step 3: Find rows older than 2 months (skip row 1 = header)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    twoMonthsAgo.setHours(0, 0, 0, 0);

    // Collect 1-based row indices to delete (oldest first so deletions don't shift indices)
    // We'll build delete requests in reverse order (bottom to top) to keep indices stable
    const rowsToDelete = [];
    for (let i = 1; i < allValues.length; i++) { // i=0 is header
      const cellVal = (allValues[i]?.[0] || "").trim();
      if (!cellVal) continue;

      let rowDate = new Date(cellVal);
      if (isNaN(rowDate.getTime())) {
        // Try M/D/YYYY
        const m = cellVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) rowDate = new Date(`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`);
      }

      if (!isNaN(rowDate.getTime()) && rowDate < twoMonthsAgo) {
        rowsToDelete.push(i); // 0-based index
      }
    }

    // Step 4: Delete old rows via batchUpdate (process in reverse so indices stay valid)
    let deleted = 0;
    if (rowsToDelete.length > 0) {
      // Sort descending so we delete from bottom up
      rowsToDelete.sort((a, b) => b - a);

      // Build delete requests in chunks of 1000
      const chunkSize = 1000;
      for (let c = 0; c < rowsToDelete.length; c += chunkSize) {
        const chunk = rowsToDelete.slice(c, c + chunkSize);
        const requests = chunk.map(rowIndex => ({
          deleteDimension: {
            range: {
              sheetId: sheetProps.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }));

        const deleteRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ requests })
          }
        );
        const deleteData = await deleteRes.json();
        if (deleteData.error) throw new Error(`Delete error: ${JSON.stringify(deleteData.error)}`);
        deleted += chunk.length;
      }
    }

    // Step 5: Re-fetch current row count after deletions
    const metaRes2 = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta2 = await metaRes2.json();
    const currentRowCount = meta2.sheets?.[0]?.properties?.gridProperties?.rowCount || 0;

    // Step 6: Ensure at least 4000 empty rows at the bottom
    // Find the last row with data
    const dataRowsAfterDelete = allValues.length - rowsToDelete.length;
    const minTotalRows = dataRowsAfterDelete + 4000;

    let rowsAdded = 0;
    if (currentRowCount < minTotalRows) {
      const rowsToAppend = minTotalRows - currentRowCount;
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            requests: [{
              appendDimension: {
                sheetId: sheetProps.sheetId,
                dimension: "ROWS",
                length: rowsToAppend
              }
            }]
          })
        }
      );
      const appendData = await appendRes.json();
      if (appendData.error) throw new Error(`Append error: ${JSON.stringify(appendData.error)}`);
      rowsAdded = rowsToAppend;
    }

    return Response.json({
      success: true,
      deleted_rows: deleted,
      rows_added: rowsAdded,
      cutoff_date: twoMonthsAgo.toISOString().split("T")[0],
      message: `Deleted ${deleted} rows older than 2 months. Added ${rowsAdded} empty rows.`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});