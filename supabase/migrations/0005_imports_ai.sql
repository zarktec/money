-- Fase 5: importación de extractos, lectura de recibos/texto con IA y control de uso de IA.

alter type tx_source add value if not exists 'natural_language';

-- Cada importación queda agrupada para poder deshacerla completa.
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  source text not null check (source in ('statement_csv', 'statement_pdf', 'receipt', 'text')),
  file_name text,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on import_batches (user_id, created_at desc);
alter table import_batches enable row level security;
create policy import_batches_owner on import_batches for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table transactions add column import_batch_id uuid references import_batches(id) on delete set null;
create index on transactions (import_batch_id) where import_batch_id is not null;

-- Consumo de IA por usuario (para aplicar el límite mensual del plan). El servidor escribe con service role;
-- el usuario solo puede leer el suyo, nunca insertar (no puede "resetear" su consumo).
create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index on ai_usage (user_id, created_at);
alter table ai_usage enable row level security;
create policy ai_usage_read_own on ai_usage for select using (user_id = auth.uid());
revoke insert, update, delete on ai_usage from authenticated;

-- Comercios colombianos conocidos → categoría. Globales (user_id null); el super admin puede ampliarlos.
insert into merchants (name, match_pattern, category_id)
select v.name, v.pat, c.id
from (values
  ('Rappi', 'rappi', 'Restaurantes y domicilios'), ('Rappi Prime', 'rappi prime', 'Suscripciones'),
  ('iFood', 'ifood', 'Restaurantes y domicilios'), ('Uber Eats', 'uber eats', 'Restaurantes y domicilios'), ('DiDi Food', 'didi food', 'Restaurantes y domicilios'),
  ('Uber', 'uber', 'Transporte y gasolina'), ('DiDi', 'didi', 'Transporte y gasolina'), ('Cabify', 'cabify', 'Transporte y gasolina'),
  ('inDrive', 'indriver', 'Transporte y gasolina'), ('Terpel', 'terpel', 'Transporte y gasolina'), ('Primax', 'primax', 'Transporte y gasolina'),
  ('Texaco', 'texaco', 'Transporte y gasolina'), ('Biomax', 'biomax', 'Transporte y gasolina'),
  ('Éxito', 'exito', 'Mercado'), ('Jumbo', 'jumbo', 'Mercado'), ('Carulla', 'carulla', 'Mercado'), ('D1', 'd1', 'Mercado'), ('Ara', 'ara', 'Mercado'),
  ('Olímpica', 'olimpica', 'Mercado'), ('PriceSmart', 'pricesmart', 'Mercado'), ('Makro', 'makro', 'Mercado'), ('Surtimax', 'surtimax', 'Mercado'),
  ('Netflix', 'netflix', 'Suscripciones'), ('Spotify', 'spotify', 'Suscripciones'), ('Disney+', 'disney', 'Suscripciones'), ('Prime Video', 'prime video', 'Suscripciones'),
  ('YouTube Premium', 'youtube premium', 'Suscripciones'), ('Apple', 'apple com bill', 'Suscripciones'), ('Google One', 'google one', 'Suscripciones'),
  ('iCloud', 'icloud', 'Suscripciones'), ('ChatGPT', 'chatgpt', 'Suscripciones'), ('OpenAI', 'openai', 'Suscripciones'), ('Canva', 'canva', 'Suscripciones'), ('Adobe', 'adobe', 'Suscripciones'),
  ('EPM', 'epm', 'Servicios públicos'), ('Enel', 'enel', 'Servicios públicos'), ('Vanti', 'vanti', 'Servicios públicos'), ('Acueducto', 'acueducto', 'Servicios públicos'), ('Aguas', 'aguas de', 'Servicios públicos'),
  ('Claro', 'claro', 'Internet y telefonía'), ('Movistar', 'movistar', 'Internet y telefonía'), ('Tigo', 'tigo', 'Internet y telefonía'), ('WOM', 'wom', 'Internet y telefonía'), ('ETB', 'etb', 'Internet y telefonía'),
  ('Sura', 'sura', 'Salud'), ('Sanitas', 'sanitas', 'Salud'), ('Colsanitas', 'colsanitas', 'Salud'), ('Compensar', 'compensar', 'Salud'), ('Coomeva', 'coomeva', 'Salud'),
  ('Farmatodo', 'farmatodo', 'Salud'), ('Cruz Verde', 'cruz verde', 'Salud'), ('Locatel', 'locatel', 'Salud'), ('La Rebaja', 'drogas la rebaja', 'Salud'),
  ('Mapfre', 'mapfre', 'Seguros'), ('Seguros Bolívar', 'seguros bolivar', 'Seguros'), ('Allianz', 'allianz', 'Seguros'),
  ('Peaje', 'peaje', 'Peajes y parqueadero'), ('Parqueadero', 'parqueadero', 'Peajes y parqueadero'),
  ('Cine Colombia', 'cine colombia', 'Cine y entretenimiento'), ('Cinemark', 'cinemark', 'Cine y entretenimiento'), ('Procinal', 'procinal', 'Cine y entretenimiento'),
  ('Falabella', 'falabella', 'Ropa y calzado'), ('Zara', 'zara', 'Ropa y calzado'), ('Arturo Calle', 'arturo calle', 'Ropa y calzado'), ('Decathlon', 'decathlon', 'Ropa y calzado'),
  ('DIAN', 'dian', 'Impuestos')
) as v(name, pat, cat)
join expense_categories c on c.name = v.cat and c.user_id is null
where not exists (select 1 from merchants m where m.user_id is null and m.match_pattern = v.pat);
