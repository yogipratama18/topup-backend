const express = require("express");
const cors = require("cors");
const midtransClient = require("midtrans-client");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
console.log(admin);
const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

require("dotenv").config();
require("dotenv").config();

console.log("EMAIL_USER =", process.env.EMAIL_USER);
console.log("EMAIL_PASS EXISTS =", !!process.env.EMAIL_PASS);

let serviceAccount;

console.log(
  "FIREBASE_SERVICE_ACCOUNT EXISTS:",
  !!process.env.FIREBASE_SERVICE_ACCOUNT
);
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
serviceAccount = JSON.parse(
process.env.FIREBASE_SERVICE_ACCOUNT
);
} else {
serviceAccount = require('./serviceAccountKey.json');
}

console.log("SERVICE ACCOUNT TYPE:", typeof serviceAccount);
console.log(serviceAccount.project_id);
admin.initializeApp({
credential: admin.cert(serviceAccount),
});


const db = getFirestore();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
        status = "paid";
      } else if (
        transactionStatus === "settlement"
      ) {
        status = "paid";
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

app.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Test Email OTP",
      html: `
        <h2>Email Test Berhasil</h2>
        <p>Nodemailer sudah terhubung ke Gmail.</p>
      `,
    });

    res.json({
      success: true,
      message: "Email sent",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
});

app.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Test OTP Email",
      html: `
        <h2>Test Email Berhasil</h2>
        <p>Nodemailer sudah terhubung dengan Gmail.</p>
      `,
    });

    res.json({
      success: true,
      message: "Email sent",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
});

app.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email wajib diisi",
      });
    }

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const expiresAt = new Date(
      Date.now() + 5 * 60 * 1000
    );

    await db.collection("otp_codes").add({
      email,
      otp,
      verified: false,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Kode OTP Registrasi",
      html: `
        <div style="font-family:Arial">
          <h2>Kode OTP Anda</h2>

          <h1>${otp}</h1>

          <p>
            Kode berlaku selama 5 menit.
          </p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "OTP berhasil dikirim",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
});

app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const snapshot = await db
      .collection("otp_codes")
      .where("email", "==", email)
      .where("otp", "==", otp)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({
        success: false,
        message: "OTP salah",
      });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    const expireTime =
  data.expiresAt.toDate().getTime();

if (Date.now() > expireTime) {
  return res.status(400).json({
    success: false,
    message: "OTP expired",
  });
}

    await doc.ref.delete();

    res.json({
      success: true,
      message: "OTP valid",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
});

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