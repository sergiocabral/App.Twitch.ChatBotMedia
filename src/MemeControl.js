import { exec } from 'child_process'
import { existsSync, realpathSync, readdirSync } from 'fs'
import { dirname, extname, basename } from 'path'
import Utils from "./Utils.js"
import ObsControl from "./ObsControl.js"

/**
 * Controle de execução de memes (mídia + OBS).
 */
export default class MemeControl {
  /**
   * Caminho absoluto do script .bat que executa os memes.
   * @type {string}
   * @private
   */
  _scriptPath

  /**
   * Instância do controle do OBS.
   * @type {ObsControl}
   * @private
   */
  _obsControl

  /**
   * Nome da cena no OBS onde está o source do meme.
   * @type {string}
   * @private
   */
  _obsMemeScene

  /**
   * Nome do source no OBS que representa o meme.
   * @type {string}
   * @private
   */
  _obsMemeSource

    /**
   * Lista dos memes disponíveis (sem extensão).
   * @type {string[]}
   * @private
   */
  memes = []

  constructor(obsControl) {
    console.debug(`Initializing ${this.constructor.name} class`)

    this._obsControl = obsControl
    this._scriptPath = String(process.env.MEME_SCRIPT_PATH || '').trim()
    this._obsMemeScene = String(process.env.OBS_MEME_SCENE || '').trim()
    this._obsMemeSource = String(process.env.OBS_MEME_SOURCE || '').trim()

    this._loadMemes()
  }

  /**
   * Testa se o script de meme e a configuração do OBS estão corretos.
   * @returns {Promise<boolean>}
   */
  async test() {
    const exists = existsSync(this._scriptPath)

    if (!exists) {
      console.warn(`Meme player script not found at path "${this._scriptPath}"`)
      return false
    }

    this._scriptPath = realpathSync(this._scriptPath)
    console.debug(`Meme player script located at "${this._scriptPath}"`)

    if (this._obsControl?.constructor?.name !== ObsControl.name) {
      console.warn('Invalid OBS Control instance — meme features requiring OBS will be disabled')
      this._obsControl = null
      return false
    }

    if (!this._obsMemeScene || !this._obsMemeSource) {
      console.warn('OBS meme configuration is invalid — OBS_MEME_SCENE or OBS_MEME_SOURCE not defined in .env')
      return false
    }

    console.debug('OBS Control instance validated — ready to interact with OBS Studio')
    return true
  }

  /**
   * Executa um meme (esconde, roda script, mostra).
   * @param {string} memeName 
   * @returns {Promise<boolean>}
   */
  async play(message) {
    message = Utils.slug(message)

    for (const memeName of this.memes) {
      if (message.includes(memeName)) {
        console.debug(`Starting meme playback: '${memeName}'`)

        await this._obsControl?.setVisible(this._obsMemeScene, this._obsMemeSource, false)

        const executed = await this._callScript(memeName)

        if (!executed) {
          console.warn(`Meme script '${memeName}' failed — skipping OBS visibility change`)
          return false
        }

        await this._obsControl?.setVisible(this._obsMemeScene, this._obsMemeSource, true)

        console.debug(`Meme playback completed: '${memeName}'`)
        return true
      }
    }

    return null
  }

  /**
   * Executa o script de meme.
   * @param {string} memeName 
   * @returns {Promise<boolean>}
   */
  async _callScript(memeName) {
    const command = `"${this._scriptPath}" "${memeName}"`

    console.debug(`Executing meme script with command: ${command}`)

    return new Promise(resolve => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to execute meme script '${memeName}'. Error: ${Utils.errorMessage(error)}`)
          return resolve(false)
        }

        if (stderr?.trim()) {
          console.warn(`Meme script '${memeName}' executed with warnings: ${Utils.errorMessage(stderr)}`)
        }

        console.debug(`Meme script '${memeName}' executed successfully`)

        const timeout = 1000
        setTimeout(() => resolve(true), timeout)
      })
    })
  }

  /**
   * Carrega os memes disponíveis no diretório do script.
   * @returns {Promise<void>}
   */
  async _loadMemes() {
    try {
      const scriptDir = dirname(this._scriptPath)

      if (!existsSync(scriptDir)) {
        console.warn(`Meme directory does not exist: "${scriptDir}"`)
        this.memes = []
        return
      }

      const files = readdirSync(scriptDir)
      const memes = files
        .filter(file => {
          const ext = extname(file).toLowerCase()
          return ext === '.mp4' || ext === '.mp3'
        })
        .map(file => basename(file, extname(file)))

      this.memes = memes

      console.debug(`Memes loaded: [${this.memes.join(', ')}]`)
    } catch (error) {
      console.error(`Failed to load memes. Error: ${Utils.errorMessage(error)}`)
      this.memes = []
    }

    const timeout = 10000
    setTimeout(() => this._loadMemes(), timeout)
  }
}
