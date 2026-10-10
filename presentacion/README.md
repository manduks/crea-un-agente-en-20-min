# Presentación: Crea un agente de IA en 20 minutos

31 diapositivas en español, estilo 8 bits, en un solo archivo (`index.html`). Las fuentes pixeladas están en `fuentes/` (licencia OFL), así que funciona sin internet.

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
| m | sonido 8 bits sí/no |
| f | pantalla completa |
| Shift + R | reinicia puntos y encuestas |

En la pantalla en vivo, si das clic adentro, usa la barra de abajo para volver a la presentación.

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
