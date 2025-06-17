import { exec } from 'child_process'
import Utils from "./Utils.js"

/**
 * Controle de execução de sons via ffplay.
 */
export default class PlayerControl {
  constructor() {
    console.debug(`Initializing ${this.constructor.name} class`)
  }

  /**
   * Testa se o ffplay está disponível no PATH.
   * @returns {Promise<boolean>}
   */
  async test() {
    return new Promise(resolve => {
      exec('ffplay -version', (error) => {
        if (error) {
          console.warn(`ffplay not found or not available in PATH. Error: ${Utils.errorMessage(error)}`)
          resolve(false)
        } else {
          console.debug('ffplay is available')
          resolve(true)
        }
      })
    })
  }

  /**
   * Executa um arquivo de mídia via ffplay.
   * @param {string} mediaFilePath 
   * @returns {Promise<boolean>}
   */
  async play(mediaFilePath = 'notification.wav') {
    const command = `ffplay -nodisp -autoexit -hide_banner -loglevel quiet "${mediaFilePath}"`

    console.debug(`Attempting to play media file: "${mediaFilePath}"`)

    return new Promise(resolve => {
      exec(command, (error) => {
        if (error) {
          console.warn(`Failed to play media file "${mediaFilePath}" — Media player not available or error occurred: ${Utils.errorMessage(error)}`)
          resolve(false)
        } else {
          console.debug(`Successfully played media file: "${mediaFilePath}"`)
          resolve(true)
        }
      })
    })
  }
}
