import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";

const app = express();

const allowedOrigins = [
  "https://tablica.matmamaturalna.pl",
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(cors({ origin: allowedOrigins }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get("/", (req, res) => {
  res.send("Tablica live server działa z zapisem Supabase.");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 20 * 1024 * 1024,
});

async function getBoard(boardId) {
  const { data, error } = await supabase
    .from("boards")
    .select("elements")
    .eq("id", boardId)
    .single();

  if (error) return [];

  return data?.elements || [];
}

async function saveBoard(boardId, elements) {
  await supabase.from("boards").upsert({
    id: boardId,
    elements,
    updated_at: new Date().toISOString(),
  });
}

io.on("connection", (socket) => {
  console.log("Połączono:", socket.id);

  socket.on("join-board", async (boardId) => {
    socket.join(boardId);

    const elements = await getBoard(boardId);

    socket.emit("board-load", elements);

    console.log(`${socket.id} dołączył do pokoju ${boardId}`);
  });

  socket.on("board-change", async ({ boardId, elements }) => {
    socket.to(boardId).emit("board-update", elements);

    await saveBoard(boardId, elements);
  });

  socket.on("disconnect", () => {
    console.log("Rozłączono:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Live server działa na porcie ${PORT}`);
});