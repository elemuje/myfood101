// Food 101 website feedback bridge. The existing Google Form is unchanged.
// Script Property required: BRIDGE_SECRET (same value as the Vercel secret).
var SPREADSHEET_ID = '18j6KNPxLlEoiuBScGOdcopDwFrpwhmNrmC9xSlNx6tI';
var RESPONSE_SHEET_ID = 763732222;
var LOG_SHEET = '_Food101WebsiteSubmissions';
var PRODUCT_SHEET = '_Food101Products';

function doGet() { return reply_({ ok: true, service: 'Food 101 feedback bridge' }); }
function reply_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function sameSecret_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b.length < 32) return false;
  var left = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a);
  var right = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  var difference = 0;
  for (var i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
function api_(url, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() });
  options.muteHttpExceptions = true;
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Google API failed: ' + response.getResponseCode());
  return JSON.parse(response.getContentText());
}
function writeBatch_(requests) {
  // The enabled Sheets service handles Google authorization for spreadsheet writes.
  // Keep each response and its retry reference together in one atomic batch.
  return Sheets.Spreadsheets.batchUpdate({ requests: requests }, SPREADSHEET_ID);
}
function logSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(LOG_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOG_SHEET);
    sheet.appendRow(['Submission reference', 'Received at']);
    sheet.hideSheet();
  }
  return sheet;
}
function pictureFolder_() {
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty('PICTURE_FOLDER_ID');
  if (!id) {
    var folder = api_('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({
        name: 'Food 101 customer feedback pictures', mimeType: 'application/vnd.google-apps.folder'
      })
    });
    id = folder.id; properties.setProperty('PICTURE_FOLDER_ID', id);
  }
  return id;
}
function upload_(picture, folder, reference, index) {
  var extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[picture.mime];
  if (!extension || typeof picture.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(picture.data)) throw new Error('Invalid picture');
  var bytes = Utilities.base64Decode(picture.data);
  if (!bytes.length || bytes.length > 600000) throw new Error('Picture exceeds size limit');
  var boundary = 'food101_' + Utilities.getUuid();
  var metadata = { name: reference + '-' + (index + 1) + '.' + extension, parents: [folder] };
  var prefix = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: ' + picture.mime + '\r\n\r\n';
  var suffix = '\r\n--' + boundary + '--';
  var payload = Utilities.newBlob(prefix).getBytes().concat(bytes).concat(Utilities.newBlob(suffix).getBytes());
  var file = api_('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: payload
  });
  return { id: file.id, link: file.webViewLink || 'https://drive.google.com/file/d/' + file.id + '/view' };
}
function cell_(value) {
  // stringValue makes customer text literal; =, +, - and @ cannot become formulas.
  return { userEnteredValue: { stringValue: String(value || '') } };
}
function catalog_(value, lock) {
  lock.waitLock(30000);
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(PRODUCT_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PRODUCT_SHEET);
    sheet.appendRow(['ID', 'Name', 'Price', 'Category', 'Picture', 'Description']); sheet.hideSheet();
  }
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('CATALOG_INITIALIZED')) {
    if (!Array.isArray(value.seed)) throw new Error('Menu seed missing');
    writeProducts_(sheet, value.seed);
    properties.setProperty('CATALOG_INITIALIZED', 'true');
  }
  var products = [];
  if (sheet.getLastRow() > 1) products = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().filter(function(row) { return row[0] !== ''; }).map(function(row) {
    return { id: Number(row[0]), name: String(row[1]), price: Number(row[2]), cat: String(row[3]), img: String(row[4]), desc: String(row[5]) };
  });
  var revision = revision_(products);
  if (value.action === 'catalog.get') return { ok: true, products: products, revision: revision };
  if (value.revision !== revision) return { ok: false, code: 'conflict' };
  if (!Array.isArray(value.products) || value.products.length > 300) throw new Error('Invalid product list');
  var next = value.products, photo;
  try {
    if (value.picture) {
      var item = next.filter(function(product) { return product.id === value.picture.productId; })[0];
      if (!item) throw new Error('Picture product missing');
      var properties = PropertiesService.getScriptProperties(), folderId = properties.getProperty('PRODUCT_FOLDER_ID');
      if (!folderId) {
        folderId = api_('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ name: 'Food 101 product pictures', mimeType: 'application/vnd.google-apps.folder' }) }).id;
        properties.setProperty('PRODUCT_FOLDER_ID', folderId);
      }
      photo = upload_(value.picture, folderId, 'product-' + Utilities.getUuid(), 0);
      api_('https://www.googleapis.com/drive/v3/files/' + photo.id + '/permissions', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ type: 'anyone', role: 'reader' }) });
      item.img = 'https://lh3.googleusercontent.com/d/' + photo.id + '=w1000';
    }
    writeProducts_(sheet, next);
    return { ok: true, products: next, revision: revision_(next) };
  } catch (error) {
    if (photo) try { api_('https://www.googleapis.com/drive/v3/files/' + photo.id, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ trashed: true }) }); } catch (ignored) {}
    throw error;
  }
}
function revision_(products) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(products)).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}
function writeProducts_(sheet, products) {
  var rows = products.map(function(p) { return { values: [cell_(p.id), cell_(p.name), cell_(p.price), cell_(p.cat), cell_(p.img), cell_(p.desc)] }; });
  var endRow = Math.max(sheet.getLastRow(), products.length + 1, 2);
  writeBatch_([{ updateCells: {
      range: { sheetId: sheet.getSheetId(), startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: 6 },
      rows: rows, fields: 'userEnteredValue'
  } }]);
}
function doPost(e) {
  var lock = LockService.getScriptLock(), uploaded = [], authorized = false;
  try {
    if (!e.postData || e.postData.contents.length > 4200000) return reply_({ ok: false, code: 'invalid_request' });
    var value = JSON.parse(e.postData.contents);
    if (!sameSecret_(value.secret, PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET'))) return reply_({ ok: false, code: 'unauthorized' });
    authorized = true;
    if (value.action === 'catalog.get' || value.action === 'catalog.save') return reply_(catalog_(value, lock));
    var types = ['Give feedback', 'Make a complaint', 'Request support or assistance', 'Make a suggestion', 'Appreciate our service'];
    if (!/^[a-f0-9-]{36}$/i.test(value.id || '') || types.indexOf(value.type) === -1 || ['Yes', 'No'].indexOf(value.customer) === -1 || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 5000 || !Array.isArray(value.pictures) || value.pictures.length > 5) return reply_({ ok: false, code: 'invalid_fields' });
    if (typeof value.topic !== 'string' || value.topic.length > 200 || typeof value.phone !== 'string' || value.phone.length > 40) return reply_({ ok: false, code: 'invalid_fields' });
    lock.waitLock(30000);
    var log = logSheet_();
    if (log.getRange('A:A').createTextFinder(value.id).matchEntireCell(true).findNext()) return reply_({ ok: true, id: value.id, duplicate: true });
    var folder = value.pictures.length ? pictureFolder_() : null;
    value.pictures.forEach(function(picture, index) { uploaded.push(upload_(picture, folder, value.id, index)); });
    var timestamp = Utilities.formatDate(new Date(), 'Africa/Lagos', 'yyyy-MM-dd HH:mm:ss');
    var responseValues = [timestamp, value.type, value.customer, value.topic, value.message, uploaded.map(function(f) { return f.link; }).join('\n'), value.phone];
    // Write the response and durable submission reference in one atomic Sheets batch.
    // Retrying the same reference will return success without adding another row.
    writeBatch_([
        { appendCells: { sheetId: RESPONSE_SHEET_ID, rows: [{ values: responseValues.map(cell_) }], fields: 'userEnteredValue' } },
        { appendCells: { sheetId: log.getSheetId(), rows: [{ values: [cell_(value.id), cell_(timestamp)] }], fields: 'userEnteredValue' } }
    ]);
    return reply_({ ok: true, id: value.id });
  } catch (error) {
    console.error('Food101 feedback failed: ' + error.message);
    uploaded.forEach(function(file) {
      try { api_('https://www.googleapis.com/drive/v3/files/' + file.id, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ trashed: true }) }); } catch (ignored) {}
    });
    // Diagnostics go only to callers holding the private bridge secret.
    // The public website API continues returning its generic customer message.
    return reply_({ ok: false, code: 'save_failed', detail: authorized ? String(error.message).slice(0, 1000) : undefined });
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
