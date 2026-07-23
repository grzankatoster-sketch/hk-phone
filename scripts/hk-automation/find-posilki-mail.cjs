// Jednorazowe narzędzie testowe: znajduje w skrzynce mail z "Raportem Posiłków"
// (bez wzgledu na to czy juz zaznaczony jako przetworzony przez service.cjs) i
// zapisuje jego zalacznik PDF do wskazanego folderu — do recznego przetestowania
// parsera bez czekania na kolejny mail i bez ruszania processed-uids.json.
//
// Uzycie: node scripts/hk-automation/find-posilki-mail.cjs [ile-dni-wstecz=3]

const fs = require("fs");
const path = require("path");
const { loadConfig, getMailPassword } = require("./lib/config.cjs");

async function main() {
  const { ImapFlow } = require("imapflow");
  const { simpleParser } = require("mailparser");
  const config = loadConfig();
  const password = getMailPassword(config);
  const daysBack = Number(process.argv[2]) || 3;

  const client = new ImapFlow({
    host: config.mailbox.host,
    port: config.mailbox.port || 993,
    secure: config.mailbox.secure !== false,
    auth: { user: config.mailbox.user, pass: password },
    logger: false,
  });

  const outDir = path.join(config.outputDir, "mail-pdf-test");
  fs.mkdirSync(outDir, { recursive: true });

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox.folder || "INBOX");
  let found = 0;
  try {
    const since = new Date(Date.now() - daysBack * 86400000);
    const uids = await client.search({ since });
    console.log(`Przeszukuje ${uids.length} wiadomosci z ostatnich ${daysBack} dni...`);
    for await (const message of client.fetch(uids, { uid: true, envelope: true, source: true })) {
      const subject = message.envelope?.subject || "";
      if (!message.source) continue;
      const parsed = await simpleParser(message.source);
      const pdfAttachments = (parsed.attachments || []).filter((a) => a.contentType === "application/pdf" || /\.pdf$/i.test(a.filename || ""));
      for (const att of pdfAttachments) {
        const isPosilki = /posi[łl]k/i.test(subject) || /posi[łl]k/i.test(att.filename || "") || /Raport Posi[łl]k/i.test(att.content.toString("latin1"));
        if (!isPosilki) continue;
        const filename = `posilki-${message.uid}-${(att.filename || "raport.pdf").replace(/[<>:"/\\|?*]/g, "_")}`;
        const filePath = path.join(outDir, filename);
        fs.writeFileSync(filePath, att.content);
        console.log(`ZNALEZIONO: uid=${message.uid} subject="${subject}" -> ${filePath}`);
        found++;
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
  if (!found) console.log("Nie znaleziono zadnego maila z Raportem Posilkow w tym oknie czasowym.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
