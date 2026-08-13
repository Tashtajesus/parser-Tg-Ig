// backend/whatsapp-checker.js
// Проверка номеров на наличие WhatsApp через whatsapp-web.js
// Интегрируется с модулем рассылки

const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

let client = null;

/**
 * Подключение к WhatsApp
 * @returns {Promise<Client>}
 */
async function connect() {
  if (client) return client;

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    console.log("📱 WhatsApp: отсканируйте QR-код для авторизации");
    console.log(qr);
  });

  client.on("ready", () => {
    console.log("✅ WhatsApp: клиент готов");
  });

  client.on("disconnected", (reason) => {
    console.log("❌ WhatsApp: отключено —", reason);
    client = null;
  });

  await client.initialize();
  return client;
}

/**
 * Проверка одного номера
 * @param {string} phone - Номер телефона
 * @returns {Promise<Object>}
 */
async function checkNumber(phone) {
  if (!client) {
    throw new Error(
      "WhatsApp клиент не подключён. Вызовите connect() сначала.",
    );
  }

  // Нормализация номера
  const digits = phone.replace(/[^\d]/g, "");
  const normalized =
    digits.startsWith("8") && digits.length === 11
      ? "7" + digits.slice(1)
      : digits;

  const chatId = `${normalized}@c.us`;

  try {
    // Проверяем, существует ли чат (номер зарегистрирован в WhatsApp)
    const chat = await client.getChatById(chatId);
    const exists = chat && chat.isMyContact === false; // Если не в контактах, но чат есть — номер в WA

    return {
      phone,
      digits: "+" + normalized,
      exists,
      chatId,
    };
  } catch (error) {
    // Номер не найден в WhatsApp
    return {
      phone,
      digits: "+" + normalized,
      exists: false,
      chatId,
      error: error.message,
    };
  }
}

/**
 * Массовая проверка номеров
 * @param {Array<string>} phones - Список номеров
 * @param {Object} options
 * @param {number} options.minDelay - Минимальная пауза (мс)
 * @param {number} options.maxDelay - Максимальная пауза (мс)
 * @param {Function} options.onProgress - Callback прогресса
 * @returns {Promise<Object>}
 */
async function checkMany(phones, options = {}) {
  const { minDelay = 3000, maxDelay = 5000, onProgress = () => {} } = options;

  const results = {
    ok: [],
    bad: [],
    errors: [],
  };

  let done = 0;
  const total = phones.length;

  for (const phone of phones) {
    try {
      const result = await checkNumber(phone);

      if (result.exists) {
        results.ok.push(result);
      } else {
        results.bad.push(result);
      }

      done++;
      onProgress({
        done,
        total,
        current: result,
      });

      // Случайная пауза (защита от бана)
      const delay =
        Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      results.errors.push({ phone, error: error.message });
      done++;
      onProgress({
        done,
        total,
        current: { phone, exists: false, error: error.message },
      });
    }
  }

  return {
    ok: results.ok,
    bad: results.bad,
    errors: results.errors,
  };
}

/**
 * Проверка контактов из файла (all_contacts.json)
 * @param {string} inputFile
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function checkContactsFromFile(inputFile, options = {}) {
  const data = fs.readFileSync(inputFile, "utf-8");
  const contacts = JSON.parse(data);

  // Извлекаем уникальные телефоны
  const phones = [
    ...new Set(contacts.filter((c) => c.phone).map((c) => c.phone)),
  ];

  console.log(`🔍 Проверяю ${phones.length} уникальных номеров...\n`);

  const results = await checkMany(phones, options);

  // Сохраняем результаты
  const outputFile = path.join("./output", `whatsapp_check_${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n💾 Результаты сохранены: ${outputFile}`);

  return results;
}

/**
 * Отключение клиента
 */
async function disconnect() {
  if (client) {
    await client.destroy();
    client = null;
    console.log("👋 WhatsApp: клиент отключён");
  }
}

// ============================================================================
// ЭКСПОРТ
// ============================================================================

module.exports = {
  connect,
  checkNumber,
  checkMany,
  checkContactsFromFile,
  disconnect,
};

// ============================================================================
// STANDALONE РЕЖИМ
// ============================================================================

if (require.main === module) {
  (async () => {
    try {
      await connect();

      // Ждём подключения
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.error("❌ Таймаут подключения WhatsApp");
          process.exit(1);
        }, 60000);

        client.ev.on("connection.update", (u) => {
          if (u.connection === "open") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      // Загрузка контактов из файла
      const inputFile = process.argv[2] || "./output/all_contacts.json";

      if (!fs.existsSync(inputFile)) {
        console.error(`❌ Файл не найден: ${inputFile}`);
        process.exit(1);
      }

      const results = await checkContactsFromFile(inputFile, {
        minDelay: 3000,
        maxDelay: 5000,
        onProgress: (p) => {
          const mark = p.current.exists ? "✅" : "❌";
          console.log(
            `${mark} [${p.done}/${p.total}] ${p.current.phone} → ${p.current.digits}`,
          );
        },
      });

      console.log("\n--- Итого ---");
      console.log(`✅ Есть WhatsApp: ${results.ok.length}`);
      console.log(`❌ Нет WhatsApp: ${results.bad.length}`);
      console.log(`⚠️  Ошибки: ${results.errors.length}`);

      if (results.ok.length) {
        console.log("\nНомера с WhatsApp:");
        results.ok.forEach((r) => console.log(`  ${r.digits}`));
      }

      await disconnect();
      process.exit(0);
    } catch (error) {
      console.error("❌ Ошибка:", error);
      await disconnect();
      process.exit(1);
    }
  })();
}
