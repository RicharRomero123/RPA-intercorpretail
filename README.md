# Calderón Retail

Sell-out de turrones Calderón en Supermercados Peruanos (portal B2B de Intercorp): venta diaria, rotación,
instock y cobertura por cadena, zona y local.

| Carpeta | Qué es |
|---|---|
| `rpa/` | Robot en Python: entra al portal de Intercorp y carga cada día en la base (`retail_diario.py`) |
| `supabase/` | Esquema de la base (tablas, vistas y reglas de acceso) |
| `web/` | Front en Next.js (se publica en Vercel) |
| `.github/workflows/` | Carga diaria automática en GitHub Actions (7:00 a 12:00, hora de Lima) |

## Puesta en marcha

1. **Supabase**
   - SQL Editor: ejecutar `supabase/001_retail.sql`.
   - Authentication > Users > Add user: crear los usuarios (correo y contraseña).
   - Authentication > Sign In / Providers: desactivar "Allow new users to sign up".
2. **Datos iniciales** (desde la PC): en `rpa/.env` agregar `DATABASE_URL=postgresql://...` y ejecutar
   ```
   cd rpa
   pip install -r requirements.txt
   python migrar_base_local.py --origen ..\..\rpa_intercorp\datos\retail_spsa.db
   ```
3. **Front en la PC**: copiar `web/.env.example` como `web/.env.local`, completar y ejecutar
   ```
   cd web
   npm install
   npm run dev
   ```
   Abrir http://localhost:3000
4. **GitHub**: subir esta carpeta a un repositorio privado. En Settings > Secrets and variables > Actions, crear
   `INTERCORP_USUARIO`, `INTERCORP_CLAVE` y `DATABASE_URL`.
5. **Vercel**: importar el repositorio, elegir `web` como *Root Directory* y cargar las dos variables de
   `web/.env.example`.

## Reglas de los datos

- Montos en soles sin IGV. **Venta al público** = lo que pagó el consumidor. **Ingreso Calderón** = la
  "venta a costo" del portal (lo que SPSA paga a Calderón). **Margen SPSA** = la diferencia.
- El detalle por local solo existe para los últimos 45 días del portal; el robot lo guarda cada día y debe
  cuadrar al céntimo con el TOTAL del portal, o no se guarda (queda anotado en la tabla `cargas`).
- El inventario es una foto diaria ("inventario al ..."); la historia de stock se arma día a día.
- La zona (Lima / Provincia) sale de `rpa/zonas_locales.csv` al crear cada local; se puede corregir en la
  tabla `locales` de Supabase.
