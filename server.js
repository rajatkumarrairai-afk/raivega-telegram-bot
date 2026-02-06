const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let messages = [];
let lastUpdateId = 0;

// Send message from website to Telegram
app.post("/send", async (req, res) => {
  const { message } = req.body;

  messages.push({ from: "user", text: message });

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message
      }
    );
  } catch (error) {
    console.log("Send error:", error.message);
  }

  res.json({ status: "sent" });
});

// Return all messages
app.get("/messages", (req, res) => {
  res.json(messages);
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
        update.message.text &&
        update.message.chat.id.toString() === CHAT_ID
      ) {
        messages.push({
          from: "bot",
          text: update.message.text
        });
      }
    });

  } catch (err) {
    console.log("Polling error:", err.message);
  }
}, 3000);

app.get("/", (req, res) => {
  res.send("Telegram Bot Running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
