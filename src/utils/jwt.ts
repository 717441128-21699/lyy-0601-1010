import jwt from "jsonwebtoken";
import * as bcrypt from "bcryptjs";

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  department: string;
}

const JWT_SECRET: string = process.env.JWT_SECRET || "asset-inspection-secret-key-2024";
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "24h";

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (err) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
