# Presentación: Crea un agente de IA en 20 minutos

32 diapositivas en español, estilo 8 bits, en un solo archivo (`index.html`). Las fuentes pixeladas están en `fuentes/` (licencia OFL), así que funciona sin internet.

## Cómo abrirla

Lo más fácil es con el servidor de la demo, que la sirve junto con la pantalla en vivo y los QR:

```bash
cd ../cada-quien-su-app && npm run charla
# abre la URL "Presentación" que imprime: http://localhost:4317/charla?key=...
```

También puedes abrir `index.html` directo; entonces pásale el servidor: `index.html?demo=http://localhost:4317&key=...`

## Teclas

| Tecla | Qué hace |
|---|---|
| → · espacio · Enter · clic a la derecha | siguiente (en el minijuego, primero revela la respuesta y suma +100) |
| ← · clic a la izquierda | anterior |
| 1–4 | suma una mano a esa opción en las encuestas |
| Shift + 1–4 | resta una |
| 0 | borra la encuesta actual |
| w | salta a la pantalla en vivo |
| e | salta al final: "El público decide" |
| m | sonido 8 bits sí/no |
| f | pantalla completa |
| Shift + R | reinicia puntos y encuestas |

En las diapositivas en vivo (la pantalla y el final), si das clic adentro, usa la barra de abajo para volver a la presentación.

La presentación se ajusta a cualquier ventana (16:9 con bandas negras si hace falta). Los puntos y las encuestas empiezan en cero cada vez que arrancas el servidor.

## Niveles

| Nivel | Tema |
|---|---|
| 0 | El código era lo caro |
| 1 | ¿Qué es un agente? · tu primer agente (`agente-minimo/`) · pi |
| 2 | El agente se hace sus propias herramientas (extensiones de pi) |
| 3 | Cada quien su app: la demo en vivo |
| 4 | La inteligencia se vuelve código |
| 5 | El ciclo de producto corre solo |
| Jefe | Empresas que trabajan mientras duermes · minijuego "¿Agente o humano?" |
| Final | **El público decide**: aceptas o quitas cada sugerencia, el agente las agrupa y aplicas las más pedidas a la app principal y a la app de cada persona (~25 s) |

## Guion de las demos en vivo

Abre una terminal aparte con letra grande. En macOS, la key sale del Llavero:

```bash
export ANTHROPIC_API_KEY="$(security find-generic-password -s pi-demo-anthropic -w)"
mkdir -p ~/demo-en-vivo && cd ~/demo-en-vivo
```

**Nivel 1 · tu primer agente** (~30 s):

```bash
node ~/Documents/code/demos/agente-minimo/agente.mjs "crea un reloj digital grande en reloj.html y luego lista los archivos"
open reloj.html
```

**Nivel 2 · el agente se hace su herramienta** (~30 s):

```bash
~/Documents/code/demos/cada-quien-su-app/node_modules/.bin/pi --model anthropic/claude-sonnet-5-5
```

Escribe: `Crea una extensión de pi en ./costo.ts con un comando /costo que muestre cuánto llevo gastado en esta sesión y cuántos tokens.`
Cuando termine, sal con Ctrl+C y vuelve a abrir pi cargándola: `pi -e ./costo.ts`, haz una pregunta cualquiera y escribe `/costo`.

**Nivel 3 · Cada quien su app**: ya está dentro de la presentación (tecla `w`).

**Final · El público decide** (tecla `e`):
1. Quita con un clic las sugerencias que no quieres contar (por ejemplo, la que intentó romper la app).
2. **Agrupar las aceptadas**: el agente las junta por tema en unos 5 s y preselecciona las 3 más pedidas.
3. **Aplicar a todos**: se agregan a la app principal y a la app de cada persona al mismo tiempo; cada celular se actualiza solo y conserva lo que esa persona ya había cambiado.
