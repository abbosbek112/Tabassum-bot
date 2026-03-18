require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const admin = require('firebase-admin');

// ─── Firebase Admin Init ───────────────────────────────────────────────────
let db = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('✅ Firebase connected!');
  } else {
    console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT not set. Phone numbers will NOT be saved to Firestore.');
  }
} catch (err) {
  console.error('Firebase init error:', err.message);
}

// ─── Bot Init ──────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://tabssum.app';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is required!');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Tabassum Bot started...');

// ─── /start command ────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || 'Foydalanuvchi';

  await bot.sendMessage(
    chatId,
    `Assalomu alaykum, ${firstName}! 👋\n\n` +
    `Tabassum Marketplacega xush kelibsiz! 🛍️\n\n` +
    `Davom etish uchun telefon raqamingizni ulashing 📱`,
    {
      reply_markup: {
        keyboard: [
          [
            {
              text: '📱 Telefon raqamimni ulashish',
              request_contact: true,
            },
          ],
          [{ text: '❌ Bekor qilish' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

// ─── Contact received ──────────────────────────────────────────────────────
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id?.toString();
  const contact = msg.contact;

  // Faqat o'z raqamini ulashsa qabul qilish
  if (contact.user_id && contact.user_id !== msg.from?.id) {
    await bot.sendMessage(chatId, '❗ Iltimos, faqat o\'z raqamingizni ulashing.');
    return;
  }

  const phone = contact.phone_number.replace(/[^0-9+]/g, '');
  const firstName = contact.first_name || msg.from?.first_name || '';
  const lastName = contact.last_name || msg.from?.last_name || '';

  try {
    // Firestore-ga saqlash
    if (db) {
      await db.collection('telegram_users').doc(telegramId).set({
        telegramId,
        phone,
        firstName,
        lastName,
        username: msg.from?.username || null,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`✅ Phone saved: ${phone} for Telegram ID: ${telegramId}`);
    } else {
      console.warn('⚠️ db is null, phone not saved');
    }

    // Klaviaturani olib tashlash
    await bot.sendMessage(
      chatId,
      '✅ Raqamingiz saqlandi!\n\n' +
      'Endi quyidagi tugmani bosib Tabassum Marketplacega kiring va ro\'yxatdan o\'ting 👇',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    );

    // App havolasini yuborish (inline button bilan)
    await bot.sendMessage(
      chatId,
      '🛍️ *Tabassum Marketplace*\n\nMahsulotlarni ko\'rish, do\'kon ochish va xarid qilish uchun ilovani oching!',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Ilovani ochish',
                web_app: { url: APP_URL },
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error('Firestore save error:', err);
    await bot.sendMessage(chatId, '❌ Xatolik yuz berdi, iltimos qayta urinib ko\'ring: /start');
  }
});

// ─── Cancel ───────────────────────────────────────────────────────────────
bot.onText(/Bekor qilish|Bekor|❌/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Bekor qilindi. /start bilan qayta boshlash mumkin.', {
    reply_markup: { remove_keyboard: true },
  });
});

// ─── Health check (Render.com uchun) ──────────────────────────────────────
const app = express();
app.get('/', (_, res) => res.json({ status: 'ok', bot: 'Tabassum Bot running' }));
app.listen(PORT, () => console.log(`🌐 Health check server on port ${PORT}`));
