/**
 * Utility functions for ZIP export functionality
 */

/**
 * Calculates the number of days since a base date (2025-01-01)
 * @param today - Current date (defaults to now in UTC)
 * @param base - Base date (defaults to 2025-01-01T00:00:00Z)
 * @returns Number of days (1-based: 2025-01-01 = 1, 2025-12-31 = 365, 2026-01-01 = 366)
 */
export function getDaysSinceBaseDate(today: Date = new Date(), base: Date = new Date("2025-01-01T00:00:00Z")): number {
  // Convert to UTC timestamps
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const baseUtc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());

  // Calculate difference in days (1-based)
  const diffMs = todayUtc - baseUtc;
  const diffDays = Math.floor(diffMs / 86400000) + 1;

  return diffDays;
}

/**
 * Sanitizes phrase text for use in filename
 * - Removes markdown formatting
 * - Removes special characters (keeps only A-Z, a-z, 0-9, spaces)
 * - Trims and normalizes whitespace
 * - Truncates to 150 characters
 * - Replaces spaces with underscores
 * @param enText - English text from phrase
 * @returns Sanitized filename-safe string
 */
export function sanitizePhraseName(enText: string): string {
  if (!enText) return "";

  // Remove markdown formatting (** and __)
  let cleaned = enText.replace(/\*\*/g, "").replace(/__/g, "");

  // Trim and normalize whitespace
  cleaned = cleaned.trim().replace(/\s+/g, " ");

  // Remove all special characters, keep only letters, digits, and spaces
  cleaned = cleaned.replace(/[^A-Za-z0-9 ]/g, "");

  // Truncate to 150 characters
  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 150);
  }

  // Replace spaces with underscores
  cleaned = cleaned.replace(/\s/g, "_");

  return cleaned;
}

/**
 * Builds a filename for a phrase MP3 in the ZIP export
 * Format: {dni_od_2025-01-01}_{N}_{Fraza_do_150}.mp3
 * @param indexInZip - Index (1-based) of phrase in ZIP (without zero-padding)
 * @param enText - English text from phrase
 * @param exportDate - Date of export (defaults to now)
 * @returns Filename string
 */
export function buildPhraseFilename(indexInZip: number, enText: string, exportDate: Date = new Date()): string {
  const daysSinceBase = getDaysSinceBaseDate(exportDate);
  const index = String(indexInZip); // No zero-padding
  const sanitizedPhrase = sanitizePhraseName(enText);

  return `${daysSinceBase}_${index}_${sanitizedPhrase}.mp3`;
}

/**
 * Sanitizes notebook name for use in ZIP filename
 * Similar to sanitizePhraseName but may have different length limits
 * @param notebookName - Notebook name
 * @returns Sanitized filename-safe string
 */
export function sanitizeNotebookName(notebookName: string): string {
  if (!notebookName) return "notebook";

  // Remove special characters, keep only letters, digits, spaces, hyphens, underscores
  let cleaned = notebookName.replace(/[^A-Za-z0-9 _-]/g, "");

  // Trim and normalize whitespace
  cleaned = cleaned.trim().replace(/\s+/g, " ");

  // Truncate to reasonable length (e.g., 50 characters)
  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 50);
  }

  // Replace spaces with underscores
  cleaned = cleaned.replace(/\s/g, "_");

  // If empty after sanitization, use default
  if (!cleaned) {
    cleaned = "notebook";
  }

  return cleaned;
}
