/**
 * egarden.playbees.shop — order request intake.
 *
 * Receives the JSON the website posts, appends one row per request to the
 * "Orders" sheet and one row per line to the "Lines" sheet, then emails the
 * request to RECIPIENTS. Deploy as a Web app (Execute as: Me, Who has access:
 * Anyone) and paste the /exec URL into config.js on the site.
 */

var RECIPIENTS = ["abc@zollyfriedman.com"];   // add more addresses, comma separated
var SUBJECT_PREFIX = "[eGarden order request] ";

function doGet() {
  return json_({ ok: true, service: "egarden-intake", time: new Date().toISOString() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = JSON.parse(e.postData.contents);
    if (!p || !p.lines || !p.lines.length) return json_({ ok: false, error: "no lines" });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var orders = sheet_(ss, "Orders", ["Received", "Ref", "Name", "Company", "Email", "Phone", "Notes", "Items", "Packs", "Subtotal", "On request", "Item list", "Status", "JSON"]);
    var lines = sheet_(ss, "Lines", ["Received", "Ref", "Company", "UID", "Product", "Spec", "Category", "Packs", "Pack price", "Line total", "On request"]);

    var ref = String(p.ref || "").trim() || nextRef_();
    if (alreadyLogged_(orders, ref)) return json_({ ok: true, ref: ref, duplicate: true });
    var now = new Date();
    var itemText = p.lines.map(function (l) {
      return l.uid + " " + l.name + " (" + l.spec + ") x " + l.packs + (l.onRequest ? " - price on request" : " @ $" + num_(l.packPrice).toFixed(2) + " = $" + num_(l.lineTotal).toFixed(2));
    }).join("\n");

    orders.appendRow([now, ref, p.name || "", p.company || "", p.email || "", p.phone || "", p.notes || "",
      p.items || p.lines.length, p.packs || 0, num_(p.subtotal), p.onRequestLines || 0, itemText, "New", JSON.stringify(p)]);
    var rows = p.lines.map(function (l) {
      return [now, ref, p.company || "", l.uid, l.name, l.spec, l.category || "", l.packs, l.onRequest ? "" : num_(l.packPrice), l.onRequest ? "" : num_(l.lineTotal), l.onRequest ? "yes" : ""];
    });
    lines.getRange(lines.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    notify_(p, ref, itemText, ss.getUrl());
    return json_({ ok: true, ref: ref });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function notify_(p, ref, itemText, sheetUrl) {
  var subject = SUBJECT_PREFIX + ref + " - " + (p.company || p.name || "unknown") + " - $" + num_(p.subtotal).toFixed(2) +
    (p.onRequestLines ? " + " + p.onRequestLines + " on request" : "");
  var body = [
    "New wholesale order request from " + (p.site || "egarden.playbees.shop"),
    "",
    "Ref:      " + ref,
    "Name:     " + (p.name || ""),
    "Company:  " + (p.company || ""),
    "Email:    " + (p.email || ""),
    "Phone:    " + (p.phone || ""),
    "Notes:    " + (p.notes || "-"),
    "",
    "ITEMS (quantity in packs)",
    itemText,
    "",
    "Subtotal: $" + num_(p.subtotal).toFixed(2) + (p.onRequestLines ? "  (+ " + p.onRequestLines + " item(s) priced on request)" : ""),
    "Packs:    " + (p.packs || 0),
    "",
    "Sheet: " + sheetUrl,
  ].join("\n");
  var opts = { name: "eGarden catalog" };
  if (p.email && /@/.test(p.email)) opts.replyTo = p.email;
  MailApp.sendEmail(RECIPIENTS.join(","), subject, body, opts);
}

function alreadyLogged_(orders, ref) {
  var last = orders.getLastRow();
  if (last < 2) return false;
  var refs = orders.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < refs.length; i++) if (String(refs[i][0]) === ref) return true;
  return false;
}

function sheet_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function nextRef_() {
  var props = PropertiesService.getScriptProperties();
  var d = new Date(), key = "EG-" + Utilities.formatDate(d, "America/New_York", "yyMMdd");
  var n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return key + "-" + ("00" + n).slice(-3);
}

function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor to authorize Sheets + Mail and to confirm the script works. */
function selfTest() {
  var fake = { postData: { contents: JSON.stringify({ ref: "EG-TEST-0001", site: "test", name: "Test Buyer", company: "Test Store", email: "buyer@example.com", phone: "555-0100", notes: "self test",
    lines: [{ uid: "PB141", name: "Squishy Fun Foods", spec: "10 Pack", category: "Squishy Foods", packs: 3, packPrice: 2.3, lineTotal: 6.9, onRequest: false },
            { uid: "NEW", name: "Squishy Ducky", spec: "Each", category: "Squishy Shapes & Balls", packs: 12, packPrice: null, lineTotal: null, onRequest: true }],
    items: 2, packs: 15, subtotal: 6.9, onRequestLines: 1 }) } };
  Logger.log(doPost(fake).getContent());
}
