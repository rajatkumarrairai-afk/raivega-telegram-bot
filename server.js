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

/* =============================
   CLIENT NAME ASSIGNMENT
============================= */

function getClientName(sessionId) {
  if (!sessionMap[sessionId]) {
    sessionMap[sessionId] = "Client_" + clientCounter++;
  }
  return sessionMap[sessionId];
}

/* =============================
   SMART FREIGHT QUICK ENGINE
============================= */

function smartReply(session, message) {
  const msg = message.toLowerCase();

  if (!session.state) session.state = "normal";

  // Greeting
  if (msg === "hi" || msg.includes("hello")) {
    return "Welcome to RAIVEGA. Please share your shipment requirement.";
  }

  // ================= RATE FLOW =================
  if (msg.includes("rate") || msg.includes("quote")) {

    if (session.state === "awaiting_rate_details") {
      return "Kindly share POL, POD, container type and cargo details so we can proceed.";
    }

    session.state = "awaiting_rate_details";
    return "To provide accurate rates, please share POL, POD, container type (20DV/40HC), commodity and cargo readiness date.";
  }

  // Detect shipment details provided
  const hasContainer = msg.includes("20") || msg.includes("40");
  const hasDirection = msg.includes(" to ") || msg.includes(" from ");

  if (session.state === "awaiting_rate_details" && (hasContainer || hasDirection)) {
    session.state = "normal";
    return "Thank you. Our pricing team is reviewing your shipment details and will revert shortly.";
  }

  // ================= OTHER FLOWS =================

  if (msg.includes("booking")) {
    return "Kindly provide booking number or shipment reference for status verification.";
  }

  if (msg.includes("air")) {
    return "For air freight, please share origin airport, destination airport and chargeable weight.";
  }

  if (msg.includes("bl") || msg.includes("bill of lading")) {
    return "Please confirm BL number and whether it is Original or Telex Release.";
  }

  if (msg.includes("invoice") || msg.includes("charges")) {
    return "Please provide invoice number for verification.";
  }

  if (msg.includes("documentation")) {
    return "Kindly specify required document type (Invoice, Packing List, COO, BL Draft).";
  }

  return null;
}

/* =============================
   SEND FROM WEBSITE
============================= */

app.post("/send", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!sessions[sessionId]) {
    sessions[sessionId] = { messages: [], state: "normal" };
  }

  const session = sessions[sessionId];
  const clientName = getClientName(sessionId);

  session.messages.push({ from: "client", text: message });

  // Smart Auto Reply
  const auto = smartReply(session, message);
  if (auto) {
    session.messages.push({ from: "agent", text: auto });
  }

  try {
    const tgResponse = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: `${clientName}:\n${message}`
      }
    );

    const telegramMsgId = tgResponse.data.result.message_id;
    telegramMessageMap[telegramMsgId] = sessionId;

  } catch (err) {
    console.log("Telegram send error:", err.message);
  }

  res.json({ status: "ok" });
});

/* =============================
   FETCH SESSION MESSAGES
============================= */

app.get("/messages/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;

  if (!sessions[sessionId]) {
    return res.json([]);
  }

  res.json(sessions[sessionId].messages);
});

/* =============================
   TELEGRAM POLLING (NO DUPLICATES)
============================= */

setInterval(async () => {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`
    );

    const updates = response.data.result;

    if (!updates.length) return;

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

/* =============================
   ROOT CHECK
============================= */

app.get("/", (req, res) => {
  res.send("RAIVEGA Telegram AI Support Running - Stable Mode");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
