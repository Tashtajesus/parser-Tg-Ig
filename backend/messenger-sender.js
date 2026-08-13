// backend/messenger-sender.js
// Модуль рассылки в Telegram, WhatsApp, Instagram
// С учётом лимитов, обработкой ошибок и логированием

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// ============================================================================
// TELEGRAM СЕНДЕР
// ============================================================================

/**
 * Отправка сообщения в Telegram через бота
 * @param {string} botToken - Токен бота от @BotFather
 * @param {string} username - Username получателя (без @)
 * @param {string} message - Текст сообщения
 * @returns {Promise<boolean>} Успешно ли отправлено
 */
async function sendTelegramMessage(botToken, username, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: `@${username}`,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`Telegram: отправлено @${username}`);
      return true;
    }

    if (data.error_code === 429) {
      // Rate limit — ждём указанное время
      const retryAfter = data.parameters?.retry_after || 5;
      console.log(`Telegram: rate limit, ждём ${retryAfter} сек...`);
      await sleep(retryAfter * 1000);
      return sendTelegramMessage(botToken, username, message); // Retry
    }

    console.error(`Telegram: ошибка @${username} — ${data.description}`);
    return false;
  } catch (error) {
    console.error(`Telegram: исключение @${username} — ${error.message}`);
    return false;
  }
}

/**
 * Массовая рассылка в Telegram
 * @param {string} botToken
 * @param {Array} contacts - Массив контактов с полем username
 * @param {string} message
 * @param {number} delayMs - Пауза между сообщениями (мс)
 * @returns {Promise<Object>} Статистика
 */
async function sendTelegramBulk(botToken, contacts, message, delayMs = 1000) {
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    if (!contact.username) continue;

    const success = await sendTelegramMessage(
      botToken,
      contact.username,
      message,
    );

    if (success) {
      sent++;
    } else {
      failed++;
    }

    // Пауза между сообщениями (защита от бана)
    await sleep(delayMs);
  }

  return { sent, failed };
}

// ============================================================================
// WHATSAPP СЕНДЕР (через whatsapp-web.js)
// ============================================================================

/**
 * Инициализация WhatsApp клиента
 * @returns {Promise<Object>} Клиент WhatsApp
 */
async function initWhatsAppClient() {
  const { Client, LocalAuth } = require("whatsapp-web.js");

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    console.log("WhatsApp: отсканируйте QR-код для авторизации");
    console.log(qr);
  });

  client.on("ready", () => {
    console.log("WhatsApp: клиент готов");
  });

  await client.initialize();
  return client;
}

/**
 * Отправка сообщения в WhatsApp
 * @param {Object} client - WhatsApp клиент
 * @param {string} phone - Номер телефона (в формате +7XXXXXXXXXX)
 * @param {string} message - Текст сообщения
 * @returns {Promise<boolean>}
 */
async function sendWhatsAppMessage(client, phone, message) {
  try {
    // Нормализация номера
    const normalizedPhone = phone.replace(/[^\d]/g, "") + "@c.us";

    await client.sendMessage(normalizedPhone, message);
    console.log(`WhatsApp: отправлено ${phone}`);
    return true;
  } catch (error) {
    console.error(`WhatsApp: ошибка ${phone} — ${error.message}`);
    return false;
  }
}

/**
 * Массовая рассылка в WhatsApp
 * @param {Object} client
 * @param {Array} contacts - Массив контактов с полем phone
 * @param {string} message
 * @param {number} delayMs - Пауза между сообщениями (рекомендуется 2000-5000)
 * @returns {Promise<Object>} Статистика
 */
async function sendWhatsAppBulk(client, contacts, message, delayMs = 3000) {
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    if (!contact.phone) continue;

    const success = await sendWhatsAppMessage(client, contact.phone, message);

    if (success) {
      sent++;
    } else {
      failed++;
    }

    // Пауза (WhatsApp строго лимитирует)
    await sleep(delayMs);
  }

  return { sent, failed };
}

// ============================================================================
// INSTAGRAM СЕНДЕР (через instagrapi)
// ============================================================================

/**
 * Отправка сообщения в Instagram DM
 * @param {string} username - Логин Instagram (отправитель)
 * @param {string} password - Пароль Instagram
 * @param {string} recipientUsername - Получатель (username)
 * @param {string} message - Текст сообщения
 * @returns {Promise<boolean>}
 */
async function sendInstagramDM(username, password, recipientUsername, message) {
  // Генерируем Python-скрипт
  const script = `
import instagrapi
import json

username = '${username}'
password = '${password}'
recipient = '${recipientUsername}'
message = '''${message}'''

try:
    client = instagrapi.Client()
    client.login(username, password)

    user_id = client.user_id_by_username(recipient)
    client.dm_send(user_id, message)

    print(json.dumps({'success': True}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
  `;

  const scriptPath = path.join("./output", "instagram_dm_temp.py");
  fs.writeFileSync(scriptPath, script, "utf-8");

  return new Promise((resolve) => {
    exec(`python3 ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Instagram: ошибка ${recipientUsername} — ${stderr}`);
        resolve(false);
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          console.log(`Instagram: отправлено @${recipientUsername}`);
          resolve(true);
        } else {
          console.error(
            `Instagram: ошибка @${recipientUsername} — ${result.error}`,
          );
          resolve(false);
        }
      } catch {
        console.error(`Instagram: ошибка парсинга ответа`);
        resolve(false);
      }
    });
  });
}

/**
 * Массовая рассылка в Instagram
 * @param {string} username
 * @param {string} password
 * @param {Array} contacts - Массив контактов с полем username (Instagram)
 * @param {string} message
 * @param {number} delayMs - Пауза (рекомендуется 5000-10000)
 * @returns {Promise<Object>} Статистика
 */
async function sendInstagramBulk(
  username,
  password,
  contacts,
  message,
  delayMs = 7000,
) {
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    if (!contact.username) continue;

    const success = await sendInstagramDM(
      username,
      password,
      contact.username,
      message,
    );

    if (success) {
      sent++;
    } else {
      failed++;
    }

    // Пауза (Instagram очень строгий)
    await sleep(delayMs);
  }

  return { sent, failed };
}

// ============================================================================
// ОБЩИЕ ФУНКЦИИ
// ============================================================================

/**
 * Сон (пауза)
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Логирование результатов
 * @param {string} platform
 * @param {Object} stats
 */
function logStats(platform, stats) {
  console.log(`\n${platform} — Статистика:`);
  console.log(`  Отправлено: ${stats.sent}`);
  console.log(`  Ошибки: ${stats.failed}`);
}

/**
 * Сохранение лога рассылки
 * @param {string} platform
 * @param {Array} results
 */
function saveLog(platform, results) {
  const logFile = path.join(
    "./output",
    `send_log_${platform}_${Date.now()}.json`,
  );
  fs.writeFileSync(logFile, JSON.stringify(results, null, 2), "utf-8");
  console.log(`Лог сохранён: ${logFile}`);
}

// ============================================================================
// ЭКСПОРТ
// ============================================================================

module.exports = {
  sendTelegramMessage,
  sendTelegramBulk,
  initWhatsAppClient,
  sendWhatsAppMessage,
  sendWhatsAppBulk,
  sendInstagramDM,
  sendInstagramBulk,
  logStats,
  saveLog,
};
