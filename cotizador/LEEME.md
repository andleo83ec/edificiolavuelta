# Cotizador La Vuelta

Carpeta: `cotizador/` (va en la raíz del mismo repo de edificiolavuelta.com).
Dirección: https://edificiolavuelta.com/cotizador/

## Actualizar precios o estado
Edita `unidades.csv` en GitHub (lápiz ✏️ → Commit). Columnas:
unidad, piso, tipologia, area_interna, area_balcon, area_parqueo_bodega, area_total, dormitorios, banos, parqueo, bodega, estado, precio

- estado: `Disponible`, `Reservado` o `Vendido` (solo "Disponible" se puede cotizar).
- precio: número con punto decimal y sin comas (ej. 112090.25).

## Planos
`img/planos/tipo-01.jpg` … `tipo-23.jpg`. Para usar tus imágenes originales, súbelas con el mismo nombre.

## Datos desde el formulario de eventos
El cotizador lee de la URL: `?nombre=…&cel=…&correo=…` (opcional `&unidad=304` y `&ci=…`).
