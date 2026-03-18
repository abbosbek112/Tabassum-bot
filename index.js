require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const admin = require('firebase-admin');

// ─── Firebase Admin Init ───────────────────────────────────────────────────
let db = null;

try {
  const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  console.log('Env check:', {
    hasBotToken: !!process.env.BOT_TOKEN,
    hasAppUrl: !!process.env.APP_URL,
    hasServiceAccount: !!rawEnv,
    serviceAccountLength: rawEnv?.length || 0,
  });

  if (rawEnv) {
    // Fix escaped newlines that Render sometimes introduces
    let jsonStr = rawEnv;
    try {
      // Try direct parse first
      JSON.parse(jsonStr);
    } catch (_) {
      // Replace escaped newlines in private_key field
      jsonStr = rawEnv.replace(/\\n/g, '\n');
    }

    const serviceAccount = JSON.parse(jsonStr);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("✅ Firebase bog'landi! (v4)");
  } else {
    console.warn("⚠️  FIREBASE_SERVICE_ACCOUNT topilmadi! (v4)");
  }
} catch (err) {
  console.error('Firebase init xatosi:', err.message);
}

// ─── Bot Init (Webhook via Express — no separate port) ─────────────────────
const BOT_TOKEN  = process.env.BOT_TOKEN;
const APP_URL    = process.env.APP_URL || 'https://tabassum-marketplace-9821c.web.app';
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://tabassum-bot.onrender.com';
const PORT       = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is required!');
  process.exit(1);
}

// Create bot WITHOUT polling and WITHOUT its own server
// We'll handle the webhook via Express
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

console.log('🤖 Tabassum Bot v5 (webhook via Express) started...');

// ─── OTP Storage (in-memory + Firestore) ──────────────────────────────────
// { telegramId: { code, expiresAt } }
const otpStore = {};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── /start command ────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || 'Foydalanuvchi';

  await bot.sendMessage(
    chatId,
    `Assalomu alaykum, ${firstName}! 👋\n\n` +
    `Tabassum Marketplacega xush kelibsiz! 🛍️\n\n` +
    `Ro'yxatdan o'tish uchun quyidagi tugmani bosing 👇`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Tabassum ni ochish', web_app: { url: APP_URL } }]
        ]
      }
    }
  );
});

// ─── Express Server ────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/', (_, res) => res.json({ status: 'ok', bot: 'Tabassum Bot v3 running' }));

// ─── POST /send-code ───────────────────────────────────────────────────────
// Body: { telegramId: string }
// Generates a 6-digit OTP, saves it, sends via bot
app.post('/send-code', async (req, res) => {
  const { telegramId } = req.body;

  if (!telegramId) {
    return res.status(400).json({ success: false, error: 'telegramId required' });
  }

  try {
    const code = generateOtp();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Save OTP in memory
    otpStore[telegramId] = { code, expiresAt };

    // Also save to Firestore for persistence (optional)
    if (db) {
      await db.collection('otp_codes').doc(String(telegramId)).set({
        code,
        expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Send code via Telegram bot
    await bot.sendMessage(
      telegramId,
      `🔐 *Tabassum — Tasdiqlash kodi*\n\n` +
      `Sizning kodingiz: *${code}*\n\n` +
      `⏱️ Kod 5 daqiqa davomida amal qiladi.\n` +
      `Bu kodni hech kimga bermang!`,
      { parse_mode: 'Markdown' }
    );

    console.log(`✅ OTP sent to telegramId: ${telegramId}`);
    res.json({ success: true });

  } catch (err) {
    console.error('Send code error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /verify-code ──────────────────────────────────────────────────────
// Body: { telegramId: string, code: string, name: string, surname?: string, age: number, phone?: string }
// Verifies OTP, creates Firebase user, returns custom token
app.post('/verify-code', async (req, res) => {
  const { telegramId, code, name, surname, age, phone } = req.body;

  if (!telegramId || !code || !name || !age) {
    return res.status(400).json({ success: false, error: 'telegramId, code, name, age required' });
  }

  // Check OTP in memory first, then Firestore
  let stored = otpStore[telegramId];

  if (!stored && db) {
    try {
      const doc = await db.collection('otp_codes').doc(String(telegramId)).get();
      if (doc.exists) {
        const data = doc.data();
        stored = { code: data.code, expiresAt: data.expiresAt };
      }
    } catch (e) {
      console.error('Firestore OTP fetch error:', e.message);
    }
  }

  if (!stored) {
    return res.status(400).json({ success: false, error: 'Kod topilmadi. /send-code ni qayta chaqiring.' });
  }

  if (Date.now() > stored.expiresAt) {
    delete otpStore[telegramId];
    return res.status(400).json({ success: false, error: 'Kod muddati tugagan. Qayta yuborilsin.' });
  }

  if (stored.code !== code) {
    return res.status(400).json({ success: false, error: 'Noto\'g\'ri kod. Qayta urinib ko\'ring.' });
  }

  // Code is correct — clear it
  delete otpStore[telegramId];
  if (db) {
    db.collection('otp_codes').doc(String(telegramId)).delete().catch(() => {});
  }

  if (!db) {
    return res.status(500).json({ success: false, error: 'Firebase not initialized' });
  }

  try {
    // Get phone from telegram_users if available
    let userPhone = phone || '';
    if (!userPhone) {
      const telDoc = await db.collection('telegram_users').doc(String(telegramId)).get();
      if (telDoc.exists) {
        userPhone = telDoc.data()?.phone || '';
      }
    }

    // Use telegramId as the Firebase UID (prefixed)
    const uid = `tg_${telegramId}`;

    // Create or update user profile in Firestore
    await db.collection('users').doc(uid).set({
      uid,
      telegramId: String(telegramId),
      displayName: name,
      surname: surname || '',
      age: parseInt(age),
      phoneNumber: userPhone,
      email: '',
      role: 'customer',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Create Firebase Custom Token
    const customToken = await admin.auth().createCustomToken(uid, {
      telegramId: String(telegramId),
      role: 'customer',
    });

    console.log(`✅ Auth verified for telegramId: ${telegramId}, uid: ${uid}`);
    res.json({ success: true, token: customToken, uid });

  } catch (err) {
    console.error('Verify code error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Express server on port ${PORT}`);
  
  // Register webhook with Telegram after server is up
  const webhookUrl = `${RENDER_URL}/bot${BOT_TOKEN}`;
  bot.setWebHook(webhookUrl)
    .then(() => console.log(`✅ Webhook set: ${webhookUrl}`))
    .catch(err => console.error('Webhook set error:', err.message));
});

// ─── Telegram Webhook Route ────────────────────────────────────────────────
// Telegram sends updates to this endpoint
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
