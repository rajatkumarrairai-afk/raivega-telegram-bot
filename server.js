const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let messages = [];

app.post("/send", async (req, res) => {
  const { message } = req.body;

  messages.push({ from: "user", text: message });

  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text: "Website Message:\n\n" + message
    }
  );

  res.sendStatus(200);
});

app.get("/messages", (req, res) => {
  res.json(messages);
});

let lastUpdateId = 0;

setInterval(async () => {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`
    );

    const updates = response.data.result;

    updates.forEach(update => {
      lastUpdateId = update.update_id;

      if (update.message && update.message.text) {
        messages.push({
          from: "bot",
          text: update.message.text
        });
      }
    });
  } catch (err) {}
}, 4000);

app.listen(3000, () => {
  console.log("Server running");
});
