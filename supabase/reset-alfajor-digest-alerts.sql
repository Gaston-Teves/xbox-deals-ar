-- Limpia solamente el historial de envios del digest "Mas barato que un alfajor".
-- Usalo en Supabase SQL Editor cuando quieras probar varias veces desde el boton
-- sin que aplique la regla anti-repeticion.
--
-- No borra catalogo, precios, historial de precios ni matches de Steam.

delete from public.alert_events
where alert_type = 'alfajor-digest';

-- Verificacion: deberia devolver 0 despues del delete.
select count(*) as remaining_alfajor_digest_events
from public.alert_events
where alert_type = 'alfajor-digest';
