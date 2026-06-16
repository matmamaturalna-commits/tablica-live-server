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
  console.log(`Pobieram tablicę: ${boardId}`);

  const { data, error } = await supabase
    .from("boards")
    .select("elements")
    .eq("id", boardId)
    .maybeSingle();

  if (error) {
    console.error("BŁĄD ODCZYTU SUPABASE:", error);
    return [];
  }

  const elements = Array.isArray(data?.elements) ? data.elements : [];

  console.log(`Pobrano tablicę: ${boardId}, elementów: ${elements.length}`);

  return elements;
}

async function saveBoard(boardId, elements) {
  const safeElements = Array.isArray(elements) ? elements : [];

  console.log(
    `Próba zapisu tablicy: ${boardId}, elementów: ${safeElements.length}`
  );

  if (safeElements.length === 0) {
    const existingElements = await getBoard(boardId);

    if (existingElements.length > 0) {
      console.log(
        `Pominięto pusty zapis dla ${boardId}, bo istnieje zapis z elementami.`
      );
      return;
    }
  }

  const { error } = await supabase.from("boards").upsert({
    id: boardId,
    elements: safeElements,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("BŁĄD ZAPISU SUPABASE:", error);
    return;
  }

  console.log(`Zapisano tablicę: ${boardId}, elementów: ${safeElements.length}`);
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
    const safeElements = Array.isArray(elements) ? elements : [];

    console.log(
      `ODEBRANO ZMIANĘ: ${boardId}, elementów: ${safeElements.length}`
    );

    socket.to(boardId).emit("board-update", safeElements);

    await saveBoard(boardId, safeElements);
  });

  socket.on("disconnect", () => {
    console.log("Rozłączono:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Live server działa na porcie ${PORT}`);
});