# Máximo FPS

Aplicación de escritorio para Windows 10/11 x64, con una interfaz en español inspirada en paneles gaming. Incluye un monitor de hardware, 54 ajustes individuales, tres perfiles y restauración local. La web y Linux permiten explorar una **demostración**; solo la aplicación de Windows ejecuta cambios reales.

## Descargar y usar

La descarga de esta entrega es **Maximo-FPS-Portable-0.1.0.exe** para Windows 10/11 de 64 bits. Guárdala en una carpeta y ábrela; no requiere instalación. La primera apertura puede tardar unos segundos mientras se extrae. La aplicación funciona sin cuenta ni conexión a Internet.

1. Abre Máximo FPS y pulsa **Analizar PC**.
2. En **Optimizaciones**, revisa los detalles y consecuencias de cada ajuste.
3. Selecciona los que quieras o carga un perfil. Ningún perfil se aplica automáticamente.
4. Pulsa **Aplicar selección** y confirma la lista. La app guarda los valores anteriores antes de modificarlos.
5. Comprueba el resultado. Algunos cambios necesitan cerrar sesión o reiniciar; la app nunca reinicia por su cuenta.
6. Para deshacer un lote, abre **Historial → Restaurar**. Se restaura siempre del lote más reciente al más antiguo.

Los ocho ajustes del perfil Equilibrado no requieren administrador. Para los servicios y ajustes globales identificados con **Admin**, inicia la aplicación mediante **Ejecutar como administrador** usando la misma cuenta de Windows. Elevar con otra cuenta modifica otro perfil HKCU y guarda otro historial.

**Estado de esta entrega:** beta sin certificado de firma propio; Windows puede indicar editor desconocido. Ejecutable portátil generado en Linux mediante las herramientas oficiales de Electron/NSIS y su contenido verificado. La interfaz y el motor de respaldo se probaron automáticamente; la ejecución de registro, servicios y el ejecutable aún requieren validación en Windows real. No desactives protecciones de Windows para probarla. Prueba la beta primero en un equipo de pruebas o una VM.

## Funciones

- Panel de hardware: CPU y núcleos, GPU y VRAM cuando el controlador la informa, RAM usada/disponible, volúmenes y espacio libre.
- Lecturas de Windows mediante CIM cada 10 segundos, con actualización manual opcional. El uso de GPU se muestra como no disponible si no hay un sensor compatible.
- 54 ajustes en juego, sistema, privacidad, red, visuales y limpieza de funciones en segundo plano.
- Perfiles Equilibrado, Gaming y Privacidad; búsquedas y filtros; explicación de permisos y reinicio por ajuste.
- Historial de operaciones y recuperación de valores originales del registro, modo de inicio de servicios y plan de energía.
- Exportación local de diagnóstico JSON, tipografía incluida y opción de reducir animaciones.
- Demostración con el hardware indicado: Intel i5-9400F, Radeon RX 560, 16 GB DDR4 y 1,6 TB. Los datos de demostración **no son mediciones de tu PC**.

La limpieza de esta versión desactiva funciones opcionales; **no elimina archivos temporales ni desinstala paquetes**. Los servicios solo cambian su modo de inicio, sin detenerse en vivo. La compatibilidad de políticas varía por versión/edición de Windows. El estado «aplicado» verifica el valor configurado, pero no acredita una mejora de FPS ni que una política sea consumida por todas las ediciones.

No incluye overclock, cambio de timers/HPET/MSI, desactivación del antivirus, firewall ni Windows Update. Ningún ajuste garantiza una mejora de FPS: compara un benchmark del mismo juego y configuración antes y después.

## Desarrollo

Requisitos: Node.js 22.12+ o 24 LTS y npm. Windows x64 para operaciones reales. Utiliza el checkout existente; no hace falta un worktree.

```sh
npm ci
npm run dev
```

El servidor Vite utiliza el puerto 5173. La vista de navegador funciona como demostración, con sus estados guardados en localStorage. No ofrece acceso al registro ni a servicios del equipo.

Aplicación de escritorio en desarrollo:

```sh
npm run dev:desktop
```

Compilar y generar el instalador en Windows:

```sh
npm run build
npm run dist:win
```

El instalador queda en `release/Maximo-FPS-Setup-0.1.0.exe`. Para generar la versión portátil en Windows, después de `npm run build` ejecuta `npx electron-builder --win portable --x64 -c.artifactName=Maximo-FPS-Portable-0.1.0.exe`. El empaquetado en Linux puede usar el toolset Wine oficial de electron-builder (`-c.toolsets.wine=1.0.1`). No es necesario usar Wine en Windows. La firma Authenticode requiere un certificado propio; no hay claves ni certificados dentro de este repositorio.

## Pruebas

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Playwright usa Chromium del sistema cuando existe; se puede indicar otro binario con `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Comprueba panel, búsqueda/filtros, aplicar/restaurar, persistencia, navegación, vista móvil, teclado, exportación y errores de permisos.

Las pruebas del motor usan adaptadores controlados: demuestran respaldo previo a escritura, validación, tratamiento de fallos parciales, bloqueo de concurrencia y restauración en orden. No sustituyen una prueba de Windows real.

```sh
node --test tests/windows.integration.cjs
```

Esta prueba adicional solo corre en Windows y usa una clave HKCU aislada con UUID, sin aplicar el catálogo a tu configuración personal. La automatización de `.github/workflows/build-windows.yml` la ejecuta junto con compilación y pruebas antes de generar su artefacto.

## Respaldo y permisos

Los respaldos se guardan en la carpeta `backups` dentro de `app.getPath('userData')` de Electron, normalmente `%APPDATA%\maximo-fps\backups` (el nombre puede variar según empaquetado). Conserva esta carpeta hasta terminar tus restauraciones. No es un punto de Restauración del sistema de Windows: es un registro local de los valores concretos que cambia esta aplicación.

Cada lote se escribe y sincroniza a disco antes de empezar. Un timeout o resultado incompleto conserva un respaldo restaurable. La restauración reproduce existencia, tipo y valor del registro, plan de energía y modo de inicio de servicios. Un cambio externo posterior en los mismos valores podría ser reemplazado al restaurar.

## Estructura

- `src/`: aplicación React/TypeScript, demostración y estilos.
- `src/data/tweaks.json`: catálogo declarativo; véase [notas del catálogo](src/data/README.md).
- `electron/main.cjs` y `preload.cjs`: ventana aislada e IPC limitado.
- `electron/engine.cjs`: validación, operaciones y respaldos.
- `electron/powershell/`: inspección, aplicación, restauración y hardware.
- `tests/`: pruebas del motor, interfaz e integración opcional de Windows.

Las fuentes Manrope (OFL-1.1), iconos Lucide (ISC) y dependencias se distribuyen bajo sus respectivas licencias. El instalador incluye las licencias de Electron/Chromium.
