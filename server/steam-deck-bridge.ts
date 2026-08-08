import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { Client, type ConnectConfig, type FileEntryWithStats, type SFTPWrapper, type Stats } from 'ssh2';
import type { Plugin } from 'vite';

export const STEAM_DECK_ENDPOINT = '/api/local/steam-deck-save';
export const MAX_SAVE_BYTES = 64 * 1024 * 1024;

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_OS_RELEASE_BYTES = 64 * 1024;
const MAX_ACCOUNT_DIRECTORIES = 64;
const CONNECT_TIMEOUT_MS = 12_000;
const STEAM_APP_ID = '1245620';

export interface SteamDeckCredentials {
  host: string;
  username: string;
  password: string;
}

export interface SaveCandidate {
  path: string;
  fileName: 'ER0000.sl2' | 'ER0000.co2';
  size: number;
  modifiedAtSeconds: number;
}

class BridgeError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export function isPrivateIpv4(host: string): boolean {
  if (isIP(host) !== 4) return false;
  const [first, second] = host.split('.').map(Number);
  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

export function validateDeckRequest(value: unknown): SteamDeckCredentials {
  if (!value || typeof value !== 'object') {
    throw new BridgeError('Invalid connection details.', 400);
  }

  const record = value as Record<string, unknown>;
  const host = typeof record.host === 'string' ? record.host.trim() : '';
  const username = typeof record.username === 'string' ? record.username.trim() : '';
  const password = typeof record.password === 'string' ? record.password : '';

  if (!isPrivateIpv4(host)) {
    throw new BridgeError('Use a private IPv4 address for the Steam Deck.', 400);
  }
  if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(username)) {
    throw new BridgeError('The Linux username is not valid.', 400);
  }
  if (password.length < 1 || password.length > 512) {
    throw new BridgeError('The password is required and must be at most 512 characters.', 400);
  }

  return { host, username, password };
}

export function isSteamDeckOsRelease(contents: string): boolean {
  const values = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match) continue;
    values.set(match[1], match[2].replace(/^['"]|['"]$/g, '').toLowerCase());
  }
  return values.get('ID') === 'steamos' || values.get('VARIANT_ID') === 'steamdeck';
}

export function selectLatestSaveCandidate(candidates: SaveCandidate[]): SaveCandidate | null {
  return [...candidates].sort((left, right) => {
    if (right.modifiedAtSeconds !== left.modifiedAtSeconds) {
      return right.modifiedAtSeconds - left.modifiedAtSeconds;
    }
    if (left.fileName !== right.fileName) return left.fileName === 'ER0000.sl2' ? -1 : 1;
    return left.path.localeCompare(right.path);
  })[0] ?? null;
}

function readRequestJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    request.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_REQUEST_BYTES) {
        reject(new BridgeError('The request is too large.', 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new BridgeError('The request body is not valid JSON.', 400));
      }
    });
    request.on('error', reject);
  });
}

function connect(credentials: SteamDeckCredentials): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      client.end();
      reject(new BridgeError('Could not connect or authenticate with the Steam Deck.', 502));
    };

    client.once('ready', () => {
      settled = true;
      resolve(client);
    });
    client.once('error', fail);
    client.once('timeout', fail);

    const config: ConnectConfig = {
      host: credentials.host,
      port: 22,
      username: credentials.username,
      password: credentials.password,
      readyTimeout: CONNECT_TIMEOUT_MS,
      keepaliveInterval: 4_000,
      keepaliveCountMax: 2,
    };
    client.connect(config);
  });
}

function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) reject(new BridgeError('The Steam Deck did not allow an SFTP session.', 502));
      else resolve(sftp);
    });
  });
}

function stat(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(path, (error, attributes) => error ? reject(error) : resolve(attributes));
  });
}

function readDirectory(sftp: SFTPWrapper, path: string): Promise<FileEntryWithStats[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (error, entries) => error ? reject(error) : resolve(entries));
  });
}

async function readBoundedText(sftp: SFTPWrapper, path: string, limit: number): Promise<string> {
  const attributes = await stat(sftp, path);
  if (!attributes.isFile() || attributes.size < 1 || attributes.size > limit) {
    throw new BridgeError('The Steam Deck identity file is not plausible.', 502);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    const stream = sftp.createReadStream(path);
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > limit) {
        stream.destroy(new BridgeError('The Steam Deck identity file exceeded its size limit.', 502));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

async function findSave(sftp: SFTPWrapper, username: string): Promise<SaveCandidate> {
  const steamRoots = [
    `/home/${username}/.local/share/Steam/steamapps`,
    `/home/${username}/.steam/steam/steamapps`,
  ];
  const candidates: SaveCandidate[] = [];

  for (const steamRoot of steamRoots) {
    const savesRoot = `${steamRoot}/compatdata/${STEAM_APP_ID}/pfx/drive_c/users/steamuser/AppData/Roaming/EldenRing`;
    let entries: FileEntryWithStats[];
    try {
      entries = await readDirectory(sftp, savesRoot);
    } catch {
      continue;
    }

    const accountDirectories = entries
      .filter((entry) => entry.attrs.isDirectory() && /^\d{17}$/.test(entry.filename))
      .slice(0, MAX_ACCOUNT_DIRECTORIES);

    for (const account of accountDirectories) {
      for (const fileName of ['ER0000.sl2', 'ER0000.co2'] as const) {
        const path = `${savesRoot}/${account.filename}/${fileName}`;
        try {
          const attributes = await stat(sftp, path);
          if (!attributes.isFile() || attributes.size < 1 || attributes.size > MAX_SAVE_BYTES) continue;
          candidates.push({
            path,
            fileName,
            size: attributes.size,
            modifiedAtSeconds: attributes.mtime,
          });
        } catch {
          // Missing save variants are expected.
        }
      }
    }
  }

  const selected = selectLatestSaveCandidate(candidates);
  if (!selected) {
    throw new BridgeError('No Elden Ring .sl2 or .co2 save was found in the standard SteamOS paths.', 404);
  }
  return selected;
}

function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: object): void {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function handleSteamDeckRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: 'Cross-origin requests are not allowed.' });
    return;
  }

  let client: Client | null = null;
  try {
    const credentials = validateDeckRequest(await readRequestJson(request));
    client = await connect(credentials);
    const sftp = await openSftp(client);
    const osRelease = await readBoundedText(sftp, '/etc/os-release', MAX_OS_RELEASE_BYTES);
    if (!isSteamDeckOsRelease(osRelease)) {
      throw new BridgeError('The remote computer does not identify itself as a Steam Deck running SteamOS.', 422);
    }

    const save = await findSave(sftp, credentials.username);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${save.fileName}"`,
      'Content-Length': String(save.size),
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Save-File-Name': save.fileName,
      'X-Save-Last-Modified': String(save.modifiedAtSeconds * 1000),
    });

    let sent = 0;
    const stream = sftp.createReadStream(save.path);
    stream.on('data', (chunk: Buffer) => {
      sent += chunk.length;
      if (sent > save.size || sent > MAX_SAVE_BYTES) {
        stream.destroy(new BridgeError('The save changed size while it was being read.', 502));
      }
    });
    stream.once('error', () => {
      if (!response.headersSent) sendJson(response, 502, { error: 'The save could not be read from the Steam Deck.' });
      else response.destroy();
      client?.end();
    });
    stream.once('end', () => client?.end());
    response.once('close', () => {
      stream.destroy();
      client?.end();
    });
    stream.pipe(response);
  } catch (error) {
    client?.end();
    const statusCode = error instanceof BridgeError ? error.statusCode : 502;
    const message = error instanceof BridgeError ? error.message : 'The local Steam Deck connection failed.';
    if (!response.headersSent) sendJson(response, statusCode, { error: message });
    else response.destroy();
  }
}

export function steamDeckBridgePlugin(): Plugin {
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    const pathname = request.url ? new URL(request.url, 'http://localhost').pathname : '';
    if (pathname !== STEAM_DECK_ENDPOINT) {
      next();
      return;
    }
    void handleSteamDeckRequest(request, response);
  };

  return {
    name: 'local-steam-deck-bridge',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
