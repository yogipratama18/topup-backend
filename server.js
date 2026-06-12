const express = require("express");
const cors = require("cors");
const midtransClient = require("midtrans-client");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend Midtrans Running");
});

console.log(
  "MIDTRANS KEY EXISTS:",
  !!process.env.MIDTRANS_SERVER_KEY
);

console.log(
  "MIDTRANS KEY PREFIX:",
  process.env.MIDTRANS_SERVER_KEY?.substring(0, 20)
);

app.post("/create-transaction", async (req, res) => {
  try {
    const snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
    });

    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: req.body.orderId,
        gross_amount: req.body.amount,
      },

      customer_details: {
        first_name: req.body.customerName || "Customer",
        email: req.body.customerEmail || "customer@email.com",
      },
    });

    res.json({
      success: true,
      token: transaction.token,
      redirectUrl: transaction.redirect_url,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server Running On Port 3000");
});