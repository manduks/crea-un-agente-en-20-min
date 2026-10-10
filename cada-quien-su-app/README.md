# Cada quien su app

Demo en vivo. Cada persona del público escanea un código QR y recibe **su propia copia** de una app de hábitos, con una sola caja: *"Cambia esta app…"*. Un agente de código ([pi](https://pi.dev)) reescribe su copia en unos 15 segundos. La pantalla del proyector muestra todas las copias juntas. Al final, en "El público decide", aceptas o quitas cada sugerencia, el agente las agrupa por tema y lo más pedido se aplica a la app principal y a la app de cada persona.

La idea: cuando construir es gratis, ya no diseñas una app, diseñas un **espacio** de apps (piezas base, candados de seguridad, valores por defecto). Y la investigación de usuarios sale de lo que la gente construyó, no de lo que dijo.

![pantalla](docs/screenshots/wall.png)

![El público decide](docs/screenshots/el-publico-decide.png)

## Cómo correrlo

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # con límite de gasto; pi no puede usar una suscripción Claude Max
npm run charla                        # pi + túnel público para los celulares
```

En macOS, si no exportas la key, el servidor la busca en el Llavero (Keychain), en el elemento `pi-demo-anthropic`:

```bash
security add-generic-password -a "$USER" -s pi-demo-anthropic -w   # te la pide sin mostrarla
```

La terminal imprime:

| Línea | Para qué |
|---|---|
| **Celulares** | la URL del QR (la del túnel en cuanto está lista, unos 5 s) |
| **Presentación** | `http://localhost:4317/charla?key=…` · las diapositivas, con la pantalla en vivo adentro |
| **Pantalla** | `http://localhost:4317/wall?key=…` · solo la pantalla de la demo |

También existe `http://localhost:4317/revision?key=…`: la vista "El público decide" sola.

La `key` es la clave del presentador (los botones de la pantalla). Cambia en cada arranque; fíjala con `PRESENTER_KEY=...` si quieres.

| Comando | Motor | Cómo llegan los celulares |
|---|---|---|
| `npm run charla` | pi | túnel de Cloudflare (sirve en cualquier Wi-Fi, necesita internet) |
| `npm run charla:local` | pi | tu IP local (misma Wi-Fi; muchas redes de eventos lo bloquean) |
| `npm run charla:claude` | Claude Code (`claude -p`, con tu sesión) | túnel. Plan B si pi o la key fallan |

### Ajustes (variables de entorno)

| Variable | Por defecto | |
|---|---|---|
| `PI_MODEL` | `anthropic/claude-sonnet-5-5` | p. ej. `anthropic/claude-haiku-5-5` (más rápido y barato) u `openai/…` con `OPENAI_API_KEY` |
| `BUDGET_USD` | `25` | al llegar a este gasto ya no acepta cambios nuevos |
| `MAX_PARALLEL` | `6` | agentes trabajando a la vez; el resto espera en fila |
| `MAX_CHANGES` | `5` | cambios por persona (el celular muestra cuántos le quedan) |
| `PRESENTER_KEY` | aleatoria | clave fija del presentador |
| `PUBLIC_URL` | | si usas tu propio túnel (`ngrok http 4317`) |

## Qué hay adentro

| Archivo | Qué es |
|---|---|
| `server.mjs` | Servidor Node sin framework: copias por persona, fila de trabajos, los dos motores, eventos en vivo (SSE), análisis y lanzamiento, QR, túnel, y sirve la presentación en `/charla` |
| `base/index.html` | La app inicial, en un solo archivo |
| `public/phone.html` | Lo que ve cada persona en su celular: su app, la caja de cambios, el progreso en vivo y "Deshacer" |
| `public/wall.html` | La pantalla del proyector: QR, contadores, todas las apps en vivo y los botones del presentador |
| `public/review.html` | "El público decide": aceptar sugerencias, agruparlas y aplicar las más pedidas a todos |
| `extensions/fork-guard.ts` | **Una extensión de pi de 30 líneas**: pi solo puede leer y editar el `index.html` de la carpeta de esa persona; todo lo demás se bloquea |
| `test/mock-model.mjs` | Un modelo falso para probar pi sin API key |

Los celulares reciben los cambios en vivo y además preguntan cada 2 s, porque algunas redes (y el túnel) retienen los eventos en vivo.

Seguridad: la app de cada persona corre en un iframe aislado, sin acceso a la red; pi solo tiene read, edit y write más la extensión guardia; si una app se rompe, se restaura sola; cada versión se guarda para "Deshacer".

## En el escenario (unos 8 minutos)

1. "Esta es una app de hábitos. Un solo archivo. Todos aquí van a tener su propia copia." Muestra el QR.
2. La gente entra y aparecen las tarjetas. "Cámbienla como quieran, con sus palabras."
3. Narra la pantalla: las tarjetas que parpadean, la versión videojuego, el temporizador. Señala el contador de **$ gastado**.
4. Alguien va a intentar romperla. Muestra `fork-guard.ts`: "El candado son 30 líneas que le pedí al agente."
5. Al final, en **El público decide**: quita la sugerencia que intentó romperla, **Agrupar las aceptadas**. "Investigación de usuarios medida por lo que construyeron, no por lo que dijeron."
6. **Aplicar a todos.** "En 25 segundos, lo que pidieron ya está en su celular y en la app de cada usuario nuevo. Ese ciclo antes tomaba un trimestre."

## Antes de la charla

- [ ] `npm run charla`; haz un cambio desde tu celular y revisa que se mueva el contador de $
- [ ] Ten listo el plan B: `npm run charla:claude`
- [ ] Hotspot del celular por si la Wi-Fi del lugar bloquea el túnel
- [ ] Reinicia antes de subir: botón **Reiniciar** en la pantalla (o borra `data/`)
