# Control de Stock

App web para **contar el stock de un producto entre varias personas**, sin perder el hilo cuando alguien se interrumpe. Pensada para un local de productos de limpieza, con hasta unas 5 personas contando a la vez.

Es una app **independiente** del sistema de gestión del negocio: no se conecta a su base de datos ni toca su stock. El resultado de cada conteo se pasa a mano al sistema principal.

## El problema que resuelve

Contar stock a mano tiene un problema: si estás contando esponjas y entra un cliente, tenés que dejar de contar, anotar hasta dónde llegaste y después retomar, sin saber si vas a seguir desde el mismo punto.

Acá cada carga **se suma** (o se resta) al total y queda guardada. Se puede cortar en cualquier momento y seguir después, y varias personas pueden contar a la vez sin pisarse.

## Qué hace

- **Un producto por conteo, escrito a mano:** el administrador abre el conteo escribiendo qué se va a contar, con el nombre que él entienda (por ejemplo "esp rosa"). Contar de a un producto evita errores.
- **Sumar y restar:** cada persona carga lo que contó (+20) o corrige si contó de más (−5). Solo **enteros positivos**, y el total **nunca puede quedar negativo** (la base lo impide aunque dos personas resten a la vez).
- **Varios usuarios a la vez:** lo que suma una persona lo ven las demás casi al instante.
- **Modo sin conexión:** si no hay señal, las cargas se guardan en el teléfono y se envían solas al volver la conexión. Si alguna la rechaza la base (por ejemplo, el conteo ya se cerró), se avisa y no traba al resto.
- **Revisar el resultado:** al cerrar el conteo, el total queda a la vista para pasarlo al sistema principal, hasta que se abre el siguiente.

## Cómo se usa

1. **Abrir:** el administrador escribe qué se va a contar (hasta 60 caracteres) y toca **Abrir conteo**. Solo puede haber un conteo abierto a la vez.
2. **Contar:** todos ven el producto y el total parcial. Escriben la cantidad (o usan +1 / +5 / +10) y tocan **Sumar** o **Restar**.
3. **Cerrar:** el administrador toca **Cerrar conteo** y confirma. Conviene avisar antes a los demás que dejen de contar.
4. **Revisar y pasar:** la pantalla muestra el último conteo cerrado con su total. Ese número se carga a mano en el sistema principal.
5. **Reiniciar:** al abrir un conteo nuevo, el anterior deja de mostrarse.

No hay historial visible en la app, pero **todos los conteos quedan guardados en la base**, lo que deja lugar a mejoras futuras (recopilar conteos, recordar productos que se cuentan seguido, etc.).

### Preparado para varios productos

Cada conteo tiene un máximo de productos (`conteos.max_productos`, hoy siempre 1). La pantalla ya muestra un bloque por producto y la base rechaza agregar más de los permitidos, así que permitir N productos el día de mañana es cambiar ese valor y agregar la forma de sumar productos al conteo.

### Pantallas ocultas por ahora

Las pestañas **Productos** (planilla, alta y edición de productos), **Reportes** (diferencias contra el sistema y Excel) y **Usuarios** quedaron **ocultas**: su código sigue en `src/pages` con sus tests, y se reactivan agregándolas a `tabs` en `src/App.jsx`. Mientras estén ocultas, los usuarios se crean desde el panel de Supabase (Authentication → Users → Add user).

## Roles y seguridad

| | Contador | Administrador |
|---|---|---|
| Ver el conteo y el último resultado | Sí | Sí |
| Sumar y restar cantidades | Sí | Sí |
| Abrir y cerrar conteos | No | Sí |
| Productos, reportes y usuarios (pantallas ocultas por ahora) | No | Sí |

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
- Al abrir un conteo (`abrir_conteo`) se crea un producto propio de ese conteo con el nombre escrito (`origen = 'conteo'`, sin mezclarse con un catálogo) y su fila en `conteo_base`.
- Un trigger en `conteo_movimientos` (`validar_movimiento`) hace cumplir las reglas en la base: el producto tiene que ser del conteo, las unidades son enteras y el total no puede quedar negativo. Los reenvíos de la cola sin conexión se ignoran sin error.

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

- **Un producto escrito a mano por conteo** por pedido del cliente. El nombre libre no tiene código, así que no se vincula con el sistema principal ni calcula diferencias: el resultado se pasa a mano.

- **Independiente del sistema principal** por pedido del cliente. El código de producto (`codigo`) es la clave de enlace, de modo que un futuro vínculo directo solo tendría que reemplazar el paso de importar y exportar la planilla.
- **Sin costos ni stock ideal:** la app cuenta cantidades; no valoriza ni sugiere cuánto pedir.
- **Sin lector de código de barras:** se evaluó y se sacó por ahora. La columna `barcode` sigue en la base y la búsqueda la entiende, por si más adelante se retoma.
- **Alta rápida y conexión:** dar de alta un producto nuevo durante el conteo necesita conexión; sumar cantidades no.
- **Plan gratuito de Supabase:** pausa los proyectos tras 7 días sin actividad. Para un uso regular no es problema; si se usa muy esporádicamente, conviene un aviso o un ping automático.
