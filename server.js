const express = require("express");
const cors = require("cors");
const midtransClient = require("midtrans-client");
const admin = require("firebase-admin");
const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

require("dotenv").config();

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.cert(serviceAccount),
});

const db = getFirestore();

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
        first_name:
          req.body.customerName || "Customer",
        email:
          req.body.customerEmail ||
          "customer@email.com",
      },
    });

    res.json({
      success: true,
      token: transaction.token,
      redirectUrl: transaction.redirect_url,
    });
  } catch (e) {
    console.error("Create Transaction Error:", e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| MIDTRANS WEBHOOK
|--------------------------------------------------------------------------
*/

app.post(
  "/midtrans-notification",
  async (req, res) => {
    try {
      const notification = req.body;

      console.log(
        "MIDTRANS WEBHOOK:",
        JSON.stringify(notification, null, 2)
      );

      const orderId =
        notification.order_id;

      const transactionStatus =
        notification.transaction_status;

      const fraudStatus =
        notification.fraud_status;

      let status = "pending";

      if (
        transactionStatus === "capture" &&
        fraudStatus === "accept"
      ) {
        status = "success";
      } else if (
        transactionStatus === "settlement"
      ) {
        status = "success";
      } else if (
        transactionStatus === "pending"
      ) {
        status = "pending";
      } else if (
        transactionStatus === "expire"
      ) {
        status = "expired";
      } else if (
        transactionStatus === "cancel"
      ) {
        status = "failed";
      } else if (
        transactionStatus === "deny"
      ) {
        status = "failed";
      }

      await db
        .collection("transactions")
        .doc(orderId)
        .update({
          status: status,
          updatedAt: FieldValue.serverTimestamp(),
        });

      console.log(
        `Transaction ${orderId} updated to ${status}`
      );

      res.status(200).json({
        success: true,
      });
    } catch (e) {
      console.error(
        "Webhook Error:",
        e
      );

      res.status(500).json({
        success: false,
        message: e.message,
      });
    }
  }
);

app.listen(
  process.env.PORT || 3000,
  () => {
    console.log(
      `Server Running On Port ${
        process.env.PORT || 3000
      }`
    );
  }
);