// agente.mjs: un agente de IA completo, sin dependencias.
//
// Un agente es: un modelo + herramientas + un ciclo.
// El modelo pide una herramienta → este programa la ejecuta → el resultado
// regresa al modelo → se repite hasta que el modelo ya no pide nada.
//
// Uso:   ANTHROPIC_API_KEY=sk-ant-... node agente.mjs "crea una página web con un reloj"
// Con juez externo: VERIFICAR="npm test" node agente.mjs "arregla las pruebas"
// Ojo:   puede leer, escribir y ejecutar comandos en la carpeta donde lo corras.

import fs from "node:fs";
import { execSync } from "node:child_process";

const MODELO = process.env.MODELO || "claude-sonnet-5-5";
const tarea = process.argv.slice(2).join(" ") || "Crea hola.txt con un saludo y dime qué contiene.";
const MAX_PASOS = Number(process.env.MAX_PASOS || 20); // límite: nunca se queda dando vueltas
const VERIFICAR = process.env.VERIFICAR;               // juez externo opcional, p. ej. "npm test"

// La API key: de la variable de entorno o, en macOS, del Llavero (elemento "pi-demo-anthropic").
let API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && process.platform === "darwin") {
  try { API_KEY = execSync("security find-generic-password -s pi-demo-anthropic -w", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
}
if (!API_KEY) {
  console.error("Falta la API key: export ANTHROPIC_API_KEY=sk-ant-... (consíguela en console.anthropic.com)");
  process.exit(1);
}

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
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4096,
      system: "Eres un agente que resuelve tareas usando herramientas. Antes de terminar, revisa tu trabajo con las herramientas (lee el archivo, corre el código o las pruebas). Responde en español.",
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

// El juez externo: un comando que debe salir con código 0. Regresa el error o null.
function verificar() {
  if (!VERIFICAR) return null;
  try { execSync(VERIFICAR, { encoding: "utf8", timeout: 60_000, stdio: "pipe" }); return null; }
  catch (e) { return `${e.stdout || ""}${e.stderr || ""}`.trim().slice(0, 4000) || e.message; }
}

const corrige = error => ({ role: "user", content: `La verificación \`${VERIFICAR}\` falló:\n${error}\nCorrígelo.` });

// 3. El ciclo: esto es todo el "agente".
const mensajes = [{ role: "user", content: tarea }];
for (let paso = 1; paso <= MAX_PASOS; paso++) {
  const respuesta = await modelo(mensajes);
  mensajes.push(respuesta);
  mostrar(respuesta);

  const llamadas = herramientasPedidas(respuesta);
  if (llamadas.length === 0) {     // dice que terminó...
    const error = verificar();     // ...un juez lo revisa
    if (!error) break;             // listo de verdad
    console.log("\n[la verificación falló, el agente sigue]");
    mensajes.push(corrige(error)); // si no, a corregir
    continue;
  }

  const resultados = llamadas.map(llamada =>
    resultado(llamada, ejecutar(llamada)));
  mensajes.push({ role: "user", content: resultados });
}

// Si lo último que habló fue el modelo, terminó (y pasó al juez). Si no, se acabaron los pasos.
if (mensajes.at(-1).role === "assistant") console.log(VERIFICAR ? "\n[verificado]" : "");
else { console.log(`\nSe acabó el límite de pasos (${MAX_PASOS}) sin terminar.`); process.exitCode = 1; }
