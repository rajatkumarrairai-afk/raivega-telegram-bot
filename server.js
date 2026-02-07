const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

let sessions = {};
let messageIdToSession = {};

/*
sessions structure:
{
  sessionId: {
    name,
    company,
    country,
    messages: [],
    telegramMessageIds: []
  }
}
*/

/* ================= SEND MESSAGE FROM WEBSITE ================= */

app.post("/send", async (req, res) => {

  const { message, sessionId, name, company, country } = req.body;

  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      name,
      company,
      country,
      messages: [],
      telegramMessageIds: []
    };
  }

  const session = sessions[sessionId];

  session.messages.push({
    from: "client",
    text: message
  });

  const label = `${session.name} | ${session.company} | ${session.country}`;

  const telegramResponse = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: `${label}\n\n${message}`
    })
  });

  const telegramData = await telegramResponse.json();

  if (telegramData.result) {
    const telegramMessageId = telegramData.result.message_id;
    session.telegramMessageIds.push(telegramMessageId);
    messageIdToSession[telegramMessageId] = sessionId;
  }

  res.json({ status: "sent" });
});

/* ================= FETCH MESSAGES FOR WEBSITE ================= */

app.get("/messages/:sessionId", (req, res) => {

  const sessionId = req.params.sessionId;

  if (!sessions[sessionId]) {
    return res.json([]);
  }

  res.json(sessions[sessionId].messages);
});

/* ================= TELEGRAM POLLING ================= */

let offset = 0;

async function pollTelegram() {

  try {

    const response = await fetch(
      `${TELEGRAM_API}/getUpdates?offset=${offset}`
    );

    const data = await response.json();

    if (data.result.length > 0) {

      data.result.forEach(update => {

        offset = update.update_id + 1;

        if (
          update.message &&
          update.message.text &&
          update.message.reply_to_message
        ) {

          const replyToId = update.message.reply_to_message.message_id;
          const sessionId = messageIdToSession[replyToId];

          if (sessionId && sessions[sessionId]) {

            const agentFirstName =
              update.message.from.first_name || "RAIVEGA";

            const agentLabel = `Mr ${agentFirstName} - RAIVEGA`;

            sessions[sessionId].messages.push({
              from: "agent",
              text: update.message.text,
              agentName: agentLabel
            });

          }

        }

      });

    }

  } catch (err) {
    console.log("Polling error:", err.message);
  }

  setTimeout(pollTelegram, 3000);
}

pollTelegram();

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.send("Professional Telegram Support Bot Running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port", PORT)
);
