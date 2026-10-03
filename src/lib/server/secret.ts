import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths';

// API キーは AES-256-GCM で暗号化して DB に保存する。
// 鍵は環境変数 APP_SECRET（推奨）。未設定なら DATA_DIR/secret.key を初回に自動生成する。
// （自動生成の鍵は DB と同じ場所に置かれるため、DB ファイル単体が漏れた場合の保護にとどまる）

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    cachedKey = createHash('sha256').update(fromEnv).digest();
    return cachedKey;
  }
  const file = path.join(dataDir(), 'secret.key');
  if (fs.existsSync(file)) {
    cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  } else {
    fs.mkdirSync(dataDir(), { recursive: true });
    cachedKey = randomBytes(32);
    fs.writeFileSync(file, cachedKey.toString('base64'), { mode: 0o600 });
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** 復号できない（鍵が変わった等）場合は null */
export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, enc] = stored.split(':');
  if (v !== 'v1' || !iv || !tag || !enc) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    return null;
  }
}

/** 画面に出すための伏せ字。例: sk-or-••••••••3f2a */
export function maskKey(plain: string): string {
  if (plain.length <= 12) return '••••••••';
  const head = plain.match(/^([a-z]{2,5}-){1,2}/i)?.[0] ?? plain.slice(0, 3);
  return `${head}••••••••${plain.slice(-4)}`;
}
