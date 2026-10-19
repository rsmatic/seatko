/**
 * SeatKo → Google Sheet: logs online ticket requests (one row each, updated when approved/rejected).
 *
 * Setup (about 3 minutes):
 *  1. Create a Google Sheet. Menu: Extensions → Apps Script.
 *  2. Delete what's there, paste this whole file, and Save.
 *  3. Deploy → New deployment → type "Web app".
 *       Execute as: Me    ·    Who has access: Anyone
 *     Click Deploy, allow access, and copy the Web app URL (ends with /exec).
 *  4. In SeatKo: Branding & settings → Online ticket requests → paste the URL → Save.
 *
 * Updating this script later: Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy
 * (the URL stays the same).
 *
 * Columns are matched by their header text, so you can reorder them; new fields SeatKo sends
 * are added as new columns at the end automatically. Only SeatKo knows the URL; keep it private.
 */

// Leave empty when this script was opened from the sheet (Extensions → Apps Script).
// Otherwise put the sheet's ID here (the long part of its URL between /d/ and /edit).
const SHEET_ID = '';

const LABELS = {
  reference: 'Reference', submitted: 'Submitted', event: 'Event', name: 'Name', email: 'Email', phone: 'Phone',
  tickets: 'Tickets', amount: 'Amount (PHP)', payment: 'Payment', payment_ref: 'Payment ref.', proof_link: 'Proof',
  buyer_note: 'Buyer note', status: 'Status', reviewed: 'Reviewed', review_note: 'Review note', seats: 'Seats',
  ticket_codes: 'Ticket codes', order: 'Order', seatko_link: 'Open in SeatKo',
};

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const book = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheets()[0];

    // Header row: create it, and add a column for any field that doesn't have one yet.
    const keys = Object.keys(data);
    let headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    if (!headers.filter(String).length) {
      headers = Object.keys(LABELS).map((k) => LABELS[k]);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    keys.forEach((k) => {
      const label = LABELS[k] || k;
      if (headers.indexOf(label) < 0) {
        headers.push(label);
        sheet.getRange(1, headers.length).setValue(label).setFontWeight('bold');
      }
    });

    // Find the request's row by reference, or add a new one.
    const refCol = headers.indexOf(LABELS.reference) + 1;
    const last = sheet.getLastRow();
    const refs = last > 1 ? sheet.getRange(2, refCol, last - 1, 1).getValues().map((r) => r[0]) : [];
    const at = refs.indexOf(data.reference);
    const row = at >= 0 ? at + 2 : last + 1;

    keys.forEach((k) => {
      const col = headers.indexOf(LABELS[k] || k) + 1;
      const value = data[k] === undefined || data[k] === null ? '' : data[k];
      const cell = sheet.getRange(row, col);
      // Links become clickable.
      if (typeof value === 'string' && /^https:\/\//.test(value)) {
        cell.setFormula('=HYPERLINK("' + value.replace(/"/g, '') + '","' + (k === 'proof_link' ? 'View proof' : 'Open') + '")');
      } else {
        cell.setValue(value);
      }
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
