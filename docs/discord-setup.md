# Configurar un Discord propio

Esta guia es para alguien que quiere usar Xbox Deals AR con su propio servidor de Discord sin tocar codigo.

## 1. Crear el canal

1. Crear un canal de texto en Discord.
2. Editar canal.
3. Entrar a Integraciones.
4. Entrar a Webhooks.
5. Crear webhook.
6. Copiar la URL del webhook.

## 2. Crear Supabase

1. Crear un proyecto en Supabase.
2. Abrir SQL Editor.
3. Ejecutar `supabase/schema.sql`.
4. Copiar:
   - Project URL
   - Service role key

## 3. Deploy en Vercel

1. Importar el repositorio en Vercel.
2. Configurar las variables de entorno en Production.
3. Hacer Deploy.

Variables minimas:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ALFAJOR_DISCORD_WEBHOOK_URL=
CRON_SECRET=
ALFAJOR_PRICE_ARS=1800
ALFAJOR_DIGEST_MAX_DEALS=30
ALFAJOR_REPEAT_DAYS=7
STEAM_CRON_LIMIT=250
APP_PUBLIC_URL=
```

`APP_PUBLIC_URL` debe ser la URL publica de la app en Vercel, por ejemplo:

```env
APP_PUBLIC_URL=https://xbox-deals-ar.vercel.app
```

## 4. Activar automatizacion

Vercel lee `vercel.json` y ejecuta:

- `/api/cron/daily`: actualiza catalogo Xbox, cobertura Steam y envia el informe diario a Discord.

En Vercel Hobby, los cron solo pueden correr una vez por dia. Si usas Vercel Pro, podes separar refresh y digest en varios horarios.

## 5. Ajustes utiles

- `ALFAJOR_PRICE_ARS`: precio maximo para entrar al informe.
- `ALFAJOR_DIGEST_MAX_DEALS`: cantidad maxima de juegos enviados.
- `ALFAJOR_REPEAT_DAYS`: dias sin repetir juegos ya enviados.

Para pruebas, ejecutar `supabase/reset-alfajor-digest-alerts.sql` y volver a disparar el digest.
