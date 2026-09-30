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
  let s=String(v??"").replace(/[^\d,.\-]/g,"");
  if(s.includes(",")&&s.includes(".")) s = s.lastIndexOf(",")>s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
  else if(s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",",".") : s.replace(/,/g,"");
  const n=parseFloat(s); return isFinite(n)?n:0;
}
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

/* Calcula un plan personalizado que tenga el mismo valor presente que el plan estándar.
   El cliente decide entrada, pago anticipado, número de cuotas y total en cuotas;
   el contra entrega se ajusta y la diferencia contra el precio es el descuento. */
window.lvPlan = function (precio, o) {
  const C = window.LV_CONFIG, T = C.plazoMeses;
  const r = (o.tasa ?? C.tasaAnual) / 100 / 12;
  const f = n => Math.pow(1 + r, -n);                          // factor de descuento
  const a = n => n > 0 ? (r ? (1 - f(n)) / r : n) : 0;         // valor presente de n cuotas de $1
  const r2 = x => Math.round(x * 100) / 100;
  const avisos = [];

  // Plan estándar (referencia)
  const std = { E: precio * C.entradaPct / 100, C: precio * C.cuotasPct / 100 };
  std.CE = precio - std.E - std.C;
  const vpStd = std.E + (std.C / T) * a(T) + std.CE * f(T);

  // Plan del cliente
  let E = r2(precio * (o.entradaPct ?? C.entradaPct) / 100);
  let A = Math.max(0, r2(o.anticipado || 0));
  let n = Math.max(0, Math.min(T, Math.round(o.cuotas ?? T)));
  let total = n ? Math.max(0, o.totalCuotas ?? precio * C.cuotasPct / 100) : 0;
  let c = n ? total / n : 0;

  if (E + A > vpStd) {                                          // pagó todo al inicio
    A = r2(Math.max(0, vpStd - E)); c = 0; total = 0;
    avisos.push("El pago anticipado cubre todo el departamento; se ajustó al máximo.");
  }
  let CE = (vpStd - E - A - c * a(n)) / f(T);
  if (CE < 0) {                                                 // cuotas cubren todo: contra entrega = 0
    c = n ? (vpStd - E - A) / a(n) : 0; CE = 0;
    avisos.push("Con estos pagos el departamento queda pagado en la construcción; se ajustó la cuota.");
  }
  c = r2(c); total = r2(c * n);
  CE = r2(Math.max(0, (vpStd - E - A - c * a(n)) / f(T)));   // recalculado con la cuota redondeada
  let D = r2(precio - (E + A + total + CE));
  if (Math.abs(D) < 1) { D = 0; CE = r2(precio - E - A - total); }   // centavos de redondeo
  if (D < 0) {                                                  // paga menos que el estándar durante la obra
    D = 0; CE = r2(precio - E - A - total);
    avisos.push("Este plan paga menos que el estándar durante la obra: no aplica descuento.");
  }
  return { precio, E, entradaPct: o.entradaPct ?? C.entradaPct, A, n, c, total, CE, D,
           final: r2(precio - D), pctDesc: D / precio * 100, tasa: o.tasa ?? C.tasaAnual, plazo: T, avisos };
};
