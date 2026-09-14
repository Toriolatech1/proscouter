const XLSX = require('xlsx');

function buildWorkbook(rows, sheetName) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

function sendXlsx(res, rows, sheetName, filename) {
  const wb = buildWorkbook(rows, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}

function sendCsv(res, rows, filename) {
  const wb = buildWorkbook(rows, 'sheet1');
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets['sheet1']);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
}

module.exports = { sendXlsx, sendCsv };
