# Catálogo de Máximo FPS

El catálogo contiene **54 ajustes individuales**, con identificadores estables y una operación declarativa por ajuste. Está pensado para Windows 10/11 y separa juego, sistema, privacidad, red, efectos visuales y funciones opcionales. Los ajustes de interfaz y privacidad **no representan mejoras de FPS**. El rendimiento debe medirse en cada juego y equipo antes y después de aplicar cambios.

Cada entrada declara el destino concreto, el valor, los permisos, la necesidad de reinicio y las consecuencias. No se ejecutan comandos suministrados por el usuario. No se desactivan Defender, el firewall ni Windows Update; tampoco se incluyen cambios de HPET, temporizadores, MSI, voltajes, overclock o parámetros de memoria sin justificación.

## Compatibilidad y alcance

- Los valores de registro son preferencias de Windows o políticas de sus componentes. Las políticas administradas por una organización pueden prevalecer sobre ellas. La lectura posterior de un valor confirma el estado del registro, **no que todas las versiones de Windows estén utilizando esa preferencia**.
- Las claves de `ContentDeliveryManager`, algunos efectos del Explorador y los accesos a Chat, Noticias e intereses o Widgets cambian entre versiones. Las limitaciones están indicadas en `caveat`. El estado actual de la aplicación no debe confundir «valor configurado» con una mejora de rendimiento medida.
- Ocultar un acceso de la barra de tareas no desinstala su aplicación ni garantiza que detenga sus procesos. Los cambios de Inicio, barra de tareas y Explorador pueden requerir cerrar sesión, reiniciar el Explorador o reiniciar Windows.
- Un servicio puede no estar instalado. En ese caso el motor debe devolver una incompatibilidad por ajuste, sin crear el servicio ni simular un resultado satisfactorio. Cambiar su tipo de inicio no detiene su proceso actual; el efecto se comprueba después de reiniciar.
- Alto rendimiento utiliza el GUID estándar `8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`. Si el esquema no existe, el motor informa del problema. No crea esquemas ni cambia límites de temperatura o frecuencias.
- Los ajustes agrupados como limpieza reducen funciones opcionales o contenido promocional. **No borran archivos ni desinstalan aplicaciones**. Así se pueden restaurar los valores anteriores sin prometer recuperación de archivos eliminados.
- Los cambios en `HKLM`, servicios y plan energético requieren la ruta de permisos indicada por el motor. No se debe elevar privilegios ni aplicar todos los ajustes de servicios como un perfil recomendado.

## Restauración

Antes de cualquier cambio, el motor debe persistir el valor y tipo anteriores, o la ausencia del valor. Para servicios se conserva la configuración anterior y para energía el esquema activo. Restaurar significa recuperar ese estado previo, no escribir un «valor por defecto» supuesto. No sustituye una copia de seguridad completa del sistema y no promete revertir efectos secundarios de aplicaciones externas.

Los ajustes recomendados se limitan a cambios simples: Modo Juego, desactivar grabación continua, reducir transparencias y animaciones, limitar personalización publicitaria y consejos. Los cambios con posibles efectos funcionales o que aumenten el consumo son opcionales o avanzados.

## Referencias de comportamiento de Windows

- [Configuración de juegos en Windows](https://support.microsoft.com/windows/gaming)
- [Policy CSP — ApplicationManagement: captura de juegos](https://learn.microsoft.com/windows/client-management/mdm/policy-csp-applicationmanagement)
- [Policy CSP — Experience: contenido, sugerencias y experiencias](https://learn.microsoft.com/windows/client-management/mdm/policy-csp-experience)
- [Policy CSP — DeliveryOptimization: modos de descarga](https://learn.microsoft.com/windows/client-management/mdm/policy-csp-deliveryoptimization)
- [Powercfg: planes de energía](https://learn.microsoft.com/windows-hardware/design/device-experiences/powercfg-command-line-options)
- [Administración de servicios con PowerShell](https://learn.microsoft.com/powershell/module/microsoft.powershell.management/set-service)

La validación automática del catálogo comprueba unicidad y estructura. La compatibilidad efectiva y los resultados de cada ajuste necesitan validación en un equipo Windows y en su versión concreta.
