/* CX Tracks - 1.10.26: кратката форма при първото стартиране на устройството.
   Пита се веднъж за име, град и държава; отговорът се праща към Google таблица през
   Apps Script (сървърната част е в tools/who-sheet.gs). Пращането е fire-and-forget:
   отговор не се чака, страницата не блокира, а при липса на връзка или грешка нищо не
   се показва и нищо не се повтаря само. Отговореното се помни в gpxk.who, затова формата
   не излиза пак на това устройство; „По-късно“ не помни нищо и формата излиза при
   следващото стартиране. */
(function () {
  'use strict';

  var U = window.U;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* Адресът на уеб приложението: Apps Script → „Внедряване“ → „Управление на внедряванията“ → /exec.
     Докато е празен, формата работи и помни отговора на устройството, но не праща нищо. */
  var URL = 'https://script.google.com/macros/s/AKfycbwIeAv3UZhwTGQmbqBYMATy5inD79Nn87VE6iZYSsz6MRb5lYQk2R7E5fHusg9JZRHqkQ/exec';
  var KEY = 'who';

  function data() { return U.LS.get(KEY, null); }

  /* Пращане без чакане: нито then, нито catch показват нещо на екрана.
     keepalive оставя заявката да тръгне и когато страницата се затваря веднага след „Запази“. */
  function send(o) {
    if (!URL) return;
    try {
      fetch(URL, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ name: o.name, city: o.city, country: o.country })
      }).catch(function () { /* без връзка: отговорът си стои на устройството */ });
    } catch (e) { /* среда без fetch - не се праща */ }
  }

  function open() {
    var d = $('#dlgWho');
    if (!d || d.open) return false;
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    var n = $('#whoName');
    if (n) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } }
    return true;
  }

  /* Пита се само когато няма какво друго да се гледа: изчаква началния екран да се махне
     и не се качва върху друг отворен прозорец (напр. „Няма зареден маршрут“). */
  function ask() {
    if (data()) return;
    if ($('#splash')) { setTimeout(ask, 600); return; }
    var other = document.querySelector('dialog[open]');
    if (other) {
      other.addEventListener('close', function () { setTimeout(ask, 300); }, { once: true });
      return;
    }
    open();
  }

  function save() {
    var n = $('#whoName'), c = $('#whoCity'), k = $('#whoCountry');
    var o = {
      name: ((n && n.value) || '').trim(),
      city: ((c && c.value) || '').trim(),
      country: ((k && k.value) || '').trim()
    };
    if (!o.name) return false;
    o.at = new Date().toISOString();
    U.LS.set(KEY, o);
    send(o);
    return true;
  }

  function bind() {
    var f = $('#whoForm'), d = $('#dlgWho');
    if (!f || !d) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!save()) { var n = $('#whoName'); if (n) n.focus(); return; }
      d.close('save');
    });
    var later = $('#whoLater');
    if (later) later.addEventListener('click', function () { d.close('later'); });
  }

  window.Who = {
    ask: ask,
    open: open,
    data: data,
    save: save,
    KEY: KEY,
    /* Проверките слагат адрес и викат save(), за да видят точното тяло на заявката. */
    url: function (u) { if (u != null) URL = String(u); return URL; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
