const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h", etag: true }));
app.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "radioos-studio-web", version: "0.1.0", time: new Date().toISOString() }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log("RadioOS Studio Web listening on " + PORT));
