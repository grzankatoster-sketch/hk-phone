const fs = require("fs");
const path = require("path");
const { getMailPassword } = require("./config.cjs");

function subjectMatches(subject, includes) {
  if (!includes || !includes.length) return true;
  const lower = String(subject || "").toLowerCase();
  return includes.some((needle) => lower.includes(String(needle).toLowerCase()));
}

function senderMatches(from, allowList) {
  if (!allowList || !allowList.length) return true;
  const lower = String(from || "").toLowerCase();
  return allowList.some((needle) => lower.includes(String(needle).toLowerCase()));
}

function safeFilename(name) {
  return path.basename(String(name || "raport.pdf")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function processedStatePath(outputDir) {
  return path.join(outputDir, "processed-uids.json");
}

function loadProcessedUids(outputDir) {
  try {
    const file = processedStatePath(outputDir);
    if (!fs.existsSync(file)) return new Set();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return new Set(Array.isArray(raw?.uids) ? raw.uids.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveProcessedUids(outputDir, uids) {
  const file = processedStatePath(outputDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), uids: [...uids].slice(-2000) }, null, 2), "utf8");
}

async function fetchPdfAttachments(config, outputDir) {
  let ImapFlow;
  let simpleParser;
  try {
    ({ ImapFlow } = require("imapflow"));
    ({ simpleParser } = require("mailparser"));
  } catch {
    throw new Error("Brak zaleznosci imapflow/mailparser. Uruchom: npm install");
  }

  const password = getMailPassword(config);
  if (!config.mailbox.host || !config.mailbox.user || !password) {
    throw new Error("Brak konfiguracji IMAP lub hasla w zmiennej srodowiskowej.");
  }

  const client = new ImapFlow({
    host: config.mailbox.host,
    port: config.mailbox.port || 993,
    secure: config.mailbox.secure !== false,
    auth: { user: config.mailbox.user, pass: password },
    logger: false,
  });

  const attachmentDir = path.join(outputDir, "mail-pdf");
  fs.mkdirSync(attachmentDir, { recursive: true });
  const saved = [];
  const rememberProcessed = config.mailbox.rememberProcessed !== false;
  const processedUids = rememberProcessed ? loadProcessedUids(outputDir) : new Set();

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox.folder || "INBOX");
  try {
    const criteria = config.mailbox.unseenOnly === false ? {} : { seen: false };
    const uids = await client.search(criteria);
    for await (const message of client.fetch(uids, { uid: true, envelope: true, source: true })) {
      if (rememberProcessed && processedUids.has(String(message.uid))) continue;
      const subject = message.envelope?.subject || "";
      const from = (message.envelope?.from || []).map((item) => item.address || item.name || "").join(", ");
      if (!subjectMatches(subject, config.mailbox.subjectIncludes)) continue;
      if (!senderMatches(from, config.mailbox.senderAllowList)) continue;
      if (!message.source) continue;

      const parsed = await simpleParser(message.source);
      const pdfAttachments = (parsed.attachments || []).filter((attachment) => {
        const name = attachment.filename || "";
        return attachment.contentType === "application/pdf" || /\.pdf$/i.test(name);
      });

      // Raport tygodniowy = 7 osobnych PDF "Wykaz sprzatania" w JEDNYM mailu.
      // Maja ten sam uid, te sama nazwe bazowa i moga trafic w te sama milisekunde,
      // wiec bez indeksu zalacznika nazwy plikow kolidowalyby i 6 z 7 dni zostaloby
      // nadpisanych. Indeks gwarantuje unikalna sciezke (= unikalne id w historii).
      pdfAttachments.forEach((attachment, attachmentIndex) => {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${stamp}-${message.uid}-${String(attachmentIndex).padStart(2, "0")}-${safeFilename(attachment.filename)}`;
        const filePath = path.join(attachmentDir, filename);
        fs.writeFileSync(filePath, attachment.content);
        saved.push({ filePath, uid: message.uid, subject, from });
      });

      if (pdfAttachments.length && config.mailbox.markSeenAfterSuccess) {
        await client.messageFlagsAdd([message.uid], ["\\Seen"], { uid: true });
      }
      if (pdfAttachments.length && rememberProcessed) {
        processedUids.add(String(message.uid));
        saveProcessedUids(outputDir, processedUids);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return saved;
}

// Skrzynka raporty@conradcomfort.pl jest dedykowana tylko do odbioru raportow
// KWHotel — po X dniach maile sa juz przetworzone (PDF-y zapisane lokalnie +
// uidy w processed-uids.json), wiec mozna je trwale usunac zeby nie puchla skrzynka.
async function deleteOldMail(config, { logger = console } = {}) {
  const days = Number(config.mailbox.deleteAfterDays);
  if (!days || days <= 0) return { deleted: 0, skipped: true };

  let ImapFlow;
  try {
    ({ ImapFlow } = require("imapflow"));
  } catch {
    throw new Error("Brak zaleznosci imapflow. Uruchom: npm install");
  }

  const password = getMailPassword(config);
  if (!config.mailbox.host || !config.mailbox.user || !password) {
    throw new Error("Brak konfiguracji IMAP lub hasla w zmiennej srodowiskowej.");
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const client = new ImapFlow({
    host: config.mailbox.host,
    port: config.mailbox.port || 993,
    secure: config.mailbox.secure !== false,
    auth: { user: config.mailbox.user, pass: password },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox.folder || "INBOX");
  let deleted = 0;
  try {
    const uids = await client.search({ before: cutoff }, { uid: true });
    if (uids && uids.length) {
      await client.messageDelete(uids, { uid: true });
      deleted = uids.length;
      logger.log?.(`Usunieto ${deleted} maili starszych niz ${days} dni (przed ${cutoff.toISOString()}).`);
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return { deleted, skipped: false };
}

module.exports = { fetchPdfAttachments, deleteOldMail };
