import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();

const allowedOrigins = [
  "https://tablica.matmamaturalna.pl",
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(cors({ origin: allowedOrigins }));

app.get("/", (req, res) => {
  res.send("Tablica live server działa.");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 20 * 1024 * 1024,
});

io.on("connection", (socket) => {
  console.log("Połączono:", socket.id);

  socket.on("join-board", (boardId) => {
    socket.join(boardId);
    console.log(`${socket.id} dołączył do pokoju ${boardId}`);
  });

  socket.on("board-change", ({ boardId, elements }) => {
    socket.to(boardId).emit("board-update", elements);
  });

  socket.on("disconnect", () => {
    console.log("Rozłączono:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Live server działa na porcie ${PORT}`);
});