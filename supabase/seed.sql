-- Datos iniciales para Colombia (administrables luego desde el panel de super admin)

insert into banks (name, code, sender_domains, sort_order) values
 ('Bancolombia', '007', '{bancolombia.com.co,notificaciones.bancolombia.com.co}', 1),
 ('Davivienda', '051', '{davivienda.com}', 2),
 ('Banco de Bogotá', '001', '{bancodebogota.com.co}', 3),
 ('BBVA Colombia', '013', '{bbva.com.co}', 4),
 ('Banco de Occidente', '023', '{bancodeoccidente.com.co}', 5),
 ('Banco Popular', '002', '{bancopopular.com.co}', 6),
 ('AV Villas', '052', '{avvillas.com.co}', 7),
 ('Scotiabank Colpatria', '019', '{scotiabankcolpatria.com}', 8),
 ('Itaú', '006', '{itau.co}', 9),
 ('Banco Caja Social', '032', '{bancocajasocial.com}', 10),
 ('Nequi', null, '{nequi.com.co}', 11),
 ('Daviplata', null, '{daviplata.com}', 12),
 ('Lulo Bank', null, '{lulobank.com}', 13),
 ('Nu Colombia', null, '{nu.com.co}', 14),
 ('RappiPay', null, '{rappi.com}', 15)
on conflict do nothing;

insert into income_types (name, icon, recurring_default, sort_order) values
 ('Salario', 'briefcase', true, 1),
 ('Freelance / Honorarios', 'laptop', false, 2),
 ('Pensión', 'landmark', true, 3),
 ('Mesada', 'wallet', true, 4),
 ('Herencia', 'gift', false, 5),
 ('Arriendos recibidos', 'home', true, 6),
 ('Rendimientos / Inversiones', 'trending-up', false, 7),
 ('Prima / Cesantías / Bonificación', 'award', false, 8),
 ('Venta ocasional', 'tag', false, 9),
 ('Reembolso', 'undo-2', false, 10),
 ('Otros ingresos', 'plus-circle', false, 99)
on conflict do nothing;

insert into expense_categories (name, icon, color, essential, sort_order) values
 ('Vivienda (arriendo/cuota)', 'home', '#3b82f6', true, 1),
 ('Servicios públicos', 'zap', '#f59e0b', true, 2),
 ('Internet y telefonía', 'wifi', '#06b6d4', true, 3),
 ('Mercado', 'shopping-cart', '#22c55e', true, 4),
 ('Transporte y gasolina', 'car', '#64748b', true, 5),
 ('Peajes y parqueadero', 'milestone', '#78716c', false, 6),
 ('Seguros', 'shield', '#8b5cf6', true, 7),
 ('Salud', 'heart-pulse', '#ef4444', true, 8),
 ('Educación', 'graduation-cap', '#0ea5e9', true, 9),
 ('Suscripciones', 'repeat', '#ec4899', false, 10),
 ('Restaurantes y domicilios', 'utensils', '#f97316', false, 11),
 ('Bar y salidas', 'beer', '#a855f7', false, 12),
 ('Cine y entretenimiento', 'film', '#d946ef', false, 13),
 ('Ropa y calzado', 'shirt', '#14b8a6', false, 14),
 ('Hobbies', 'palette', '#84cc16', false, 15),
 ('Regalos', 'gift', '#f43f5e', false, 16),
 ('Viajes', 'plane', '#0891b2', false, 17),
 ('Finca / Asado / Recreación', 'tent', '#65a30d', false, 18),
 ('Mascotas', 'paw-print', '#d97706', false, 19),
 ('Cuidado personal', 'sparkles', '#e879f9', false, 20),
 ('Impuestos', 'file-text', '#475569', true, 21),
 ('Deudas y créditos', 'credit-card', '#dc2626', true, 22),
 ('Otros', 'more-horizontal', '#94a3b8', false, 99)
on conflict do nothing;

insert into subscription_platforms (name, sender_domains, sort_order) values
 ('Netflix', '{netflix.com}', 1),
 ('Spotify', '{spotify.com}', 2),
 ('YouTube Premium', '{youtube.com,google.com}', 3),
 ('Disney+', '{disneyplus.com}', 4),
 ('Max (HBO)', '{max.com,hbomax.com}', 5),
 ('Amazon Prime', '{amazon.com,primevideo.com}', 6),
 ('Apple (iCloud/Music/TV+)', '{apple.com}', 7),
 ('Google One', '{google.com}', 8),
 ('Microsoft 365', '{microsoft.com}', 9),
 ('ChatGPT / OpenAI', '{openai.com}', 10),
 ('Claude', '{anthropic.com}', 11),
 ('Canva', '{canva.com}', 12),
 ('Adobe', '{adobe.com}', 13),
 ('Rappi Prime', '{rappi.com}', 14),
 ('Paramount+', '{paramountplus.com}', 15),
 ('Crunchyroll', '{crunchyroll.com}', 16),
 ('Gimnasio', '{}', 90)
on conflict do nothing;

insert into plans (code, name, description, price_cents, interval, trial_days, limits, features, sort_order) values
 ('free', 'Gratis', 'Lo esencial para empezar', 0, 'month', 0,
   '{"accounts":2,"email_connections":0,"ai_requests_month":10,"projects":1,"goals":2}',
   '["Ingresos y egresos","Metas de ahorro (2)","Presupuestos básicos"]', 1),
 ('pro', 'Pro', 'Automatiza con correo e IA', 1990000, 'month', 14,
   '{"accounts":10,"email_connections":2,"ai_requests_month":300,"projects":10,"goals":20}',
   '["Todo lo del plan Gratis","Lectura de correo con IA","Foto de recibos","Deudas y proyecciones","Gastos compartidos"]', 2),
 ('pro_anual', 'Pro Anual', 'Pro con 2 meses gratis', 19900000, 'year', 14,
   '{"accounts":10,"email_connections":2,"ai_requests_month":300,"projects":10,"goals":20}',
   '["Todo lo del plan Pro","2 meses gratis"]', 3)
on conflict do nothing;
