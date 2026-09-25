"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_http_1 = require("node:http");
const socket_io_1 = require("socket.io");
const ioredis_1 = __importDefault(require("ioredis"));
const port = Number(process.env.PORT ?? 4000);
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    throw new Error("REDIS_URL must be set for the realtime server");
}
const frontendOrigins = (process.env.FRONTEND_URL ?? "*")
    .split(",")
    .map((origin) => origin.trim());
let subscribed = false;
const httpServer = (0, node_http_1.createServer)((request, response) => {
    const pathname = request.url?.split("?", 1)[0];
    if (pathname === "/socket.io" || pathname?.startsWith("/socket.io/")) {
        return;
    }
    if (request.method === "GET" && request.url === "/healthz") {
        const healthy = subscribed && subscriber.status === "ready";
        response.writeHead(healthy ? 200 : 503, {
            "content-type": "application/json",
            "cache-control": "no-store",
        });
        response.end(JSON.stringify({
            status: healthy ? "ok" : "starting",
            redis: subscriber.status,
            subscribed,
        }));
        return;
    }
    response.writeHead(404, {
        "content-type": "application/json",
    });
    response.end(JSON.stringify({ error: "Not found" }));
});
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: frontendOrigins.length === 1
            ? frontendOrigins[0]
            : frontendOrigins,
    },
});
const subscriber = new ioredis_1.default(redisUrl, {
    retryStrategy(attempt) {
        return Math.min(attempt * 500, 5000);
    },
});
subscriber.on("connect", () => {
    console.log("REDIS CONNECTED");
});
subscriber.on("ready", () => {
    console.log("REDIS READY");
    console.log("Redis status:", subscriber.status);
});
subscriber.on("error", (error) => {
    subscribed = false;
    console.error("REDIS ERROR:", error.message);
});
subscriber.on("close", () => {
    subscribed = false;
    console.log("REDIS CONNECTION CLOSED");
});
subscriber.on("unsubscribe", (channel) => {
    if (channel === "realtime") {
        subscribed = false;
        console.log("REALTIME CHANNEL UNSUBSCRIBED");
    }
});
void subscriber
    .subscribe("realtime")
    .then(() => {
    subscribed = true;
    console.log("SUBSCRIBE COMPLETED");
    console.log("Redis status:", subscriber.status);
    console.log("Subscribed:", subscribed);
})
    .catch((error) => {
    subscribed = false;
    console.error("SUBSCRIBE FAILED:", error);
});
function parseSeatUpdate(message) {
    try {
        const value = JSON.parse(message);
        if (!value || typeof value !== "object") {
            return null;
        }
        const update = value;
        if (typeof update.eventId !== "string" ||
            typeof update.seatId !== "string" ||
            !["AVAILABLE", "HELD", "BOOKED"].includes(String(update.status))) {
            return null;
        }
        return update;
    }
    catch {
        return null;
    }
}
subscriber.on("message", (channel, message) => {
    if (channel !== "realtime") {
        return;
    }
    const update = parseSeatUpdate(message);
    if (!update) {
        console.warn("Ignoring invalid message on Redis realtime channel");
        return;
    }
    io.to(`event:${update.eventId}`).emit("seat-update", update);
});
io.on("connection", (socket) => {
    console.info("Socket.IO client connected:", socket.id);
    socket.on("join-event", (eventId) => {
        if (typeof eventId !== "string" ||
            eventId.length === 0 ||
            eventId.length > 200) {
            return;
        }
        void socket.join(`event:${eventId}`);
    });
});
httpServer.listen(port, "0.0.0.0", () => {
    console.info(`Realtime server listening on port ${port}`);
});
async function shutdown(signal) {
    console.info(`Received ${signal}; shutting down realtime server`);
    subscribed = false;
    await Promise.all([
        new Promise((resolve) => io.close(() => resolve())),
        subscriber.quit().then(() => undefined),
    ]);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
