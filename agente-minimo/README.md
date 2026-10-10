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

**Cuidado:** puede leer, escribir y ejecutar comandos en la carpeta donde lo corras. Pruébalo en una carpeta vacía.

Ideas para seguir: agrégale una herramienta (buscar en internet, mandar un correo), un límite de pasos, o pídele a un agente de código que se la agregue por ti.
