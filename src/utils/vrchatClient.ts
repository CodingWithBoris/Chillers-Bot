import fetch, { RequestInit } from "node-fetch";
import { CookieJar } from "tough-cookie";
import fs from "fs";
import path from "path";

const SECRETS_PATH = path.resolve("data/secrets.json");

interface Secrets {
  AUTH_COOKIE: string;
  "2FA_COOKIE": string;
}

export class VRChatClient {
  private cookieJar: CookieJar;
  private secrets: Secrets | null = null;
  private baseUrl = "https://api.vrchat.cloud/api/1";

  constructor() {
    this.cookieJar = new CookieJar();
    this.loadSecrets();
  }

 private loadSecrets() {
  try {
    const data = fs.readFileSync(SECRETS_PATH, "utf-8");
    this.secrets = JSON.parse(data);

    if (this.secrets) {
      this.cookieJar.setCookieSync(
        `auth=${this.secrets.AUTH_COOKIE}; Domain=api.vrchat.cloud; Path=/; Secure`,
        this.baseUrl
      );
      this.cookieJar.setCookieSync(
        `twoFactorAuth=${this.secrets["2FA_COOKIE"]}; Domain=api.vrchat.cloud; Path=/; Secure`,
        this.baseUrl
      );
      console.log("[VRChat] Loaded cookies from secrets.json");
    }
  } catch {
    console.warn("[VRChat] No valid secrets.json found");
  }
}


  async getCurrentUser(): Promise<any> {
    const cookieHeader = await this.cookieJar.getCookieString(this.baseUrl);
    const res = await fetch(`${this.baseUrl}/auth/user`, {
      headers: {
        "User-Agent": "GroupMetrics/0.0.1 YourEmailHere",
        "Cookie": cookieHeader,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to get current user: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async loginWithCookies(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      console.log(`[VRChat] Authenticated as ${user.displayName}`);
      return true;
    } catch (err: any) {
      console.error("[VRChat] Login failed:", err.message);
      return false;
    }
  }

  async get(endpoint: string, init?: RequestInit): Promise<any> {
    const cookieHeader = await this.cookieJar.getCookieString(this.baseUrl);
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        "User-Agent": "GroupMetrics/0.0.1 YourEmailHere",
        "Cookie": cookieHeader,
      },
    });

    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    return res.json();
  }
}

export const vrchatClient = new VRChatClient();
