// server.ts — the skeleton, I'll write this part since it's new
import { createServer } from "http"
import { Server } from "socket.io"
import Redis from "ioredis"

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: { origin: "*" } // tighten this later to your actual frontend domain
})

const subscriber = new Redis(process.env.REDIS_URL!)

io.on("connection", (socket) => {
    console.log("client connected:", socket.id)
    socket.on("join-event",(eventId:string)=>{
        socket.join(`event:${eventId}`)
        console.log(`${socket.id} joined event: ${eventId}`)
    })
    // YOU write: the room-joining logic here
})

// YOU write: the Redis subscriber that listens for published messages
// and broadcasts them to the right room via io.to(room).emit(...)

httpServer.listen(process.env.PORT || 4000)