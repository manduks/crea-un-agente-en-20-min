/**
 * fork-guard: el público escribe los prompts, así que pi solo puede tocar un archivo.
 *
 * Cada llamada a una herramienta pasa por aquí: solo read / edit / write,
 * y solo sobre el index.html de la carpeta donde arrancó pi (la app de esa persona).
 * Todo lo demás se bloquea y el modelo recibe el motivo.
 *
 * Este es el punto de la lámina: la barrera de seguridad son 30 líneas de extensión,
 * no una función que alguien tuvo que lanzar por ti.
 */
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const raiz = process.cwd();
	const archivoPermitido = resolve(raiz, "index.html");
	const herramientasPermitidas = new Set(["read", "edit", "write"]);

	pi.on("tool_call", async (event) => {
		if (!herramientasPermitidas.has(event.toolName)) {
			return { block: true, reason: "Aquí solo se permite read, edit y write sobre index.html." };
		}
		const pedido = String((event.input as { path?: unknown })?.path ?? "");
		const destino = resolve(raiz, pedido);
		if (destino !== archivoPermitido) {
			return { block: true, reason: `Solo puedes tocar index.html en esta carpeta (pediste ${pedido}).` };
		}
		return undefined;
	});
}
