const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let sessions = {};
let sessionMap = {};
let clientCounter = 1;
let lastUpdateId = 0;

// Assign Client_X automatically
function getClientName(sessionId) {
  if (!sessionMap[sessionId]) {
    sessionMap[sessionId] = "Client_" + clientCounter++;
  }
  return sessionMap[sessionId];
}

// Send message from website
app.post("/send", async (req, res) => {
  const { message, sessionId } = req.body;

  const clientName = getClientName(sessionId);

  if (!sessions[sessionId]) {
    sessions[sessionId] = [];
  }

  sessions[sessionId].push({ from: "client", text: message });

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: `${clientName}: ${message}`
      }
    );
  } catch (err) {
    console.log("Send error:", err.message);
  }

  res.json({ status: "sent" });
});

// Return session messages
app.get("/messages/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  res.json(sessions[sessionId] || []);
});

// Poll Telegram replies
setInterval(async () => {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`
    );

    const updates = response.data.result;

    updates.forEach(update => {
      lastUpdateId = update.update_id;

      if (
        update.message &&
        update.message.text &&
        update.message.chat.id.toString() === CHAT_ID
      ) {
        const text = update.message.text;

        // Detect reply starting with Client_X:
        const match = text.match(/^(Client_\d+):\s(.+)/);

        if (match) {
          const clientName = match[1];
          const reply = match[2];

          const sessionId = Object.keys(sessionMap)
            .find(key => sessionMap[key] === clientName);

          if (sessionId) {
            sessions[sessionId].push({
              from: "agent",
              text: reply
            });
          }
        }
      }
    });

  } catch (err) {
    console.log("Polling error:", err.message);
  }
}, 3000);

app.get("/", (req, res) => {
  res.send("Telegram Bot Running (Client Mode)");
});

app.listen(3000, () => {
  console.log("Server running");
});
