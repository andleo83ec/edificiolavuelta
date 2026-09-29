/* ================================================================
   La Vuelta · configuración y cálculo del plan de pagos
   Cambia aquí las condiciones comerciales (aplica a calculadora y cotizador).
   ================================================================ */
window.LV_CONFIG = {
  tasaAnual: 7,     // % anual con la que se calcula el descuento por pronto pago
  plazoMeses: 30,   // meses de construcción (fecha del pago contra entrega)
  entradaPct: 5,    // entrada del plan estándar
  cuotasPct: 25     // % pagado en cuotas durante la construcción en el plan estándar
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
