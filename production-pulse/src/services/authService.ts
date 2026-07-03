import axios from "axios";
import { setAuthTokens, clearAuthTokens } from "@/services/api";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface TokenResponse {
  access: string;
  refresh: string;
}

export const authService = {
  async login(payload: LoginPayload): Promise<TokenResponse> {
    const response = await axios.post<TokenResponse>(
      `${API_BASE_URL}/token/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    setAuthTokens(response.data.access, response.data.refresh);
    return response.data;
  },

  logout(): void {
    clearAuthTokens();
    window.location.href = "/login";
  },
};