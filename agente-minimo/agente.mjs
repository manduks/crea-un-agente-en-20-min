// agente.mjs: un agente de IA completo, sin dependencias.
//
// Un agente es: un modelo + herramientas + un ciclo.
// El modelo pide una herramienta → este programa la ejecuta → el resultado
// regresa al modelo → se repite hasta que el modelo ya no pide nada.
//
// Uso:   ANTHROPIC_API_KEY=sk-ant-... node agente.mjs "crea una página web con un reloj"
// Ojo:   puede leer, escribir y ejecutar comandos en la carpeta donde lo corras.

import fs from "node:fs";
import { execSync } from "node:child_process";

const MODELO = process.env.MODELO || "claude-sonnet-5-5";
const tarea = process.argv.slice(2).join(" ") || "Crea hola.txt con un saludo y dime qué contiene.";

// 1. Las herramientas: lo que el agente puede hacer en el mundo.
const herramientas = {
  leer_archivo: {
    descripcion: "Lee un archivo de texto.",
    parametros: { ruta: "ruta del archivo" },
    ejecutar: ({ ruta }) => fs.readFileSync(ruta, "utf8"),
  },
  escribir_archivo: {
    descripcion: "Crea o reemplaza un archivo de texto.",
    parametros: { ruta: "ruta del archivo", contenido: "texto completo del archivo" },
    ejecutar: ({ ruta, contenido }) => (fs.writeFileSync(ruta, contenido), `Listo: ${ruta}`),
  },
  ejecutar_comando: {
    descripcion: "Ejecuta un comando de terminal y regresa lo que imprime.",
    parametros: { comando: "el comando" },
    ejecutar: ({ comando }) => execSync(comando, { encoding: "utf8", timeout: 30_000 }),
  },
};

// 2. El modelo: le mandamos la conversación y la lista de herramientas.
async function modelo(mensajes) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4096,
      system: "Eres un agente que resuelve tareas usando herramientas. Responde en español.",
      tools: Object.entries(herramientas).map(([nombre, h]) => ({
        name: nombre,
        description: h.descripcion,
        input_schema: {
          type: "object",
          properties: Object.fromEntries(Object.entries(h.parametros).map(([p, d]) => [p, { type: "string", description: d }])),
          required: Object.keys(h.parametros),
        },
      })),
      messages: mensajes,
    }),
  });
  if (!r.ok) throw new Error(`El modelo respondió ${r.status}: ${await r.text()}`);
  const { content } = await r.json();
  return { role: "assistant", content };
}

// Ayudantes: qué herramientas pidió, ejecutarlas, y empaquetar el resultado.
const herramientasPedidas = respuesta => respuesta.content.filter(b => b.type === "tool_use");
function ejecutar(llamada) {
  console.log(`  → ${llamada.name} ${JSON.stringify(llamada.input).slice(0, 80)}`);
  try { return String(herramientas[llamada.name].ejecutar(llamada.input)); }
  catch (e) { return `Error: ${e.message}`; }
}
const resultado = (llamada, salida) => ({ type: "tool_result", tool_use_id: llamada.id, content: salida.slice(0, 20_000) });
const mostrar = respuesta => respuesta.content.filter(b => b.type === "text").forEach(b => console.log(`\n${b.text}`));

// 3. El ciclo: esto es todo el "agente".
const mensajes = [{ role: "user", content: tarea }];
while (true) {
  const respuesta = await modelo(mensajes);
  mensajes.push(respuesta);
  mostrar(respuesta);

  const llamadas = herramientasPedidas(respuesta);
  if (llamadas.length === 0) break; // terminó

  const resultados = [];
  for (const llamada of llamadas) {
    const salida = ejecutar(llamada);
    resultados.push(resultado(llamada, salida));
  }
  mensajes.push({ role: "user", content: resultados });
}
