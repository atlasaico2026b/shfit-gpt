/* ATLAS SHIFT — ذخیره‌سازی رمزنگاری‌شدهٔ داده‌ها
   یک ماژول کوچک و بدون وابستگی: gzip (اگر مرورگر پشتیبانی کند) + AES-GCM 256.
   کلید دستگاه غیرقابل‌استخراج (non-extractable) است و در IndexedDB نگه داشته می‌شود،
   پس بایت خام کلید هرگز بیرون از موتور رمزنگاری مرورگر نمی‌رود.
   خروجی باینری است تا base64 (۳۳٪ اضافه‌حجم) لازم نباشد.
   این فایل در design/ است چون اکشن دیپلوی کل این پوشه را کپی می‌کند
   (فهرست فایل‌های ریشهٔ در حال کپی دستی نگه داشته می‌شود) — همان‌جا که theme-switch.js هست. */
(function () {
  'use strict';

  const KEY_DB = 'ATLAS_SECURE_KEYS';
  const KEY_STORE = 'keys';
  const KEY_ID = 'device';
  const KEY_FALLBACK = 'atlasShiftDeviceKeyV2';
  const VERSION = 2;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let keyPromise = null;

  function openKeyDb() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(KEY_DB, 1);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('key db')); };
      request.onblocked = function () { reject(new Error('key db blocked')); };
    });
  }

  function readStoredKey() {
    return openKeyDb().then(function (database) {
      return new Promise(function (resolve, reject) {
        const request = database.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(KEY_ID);
        request.onsuccess = function () { database.close(); resolve(request.result || null); };
        request.onerror = function () { database.close(); reject(request.error); };
      });
    });
  }

  function storeKey(key) {
    return openKeyDb().then(function (database) {
      return new Promise(function (resolve, reject) {
        const tx = database.transaction(KEY_STORE, 'readwrite');
        tx.objectStore(KEY_STORE).put(key, KEY_ID);
        tx.oncomplete = function () { database.close(); resolve(key); };
        tx.onerror = function () { database.close(); reject(tx.error); };
      });
    });
  }

  function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function toBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  // کلید: ابتدا تلاش برای خواندن CryptoKey غیرقابل‌استخراج از IndexedDB، بعد ساخت آن.
  async function getKey() {
    if (keyPromise) return keyPromise;
    keyPromise = (async function () {
      try {
        const stored = await readStoredKey();
        if (stored) return stored;
        const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await storeKey(fresh);
        return fresh;
      } catch (error) {
        // اگر IndexedDB برای کلید در دسترس نبود، کلید متنی در localStorage نگه داشته می‌شود.
        const raw = localStorage.getItem(KEY_FALLBACK);
        if (raw) return crypto.subtle.importKey('raw', fromBase64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        localStorage.setItem(KEY_FALLBACK, toBase64(bytes));
        return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
      }
    })();
    return keyPromise;
  }

  async function gzip(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      return null;
    }
  }

  async function gunzip(bytes) {
    if (typeof DecompressionStream !== 'function') return null;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      return null;
    }
  }

  // Web Crypto فقط در بستر امن (https یا localhost) در دسترس است.
  function available() {
    try { return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues); }
    catch (error) { return false; }
  }

  function isSealed(value) {
    return !!(value && typeof value === 'object' && value.v === VERSION && value.iv && value.ct);
  }

  // seal(obj) → { v, alg, iv, ct }  (ct باینری، برای ذخیرهٔ مستقیم در IndexedDB)
  async function seal(value) {
    const plain = enc.encode(JSON.stringify(value));
    const packed = (await gzip(plain)) || plain;
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, packed);
    return { v: VERSION, alg: packed === plain ? 'A256GCM' : 'A256GCM+GZ', iv: iv, ct: ct, at: Date.now() };
  }

  async function open(payload) {
    if (!isSealed(payload)) return payload || null;
    const key = await getKey();
    const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(payload.iv) }, key, payload.ct));
    const bytes = payload.alg === 'A256GCM+GZ' ? await gunzip(raw) : raw;
    if (!bytes) throw new Error('decompress');
    return JSON.parse(dec.decode(bytes));
  }

  // نسخهٔ متنی برای localStorage (که فقط رشته می‌پذیرد).
  async function sealText(value) {
    const payload = await seal(value);
    return JSON.stringify({ v: VERSION, alg: payload.alg, iv: toBase64(new Uint8Array(payload.iv)), ct: toBase64(new Uint8Array(payload.ct)) });
  }

  async function openText(text) {
    const parsed = JSON.parse(text);
    if (!isSealed(parsed)) return parsed;
    return open({ v: parsed.v, alg: parsed.alg, iv: fromBase64(parsed.iv), ct: fromBase64(parsed.ct).buffer });
  }

  window.ATLAS_SECURE = { available: available, seal: seal, open: open, sealText: sealText, openText: openText, isSealed: isSealed };
})();
