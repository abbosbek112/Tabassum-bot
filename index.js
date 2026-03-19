require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
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

// ─── Direct Telegram Auth Server ──────────────────────────────────────────

// ─── /start command — Ask for phone number first ──────────────────────────
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || 'Foydalanuvchi';
  const telegramId = String(msg.from.id);
  const startParam = match[1] ? match[1].trim() : '';

  let phoneExists = false;
  let savedPhone = '';

  if (db) {
    try {
      const doc = await db.collection('telegram_users').doc(telegramId).get();
      if (doc.exists && doc.data().phone) {
        phoneExists = true;
        savedPhone = doc.data().phone;
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Telegram allows passing startapp via start param if simple deep link is used, 
  // or it will just be added by Telegram UI. We provide it dynamically.
  // We'll leave the url as APP_URL; Telegram appends tgWebAppStartParam automatically
  // but if we need a specific link, we can just use APP_URL.

  if (phoneExists) {
    await bot.sendMessage(
      chatId,
      `Assalomu alaykum yana bir bor, *${firstName}*! 👋\n\n` +
      `Sizning raqamingiz (\`${savedPhone}\`) tizimda muvaffaqiyatli saqlangan.\n\n` +
      `👇 Pastdagi tugmani bosib **Tabassum Marketplace** ga kiring!`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Tabassum ni ochish', web_app: { url: APP_URL } }]
          ]
        }
      }
    );
    await bot.sendMessage(
      chatId,
      `Boshqa raqam kiritish kerak bo'lsa, pastdagi tugmani bosing:`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '🔄 Raqamni almashtirish', request_contact: true }]
          ],
          resize_keyboard: true,
        }
      }
    );
  } else {
    await bot.sendMessage(
      chatId,
      `Assalomu alaykum, *${firstName}*! 👋\n\n` +
      `🛍️ *Tabassum Marketplace* — onlayn xaridlar platformasiga xush kelibsiz!\n\n` +
      `Davom etish va profilingizni xavfsiz himoyalash uchun, iltimos,\n` +
      `👇 **Telefon raqamingizni ulang**:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '📱 Telefon raqamimni ulashish', request_contact: true }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        }
      }
    );
  }
});

// ─── Contact handler — Save phone & show app button ───────────────────────
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  const telegramId = String(msg.from.id);
  const phone = contact.phone_number;

  // Save to Firestore
  if (db) {
    try {
      await db.collection('telegram_users').doc(telegramId).set({
        telegramId,
        phone,
        firstName: contact.first_name || '',
        lastName: contact.last_name || '',
        username: msg.from?.username || '',
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      const uid = `tg_${telegramId}`;
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        await db.collection('users').doc(uid).update({ phoneNumber: phone });
      }

      console.log(`✅ Phone saved and synced: ${telegramId} → ${phone}`);
    } catch (err) {
      console.error('Firestore save error:', err.message);
    }
  }

  // Send success message + app button
  await bot.sendMessage(
    chatId,
    `✅ *Ajoyib! Raqamingiz muvaffaqiyatli saqlandi:*\n\`${phone}\`\n\n` +
    `Endi platformamizdan to'liq foydalanishingiz mumkin.\n` +
    `👇 Pastdagi tugmani bosib **Tabassum** ilovasiga kiring!`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Tabassum ni ochish', web_app: { url: APP_URL } }]
        ]
      }
    }
  );

  await bot.sendMessage(
    chatId,
    `Kerak bo'lganda raqamingizni almashtirishingiz mumkin:`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '🔄 Raqamni almashtirish', request_contact: true }]
        ],
        resize_keyboard: true,
      }
    }
  );
});

// ─── Express Server ────────────────────────────────────────────────────────
const app = express();
app.use(cors()); // Allow all origins (Flutter web app on Firebase Hosting)
app.use(express.json());

app.get('/', (_, res) => res.json({ status: 'ok', bot: 'Tabassum Bot v3 running' }));

// ─── POST /telegram-login ───────────────────────────────────────────────────
// Body: { telegramId: string }
app.post('/telegram-login', async (req, res) => {
  const { telegramId } = req.body;
  
  if (!telegramId) {
    return res.status(400).json({ success: false, error: 'telegramId required' });
  }

  if (!db) {
    return res.status(500).json({ success: false, error: 'Firebase not initialized' });
  }

  try {
    const uid = `tg_${telegramId}`;
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (userDoc.exists) {
      // User already exists, log them in!
      const customToken = await admin.auth().createCustomToken(uid, {
        telegramId: String(telegramId),
        role: userDoc.data()?.role || 'customer',
      });
      console.log(`✅ Direct login for: ${uid}`);
      return res.json({ success: true, token: customToken, uid, needs_registration: false });
    } else {
      // User needs to register (provide Name, Surname, Age)
      console.log(`ℹ️ Needs registration: ${telegramId}`);
      return res.json({ success: true, needs_registration: true });
    }
  } catch (err) {
    console.error('Telegram login error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /telegram-register ────────────────────────────────────────────────
// Body: { telegramId: string, name: string, surname?: string, age: number }
app.post('/telegram-register', async (req, res) => {
  const { telegramId, name, surname, age } = req.body;

  if (!telegramId || !name || !age) {
    return res.status(400).json({ success: false, error: 'telegramId, name, age required' });
  }

  if (!db) {
    return res.status(500).json({ success: false, error: 'Firebase not initialized' });
  }

  try {
    // 1. Fetch phone number from telegram_users
    let userPhone = '';
    const telDoc = await db.collection('telegram_users').doc(String(telegramId)).get();
    if (telDoc.exists) {
      userPhone = telDoc.data()?.phone || '';
    }

    const uid = `tg_${telegramId}`;

    // 2. Create user document
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

    // 3. Create Custom Token
    const customToken = await admin.auth().createCustomToken(uid, {
      telegramId: String(telegramId),
      role: 'customer',
    });

    console.log(`✅ Registration complete for: ${uid}`);
    res.json({ success: true, token: customToken, uid });

  } catch (err) {
    console.error('Telegram register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Express server on port ${PORT}`);
  
  // Wait 5s after startup to let old Render instance fully shut down
  // before registering the webhook (avoids 409 conflict)
  setTimeout(async () => {
    const webhookUrl = `${RENDER_URL}/bot${BOT_TOKEN}`;
    try {
      await bot.setWebHook(webhookUrl);
      console.log(`✅ Webhook set: ${webhookUrl}`);
    } catch (err) {
      console.warn(`⚠️ Webhook set warning (will retry): ${err.message}`);
      // Retry after 15 more seconds
      setTimeout(async () => {
        try {
          await bot.setWebHook(webhookUrl);
          console.log(`✅ Webhook set (retry): ${webhookUrl}`);
        } catch (e) {
          console.error(`❌ Webhook set failed: ${e.message}`);
        }
      }, 15000);
    }
  }, 5000);
});

// ─── Telegram Webhook Route ────────────────────────────────────────────────
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ─── Manual Webhook Reset (call this URL in browser if bot stops responding) ─
app.get('/set-webhook', async (_, res) => {
  const webhookUrl = `${RENDER_URL}/bot${BOT_TOKEN}`;
  try {
    await bot.setWebHook(webhookUrl);
    res.json({ success: true, webhook: webhookUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
