process.env.NODE_NO_WARNINGS = "1";

const http = require("http");
const next = require("next");

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "127.0.0.1";
const app = next({ dev: false, dir: process.cwd(), hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http.createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
    console.log(`ready http://${hostname}:${port}`);
  });
});
