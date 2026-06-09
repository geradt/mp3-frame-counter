import { createApp } from "./app.js";

const PORT = 3000;

const server = createApp().listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));

server.on("error", (err: Error) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
});
