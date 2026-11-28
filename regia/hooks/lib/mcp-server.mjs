// Minimal MCP server over stdio (JSON-RPC 2.0, one message per line). No SDK, no dependencies.
// Implements: initialize, ping, tools/list, tools/call. Logs only to stderr.
import { createInterface } from 'node:readline';

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export function serve({ name, version, tools, instructions }) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'JSON non valido'); }
    const { id, method, params } = msg;
    const isRequest = id !== undefined && id !== null;
    try {
      if (method === 'initialize') {
        const asked = params?.protocolVersion;
        reply(id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          ...(instructions ? { instructions } : {}),
        });
      } else if (method === 'ping') {
        reply(id, {});
      } else if (method === 'tools/list') {
        reply(id, { tools: tools.map(({ name: n, description, inputSchema }) => ({ name: n, description, inputSchema })) });
      } else if (method === 'tools/call') {
        const tool = byName.get(params?.name);
        if (!tool) return fail(id, -32602, `Tool sconosciuto: ${params?.name}`);
        try {
          const out = await tool.handler(params.arguments || {});
          reply(id, { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] });
        } catch (e) {
          reply(id, { content: [{ type: 'text', text: e.message }], isError: true });
        }
      } else if (isRequest) {
        fail(id, -32601, `Metodo non supportato: ${method}`);
      }
      // notifications (initialized, cancelled) need no answer
    } catch (e) {
      if (isRequest) fail(id, -32603, e.message);
    }
  });
  rl.on('close', () => process.exit(0));
}

// Hide the "SQLite is an experimental feature" warning: stdout must stay clean JSON-RPC.
export function quietExperimental() {
  const orig = process.emitWarning;
  process.emitWarning = function (w, ...rest) {
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
    if (type === 'ExperimentalWarning') return;
    return orig.call(process, w, ...rest);
  };
}
