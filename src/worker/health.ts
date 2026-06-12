import { createServer } from "node:http";
const port = Number(process.env.PORT || process.env.WORKER_HEALTH_PORT || 3001);
createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: "ok", service: "logivya-whatsapp-worker", timestamp: new Date().toISOString() }));
}).listen(port, "0.0.0.0");
