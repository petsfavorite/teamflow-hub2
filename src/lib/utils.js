import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Prefer First Name + Last Name over the platform's built-in full_name ("Name" field).
export function getUserDisplayName(user) {
  if (!user) return '';
  const firstLast = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return firstLast || user.full_name || user.email || '';
}