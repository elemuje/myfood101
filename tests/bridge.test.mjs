import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
test('Apps Script writes matching columns and durable retry log atomically, with literal customer text', () => {
  const secret = 'private-bridge-secret-with-more-than-32-characters'; let batch, duplicate = false;
  const properties = new Map([['BRIDGE_SECRET', secret]]);
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ value, setMimeType() { return this; } }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_algorithm, value) => [...createHash('sha256').update(value).digest()], formatDate: () => '2026-11-10 17:00:00' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getSheetId: () => 999, getRange: () => ({ createTextFinder: () => ({ matchEntireCell() { return this; }, findNext: () => duplicate }) }) }) }) },
    ScriptApp: { getOAuthToken: () => 'google-test-token' },
    UrlFetchApp: { fetch: (url, options) => { batch = JSON.parse(options.payload); duplicate = true; return { getResponseCode: () => 200, getContentText: () => '{}' }; } }, console
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const value = { secret, id: '12345678-1234-1234-1234-123456789abc', type:'Make a complaint', customer:'Yes', topic:'Other', message:'=IMPORTXML("https://attacker.example")', phone:'', pictures:[] };
  const submit = data => JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(data)}}).value);
  assert.equal(submit({...value,secret:'wrong'}).ok, false); assert.equal(batch, undefined);
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
    ScriptApp: { getOAuthToken: () => 'test-token' },
    UrlFetchApp: { fetch: (_url, options) => {
      const batch = JSON.parse(options.payload); const update = batch.requests[0].updateCells;
      assert.equal(update.range.startRowIndex, 1);
      rows = update.rows.map(row => row.values.map(cell => cell.userEnteredValue.stringValue));
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    } }, console
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
