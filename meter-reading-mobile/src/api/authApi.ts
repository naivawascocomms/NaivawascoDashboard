import { apiRequest, clearTokens, getRefreshToken, storeTokens } from './client';

type TokenPair = {
  access: string;
  refresh: string;
};

export async function login(username: string, password: string) {
  const data = await apiRequest<TokenPair>('/token/', {
    method: 'POST',
    auth: false,
    body: {
      username,
      password,
    },
  });

  await storeTokens(data.access, data.refresh);
  return data;
}

export async function logout() {
  const refresh = await getRefreshToken();
  if (refresh) {
    try {
      await apiRequest('/token/blacklist/', {
        method: 'POST',
        body: { refresh },
      });
    } catch {
      // Local sign-out must still succeed if the token is already invalid.
    }
  }
  await clearTokens();
}
