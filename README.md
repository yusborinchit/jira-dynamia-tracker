# Jira Tracker

Recibe los webhooks de Jira y registra cuánto tiempo pasa cada issue en cada
estado. Con eso arma un resumen mensual: cuánto estuvo en desarrollo, cuánto en
QA, cuánto esperando al cliente.

No consulta la API de Jira: todo se construye a partir de los webhooks, así que
el sistema solo conoce lo que pasó desde que se instaló.

## Stack

Node + TypeScript · Fastify · Drizzle ORM · SQLite (better-sqlite3) · Docker.

## Levantarlo

```bash
pnpm install
cp .env.example .env          # completar JIRA_WEBHOOK_SECRET
pnpm db:push                  # crea/actualiza las tablas (no hay migraciones)
pnpm db:mapping               # carga el mapeo de estados a categorías
pnpm dev
```

Con Docker:

```bash
export JIRA_WEBHOOK_SECRET=$(openssl rand -hex 32)
docker compose up --build
```

El contenedor aplica el esquema y el mapeo de estados en cada arranque (ambos
pasos son idempotentes) y guarda la base en el volumen `jira-tracker-data`.

## Configurar el webhook en Jira

*Settings → System → Webhooks → Create a Webhook*

- **URL**: `https://tu-host/webhooks/jira`
- **Evento**: *Issue → updated*
- **Header**: `X-Webhook-Secret: <el valor de JIRA_WEBHOOK_SECRET>`

Los eventos que no traen un cambio de `status` en el changelog se responden con
`{ "ignored": true }` sin tocar la base. Jira reintenta ante errores 5xx, así
que un fallo al procesar se loguea pero responde 200.

### Ver qué manda Jira

Con `LOG_WEBHOOK_BODY=true` (el default) cada request al webhook deja una línea
`webhook recibido` con el body crudo, el `webhookEvent`, el `content-type`, si
vino el header del secreto y si coincidió. Se loguea **antes** de validar el
secreto, así que un 401 por secreto mal configurado también aparece.

```bash
docker compose logs -f jira-tracker | grep "webhook recibido"
```

Si el evento llega pero no cambia el estado, queda la línea `evento sin cambio de
estado, ignorado` con la lista de campos que sí cambiaron — útil para confirmar
que el webhook está bien configurado aunque todavía no se haya movido ninguna
tarjeta.

El body se trunca a 20 kB. Una vez validado en prod, conviene poner
`LOG_WEBHOOK_BODY=false` para no llenar el log.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/health` | Chequeo de vida + base accesible |
| `POST` | `/webhooks/jira` | Recibe los eventos (requiere el header del secreto) |
| `GET` | `/reports/monthly?month=YYYY-MM` | Toda la data del mes en JSON |

`month` es opcional; por defecto, el mes en curso (UTC).

```bash
curl 'http://localhost:3000/reports/monthly?month=2026-08'
```

Devuelve los tramos **recortados al mes** (un tramo que empezó el 28/7 y terminó
el 4/8 aporta a agosto solo la parte de agosto), más los totales por issue, por
categoría y por proyecto. Los tramos todavía abiertos salen con `"open": true` y
se cuentan hasta el momento de la consulta.

La categoría `done` es **terminal**: ahí la tarea murió, así que su tramo sale con
`"terminal": true` y `"seconds": 0` y no suma a ningún total. Un issue cuyo único
tramo del mes sea terminal directamente no aparece en el reporte (si se terminó en
julio, no ensucia agosto). Las categorías terminales se configuran en
`TERMINAL_CATEGORIES`, en `src/db/status-mapping.data.ts`.

```jsonc
{
  "month": "2026-08",
  "from": "2026-08-01T00:00:00.000Z",
  "to": "2026-09-01T00:00:00.000Z",
  "issues": [
    {
      "issue_key": "PUN-123",
      "project_key": "PUN",
      "summary": "Arreglar login",
      "current_status_name": "Testing",
      "total_seconds": 400278,
      "by_category": { "development": 320400, "testing": 79878 },
      "segments": [
        {
          "status_id": "10002",
          "status_name": "En curso",
          "category": "development",
          "entered_at": "2026-07-28T09:00:00.000Z",
          "left_at": "2026-08-04T17:00:00.000Z",
          "open": false,
          "terminal": false,
          "seconds": 320400
        }
      ]
    }
  ],
  "totals_by_category": { "development": 320400, "testing": 79878 },
  "totals_by_project": { "PUN": 400278 }
}
```

## Categorías: `status_mapping`

Cada proyecto llama distinto a lo mismo (`En curso`, `In Progress`). La tabla
`status_mapping` traduce esos nombres a categorías internas, que son las que
salen en los reportes. Los nombres de estado quedan como los escribe Jira; las
categorías son siempre en inglés.

| Estado en Jira | Categoría |
|---|---|
| Backlog · To Do · Por hacer · Estimar | `pending` |
| Pendiente de info · Pending for info | `waiting_info` |
| En curso · In Progress | `development` |
| To Deploy | `deploy` |
| Testing · Validar | `testing` |
| Listo · Done · Hecho | `done` (terminal) |

La fuente de verdad es `src/db/status-mapping.data.ts`. Para agregar un estado o
cambiarle la categoría, se edita ese archivo y se corre:

```bash
pnpm db:mapping
```

Es idempotente: inserta lo que falta, actualiza lo que cambió y no toca las filas
que se hayan agregado a mano por fuera del archivo. En Docker corre solo en cada
arranque.

Los estados que van apareciendo quedan registrados solos en la tabla `statuses`,
así que ahí se ve si alguno quedó sin mapear:

```sql
SELECT * FROM statuses;
```

Un estado sin mapear se reporta como `uncategorized` (no se pierde el tiempo, solo
queda sin clasificar).

Resolución: primero por `jira_status_id`; si no hay match, por nombre (sin
distinguir mayúsculas ni espacios al borde). El archivo mapea por nombre; si algún
día dos proyectos usan el mismo nombre para cosas distintas, se agrega una fila
con el id de Jira, que tiene precedencia.

**Los reportes resuelven la categoría en cada consulta**, no al momento de
recibir el webhook: cargar el mapeo recategoriza también todo el historial ya
registrado.

## Modelo de datos

- **`issues`** — una fila por incidencia, con su estado actual.
- **`status_history`** — un tramo por permanencia en un estado (`entered_at`,
  `left_at`, `duration_seconds`). Como mucho un tramo abierto por issue.
- **`statuses`** — catálogo de estados vistos, se completa solo.
- **`status_mapping`** — estado de Jira → categoría interna. Se carga con `pnpm db:mapping`.

`pnpm db:studio` abre el visor de Drizzle para mirar todo esto.

## Qué queda para más adelante

La arquitectura (rutas / servicios / repositorios) está pensada para agregar sin
tocar lo existente: dashboard en React, export a Excel/CSV, métricas por sprint
o por desarrollador, filtros por proyecto y fecha. Nada de eso está implementado
todavía.
