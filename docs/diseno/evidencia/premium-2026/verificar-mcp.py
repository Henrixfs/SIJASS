"""Comprueba los servidores de diseño locales con solicitudes MCP de lectura."""
import asyncio
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]


async def verificar(nombre, configuracion):
    proceso = await asyncio.create_subprocess_exec(
        configuracion["command"], *configuracion["args"], cwd=RAIZ,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL, limit=4 * 1024 * 1024,
    )

    async def emitir(mensaje):
        proceso.stdin.write((json.dumps({"jsonrpc": "2.0", **mensaje}) + "\n").encode())
        await proceso.stdin.drain()

    async def solicitar(identificador, metodo, parametros):
        await emitir({"id": identificador, "method": metodo, "params": parametros})
        while True:
            linea = await asyncio.wait_for(proceso.stdout.readline(), 30)
            if not linea:
                raise RuntimeError(f"{nombre} cerró el canal")
            respuesta = json.loads(linea)
            if respuesta.get("id") == identificador:
                if "error" in respuesta:
                    raise RuntimeError(respuesta["error"])
                return respuesta["result"]

    try:
        inicio = await solicitar(1, "initialize", {
            "protocolVersion": "2025-11-25", "capabilities": {},
            "clientInfo": {"name": "sijass-inspeccion", "version": "1.0"},
        })
        await emitir({"method": "notifications/initialized"})
        herramientas = (await solicitar(2, "tools/list", {}))["tools"]
        nombres = [t["name"] for t in herramientas]
        print(nombre, inicio["serverInfo"], len(nombres), "herramientas")
        if nombre == "sijass-shadcn":
            consulta = next((n for n in nombres if "project_registries" in n), None)
            if consulta is None:
                print(nombres)
                raise RuntimeError("No se encontró la consulta de registros")
        else:
            consulta = "list_pages"
        resultado = await solicitar(3, "tools/call", {"name": consulta, "arguments": {}})
        if resultado.get("isError"):
            raise RuntimeError(resultado["content"])
        print(consulta, resultado["content"])
        if nombre == "sijass-shadcn":
            if "@magicui" not in str(resultado["content"]):
                raise RuntimeError("No figura el registro Magic UI")
        else:
            pagina = await solicitar(4, "tools/call", {
                "name": "new_page", "arguments": {"url": "http://127.0.0.1:5174/ingresar"},
            })
            if pagina.get("isError"):
                raise RuntimeError(pagina["content"])
            paginas = await solicitar(5, "tools/call", {"name": "list_pages", "arguments": {}})
            listado = "\n".join(b.get("text", "") for b in paginas["content"])
            encontrada = re.search(r"(?m)^\s*(\d+):[^\n]*http://127\.0\.0\.1:5174/ingresar", listado)
            if not encontrada:
                raise RuntimeError(listado)
            identificador = int(encontrada.group(1))
            espera = await solicitar(6, "tools/call", {
                "name": "wait_for", "arguments": {"pageId": identificador, "text": ["Ingresar a SIJASS"], "timeout": 15000},
            })
            if espera.get("isError"):
                raise RuntimeError(espera["content"])
            vista = await solicitar(7, "tools/call", {"name": "take_snapshot", "arguments": {"pageId": identificador}})
            if "Ingresar a SIJASS" not in str(vista["content"]):
                raise RuntimeError("El árbol de accesibilidad no incluye el ingreso")
            print("Ingreso real encontrado en el árbol de accesibilidad de Chrome")
    finally:
        proceso.stdin.close()
        try:
            await asyncio.wait_for(proceso.wait(), 5)
        except TimeoutError:
            proceso.terminate()
            await proceso.wait()


async def main():
    config = json.loads((RAIZ / ".agents/mcp_config.json").read_text(encoding="utf-8"))
    for nombre in ["sijass-shadcn", "sijass-devtools"]:
        await verificar(nombre, config["mcpServers"][nombre])


if __name__ == "__main__":
    asyncio.run(main())
