// backend/social-media-parser.js
// Единый парсер для сбора контактов из Telegram и Instagram
// Собирает: username, ФИО, email, телефон, ссылки на профили

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// ============================================================================
// КОНФИГУРАЦИЯ
// ============================================================================

/**
 * Конфигурация парсера Telegram
 * @typedef {Object} TelegramConfig
 * @property {string} apiId - API ID от my.telegram.org
 * @property {string} apiHash - API Hash от my.telegram.org
 * @property {string} sessionName - Имя сессии
 * @property {string[]} chatIds - Список чатов для парсинга
 * @property {string[]} keywordsKZ - Ключевые слова для фильтрации по Казахстану
 */

/**
 * Конфигурация парсера Instagram
 * @typedef {Object} InstagramConfig
 * @property {string[]} hashtags - Список хештегов для поиска
 * @property {number} maxPostsPerHashtag - Максимум постов на хештег
 * @property {string[]} keywordsKZ - Ключевые слова для фильтрации по Казахстану
 */

/**
 * Общая конфигурация
 * @typedef {Object} ParserConfig
 * @property {TelegramConfig} telegram - Конфиг Telegram
 * @property {InstagramConfig} instagram - Конфиг Instagram
 * @property {string} outputDir - Папка для результатов
 */

// ============================================================================
// TELEGRAM ПАРСЕР
// ============================================================================

/**
 * Запуск парсера Telegram
 * @param {TelegramConfig} tgConfig
 * @param {string} outputDir
 * @returns {Promise<string>} Путь к файлу с результатами
 */
async function parseTelegram(tgConfig, outputDir = "./output") {
  const {
    apiId,
    apiHash,
    sessionName = "client_session",
    chatIds = [],
    keywordsKZ = [
      "kz",
      "kazakhstan",
      "almaty",
      "astana",
      "pavlodar",
      "shymkent",
      "караганда",
      "актобе",
      "атырау",
      "уральск",
      "костанай",
      "петропавловск",
      "кокшетау",
      "тарраз",
      "семей",
      "оскемен",
      "актау",
      "орал",
      "казахстан",
    ],
  } = tgConfig;

  if (!apiId || !apiHash) {
    throw new Error("Необходимо указать apiId и apiHash от my.telegram.org");
  }

  if (chatIds.length === 0) {
    throw new Error("Необходимо указать хотя бы один chatId для парсинга");
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFile = path.join(
    outputDir,
    `telegram_contacts_${timestamp}.json`,
  );

  const pythonScript = generateTelegramScript(
    apiId,
    apiHash,
    sessionName,
    chatIds,
    outputFile,
    keywordsKZ,
  );
  const scriptPath = path.join(outputDir, "telegram_parser_temp.py");
  fs.writeFileSync(scriptPath, pythonScript, "utf-8");

  console.log("Запуск парсера Telegram...");
  await executeCommand(`python3 ${scriptPath}`);
  console.log(`Парсинг Telegram завершён. Результаты в: ${outputFile}`);

  return outputFile;
}

/**
 * Генерация Python-скрипта для Telegram
 */
function generateTelegramScript(
  apiId,
  apiHash,
  sessionName,
  chatIds,
  outputFile,
  keywordsKZ,
) {
  return `
import asyncio
from telethon import TelegramClient
from telethon.tl.types import User
import json

api_id = ${apiId}
api_hash = '${apiHash}'
session_name = '${sessionName}'
chat_ids = ${JSON.stringify(chatIds)}
output_file = '${outputFile}'
keywords_kz = ${JSON.stringify(keywordsKZ)}

async def main():
    client = TelegramClient(session_name, api_id, api_hash)
    await client.start()

    contacts = []

    for chat_id in chat_ids:
        print(f'Парсинг чата: {chat_id}')
        try:
            async for user in client.iter_participants(chat_id):
                if isinstance(user, User):
                    user_id = user.id
                    username = user.username or ''
                    first_name = user.first_name or ''
                    last_name = user.last_name or ''
                    phone = user.phone or ''
                    bio = user.bio or ''

                    bio_lower = bio.lower()
                    username_lower = username.lower() if username else ''
                    name_lower = (first_name + ' ' + last_name).lower()

                    is_kz = any(kw in bio_lower or kw in username_lower or kw in name_lower for kw in keywords_kz)

                    if is_kz:
                        contact = {
                            'user_id': str(user_id),
                            'username': username,
                            'first_name': first_name,
                            'last_name': last_name,
                            'phone': phone,
                            'bio': bio,
                            'source': 'Telegram'
                        }
                        contacts.append(contact)
        except Exception as e:
            print(f'Ошибка при парсинге {chat_id}: {e}')

    await client.disconnect()

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(contacts, f, ensure_ascii=False, indent=2)

    print(f'Найдено контактов из Telegram: {len(contacts)}')

if __name__ == '__main__':
    asyncio.run(main())
  `;
}

// ============================================================================
// INSTAGRAM ПАРСЕР
// ============================================================================

/**
 * Запуск парсера Instagram
 * @param {InstagramConfig} igConfig
 * @param {string} outputDir
 * @returns {Promise<string>} Путь к файлу с результатами
 */
async function parseInstagram(igConfig, outputDir = "./output") {
  const {
    hashtags = [],
    maxPostsPerHashtag = 100,
    keywordsKZ = [
      "kazakhstan",
      "almaty",
      "astana",
      "pavlodar",
      "shymkent",
      "караганда",
      "актобе",
      "атырау",
      "уральск",
      "костанай",
      "петропавловск",
      "кокшетау",
      "тарраз",
      "семей",
      "оскемен",
      "актау",
      "орал",
      "кз",
      "казахстан",
    ],
  } = igConfig;

  if (hashtags.length === 0) {
    throw new Error("Необходимо указать хотя бы один хештег для парсинга");
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFile = path.join(
    outputDir,
    `instagram_contacts_${timestamp}.json`,
  );

  const pythonScript = generateInstagramScript(
    hashtags,
    outputFile,
    maxPostsPerHashtag,
    keywordsKZ,
  );
  const scriptPath = path.join(outputDir, "instagram_parser_temp.py");
  fs.writeFileSync(scriptPath, pythonScript, "utf-8");

  console.log("Запуск парсера Instagram...");
  await executeCommand(`python3 ${scriptPath}`);
  console.log(`Парсинг Instagram завершён. Результаты в: ${outputFile}`);

  return outputFile;
}

/**
 * Генерация Python-скрипта для Instagram
 */
function generateInstagramScript(
  hashtags,
  outputFile,
  maxPostsPerHashtag,
  keywordsKZ,
) {
  const hashtagsStr = JSON.stringify(hashtags);
  const keywordsStr = JSON.stringify(keywordsKZ);

  // Берём логин/пароль из .env
  const igUser = process.env.INSTAGRAM_USERNAME || "";
  const igPass = process.env.INSTAGRAM_PASSWORD || "";

  return `
import instaloader
import json
import re

IG_USERNAME = '${igUser}'
IG_PASSWORD = '${igPass}'

hashtags = ${hashtagsStr}
output_file = r'''${outputFile}'''
max_posts = ${maxPostsPerHashtag}
keywords_kz = ${keywordsStr}

EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'
PHONE_REGEX = r'(?:\\+7|8|7)\\s*\\(?\\d{3}\\)?\\s*\\d{3}\\s*\\d{2}\\s*\\d{2}'

def extract_contact_info(bio):
    if not bio:
        return '', ''
    emails = re.findall(EMAIL_REGEX, bio)
    phones = re.findall(PHONE_REGEX, bio)
    return emails[0] if emails else '', phones[0] if phones else ''

def is_from_kazakhstan(profile):
    bio = profile.biography or ''
    username = profile.username or ''
    full_name = profile.full_name or ''
    bio_lower = bio.lower()
    username_lower = username.lower()
    name_lower = full_name.lower()
    return any(kw in bio_lower or kw in username_lower or kw in name_lower for kw in keywords_kz)

def main():
    loader = instaloader.Instaloader()

    if IG_USERNAME and IG_PASSWORD:
        try:
            print('Логин в Instagram...')
            loader.login(IG_USERNAME, IG_PASSWORD)
        except Exception as e:
            print(f'Ошибка логина Instagram: {e}')
            return
    else:
        print('Не указаны IG_USERNAME/IG_PASSWORD, доступ к тегам может быть ограничен.')

    contacts = []
    seen_usernames = set()

    for hashtag in hashtags:
        print(f'Парсинг хештега: #{hashtag}')
        try:
            hashtag_obj = instaloader.Hashtag.from_name(loader.context, hashtag)
            posts = hashtag_obj.get_posts()

            count = 0
            for post in posts:
                if count >= max_posts:
                    break

                try:
                    profile = post.owner_profile
                except Exception:
                    count += 1
                    continue

                username = profile.username
                if not username or username in seen_usernames:
                    count += 1
                    continue

                if not is_from_kazakhstan(profile):
                    count += 1
                    continue

                bio = profile.biography or ''
                email, phone = extract_contact_info(bio)

                contact = {
                    'username': username,
                    'full_name': profile.full_name or '',
                    'email': email,
                    'phone': phone,
                    'bio': bio,
                    'followers': profile.followers,
                    'following': profile.followees,
                    'posts_count': profile.mediacount,
                    'profile_url': f'https://instagram.com/{username}',
                    'source': 'Instagram'
                }
                contacts.append(contact)
                seen_usernames.add(username)

                count += 1
                print(f'  Найдено: {len(contacts)} (постов обработано: {count})')

        except Exception as e:
            print(f'Ошибка при парсинге #{hashtag}: {e}')

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(contacts, f, ensure_ascii=False, indent=2)

    print(f'\\nНайдено контактов из Instagram: {len(contacts)}')

if __name__ == '__main__':
    main()
  `;
}
// ============================================================================
// ОБЩИЕ ФУНКЦИИ
// ============================================================================

/**
 * Выполнение shell-команды
 */
function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Ошибка: ${stderr}`);
        reject(error);
        return;
      }
      console.log(stdout);
      resolve();
    });
  });
}

/**
 * Нормализация телефона
 */
function normalizePhone(phone) {
  if (!phone) return "";
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("8") && cleaned.length === 11) {
    cleaned = "+7" + cleaned.slice(1);
  }
  if (cleaned.startsWith("7") && cleaned.length === 11) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

/**
 * Обработка результатов из JSON
 */
async function processContacts(inputFile) {
  const data = fs.readFileSync(inputFile, "utf-8");
  const contacts = JSON.parse(data);

  const filtered = contacts.filter((c) => c.username || c.phone);

  const normalized = filtered.map((c) => ({
    ...c,
    phone: normalizePhone(c.phone),
    fullName:
      c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim(),
    telegramLink:
      c.username && c.source === "Telegram" ? `https://t.me/${c.username}` : "",
    instagramLink: c.profile_url || "",
  }));

  return normalized;
}

/**
 * Объединение контактов из нескольких файлов
 */
async function mergeContacts(files) {
  const allContacts = [];

  for (const file of files) {
    const contacts = await processContacts(file);
    allContacts.push(...contacts);
  }

  // Дедупликация по username + phone
  const seen = new Set();
  const unique = [];

  for (const contact of allContacts) {
    const key = `${contact.username || ""}|${contact.phone || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(contact);
    }
  }

  console.log(
    `Объединено контактов: ${allContacts.length}, после дедупликации: ${unique.length}`,
  );
  return unique;
}

/**
 * Экспорт в CSV
 */
function exportToCSV(contacts, outputFile) {
  const headers = [
    "fullName",
    "username",
    "telegramLink",
    "instagramLink",
    "email",
    "phone",
    "source",
  ];
  const rows = contacts.map((c) =>
    [
      c.fullName,
      c.username,
      c.telegramLink,
      c.instagramLink,
      c.email,
      c.phone,
      c.source,
    ]
      .map((field) => `"${(field || "").replace(/"/g, '""')}"`)
      .join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");
  fs.writeFileSync(outputFile, csv, "utf-8");
  console.log(`CSV экспортирован в: ${outputFile}`);
}

/**
 * Экспорт в JSON
 */
function exportToJSON(contacts, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(contacts, null, 2), "utf-8");
  console.log(`JSON экспортирован в: ${outputFile}`);
}

// ============================================================================
// ЭКСПОРТ
// ============================================================================

module.exports = {
  parseTelegram,
  parseInstagram,
  processContacts,
  mergeContacts,
  normalizePhone,
  exportToCSV,
  exportToJSON,
};
