# Control de Stock

App web instalable (PWA) para contar stock entre varios usuarios. Funciona **separada** del sistema principal: se importa una copia de los productos desde una planilla y, al cerrar el conteo, se exporta el resultado para cargarlo en el sistema.

## Puesta en marcha

1. Crear un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. **SQL Editor** → pegar y ejecutar todo [supabase/schema.sql](supabase/schema.sql).
3. **Authentication → Providers → Email**: desactivar "Allow new users to sign up" (los usuarios los crea el admin).
4. **Authentication → Users → Add user**: crear TU usuario (email + contraseña, marcar "Auto confirm"). **El primer usuario queda como administrador.**
5. Desplegar la función que permite al admin crear usuarios desde la app:
   ```
   npx supabase login
   npx supabase link --project-ref TU-REF
   npx supabase functions deploy create-user
   ```
6. Copiar `.env.example` a `.env` y completar URL y clave anon (Project Settings → API).
7. `npm run dev` para probar, `npm run build` para generar `dist/`, que se publica gratis en Vercel, Netlify o Cloudflare Pages (cargando las mismas dos variables de entorno).

## Flujo de trabajo

1. **Productos** → importar la planilla (columnas: `codigo`, `nombre`, `stock`; opcionales: `unidad`, `categoria`, `barcode`, `costo`, `stock_minimo`, `stock_ideal`).
2. **Conteo** → "Iniciar conteo" (congela el stock del sistema como referencia).
3. Cada persona busca un producto (filtrando por unidad, kilo o litro) y **suma** cantidades. Si la interrumpen, retoma después sin perder nada. Funciona sin señal.
4. **Reportes** → diferencias, sin contar, a reponer. "Exportar Excel" genera la hoja de ajustes para cargar en el sistema principal.
5. "Cerrar conteo": lo contado pasa a ser el stock base de la app.

## Tests

```
npm test
```

Usan Vitest y están organizados por **clases de equivalencia** (cada `describe` lista las clases y cada `it` prueba un representante). Corré `npm test` antes de subir cada cambio.
La lógica testeable está en `src/lib/` (unidades, importación, producto nuevo, conteo) y `src/offline.js`.

> En Windows, si la ruta de la carpeta contiene `&`, `npm` falla: usá `node node_modules/vitest/vitest.mjs run`.

## Vínculo futuro con el sistema principal

`productos.codigo` es la clave de enlace. Un futuro vínculo solo tendría que reemplazar el paso de importar/exportar planilla.
