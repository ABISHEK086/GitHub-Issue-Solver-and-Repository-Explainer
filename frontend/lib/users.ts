import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export type PublicUser = Omit<StoredUser, "passwordHash">;

function ensureStore(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf-8");
}

function readUsers(): StoredUser[] {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export function findUserByEmail(email: string): StoredUser | undefined {
  return readUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function createUser(email: string, password: string, name: string): Promise<PublicUser> {
  if (findUserByEmail(email)) {
    throw new Error("An account with that email already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user: StoredUser = {
    id: randomUUID(),
    email: email.toLowerCase(),
    name: name || email.split("@")[0],
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  const { passwordHash: _omit, ...publicUser } = user;
  return publicUser;
}

export async function verifyPassword(email: string, password: string): Promise<PublicUser | null> {
  const user = findUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  const { passwordHash: _omit, ...publicUser } = user;
  return publicUser;
}
