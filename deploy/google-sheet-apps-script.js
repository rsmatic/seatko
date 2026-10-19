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
 * Only SeatKo knows the URL; keep it private like a password.
 */
const HEADERS = [
  ['reference', 'Reference'], ['submitted', 'Submitted'], ['event', 'Event'], ['name', 'Name'], ['email', 'Email'],
  ['phone', 'Phone'], ['tickets', 'Tickets'], ['amount', 'Amount (PHP)'], ['payment', 'Payment'], ['payment_ref', 'Payment ref.'],
  ['buyer_note', 'Buyer note'], ['status', 'Status'], ['reviewed', 'Reviewed'], ['review_note', 'Review note'],
  ['seats', 'Seats'], ['ticket_codes', 'Ticket codes'], ['order', 'Order'], ['seatko_link', 'Open in SeatKo'],
];

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS.map((h) => h[1]));
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    const values = HEADERS.map((h) => (data[h[0]] === undefined ? '' : data[h[0]]));
    const refs = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map((r) => r[0]) : [];
    const at = refs.indexOf(data.reference);
    if (at >= 0) sheet.getRange(at + 2, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
