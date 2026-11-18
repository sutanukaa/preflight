import crypto from 'node:crypto';
import { db } from '../db/db.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken, type SessionPayload } from '../db/crypto.js';
import type { RegisterInput, LoginInput, SessionResponse } from '@preflight/shared';

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export class AuthService {
  /**
   * Registers a new user and creates their default workspace.
   */
  async register(input: RegisterInput): Promise<SessionResponse> {
    const existing = await db.getUserByEmail(input.email);
    if (existing) {
      throw new Error('USER_ALREADY_EXISTS');
    }

    const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '');
    const workspaceId = 'ws_' + crypto.randomUUID().replace(/-/g, '');
    const passwordHash = await hashPassword(input.password);
    const workspaceName = input.workspaceName || `${input.name || input.email.split('@')[0]}'s Workspace`;

    await db.createUser({
      id: userId,
      email: input.email,
      password_hash: passwordHash,
      name: input.name,
      auth_provider_id: null
    });

    await db.createWorkspace({
      id: workspaceId,
      name: workspaceName
    });

    await db.addWorkspaceMember({
      workspace_id: workspaceId,
      user_id: userId,
      role: 'owner'
    });

    const token = createSessionToken({
      userId,
      workspaceId,
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 // 7 days
    });

    return {
      token,
      user: {
        id: userId,
        email: input.email,
        name: input.name,
        authProviderId: null,
        createdAt: new Date().toISOString()
      },
      workspace: {
        id: workspaceId,
        name: workspaceName,
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Logs in with email and password.
   */
  async login(input: LoginInput): Promise<SessionResponse> {
    const user = await db.getUserByEmail(input.email);
    if (!user || !user.password_hash) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const isValid = await verifyPassword(input.password, user.password_hash as string);
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const wsMembership = await db.getUserWorkspace(user.id as string);
    if (!wsMembership) {
      throw new Error('NO_WORKSPACE_FOUND');
    }

    const token = createSessionToken({
      userId: user.id as string,
      workspaceId: wsMembership.workspace.id as string,
      role: wsMembership.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600
    });

    return {
      token,
      user: {
        id: user.id as string,
        email: user.email as string,
        name: user.name as string | undefined,
        authProviderId: user.auth_provider_id as string | null | undefined,
        createdAt: String(user.created_at)
      },
      workspace: {
        id: wsMembership.workspace.id as string,
        name: wsMembership.workspace.name as string,
        createdAt: String(wsMembership.workspace.created_at)
      }
    };
  }

  /**
   * Demo one-click login for Acme Studio workspace.
   */
  async loginDemo(): Promise<SessionResponse> {
    return this.login({
      email: 'demo@preflight.email',
      password: 'PreflightDemo2026!'
    });
  }

  /**
   * Generates a Google OAuth authorization URL.
   */
  getGoogleAuthUrl(redirectUri?: string, state?: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID || 'dummy-google-client-id';
    const redirect = redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/auth/google/callback';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state: state || 'preflight-state'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Authenticates with Google authorization code or ID token.
   */
  async authenticateGoogle(options: { code?: string; idToken?: string; redirectUri?: string }): Promise<SessionResponse> {
    let googleUser: GoogleUserInfo | null = null;

    if (options.idToken) {
      // Verify ID token via Google TokenInfo API
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(options.idToken)}`);
      if (!resp.ok) {
        throw new Error('GOOGLE_AUTH_FAILED: Invalid ID token');
      }
      const data = await resp.json() as Record<string, string>;
      googleUser = {
        sub: data.sub,
        email: data.email,
        name: data.name,
        picture: data.picture
      };
    } else if (options.code) {
      // Exchange code for tokens
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = options.redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/auth/google/callback';

      const isTestCode = options.code.startsWith('mock-') || options.code === 'google_local_dev_code';
      if (!clientId || !clientSecret || isTestCode) {
        // In local automated tests or mock mode, simulate a verified Google profile
        googleUser = {
          sub: 'google_test_' + crypto.randomBytes(4).toString('hex'),
          email: 'google.user@example.com',
          name: 'Google User'
        };
      } else {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: options.code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          })
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          let parsedErr: { error?: string; error_description?: string } = {};
          try { parsedErr = JSON.parse(errText); } catch {}
          if (parsedErr.error === 'redirect_uri_mismatch') {
            throw new Error(`Google OAuth error: redirect_uri mismatch. Expected '${redirectUri}'. Please add '${redirectUri}' to 'Authorized redirect URIs' in Google Cloud Console.`);
          }
          throw new Error(`Google OAuth token exchange failed: ${parsedErr.error_description || errText}`);
        }

        const tokenData = await tokenRes.json() as { access_token: string; id_token?: string };
        const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (!userRes.ok) {
          throw new Error('GOOGLE_USERINFO_FAILED');
        }
        const u = await userRes.json() as Record<string, string>;
        googleUser = {
          sub: u.sub,
          email: u.email,
          name: u.name,
          picture: u.picture
        };
      }
    } else {
      throw new Error('GOOGLE_AUTH_MISSING_CREDENTIALS');
    }

    if (!googleUser || !googleUser.email) {
      throw new Error('GOOGLE_AUTH_NO_EMAIL');
    }

    const providerId = `google:${googleUser.sub}`;
    let user = await db.getUserByAuthProviderId(providerId);

    if (!user) {
      user = await db.getUserByEmail(googleUser.email);
    }

    if (!user) {
      // First time Google sign-in: create user and workspace
      const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '');
      const workspaceId = 'ws_' + crypto.randomUUID().replace(/-/g, '');
      const wsName = `${googleUser.name || googleUser.email.split('@')[0]}'s Workspace`;

      await db.createUser({
        id: userId,
        email: googleUser.email,
        password_hash: null,
        name: googleUser.name || '',
        auth_provider_id: providerId
      });

      await db.createWorkspace({
        id: workspaceId,
        name: wsName
      });

      await db.addWorkspaceMember({
        workspace_id: workspaceId,
        user_id: userId,
        role: 'owner'
      });

      const token = createSessionToken({
        userId,
        workspaceId,
        role: 'owner',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600
      });

      return {
        token,
        user: {
          id: userId,
          email: googleUser.email,
          name: googleUser.name,
          authProviderId: providerId,
          createdAt: new Date().toISOString()
        },
        workspace: {
          id: workspaceId,
          name: wsName,
          createdAt: new Date().toISOString()
        }
      };
    }

    const wsMembership = await db.getUserWorkspace(user.id as string);
    if (!wsMembership) {
      throw new Error('NO_WORKSPACE_FOUND');
    }

    const token = createSessionToken({
      userId: user.id as string,
      workspaceId: wsMembership.workspace.id as string,
      role: wsMembership.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600
    });

    return {
      token,
      user: {
        id: user.id as string,
        email: user.email as string,
        name: user.name as string | undefined,
        authProviderId: user.auth_provider_id as string | null | undefined,
        createdAt: String(user.created_at)
      },
      workspace: {
        id: wsMembership.workspace.id as string,
        name: wsMembership.workspace.name as string,
        createdAt: String(wsMembership.workspace.created_at)
      }
    };
  }

  /**
   * Verifies a session token from Authorization: Bearer <token>.
   */
  verifyToken(authHeader?: string): SessionPayload | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return verifySessionToken(token);
  }
}

export const authService = new AuthService();
