# agente-minimo

Un agente de IA completo en un archivo, sin dependencias:

1. **Herramientas**: `leer_archivo`, `escribir_archivo`, `ejecutar_comando`.
2. **Modelo**: una llamada a la API de Anthropic con la conversación y la lista de herramientas.
3. **Ciclo**: el modelo pide una herramienta → el programa la ejecuta → el resultado regresa al modelo → se repite hasta que ya no pide nada.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
mkdir prueba && cd prueba
node ../agente.mjs "crea un reloj digital en reloj.html y luego lista los archivos"
```

Cambia el modelo con `MODELO=claude-haiku-5-5`.

### ¿Dónde valida?

1. **En el ciclo:** cada resultado o error de una herramienta regresa al modelo, y él decide si sigue o si ya terminó. El prompt le pide revisar su trabajo antes de terminar.
2. **Juez externo (opcional):** con `VERIFICAR="comando"`, cuando el modelo dice que terminó se corre ese comando; si falla, el error regresa al modelo y el ciclo sigue.
3. **Límite:** `MAX_PASOS` (20 por defecto) evita que se quede dando vueltas.

```bash
VERIFICAR="grep -q Oaxaca hola.txt" node ../agente.mjs "crea hola.txt con la palabra hola"
# escribe "hola" → el juez falla → lee el error → agrega "Oaxaca" → [verificado]
```

**Cuidado:** puede leer, escribir y ejecutar comandos en la carpeta donde lo corras. Pruébalo en una carpeta vacía.

Ideas para seguir: agrégale una herramienta (buscar en internet, mandar un correo), un límite de pasos, o pídele a un agente de código que se la agregue por ti.
