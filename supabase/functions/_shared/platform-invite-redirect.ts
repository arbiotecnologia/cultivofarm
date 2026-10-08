export const PLATFORM_PUBLIC_ORIGIN = "https://app.cultivofarm.com.br";
export const PLATFORM_INVITE_REDIRECT_URL = `${PLATFORM_PUBLIC_ORIGIN}/reset-password`;

export function getPlatformInviteRedirectUrl(): string {
  return PLATFORM_INVITE_REDIRECT_URL;
}