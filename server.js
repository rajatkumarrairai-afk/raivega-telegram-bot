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

/* =========================
   CLIENT NAMING SYSTEM
========================= */

function getClientName(sessionId) {
  if (!sessionMap[sessionId]) {
    sessionMap[sessionId] = "Client_" + clientCounter++;
  }
  return sessionMap[sessionId];
}

/* =========================
   SMART QUICK REPLY ENGINE
========================= */

function smartReply(session, message) {
  const msg = message.toLowerCase();

  // Store context
  if (!session.context) session.context = {};

  // Country detection
  const countries = ["india","usa","canada","brazil","germany","uae","singapore","uk"];
  countries.forEach(c=>{
    if(msg.includes(c)){
      session.context.country = c;
    }
  });

  // Freight intelligence
  if (msg.includes("rate") || msg.includes("quote")) {
    return "To provide accurate rates, please share POL, POD, container type (20DV/40HC), commodity and cargo readiness date.";
  }

  if (msg.includes("fcl")) {
    return "For FCL shipments, please confirm container size, weight and HS Code if available.";
  }

  if (msg.includes("lcl")) {
    return "For LCL cargo, please provide volume (CBM), weight and cargo nature.";
  }

  if (msg.includes("air")) {
    return "For air freight, please share origin airport, destination airport and chargeable weight.";
  }

  if (msg.includes("booking")) {
    return "Kindly provide booking number or shipment reference for status verification.";
  }

  if (msg.includes("invoice") || msg.includes("charges")) {
    return "Please provide invoice number for review and reconciliation.";
  }

  if (msg.includes("bl") || msg.includes("bill of lading")) {
    return "Please confirm BL number and whether it is Original or Telex Release.";
  }

  if (msg.includes("documentation")) {
    return "Kindly specify required document type (Invoice, Packing List, COO, BL Draft).";
  }

  if (msg.includes("hello") || msg.includes("hi")) {
    return "Welcome to RAIVEGA. Please let us know your shipment requirement.";
  }

  return null;
}

/* =========================
   SEND MESSAGE FROM WEBSITE
========================= */

app.post("/send", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!sessions[sessionId]) {
    sessions[sessionId] = { messages: [], context: {} };
  }

  const session = sessions[sessionId];
  const clientName = getClientName(sessionId);

  session.messages.push({ from: "client", text: message });

  // Smart auto-reply
  const autoReply = smartReply(session, message);
  if (autoReply) {
    session.messages.push({ from: "agent", text: autoReply });
  }

  try {
    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: `${clientName}:\n${message}`
      }
    );

    const telegramMessageId = telegramResponse.data.result.message_id;
    telegramMessageMap[telegramMessageId] = sessionId;

  } catch (err) {
    console.log("Send error:", err.message);
  }

  res.json({ status: "sent" });
});

/* =========================
   RETURN SESSION MESSAGES
========================= */

app.get("/messages/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  if (!sessions[sessionId]) {
    return res.json([]);
  }
  res.json(sessions[sessionId].messages);
});

/* =========================
   TELEGRAM REPLY ROUTING
========================= */

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

        if (msg.reply_to_message) {
          const repliedMessageId = msg.reply_to_message.message_id;
          const sessionId = telegramMessageMap[repliedMessageId];

          if (sessionId && sessions[sessionId]) {
            sessions[sessionId].messages.push({
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

/* =========================
   ROOT CHECK
========================= */

app.get("/", (req, res) => {
  res.send("RAIVEGA Telegram AI Support Running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
