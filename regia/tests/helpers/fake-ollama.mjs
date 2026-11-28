// Fake Ollama HTTP server for tests: /api/tags, /api/chat, /api/generate, /api/embed.
import { createServer } from 'node:http';

export async function fakeOllama({ models = ['qwen2.5:7b', 'nomic-embed-text:latest'], chat = () => '{}', delayMs = 0 } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', async () => {
      const json = body ? JSON.parse(body) : null;
      calls.push({ path: req.url, body: json });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/api/tags') return send({ models: models.map((name) => ({ name })) });
      if (req.url === '/api/chat') return send({ model: json.model, message: { role: 'assistant', content: chat(json) }, prompt_eval_count: 50, eval_count: 20, done: true });
      if (req.url === '/api/generate') return send({ model: json.model, response: chat(json), prompt_eval_count: 50, eval_count: 20, done: true });
      if (req.url === '/api/embed') {
        const words = String(json.input).toLowerCase();
        return send({ embeddings: [[words.includes('deploy') ? 1 : 0, words.includes('luce') ? 1 : 0, 0.1]] });
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) };
}
