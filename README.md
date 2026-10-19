# Control de Stock

App web para **contar el stock de una tienda entre varias personas**, sin perder el hilo cuando alguien se interrumpe. Pensada para un local de productos de limpieza (líquidos, pastas y artículos secos), con hasta unas 5 personas contando a la vez y entre 100 y 500 productos.

Es una app **independiente** del sistema de gestión del negocio: no se conecta a su base de datos ni toca su stock. Trabaja con una copia de los productos que se importa desde una planilla y, al terminar, exporta el resultado para cargarlo a mano en el sistema principal.

## El problema que resuelve

Contar stock a mano tiene un problema: si estás contando esponjas y entra un cliente, tenés que dejar de contar, anotar hasta dónde llegaste y después retomar, sin saber si vas a seguir desde el mismo punto.

Acá cada carga **se suma** al total del producto y queda guardada con su autor y su hora. Se puede cortar en cualquier momento y seguir después, y varias personas pueden contar el mismo producto sin pisarse.

## Qué hace

- **Conteo acumulativo:** se busca un producto y se suma la cantidad contada. Se puede corregir el total si hubo un error.
- **Varios usuarios a la vez:** lo que carga una persona lo ven las demás casi al instante.
- **Unidad, kilo y litro:** cada producto tiene su unidad. Las unidades se cuentan en enteros; kilos y litros admiten hasta 3 decimales.
- **Progreso:** muestra cuántos productos faltan contar y permite filtrar por pendientes, contados y por tipo de unidad.
- **Modo sin conexión:** si no hay señal en el depósito, las cargas se guardan en el teléfono y se envían solas al volver la conexión.
- **Importar productos** desde una planilla (Excel o CSV) o **cargarlos a mano** uno por uno.
- **Editar y eliminar productos** (solo administrador): se corrige código, nombre, unidad, categoría, stock y mínimo. Un producto que nunca se contó se borra; uno con historial se **archiva** (no aparece en conteos nuevos, conserva los anteriores y se puede reactivar).
- **Alta rápida:** durante el conteo, cualquier persona puede dar de alta un producto que está en el local pero no en la planilla. Queda marcado para cargarlo después en el sistema principal.
- **Reportes** (solo administrador): diferencias entre lo contado y el sistema, productos sin contar y productos a reponer (en o bajo el stock mínimo).
- **Exportar a Excel** el resultado, con una hoja de ajustes lista para cargar en el sistema principal.
- **Usuarios con roles:** el administrador crea las cuentas; los contadores solo cuentan.

## Cómo se usa (flujo de trabajo)

1. **Importar:** el administrador sube la copia de la planilla del sistema en la pestaña *Productos*. Si el código ya existe, se actualiza; los que no están en la planilla no se tocan.
2. **Iniciar un conteo:** se toma una foto del stock actual de cada producto. Esa foto es la referencia contra la que se calculan las diferencias.
3. **Contar:** cada persona busca un producto y suma lo que cuenta. Puede cortar y seguir cuando quiera.
4. **Revisar:** en *Reportes* el administrador ve las diferencias y qué falta contar.
5. **Exportar y cerrar:** se descarga el Excel con los ajustes y se cierra el conteo. Lo contado pasa a ser el stock base de la app para el próximo conteo.
6. El administrador carga los ajustes en el sistema principal.

Reglas al editar un producto: el código no puede repetirse; la unidad no se cambia si el producto ya tiene cantidades contadas; y el stock del sistema no se modifica mientras hay un conteo abierto (se fijó al iniciarlo). Si se elimina un producto durante un conteo y todavía no tenía cargas ahí, también se lo saca de ese conteo.

Solo puede haber un conteo abierto a la vez, y no se puede importar ni crear productos a mano mientras haya uno abierto (para eso está la alta rápida).

### Formato de la planilla

| Columna | Obligatoria | Detalle |
|---|---|---|
| `codigo` | Sí | Identifica al producto. Es la clave de enlace con el sistema principal. |
| `nombre` | Sí | |
| `stock` | Recomendada | Stock según el sistema (si falta, se toma 0). |
| `unidad` | No | `un`, `kg` o `lt`. Acepta variantes (`kilos`, `litros`, `unidades`…). Vacía = `un`. |
| `categoria` | No | |
| `stock_minimo` | No | Para la lista "a reponer". Si la columna no está, no pisa lo ya cargado. |

Los encabezados se reconocen sin importar mayúsculas ni tildes, y admiten sinónimos comunes (`descripcion`, `rubro`, `existencia`, etc.). Las filas sin nombre o código, o con una unidad no válida, se omiten y se informan al importar. Desde la app se puede descargar una plantilla de ejemplo.

## Roles y seguridad

| | Contador | Administrador |
|---|---|---|
| Ver productos y conteo | Sí | Sí |
| Sumar cantidades y dar de alta productos durante el conteo | Sí | Sí |
| Importar / crear / editar / eliminar productos, iniciar y cerrar conteos | No | Sí |
| Ver reportes y exportar | No | Sí |
| Crear y desactivar usuarios | No | Sí |

- Los permisos se aplican **en la base de datos** (políticas RLS de Supabase), no solo en la pantalla: aunque alguien manipule la app, la base rechaza lo que su rol no permite.
- **El primer usuario que se crea queda como administrador**; los siguientes, como contadores.
- Un usuario desactivado pierde el acceso al instante.
- La clave `anon`/`publishable` de Supabase que usa la app **no es secreta** (viaja en el navegador); la seguridad la dan las políticas RLS. Lo que nunca debe exponerse es la clave `service_role`.

## Tecnología

- **Front:** React 18 + Vite, instalable como PWA (se agrega a la pantalla de inicio, funciona sin conexión).
- **Base de datos y login:** [Supabase](https://supabase.com) (Postgres + Auth + Realtime). Entra en el plan gratuito.
- **Excel:** [SheetJS](https://sheetjs.com) para importar y exportar.
- **Tests:** Vitest.
- **Hosting recomendado:** Vercel, Netlify o Cloudflare Pages (gratis para este uso).

## Estructura del proyecto

```
src/
  App.jsx              Sesión, perfil, pestañas y sincronización de la cola offline
  offline.js           Cola de cargas pendientes (localStorage) y su envío
  supabase.js          Cliente de Supabase
  pages/
    Login.jsx
    Conteo.jsx         Pantalla principal de conteo
    Productos.jsx      Importar, crear a mano, mínimos (admin)
    Reportes.jsx       Diferencias, sin contar, a reponer, exportar, cerrar (admin)
    Usuarios.jsx       Crear y desactivar usuarios (admin)
  lib/                 Lógica pura, sin React ni Supabase (es lo que se testea)
    unidades.js        Unidades un/kg/lt y validación de cantidades
    importar.js        Lectura y normalización de la planilla
    producto.js        Validación del formulario de producto nuevo
    conteo.js          Progreso, filtros, diferencias y reposición
supabase/
  schema.sql           Tablas, vista, seguridad (RLS) y funciones
  functions/create-user/   Función del servidor para que el admin cree usuarios
```

### Cómo funciona el conteo por dentro

- Cada carga es un **registro nuevo** en `conteo_movimientos` (producto, cantidad, usuario, hora). El total de un producto es la suma de sus registros, así nunca se pisan dos personas y queda historial.
- Cada registro tiene un **id generado en el dispositivo**: si una carga hecha sin conexión se reenvía, la base la reconoce y no la duplica.
- Al iniciar un conteo se guarda el stock del sistema de cada producto en `conteo_base`, por eso las diferencias siguen siendo correctas aunque después se actualice la planilla.

## Puesta en marcha

Necesitás Node.js 18 o superior y una cuenta en Supabase.

1. **Crear el proyecto** en [supabase.com](https://supabase.com).
2. **Base de datos:** en *SQL Editor*, pegar y ejecutar todo [supabase/schema.sql](supabase/schema.sql).
3. **Cerrar el registro público:** en *Authentication → Sign In / Providers*, desactivar "Allow new users to sign up". Así solo existen las cuentas que crea el administrador.
4. **Crear el usuario administrador:** *Authentication → Users → Add user* (email y contraseña, con "Auto confirm"). Tiene que ser **el primero**, porque el primer usuario queda como admin.
5. **Función para crear usuarios desde la app:**
   ```
   npx supabase login
   npx supabase link --project-ref TU-REF
   npx supabase functions deploy create-user
   ```
   Hasta que esté desplegada, los usuarios se pueden crear desde el panel de Supabase (entran como contadores).
6. **Variables de entorno:** copiar `.env.example` a `.env` y completar la URL del proyecto y la clave pública (*Project Settings → API*).
7. **Instalar y correr:**
   ```
   npm install
   npm run dev
   ```
8. **Publicar:** `npm run build` genera `dist/`, que se sube a Vercel, Netlify o Cloudflare Pages. Cargar las mismas dos variables (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) en el panel del servicio, no en el código.

> **Windows:** si la ruta de la carpeta contiene `&` (por ejemplo `A&C`), `npm run …` falla. Alcanza con ejecutar los programas directamente: `node node_modules/vite/bin/vite.js` para desarrollo, y `node node_modules/vitest/vitest.mjs run` para los tests.

## Tests

```
npm test
```

Los tests están organizados por **clases de equivalencia**: cada `describe` enumera las clases (por ejemplo, "entero positivo", "decimal", "cero", "negativo", "no numérico") y cada `it` prueba un representante de una clase. Corrélos antes de subir cada cambio. Cubren la lógica de `src/lib/` y la cola offline (`src/offline.js`).

## Decisiones y límites

- **Independiente del sistema principal** por pedido del cliente. El código de producto (`codigo`) es la clave de enlace, de modo que un futuro vínculo directo solo tendría que reemplazar el paso de importar y exportar la planilla.
- **Sin costos ni stock ideal:** la app cuenta cantidades; no valoriza ni sugiere cuánto pedir.
- **Sin lector de código de barras:** se evaluó y se sacó por ahora. La columna `barcode` sigue en la base y la búsqueda la entiende, por si más adelante se retoma.
- **Alta rápida y conexión:** dar de alta un producto nuevo durante el conteo necesita conexión; sumar cantidades no.
- **Plan gratuito de Supabase:** pausa los proyectos tras 7 días sin actividad. Para un uso regular no es problema; si se usa muy esporádicamente, conviene un aviso o un ping automático.
