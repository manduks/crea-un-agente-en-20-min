// Respaldo de la demo del Nivel 2: la extensión /costo que pi escribió en la prueba del 2026-10-10.
// Si en vivo algo falla: pi -e ~/Documents/code/demos/presentacion/respaldo/costo.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("costo", {
		description: "Muestra el gasto (USD) y los tokens de esta sesión",
		handler: async (_args, ctx) => {
			let cost = 0, input = 0, output = 0, total = 0, calls = 0;
			for (const e of ctx.sessionManager.getEntries() as any[]) {
				if (e.type !== "message" || e.message?.role !== "assistant") continue;
				const u = e.message.usage;
				if (!u) continue;
				calls++;
				cost += u.cost?.total ?? 0;
				input += u.input ?? 0;
				output += u.output ?? 0;
				total += u.totalTokens ?? 0;
			}
			const n = (x: number) => x.toLocaleString("es-MX");
			ctx.ui.notify(
				`Gasto de la sesión: $${cost.toFixed(4)} USD\nTokens: ${n(total)} (entrada ${n(input)} · salida ${n(output)})\nRespuestas del modelo: ${calls}`,
				"info",
			);
		},
	});
}
