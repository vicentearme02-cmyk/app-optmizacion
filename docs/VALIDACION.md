# Validación de la beta 0.1.0

Fecha: 31 de octubre de 2026.

| Comprobación | Resultado observado |
| --- | --- |
| TypeScript y compilación de producción Vite | Correctos |
| Motor de ajustes y respaldos (adaptadores controlados) | 18 pruebas aprobadas |
| Interfaz Playwright en Chromium | 8 pruebas aprobadas |
| Electron Linux, interfaz de producción y puente IPC | Abre correctamente, sin excepciones de página |
| Protección de plataforma | El motor real rechaza escrituras en Linux |
| Catálogo | 54 ajustes, IDs y destinos únicos |
| Prueba real de registro HKCU en Windows | Omitida: esta máquina es Linux |
| Portable Windows x64 | Generado; archivo comprimido validado y fuentes internas verificadas |
| Instalación y funcionamiento en Windows físico/VM | Pendientes de validación |

Se verificaron búsqueda/filtros, navegación, aplicación y restauración simuladas, persistencia, vista móvil sin desbordamiento, control de foco por teclado, exportación y manejo de errores de permisos.

Las pruebas del motor incluyen fallos de captura, persistencia, ejecución y verificación; los respaldos permanecen restaurables ante resultados inciertos. También se verificó restauración del más reciente al más antiguo y exclusión de operaciones concurrentes.

Los resultados no acreditan aumento de FPS, reducción de latencia ni compatibilidad efectiva de todas las políticas con cada edición de Windows. Las mediciones de demostración son datos de ejemplo.

Se entrega la versión portátil. El generador del desinstalador NSIS falló bajo Wine 11 en Linux; no se entrega ese instalador incompleto. El objetivo portátil oficial se generó correctamente sin ese requisito.
