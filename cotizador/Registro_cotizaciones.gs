/**
 * La Vuelta · Registro de cotizaciones
 * Pega este código en: Hoja de Google → Extensiones → Apps Script.
 * Cambia TOKEN por una clave propia y usa la misma en plan.js (registroToken).
 */
const TOKEN = 'CAMBIA-ESTA-CLAVE';
const HOJA  = 'Cotizaciones';
const COLUMNAS = ['Fecha','Código','Acción','Asesor','Cliente','Cédula','Celular','Correo',
  'Dpt','Piso','Tipología','Precio lista','Descuento al precio','Precio con descuento','Esquema',
  'Entrada','Pago anticipado','N° cuotas','Valor cuota','Contra entrega','Descuento pronto pago',
  'Precio final','Vigencia (días)','Observaciones'];

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return salida({ ok: false, error: 'datos' }); }
  if (d.token !== TOKEN) return salida({ ok: false, error: 'token' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerHoja();
    const fila = [new Date(), d.codigo, d.accion, d.asesor, d.cliente, d.cedula, d.celular, d.correo,
      Number(d.unidad), Number(d.piso), d.tipologia, d.lista, d.desc, d.neto, d.esquema,
      d.E, d.A, d.n, d.c, d.CE, d.D, d.final, d.vigencia, d.observaciones];

    // Si el mismo código ya existe (PDF y luego WhatsApp), se actualiza esa fila.
    const ultima = hoja.getLastRow();
    const codigos = ultima > 1 ? hoja.getRange(2, 2, ultima - 1, 1).getValues().map(r => r[0]) : [];
    const i = codigos.indexOf(d.codigo);
    if (i >= 0) {
      const r = i + 2;
      const antes = String(hoja.getRange(r, 3).getValue() || '');
      fila[0] = hoja.getRange(r, 1).getValue();
      fila[2] = antes && antes.indexOf(d.accion) < 0 ? antes + ' + ' + d.accion : (antes || d.accion);
      hoja.getRange(r, 1, 1, fila.length).setValues([fila]);
    } else {
      hoja.appendRow(fila);
    }
    return salida({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return salida({ ok: true, mensaje: 'Registro de cotizaciones activo' }); }

function obtenerHoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold').setBackground('#8c2628').setFontColor('#faede1');
    hoja.getRange('A:A').setNumberFormat('dd/mm/yyyy hh:mm');
    hoja.getRange('L:N').setNumberFormat('$#,##0.00');
    hoja.getRange('P:Q').setNumberFormat('$#,##0.00');
    hoja.getRange('S:V').setNumberFormat('$#,##0.00');
  }
  return hoja;
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
