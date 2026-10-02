# pH Cultivos · Fase 1 · v0.1.0

Primera versión independiente y navegable de la Fase 1.

## Incluye

- Tres perfiles ficticios de Colombia.
- Cinco fincas por técnico y tres lotes por finca.
- Medición individual.
- Jornadas de 10 o 15 puntos.
- Persistencia local con IndexedDB.
- Recuperación de jornadas en curso.
- Mediana, promedio y desviación estándar.
- Historial por lote.
- Comparación temporal de máximo tres lotes.
- Comparación espacial de exactamente dos lotes.
- Exportación CSV.
- Cola local de sincronización.
- Manifest, Service Worker e iconos PWA.
- Esquema inicial de Supabase con RLS.

## Simulado o pendiente

- La lectura YK-S01 es simulada y se identifica como tal.
- Supabase no está conectado; la pantalla muestra únicamente operaciones locales pendientes.
- Los rangos de café son provisionales para demostración.
- GPS, Bluefy, Bluetooth real y funcionamiento offline requieren prueba manual en dispositivos.

## Verificación automatizada

- Sintaxis JavaScript: aprobada.
- Pruebas: 11 aprobadas, 0 fallidas.
- Archivos principales servidos por HTTP: respuesta 200.
- Datos reales o secretos: no incluidos.
