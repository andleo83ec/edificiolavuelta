/* ================================================================
   La Vuelta · configuración y cálculo del plan de pagos
   Cambia aquí las condiciones comerciales (aplica a calculadora y cotizador).
   ================================================================ */
window.LV_VERSION = "2026-09-29 hoja-google";
window.LV_CONFIG = {
  tasaAnual: 7,     // % anual con la que se calcula el descuento por pronto pago
  plazoMeses: 30,   // meses de construcción (fecha del pago contra entrega)
  entradaPct: 5,    // entrada del plan estándar
  cuotasPct: 25,    // % pagado en cuotas durante la construcción en el plan estándar

  // Enlace CSV de la hoja de Google publicada (Archivo → Compartir → Publicar en la web → CSV).
  // Déjalo vacío ("") para usar el archivo unidades.csv del repositorio.
  // Registro de cotizaciones (Apps Script de la hoja de Google). Vacío = no se registra.
  prontoPagoMinimo: 100, // descuentos por pronto pago menores a este monto no se aplican (redondeos)

  registroURL: "",
  registroToken: "",

  fuenteDatos: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvS3Oy4FC6IAgoR9jLFmdrYeaMxiQTkzLvh7OQs5cMLLgciJCgQj8riMWQn9iuBvsS_jiUmy0JmHTE/pub?gid=1476526299&single=true&output=csv"
};

/* Descuento comercial sobre el precio de lista: tipo "p" = porcentaje, "m" = monto en dólares */
window.lvDescuento = function (precio, tipo, valor) {
  let d = tipo === "p" ? precio * (valor || 0) / 100 : (valor || 0);
  d = Math.round(Math.max(0, Math.min(d, precio)) * 100) / 100;
  return { desc: d, neto: Math.round((precio - d) * 100) / 100, pct: precio ? d / precio * 100 : 0 };
};

/* ---------- Lectura de unidades (hoja de Google o unidades.csv) ---------- */
function lvNumero(v){
  let s=String(v??"").trim().replace(/[^\d,.\-]/g,"");
  if(s.includes(",")&&s.includes(".")) s = s.lastIndexOf(",")>s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
  else if(s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(/\.(?=.*,)/g,"").replace(",",".") : s.replace(/,/g,"");
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,"");   // 121.500 = ciento veintiún mil quinientos
  const n=parseFloat(s); return isFinite(n)?n:0;
}
/* Formato ecuatoriano: punto para miles y coma para decimales */
window.lvFmt = function(n, dec=2){
  const neg=n<0, [e,d]=Math.abs(Number(n)||0).toFixed(dec).split(".");
  return (neg?"-":"")+e.replace(/\B(?=(\d{3})+(?!\d))/g,".")+(dec?","+d:"");
};
window.lvUSD = (n, dec=2) => "$"+lvFmt(n,dec);
window.lvFmtEntrada = v => { const x=Math.round((+v||0)*100)/100; return x? lvFmt(x, Number.isInteger(x)?0:2) : ""; };
window.lvNumero = lvNumero;
function lvParseCSV(texto){
  const filas=[]; let fila=[], campo="", q=false;
  for(let i=0;i<texto.length;i++){
    const ch=texto[i];
    if(q){ if(ch==='"'){ if(texto[i+1]==='"'){campo+='"';i++;} else q=false; } else campo+=ch; }
    else if(ch==='"') q=true;
    else if(ch===","){ fila.push(campo); campo=""; }
    else if(ch==="\n"||ch==="\r"){ if(ch==="\r"&&texto[i+1]==="\n") i++; fila.push(campo); filas.push(fila); fila=[]; campo=""; }
    else campo+=ch;
  }
  if(campo!==""||fila.length){ fila.push(campo); filas.push(fila); }
  const [cab,...resto]=filas.filter(r=>r.some(c=>c.trim()!==""));
  const k=cab.map(c=>c.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_"));
  const numericos=["area_interna","area_balcon","area_parqueo_bodega","area_total","precio"];
  return resto.map(r=>{ const o={}; k.forEach((x,i)=>o[x]=(r[i]??"").trim());
    numericos.forEach(x=>o[x]=String(lvNumero(o[x])));
    ["unidad","piso","dormitorios","banos","parqueo","bodega"].forEach(x=>o[x]=String(Math.round(lvNumero(o[x]))));
    o.tipologia=String(Math.round(lvNumero(o.tipologia))).padStart(2,"0");
    const e=(o.estado||"Disponible").toLowerCase();
    o.estado= e.startsWith("disp")?"Disponible": e.startsWith("res")?"Reservado": e.startsWith("vend")?"Vendido": o.estado;
    return o; }).filter(o=>+o.unidad>0);
}
window.lvCargarUnidades = async function(){
  const fuente=window.LV_CONFIG.fuenteDatos;
  if(fuente){
    try{ const r=await fetch(fuente+(fuente.includes("?")?"&":"?")+"t="+Date.now(),{cache:"no-store"});
      if(r.ok){ const u=lvParseCSV(await r.text()); if(u.length) return u; } }
    catch(e){ console.warn("No se pudo leer la hoja de Google; se usa unidades.csv",e); }
  }
  const r=await fetch("unidades.csv",{cache:"no-store"}); if(!r.ok) throw new Error("sin datos");
  return lvParseCSV(await r.text());
};

/* Plan personalizado.
   - Entrada, pago anticipado, número y valor de cuotas los decide el asesor (se pueden redondear).
   - El descuento por pronto pago compara el plan del cliente con las condiciones iniciales
     (5% entrada · 25% en cuotas durante la obra · 70% contra entrega) a la tasa fijada:
       · lo que pague antes que el plan estándar (anticipo, más cuotas, más entrada) suma descuento;
       · lo que deje de pagar en la obra (menos o ninguna cuota) resta descuento.
     Si el resultado es negativo no hay descuento (no se cobra recargo).
   - El descuento se aplica en el pago contra entrega; el contra entrega es el saldo. */
window.lvPlan = function (precio, o) {
  const C = window.LV_CONFIG, T = C.plazoMeses;
  const tasa = o.tasa ?? C.tasaAnual, r = tasa / 100 / 12;
  const r2 = x => Math.round(x * 100) / 100;
  const f = n => Math.pow(1 + r, -n);
  const a = n => n > 0 ? (r ? (1 - f(n)) / r : n) : 0;
  const avisos = [];

  // Condiciones iniciales (referencia)
  const E0 = precio * C.entradaPct / 100, C0 = precio * C.cuotasPct / 100;
  const vpStd = E0 + (C0 / T) * a(T) + (precio - E0 - C0) * f(T);

  let E = o.entrada != null ? r2(o.entrada) : r2(precio * (o.entradaPct ?? C.entradaPct) / 100);
  E = Math.min(Math.max(0, E), precio);
  let A = Math.max(0, r2(o.anticipado || 0));
  const n = Math.max(0, Math.min(T, Math.round(o.cuotas ?? T)));
  let c = n ? Math.max(0, r2(o.cuota != null ? o.cuota : C0 / n)) : 0;

  // Descuento (en la entrega) que deja al proyecto igual que con el plan estándar
  const dNeutro = () => (E + A + c * a(n) + (precio - E - A - c * n) * f(T) - vpStd) / f(T);
  let D = o.sinPronto ? 0 : dNeutro();

  if (!o.sinPronto && precio - E - A - c * n - D < 0) {       // pagos durante la obra cubren todo
    if (E + A >= vpStd) { A = r2(Math.max(0, vpStd - E)); c = 0;
      avisos.push("El pago anticipado cubre todo el departamento; se ajustó al máximo."); }
    else { c = n ? Math.floor((vpStd - E - A) / a(n) * 100) / 100 : 0;
      avisos.push("Con estos pagos el departamento queda pagado en la construcción; se ajustó la cuota."); }
    D = dNeutro();
  } else if (o.sinPronto && E + A + c * n > precio) {
    c = n ? Math.max(0, Math.floor((precio - E - A) / n * 100) / 100) : 0;
    avisos.push("Con estos pagos el departamento queda pagado en la construcción; se ajustó la cuota.");
  }
  if (D > 0 && D < (C.prontoPagoMinimo || 0)) D = 0;              // diferencias de redondeo
  if (D < -50) avisos.push("Este plan paga menos que las condiciones iniciales durante la obra: no aplica descuento por pronto pago.");
  D = r2(Math.max(0, D));
  const total = r2(c * n);
  const CE = r2(Math.max(0, precio - E - A - total - D));
  return { precio, E, entradaPct: precio ? E / precio * 100 : 0, A, n, c, total, CE, D,
           final: r2(precio - D), pctDesc: precio ? D / precio * 100 : 0, tasa, plazo: T, avisos };
};
