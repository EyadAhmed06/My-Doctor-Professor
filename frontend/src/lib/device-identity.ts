const DEVICE_DB = "mdp-device-identity";
const DEVICE_STORE = "identity";
const DEVICE_RECORD = "primary";

type StoredDeviceIdentity = {
  id: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  createdAt: string;
};

export type DeviceIdentity = {
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  deviceLabel: string;
  signChallenge(challenge: string): Promise<string>;
};

function openDeviceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DEVICE_STORE)) {
        request.result.createObjectStore(DEVICE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open device identity storage"));
  });
}

async function readStoredIdentity(): Promise<StoredDeviceIdentity | null> {
  const db = await openDeviceDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(DEVICE_STORE, "readonly");
      const request = transaction.objectStore(DEVICE_STORE).get(DEVICE_RECORD);
      request.onsuccess = () => resolve((request.result as StoredDeviceIdentity | undefined) ?? null);
      request.onerror = () => reject(request.error || new Error("Unable to read device identity"));
    });
  } finally {
    db.close();
  }
}

async function writeStoredIdentity(identity: StoredDeviceIdentity): Promise<void> {
  const db = await openDeviceDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DEVICE_STORE, "readwrite");
      transaction.objectStore(DEVICE_STORE).put(identity, DEVICE_RECORD);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to store device identity"));
      transaction.onabort = () => reject(transaction.error || new Error("Device identity storage was aborted"));
    });
  } finally {
    db.close();
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function describeBrowser(): string {
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/i.test(ua)
    ? "iPhone/iPad"
    : /Android/i.test(ua)
      ? "Android"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Browser device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /CriOS\//.test(ua)
        ? "Chrome"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${browser} on ${platform}`;
}

async function createStoredIdentity(): Promise<StoredDeviceIdentity> {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.randomUUID) {
    throw new Error("This browser does not support secure device binding.");
  }
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const identity: StoredDeviceIdentity = {
    id: crypto.randomUUID(),
    privateKey: keyPair.privateKey,
    publicKeyJwk,
    createdAt: new Date().toISOString(),
  };
  await writeStoredIdentity(identity);
  return identity;
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === "undefined") throw new Error("Device identity is available only in the browser.");
  let stored = await readStoredIdentity();
  if (!stored) stored = await createStoredIdentity();

  return {
    deviceId: stored.id,
    publicKeyJwk: stored.publicKeyJwk,
    deviceLabel: describeBrowser(),
    async signChallenge(challenge: string) {
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        stored!.privateKey,
        decodeBase64Url(challenge),
      );
      return encodeBase64Url(signature);
    },
  };
}
