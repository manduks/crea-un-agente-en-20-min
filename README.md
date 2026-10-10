# Crea un agente de IA en 20 minutos

Material de la charla sobre [pi.dev](https://pi.dev) (Oaxaca, octubre 2026). Todo es código abierto: descárgalo, córrelo y cámbialo.

> Decidir y ser ambicioso es el trabajo.

| Carpeta | Qué es |
|---|---|
| [`agente-minimo/`](agente-minimo) | Tu primer agente: ~90 líneas, sin dependencias. Un modelo + 3 herramientas + un ciclo. |
| [`cada-quien-su-app/`](cada-quien-su-app) | La demo en vivo: cada persona del público escanea un QR, recibe su propia copia de una app y un agente (pi) la reescribe con lo que le pida. |
| [`presentacion/`](presentacion) | Las diapositivas (estilo 8 bits), en un solo archivo HTML. |

## Arranque rápido

```bash
git clone https://github.com/manduks/crea-un-agente-en-20-min
cd crea-un-agente-en-20-min

# 1. Tu primer agente
export ANTHROPIC_API_KEY=sk-ant-...        # tu API key de console.anthropic.com
node agente-minimo/agente.mjs "crea un reloj digital en reloj.html"

# 2. La demo + la presentación (un solo servidor)
cd cada-quien-su-app && npm install
npm run charla                              # imprime la URL de la presentación y la de la pantalla
```

Requisitos: Node 20 o más reciente. Para la demo con túnel público, [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

Licencia MIT.
