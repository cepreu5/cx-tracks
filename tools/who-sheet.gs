/* CX Tracks - сървърът за кратката форма при първо стартиране (приложението я праща от js/who.js).
   Прикачен скрипт към таблицата 1k4foFLeTJKRKRpOW0BSoMWUMC9Ey1pd0ZleiILWP5ZU.
   Всяко изпращане добавя един ред: Потребител | Дата | Град | Държава.
   Датата е тази, в която редът се записва - часът на скрипта (File -> Settings -> Time zone).

   Публикуване: Внедряване -> Ново внедряване -> Уеб приложение,
   „Изпълни като“: аз · „Кой има достъп“: всеки. Адресът (/exec) се слага в js/who.js на мястото на URL.

   Отговорът е само за проверка: приложението не го чака. */

var SHEET = 'Потребители';
var HEAD = ['Потребител', 'Дата', 'Град', 'Държава'];
var FMT = 'dd.MM.yyyy HH:mm';

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var name = clean(d.name, 80);
    if (!name) return out({ ok: false, error: 'no name' });
    var sh = sheet();
    sh.appendRow([name, new Date(), clean(d.city, 80), clean(d.country, 60)]);
    var row = sh.getLastRow();
    sh.getRange(row, 2).setNumberFormat(FMT);
    return out({ ok: true, row: row });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out({ ok: true });
}

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    // Листът по подразбиране може да е подготвен под друго име - тогава се ползва първият,
    // стига в A1 да пише „Потребител“.
    var first = ss.getSheets()[0];
    if (first && String(first.getRange(1, 1).getValue()).trim() === HEAD[0]) sh = first;
  }
  if (!sh) sh = ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#ffff00');
  }
  return sh;
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
