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
let telegramMessageMap = {};
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
    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: `${clientName}:\n${message}`
      }
    );

    const telegramMessageId = telegramResponse.data.result.message_id;

    // Store mapping between Telegram message and session
    telegramMessageMap[telegramMessageId] = sessionId;

  } catch (err) {
    console.log("Send error:", err.message);
  }

  res.json({ status: "sent" });
});

// Return messages per session
app.get("/messages/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  res.json(sessions[sessionId] || []);
});

// Poll Telegram for replies
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
        update.message.chat.id.toString() === CHAT_ID
      ) {
        const msg = update.message;

        // Only process replies
        if (msg.reply_to_message) {
          const repliedMessageId = msg.reply_to_message.message_id;
          const sessionId = telegramMessageMap[repliedMessageId];

          if (sessionId) {
            if (!sessions[sessionId]) {
              sessions[sessionId] = [];
            }

            sessions[sessionId].push({
              from: "agent",
              text: msg.text
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
  res.send("Telegram Bot Running (Reply Mode Enabled)");
});

app.listen(3000, () => {
  console.log("Server running");
});
