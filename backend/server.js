// backend/server.js
// Express API сервер

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDatabase, addContacts, getAllContacts, getWhatsappContacts, updateWhatsappStatus, getStats } = require('./database');
const { parseTelegram, parseInstagram, mergeContacts, exportToCSV } = require('./social-media-parser');
const { sendTelegramBulk, initWhatsAppClient, sendWhatsAppBulk, sendInstagramBulk } = require('./messenger-sender');
const { checkContactsFromFile } = require('./whatsapp-checker');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Инициализация БД
initDatabase().catch(console.error);

// ============================================================================
// API ROUTES
// ============================================================================

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Статистика
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Контакты
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await getAllContacts();
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Парсинг Telegram
app.post('/api/parse/telegram', async (req, res) => {
  try {
    const { apiId, apiHash, chatIds } = req.body;

    if (!apiId || !apiHash || !chatIds) {
      return res.status(400).json({ error: 'Необходимо указать apiId, apiHash и chatIds' });
    }

    const chats = chatIds.split(',').map(c => c.trim());

    const outputFile = await parseTelegram(
      {
        apiId,
        apiHash,
        chatIds: chats,
      },
      './output'
    );

    const contacts = await require('./social-media-parser').processContacts(outputFile);
    const added = await addContacts(contacts);

    res.json({
      message: `Парсинг завершён. Добавлено контактов: ${added}`,
      file: outputFile,
      count: contacts.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Парсинг Instagram
app.post('/api/parse/instagram', async (req, res) => {
  try {
    const { hashtags, maxPostsPerHashtag = 100 } = req.body;

    if (!hashtags) {
      return res.status(400).json({ error: 'Необходимо указать hashtags' });
    }

    const tags = hashtags.split(',').map(h => h.trim());

    const outputFile = await parseInstagram(
      {
        hashtags: tags,
        maxPostsPerHashtag,
      },
      './output'
    );

    const contacts = await require('./social-media-parser').processContacts(outputFile);
    const added = await addContacts(contacts);

    res.json({
      message: `Парсинг завершён. Добавлено контактов: ${added}`,
      file: outputFile,
      count: contacts.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Проверка WhatsApp
app.post('/api/check/whatsapp', async (req, res) => {
  try {
    const { connect, disconnect } = require('./whatsapp-checker');

    await connect();

    const results = await checkContactsFromFile('./output/all_contacts.json', {
      minDelay: 3000,
      maxDelay: 5000,
    });

    // Обновляем статусы в БД
    for (const contact of results.ok) {
      await updateWhatsappStatus(contact.digits, true);
    }

    await disconnect();

    res.json({
      message: 'Проверка завершена',
      ok: results.ok.length,
      bad: results.bad.length,
      errors: results.errors.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Рассылка Telegram
app.post('/api/send/telegram', async (req, res) => {
  try {
    const { message } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return res.status(400).json({ error: 'Не указан TELEGRAM_BOT_TOKEN в .env' });
    }

    const contacts = await getAllContacts();
    const tgContacts = contacts.filter(c => c.telegram_link);

    const stats = await sendTelegramBulk(botToken, tgContacts, message, 1000);

    res.json({
      message: 'Рассылка завершена',
      sent: stats.sent,
      failed: stats.failed,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Рассылка WhatsApp
app.post('/api/send/whatsapp', async (req, res) => {
  try {
    const { message } = req.body;

    const contacts = await getWhatsappContacts();

    const client = await initWhatsAppClient();
    const stats = await sendWhatsAppBulk(client, contacts, message, 3000);

    res.json({
      message: 'Рассылка завершена',
      sent: stats.sent,
      failed: stats.failed,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Рассылка Instagram
app.post('/api/send/instagram', async (req, res) => {
  try {
    const { message } = req.body;
    const username = process.env.INSTAGRAM_USERNAME;
    const password = process.env.INSTAGRAM_PASSWORD;

    if (!username || !password) {
      return res.status(400).json({ error: 'Не указан INSTAGRAM_USERNAME или INSTAGRAM_PASSWORD в .env' });
    }

    const contacts = await getAllContacts();
    const igContacts = contacts.filter(c => c.instagram_link);

    const stats = await sendInstagramBulk(username, password, igContacts, message, 7000);

    res.json({
      message: 'Рассылка завершена',
      sent: stats.sent,
      failed: stats.failed,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Экспорт контактов в CSV
app.get('/api/export/csv', async (req, res) => {
  try {
    const contacts = await getAllContacts();
    const outputFile = './output/contacts_export.csv';
    exportToCSV(contacts, outputFile);

    res.download(outputFile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
});