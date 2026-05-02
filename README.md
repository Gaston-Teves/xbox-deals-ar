# Xbox Deals AR

Aplicacion web personal para consultar ofertas reales de Xbox y Microsoft Store Argentina en ARS. Usa cache en memoria para evitar consultar Microsoft en cada request y puede persistir catalogo, precios actuales e historico en Supabase.

## Stack

- Next.js con App Router
- React
- TypeScript
- Tailwind CSS
- API routes livianas dentro del mismo proyecto
- Deploy-ready para Vercel

## Instalacion

```bash
npm install
```

## Correr en desarrollo

```bash
npm run dev
```

Abrir `http://localhost:3000`.

## Variables de entorno

Crear un archivo `.env.local` a partir de `.env.example`:

```env
DISCORD_WEBHOOK_URL=
ALFAJOR_DISCORD_WEBHOOK_URL=
XBOX_DEALS_SOURCE_URL=
XBOX_DEALS_MAX_PAGES=4
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
STEAM_CRON_LIMIT=250
ALFAJOR_PRICE_ARS=1800
ALFAJOR_DIGEST_MAX_DEALS=10
ALFAJOR_REPEAT_DAYS=7
```

## Configurar Discord Webhook

1. Crear o elegir un canal en Discord.
2. Editar canal.
3. Entrar a Integraciones.
4. Entrar a Webhooks.
5. Crear webhook.
6. Copiar la URL.
7. Pegarla en `DISCORD_WEBHOOK_URL` dentro de `.env.local` o en las variables de entorno de Vercel.

El webhook no se expone al frontend. La UI llama a `/api/notify-discord` y el servidor lee la variable de entorno.

Para probar el canal tematico "Mas barato que un alfajor", se puede usar un webhook separado en `ALFAJOR_DISCORD_WEBHOOK_URL`. Si no existe, el endpoint usa `DISCORD_WEBHOOK_URL`.

## Probar API

Listar ofertas:

```bash
curl "http://localhost:3000/api/deals"
```

Ejemplos con filtros:

```bash
curl "http://localhost:3000/api/deals?maxPrice=500&minDiscount=80&platform=xbox"
curl "http://localhost:3000/api/deals?categories=action,horror&modes=single-player&sort=discount-desc"
curl "http://localhost:3000/api/deals?platform=play-anywhere&onlyGamePass=true"
curl "http://localhost:3000/api/deals?maxPrice=2000&contentType=base-games"
curl "http://localhost:3000/api/deals?hideFree=true&onlyDiscounted=true&page=1&pageSize=60"
```

`platform=pc` incluye juegos solo PC y juegos Xbox + PC / Play Anywhere. `platform=xbox` incluye juegos solo Xbox y juegos Xbox + PC / Play Anywhere. `platform=play-anywhere` muestra solamente los disponibles en ambas plataformas.

`contentType=base-games` muestra juegos base. `contentType=bundles-editions` muestra bundles y ediciones especiales. `contentType=add-ons` muestra DLC, expansiones o upgrades detectados.

`hideFree=true` oculta juegos gratis/free-to-play. `onlyDiscounted=true` muestra solo productos con descuento real. `page` y `pageSize` controlan la paginacion; `pageSize` se limita entre 12 y 120.

Enviar resumen a Discord:

```bash
curl -X POST "http://localhost:3000/api/notify-discord?maxPrice=1000&minDiscount=80"
```

Si `DISCORD_WEBHOOK_URL` no esta configurado, el endpoint devuelve un error claro.

Refrescar cache:

```bash
curl -X POST "http://localhost:3000/api/refresh"
```

Refrescar comparativa Steam para completar cobertura del catalogo filtrado:

```bash
curl -X POST "http://localhost:3000/api/refresh-steam?contentType=base-games&hideFree=true&limit=250&mode=coverage"
```

Enviar digest "Mas barato que un alfajor" a Discord:

```bash
curl -X POST "http://localhost:3000/api/discord/alfajor-digest?maxPrice=1800&limit=10&includeRecent=true"
```

Previsualizar sin enviar a Discord:

```bash
curl -X POST "http://localhost:3000/api/discord/alfajor-digest?maxPrice=1800&limit=10&includeRecent=true&dryRun=true"
```

Ese digest no exige descuento. Selecciona juegos base de PC o Xbox + PC por debajo de `ALFAJOR_PRICE_ARS`, excluye gratis, rankea relevancia con señales como franquicias conocidas, match en Steam, minimo historico, descuento si existe y precio especialmente bajo. `includeRecent=true` sirve para pruebas; sin ese parametro evita repetir juegos enviados recientemente segun `ALFAJOR_REPEAT_DAYS`.

Ver estado del catalogo persistido:

```bash
curl "http://localhost:3000/api/catalog/status"
```

Ese endpoint muestra total en `catalog_products`, productos con precio actual en `deals_current`, filas de `price_history`, ultimas fechas vistas y distribucion por plataforma/tipo.

## Deploy en Vercel

1. Subir el proyecto a un repositorio Git.
2. Importar el repo en Vercel.
3. Usar los defaults de Next.js.
4. Configurar `DISCORD_WEBHOOK_URL` en Project Settings > Environment Variables.
5. Deploy.

## Supabase

La integracion con Supabase es opcional, pero recomendada para que la app funcione como tracker real y no dependa solo del resultado actual de las paginas fuente. Para activarla:

1. Ejecutar `supabase/schema.sql` en el SQL Editor del proyecto.
2. Configurar `NEXT_PUBLIC_SUPABASE_URL` con la URL base del proyecto, por ejemplo `https://xxxxx.supabase.co`.
3. Configurar `SUPABASE_SERVICE_ROLE_KEY` con la secret key del proyecto.
4. Ejecutar `POST /api/refresh`.

El refresh guarda:

- `catalog_products`: productos descubiertos, aunque despues dejen de aparecer en una pagina fuente.
- `deals_current`: ultimo precio conocido por producto.
- `price_history`: baseline inicial y nuevos registros solo cuando aparece un producto nuevo o cambia precio/descuento.
- `external_store_matches` y `external_prices_current`: matches y precios externos, por ahora Steam.

Cuando Supabase esta configurado, `/api/deals` lee desde `deals_current`. Si Supabase no esta configurado o todavia no tiene datos, usa las fuentes oficiales en vivo como fallback.

Si ya habias ejecutado una version anterior de `supabase/schema.sql`, volve a ejecutar el archivo completo para crear `catalog_products` y sus indices. Las tablas existentes no se borran.

La comparativa Steam no requiere API key. Usa endpoints publicos de Steam Store con cache persistida en Supabase y se refresca por tandas para evitar hacer miles de consultas de golpe. El proceso prioriza juegos base sin equivalencia revisada, guarda tambien los intentos sin match y luego refresca precios de matches conocidos sin volver a buscar por nombre cuando es posible.

## Refresh automatico

El proyecto incluye `vercel.json` con crons de Vercel:

```json
[
  {
    "path": "/api/cron/refresh",
    "schedule": "0 9,21 * * *"
  },
  {
    "path": "/api/cron/alfajor-digest",
    "schedule": "0 13 * * *"
  }
]
```

El refresh general corre dos veces por dia: 06:00 y 18:00 de Argentina. El endpoint:

- refresca el catalogo/precios de Microsoft Store Argentina;
- guarda historico en Supabase;
- procesa una tanda de Steam usando `STEAM_CRON_LIMIT`;
- primero completa cobertura de juegos base pendientes y despues refresca precios stale de matches conocidos;
- guarda matches validos y tambien intentos sin match para reintentarlos mas adelante, no en cada corrida.

El digest "Mas barato que un alfajor" corre una vez por dia, 10:00 de Argentina, y envia al canal configurado una seleccion editorial de juegos baratos y relevantes.

Para activarlo en Vercel, configurar `CRON_SECRET` en Environment Variables. Vercel enviara `Authorization: Bearer <CRON_SECRET>` al endpoint programado. En local se puede probar con:

```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" "http://localhost:3000/api/cron/refresh"
curl -H "Authorization: Bearer TU_CRON_SECRET" "http://localhost:3000/api/cron/alfajor-digest"
```

## Fuente de datos

La app consulta paginas oficiales de Xbox/Microsoft Store Argentina y enriquece los productos con el catalogo publico `displaycatalog.mp.microsoft.com`. Las ofertas se cachean en memoria por 6 horas.

Fuentes por defecto:

- Xbox browse: all games, precio ascendente, PC, titulo, fecha, deals, Game Pass y PC Game Pass.
- Microsoft Store por plataforma: `top-paid`, `new`, `best-rated`, `most-played`, `top-free`, `deals`, demos, previews y proximamente.
- Microsoft Store por categorias principales: accion/aventura, RPG, shooter, deportes, carreras, estrategia, simulacion, plataformas, puzzle, familia, pelea, clasicos y cartas/mesa.
- Microsoft Store por bandas de precio oficiales.

Se puede reemplazar la lista usando `XBOX_DEALS_SOURCE_URL` con URLs separadas por coma.

Las fuentes de Microsoft Store se paginan con `skipItems` en bloques de 50 productos. `XBOX_DEALS_MAX_PAGES` controla cuantas paginas se leen por fuente, con default `4` y maximo `20` para evitar scraping agresivo. El refresh usa concurrencia limitada para no disparar todas las paginas al mismo tiempo.

## Scraper futuro

La estructura esta preparada en `src/lib/xboxScraper.ts`:

- `fetchXboxArgentinaDeals()`
- `fetchDealsFromMicrosoftStore()`
- `parseMicrosoftStoreHtml()`
- `normalizeArgentinePrice()`
- `mapRawDealToDeal()`

`fetchXboxArgentinaDeals()` usa cache en memoria por 6 horas. No se hace scraping agresivo ni se consulta Microsoft Store en cada request. Si fallan las fuentes oficiales y no hay cache previa, la API devuelve una lista vacia en vez de inventar precios.

## Roadmap

- Scraping real
- Ampliar descubrimiento del catalogo completo
- Alertas personalizadas
- Minimos historicos avanzados
- Discord bot real
- Filtros por logros faciles
- Filtros por cooperativo local/online
- Comparacion contra Steam/Epic
