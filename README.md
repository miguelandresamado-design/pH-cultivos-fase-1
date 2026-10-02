# pH Cultivos · Fase 1

Versión navegable independiente para validar el flujo de medición y monitoreo de pH por finca y lote. Todos los perfiles, fincas, coordenadas e históricos son ficticios.

## Estado de esta versión

- Versión: `0.1.0`
- Modo: demostración local
- Backend: preparado, no conectado
- Bluetooth: simulación identificada; conexión real bloqueada hasta validar UUID y paquetes YINMIK YK-S01
- Interpretación de café: rangos provisionales de demostración

## Ejecutar

Desde la carpeta que contiene `index.html`:

```bash
npm test
npm run check
python3 -m http.server 8080
```

Abrir `http://localhost:8080`. No abrir con `file://`.

## Funciones incluidas

- Activación con tres perfiles ficticios de Colombia.
- Cinco fincas asignadas por técnico.
- Medición individual manual o simulada.
- Jornadas de 10 o 15 puntos.
- GPS opcional y temperatura.
- Persistencia con IndexedDB.
- Recuperación de jornadas.
- Mediana, promedio y desviación estándar.
- Historial por lote.
- Comparación temporal de hasta tres lotes.
- Comparación espacial de exactamente dos lotes.
- Exportación CSV.
- Cola de sincronización local visible.
- PWA y funcionamiento offline después de la primera carga.

## Seguridad

No existen credenciales ni datos reales. `config/app.example.js` documenta la futura configuración, pero no contiene secretos. Nunca debe colocarse una `service_role` en el navegador. La migración SQL activa RLS y debe validarse contra una instancia Supabase de prueba antes de cualquier piloto.

## GitHub Pages

Subir el contenido de esta carpeta a la raíz del repositorio. `index.html`, `manifest.webmanifest` y `sw.js` deben quedar directamente en la raíz. Las rutas son relativas y compatibles con un repositorio publicado como subdirectorio.

## Pendientes antes de un piloto real

1. Aprobar rangos agronómicos de café.
2. Conectar Supabase Auth y sincronización remota.
3. Probar las políticas RLS con varios usuarios.
4. Incorporar UUID y decodificación BLE reales del YK-S01.
5. Validar Android Chrome y Bluefy en iPhone.
6. Probar GPS, instalación PWA y reapertura offline en dispositivos físicos.
