# Matriz de pruebas · versión 0.1.0

| Área | Estado | Evidencia o límite |
|---|---|---|
| Sintaxis JavaScript | Verificada mediante ejecución | `npm run check` sin errores |
| Estadística e interpretación | Verificada mediante ejecución | Pruebas automatizadas aprobadas |
| Datos ficticios y asignaciones | Verificada mediante ejecución | 3 técnicos, 5 fincas por técnico y 3 lotes por finca |
| CSV | Verificada mediante ejecución | Comillas, comas, saltos y UTF-8 |
| Service Worker | Verificada estáticamente | Caché versionado, lista local y archivos presentes; offline requiere navegador |
| Navegación móvil | Verificación manual requerida | Navegador real |
| Persistencia IndexedDB | Verificación manual requerida | Navegador real |
| Recuperación de jornada | Verificación manual requerida | Cierre y reapertura |
| GPS | Verificación manual requerida | Dispositivo físico y permisos |
| Bluetooth real YK-S01 | Bloqueada | Faltan UUID y protocolo validados |
| Bluefy iPhone | Bloqueada | Requiere iPhone, Bluefy y sensor |
| Supabase/RLS | Bloqueada | Requiere instancia de prueba |
| PWA offline | Verificación manual requerida | Primera carga y desconexión |

## Resultado automatizado

- Validación de sintaxis: aprobada.
- Pruebas: 11 aprobadas, 0 fallidas.
- Navegador automatizado: no disponible porque el entorno no tiene binario Chromium instalado; no se declara validación visual.
