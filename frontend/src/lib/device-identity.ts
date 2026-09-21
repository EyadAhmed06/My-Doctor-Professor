const DEVICE_DB = "mdp-device-identity";
const DEVICE_STORE = "identity";
const DEVICE_RECORD = "primary";
const DEVICE_BINDING_VERSION = "MDP_DEVICE_BINDING_V1";
const DEVICE_LOCK_KEY = "mdp-device-identity-lock";
const DEVICE_LOCK_LEASE_MS = 5_000;
let sharedIdentityPromise: Promise<DeviceIdentity> | null = null;

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
  signRegistrationProof(): Promise<string>;
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

async function withDeviceIdentityLock<T>(operation: () => Promise<T>): Promise<T> {
  const token = crypto.randomUUID();
  const deadline = Date.now() + 8_000;

  while (Date.now() < deadline) {
    let current: { token?: string; expiresAt?: number } | null = null;
    try {
      current = JSON.parse(localStorage.getItem(DEVICE_LOCK_KEY) || "null") as { token?: string; expiresAt?: number } | null;
    } catch {
      current = null;
    }

    if (!current?.token || !current.expiresAt || current.expiresAt <= Date.now()) {
      localStorage.setItem(DEVICE_LOCK_KEY, JSON.stringify({
        token,
        expiresAt: Date.now() + DEVICE_LOCK_LEASE_MS,
      }));
      let confirmed: { token?: string } | null = null;
      try {
        confirmed = JSON.parse(localStorage.getItem(DEVICE_LOCK_KEY) || "null") as { token?: string } | null;
      } catch {
        confirmed = null;
      }
      if (confirmed?.token === token) {
        try {
          return await operation();
        } finally {
          try {
            const latest = JSON.parse(localStorage.getItem(DEVICE_LOCK_KEY) || "null") as { token?: string } | null;
            if (latest?.token === token) localStorage.removeItem(DEVICE_LOCK_KEY);
          } catch {
            localStorage.removeItem(DEVICE_LOCK_KEY);
          }
        }
      }
    }

    await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
  }

  throw new Error("Unable to initialize secure device identity. Close duplicate tabs and try again.");
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function registrationMessage(deviceId: string, publicKeyJwk: JsonWebKey): ArrayBuffer {
  if (
    publicKeyJwk.kty !== "EC" ||
    publicKeyJwk.crv !== "P-256" ||
    typeof publicKeyJwk.x !== "string" ||
    typeof publicKeyJwk.y !== "string"
  ) {
    throw new Error("Stored device public key is invalid.");
  }
  const canonical = [
    DEVICE_BINDING_VERSION,
    deviceId,
    publicKeyJwk.kty,
    publicKeyJwk.crv,
    publicKeyJwk.x,
    publicKeyJwk.y,
  ].join("\n");
  return new TextEncoder().encode(canonical).buffer;
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

async function storedIdentityIsValid(identity: StoredDeviceIdentity): Promise<boolean> {
  try {
    if (
      !identity?.id ||
      !(identity.privateKey instanceof CryptoKey) ||
      identity.privateKey.type !== "private" ||
      identity.privateKey.algorithm.name !== "ECDSA" ||
      !identity.privateKey.usages.includes("sign")
    ) {
      return false;
    }
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      identity.publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const probe = crypto.getRandomValues(new Uint8Array(32));
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identity.privateKey,
      probe,
    );
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signature,
      probe,
    );
  } catch {
    return false;
  }
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === "undefined") throw new Error("Device identity is available only in the browser.");
  if (sharedIdentityPromise) return sharedIdentityPromise;

  sharedIdentityPromise = withDeviceIdentityLock(async () => {
    let stored = await readStoredIdentity();
    if (!stored || !(await storedIdentityIsValid(stored))) {
      // A device request must never be created from a public key whose matching
      // private key is unavailable/corrupt. Repair the browser identity first so
      // any subsequent administrator approval is guaranteed to be usable.
      stored = await createStoredIdentity();
    }

    const stable = stored;
    return {
      deviceId: stable.id,
      publicKeyJwk: stable.publicKeyJwk,
      deviceLabel: describeBrowser(),
      async signChallenge(challenge: string) {
        const signature = await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          stable.privateKey,
          decodeBase64Url(challenge),
        );
        return encodeBase64Url(signature);
      },
      async signRegistrationProof() {
        const signature = await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          stable.privateKey,
          registrationMessage(stable.id, stable.publicKeyJwk),
        );
        return encodeBase64Url(signature);
      },
    };
  });

  try {
    return await sharedIdentityPromise;
  } catch (error) {
    sharedIdentityPromise = null;
    throw error;
  }
}
