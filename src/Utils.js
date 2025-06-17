import { realpathSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/**
 * Classe utilitária para formatação de mensagens de erro e texto.
 */
export default class Utils {
  static basedir() {
    return realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'))
  }

  /**
   * Formata uma mensagem de erro removendo quebras de linha e espaços extras.
   * @param {any} error 
   * @returns {string}
   */
  static errorMessage(error) {
    return String(error ?? '')
      .replace(/\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Converte um texto para um slug simples, removendo caracteres especiais, espaços e acentos.
   * @param {string} text - Texto de entrada.
   * @returns {string} - Slug formatado.
   */
  static slug(text) {
    return String(text ?? '')
      .normalize('NFD')                           // Remove acentos
      .replace(/[\u0300-\u036f]/g, '')            // Remove marcas de acentuação
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')                // Substitui qualquer coisa que não seja letra ou número por hífen
      .replace(/^-+|-+$/g, '')                    // Remove hífens do início e do fim
      .replace(/-{2,}/g, '-')                     // Colapsa múltiplos hífens em um só
  }
}
