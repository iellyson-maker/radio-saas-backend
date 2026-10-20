const express = require("express");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const VERSION = "0.2.0";
const PUBLIC_DIR = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(express.static(PUBLIC_DIR, {
  maxAge: 0,
  etag: true,
  setHeaders(res, filePath) {
    if (["index.html", "app.js", "styles.css"].includes(path.basename(filePath))) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
  }
}));

app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "qolan-studio-web",
    product: "Qolan Studio",
    version: VERSION,
    time: new Date().toISOString()
  });
});

app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-cache, must-revalidate");
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Qolan Studio Web " + VERSION + " listening on " + PORT);
});
