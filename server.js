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
  res.send("Tablica live server działa z tokenami i zapisem Supabase.");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 20 * 1024 * 1024,
});

async function getBoardRow(boardId) {
  const { data, error } = await supabase
    .from("boards")
    .select("id, elements, access_token")
    .eq("id", boardId)
    .maybeSingle();

  if (error) {
    console.error("BŁĄD ODCZYTU SUPABASE:", error);
    return null;
  }

  return data;
}

async function checkBoardAccess(boardId, token) {
  const board = await getBoardRow(boardId);

  if (!board) {
    console.log(`BLOKADA: tablica ${boardId} nie istnieje.`);
    return false;
  }

  if (!board.access_token) {
    console.log(`BLOKADA: tablica ${boardId} nie ma ustawionego tokena.`);
    return false;
  }

  if (token && token === board.access_token) {
    console.log(`Dostęp OK dla tablicy ${boardId}`);
    return true;
  }

  console.log(`BLOKADA DOSTĘPU do tablicy ${boardId}`);
  return false;
}

async function getBoard(boardId) {
  console.log(`Pobieram tablicę: ${boardId}`);

  const board = await getBoardRow(boardId);
  const elements = Array.isArray(board?.elements) ? board.elements : [];

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

  socket.on("join-board", async ({ boardId, token }) => {
    const hasAccess = await checkBoardAccess(boardId, token);

    if (!hasAccess) {
      socket.emit("board-access-denied");
      return;
    }

    socket.data.boardId = boardId;
    socket.data.token = token;

    socket.join(boardId);

    const elements = await getBoard(boardId);

    socket.emit("board-load", elements);

    console.log(`${socket.id} dołączył do pokoju ${boardId}`);
  });

  socket.on("board-change", async ({ boardId, token, elements }) => {
    const hasAccess = await checkBoardAccess(boardId, token);

    if (!hasAccess) {
      socket.emit("board-access-denied");
      return;
    }

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