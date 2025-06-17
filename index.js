import dotenv from 'dotenv'
import OBSWebSocket from 'obs-websocket-js'
import tmi from 'tmi.js'
import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { existsSync, realpathSync, readdirSync } from 'fs'
import { dirname, extname, basename } from 'path'
import { fileURLToPath } from 'url'

dotenv.config()
const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Classe utilitária para formatação de mensagens de erro e texto.
 */
class Utils {
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

/**
 * Controle de execução de sons via ffplay.
 */
class PlayerControl {
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

/**
 * Controle de conexão e eventos com o chat da Twitch.
 */
class TwitchControl extends EventEmitter {
  /**
   * Instância do cliente TMI.js.
   * @type {tmi.Client}
   * @private
   */
  _client

  /**
   * Nome de usuário da conta Twitch.
   * @type {string}
   * @private
   */
  _username

  /**
   * Token OAuth da conta Twitch.
   * @type {string}
   * @private
   */
  _oauth

  /**
   * Lista de canais para se conectar.
   * @type {string[]}
   * @private
   */
  _channels

  constructor() {
    super()
    console.debug(`Initializing ${this.constructor.name} class`)

    this._username = String(process.env.TWITCH_USERNAME || '').trim()
    this._oauth = String(process.env.TWITCH_OAUTH || '').trim()
    this._channels = String(process.env.TWITCH_CHANNEL_LIST || '')
      .split(/,|;|\s+/g)
      .filter(e => e)
  }

  /**
   * Conecta ao chat da Twitch.
   * @returns {Promise<boolean>}
   */
  async connect() {
    if (!this._username || !this._oauth) {
      console.warn('Twitch connection failed — missing TWITCH_USERNAME or TWITCH_OAUTH in .env')
      return false
    }

    if (this._channels.length === 0) {
      console.warn('Twitch connection failed — no channels provided in TWITCH_CHANNEL_LIST')
      return false
    }

    try {
      this._client = new tmi.Client({
        options: { debug: true },
        identity: {
          username: this._username,
          password: this._oauth,
        },
        channels: this._channels,
      })

      this._client.on('connected', (address, port) => {
        console.debug(`Connected to Twitch Chat at ${address}:${port}`)
        this.emit('connected', { address, port })
      })

      this._client.on('message', (channel, tags, message, self) => {
        if (self) return
        this.emit('message', { channel, tags, message })
      })

      await this._client.connect()
      return true
    } catch (error) {
      console.warn(`Failed to connect to Twitch Chat. Error: ${Utils.errorMessage(error)}`)
      return false
    }
  }

  /**
   * Desconecta do chat da Twitch.
   * @returns {Promise<void>}
   */
  async disconnect() {
    await this._client.disconnect()
    this._client = null
    console.debug('Disconnected from Twitch Chat')
  }

  /**
   * Envia uma mensagem para um ou mais canais da Twitch.
   * Se nenhum canal for informado, envia para todos configurados.
   * @param {string} message - Mensagem a ser enviada.
   * @param {...string} channels - Lista de canais (opcional). Se vazio, usa os canais configurados.
   * @returns {Promise<boolean>} - Retorna true se enviado com sucesso, false se falhar.
   */
  async sendMessage(message, ...channels) {
    if (!message) {
      console.warn('Twitch message not provided — skipping send')
      return false
    }

    if (!this._client) {
      console.warn('Twitch client is not connected — cannot send message')
      return false
    }

    const targetChannels = channels.length > 0 ? channels : this._channels

    if (targetChannels.length === 0) {
      console.warn('No Twitch channels available to send message')
      return false
    }

    try {
      for (const channel of targetChannels) {
        console.debug(`Sending message to Twitch channel '${channel}': ${message}`)
        await this._client.say(channel, message)
      }
      return true
    } catch (error) {
      console.error(`Failed to send Twitch message. Error: ${Utils.errorMessage(error)}`)
      return false
    }
  }
}

/**
 * Controle de interação com o OBS Studio.
 */
class ObsControl {
  /**
   * Instância do OBS WebSocket.
   * @type {OBSWebSocket}
   * @private
   */
  _obs

  constructor() {
    console.debug(`Initializing ${this.constructor.name} class`)
    this._obs = new OBSWebSocket()
  }

  /**
   * Conecta ao OBS Studio.
   * @returns {Promise<boolean>}
   */
  async connect() {
    const address = String(process.env.OBS_ADDRESS || '')
    const password = String(process.env.OBS_PASSWORD || '')

    if (!address) {
      console.warn('OBS connection failed: OBS_ADDRESS not defined in .env')
      return false
    }

    console.debug(`Attempting to connect to OBS Studio at ws://${address}`)
    try {
      await this._obs.connect(`ws://${address}`, password)
      console.debug(`Successfully connected to OBS Studio at ws://${address}`)
      return true
    } catch (error) {
      console.warn(`Failed to connect to OBS Studio at ws://${address}. Error: ${Utils.errorMessage(error)}`)
      return false
    }
  }

  /**
   * Define a visibilidade de uma fonte em uma cena.
   * @param {string} scene 
   * @param {string} sourceName 
   * @param {boolean} visible 
   * @param {number} [timeout=50]
   * @returns {Promise<boolean>}
   */
  async setVisible(scene, sourceName, visible, timeout = 50) {
    console.debug(`Changing visibility of source '${sourceName}' in scene '${scene}' to ${visible ? 'VISIBLE' : 'HIDDEN'}`)

    try {
      const { sceneItems } = await this._obs.call('GetSceneItemList', { sceneName: scene })

      const item = sceneItems.find(i => i.sourceName === sourceName)

      if (!item) {
        console.warn(`Source '${sourceName}' not found in scene '${scene}'`)
        return false
      }

      await this._obs.call('SetSceneItemEnabled', {
        sceneName: scene,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: visible,
      })

      console.debug(`Source '${sourceName}' in scene '${scene}' is now ${visible ? 'VISIBLE' : 'HIDDEN'}`)

      if (timeout > 0) {
        await new Promise(resolve => setTimeout(resolve, timeout))
      }

      return true

    } catch (error) {
      console.error(`Failed to change visibility of source '${sourceName}' in scene '${scene}'. Error: ${Utils.errorMessage(error)}`)
      return false
    }
  }

  /**
   * Desconecta do OBS Studio.
   * @returns {Promise<void>}
   */
  async disconnect() {
    await this._obs.disconnect()
    console.debug('Disconnected from OBS Studio')
  }
}

/**
 * Controle de execução de memes (mídia + OBS).
 */
class MemeControl {
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

/**
 * Classe principal do aplicativo.
 */
class App {
  /**
   * @type {PlayerControl}
   * @private
   */
  _playerControl

  /**
   * @type {TwitchControl}
   * @private
   */
  _twitchControl

  /**
   * @type {ObsControl}
   * @private
   */
  _obsControl

  /**
   * @type {MemeControl}
   * @private
   */
  _memeControl

  constructor() {
    console.debug(`Initializing ${this.constructor.name} class`)

    this._playerControl = new PlayerControl()
    this._twitchControl = new TwitchControl()
    this._obsControl = new ObsControl()
    this._memeControl = new MemeControl(this._obsControl)
  }

  /**
   * Executa o app.
   */
  async run() {
    if (!await this._playerControl.test()) {
      console.warn('Media player not ready — media features will be disabled')
      this._playerControl = null
    } else {
      console.debug('Media player is ready')
    }

    if (!await this._twitchControl.connect()) {
      console.warn('Twitch Chat not connected — chat features will be disabled')
      this._twitchControl = null
    } else {
      console.debug('Twitch Chat is ready')
    }

    if (!await this._obsControl.connect()) {
      console.warn('OBS Studio not connected — OBS features will be disabled')
      this._obsControl = null
    } else {
      console.debug('OBS Studio is ready')
    }

    if (!await this._memeControl.test()) {
      console.warn('Meme player not ready — meme features will be disabled')
      this._memeControl = null
    } else {
      console.debug('Meme player is ready')
    }

    await this._playerControl?.play()
    this._twitchControl?.on('message', this._onTwitchMessage.bind(this))
  }

  /**
   * Manipula mensagens recebidas no chat da Twitch.
   * @param {string} channel - Nome do canal onde a mensagem foi recebida.
   * @param {Record<string, string>} tags - Informações do usuário que enviou a mensagem.
   * @param {string} message - Conteúdo da mensagem.
   * @param {boolean} self - Indica se a mensagem foi enviada pelo próprio bot.
   */
  _onTwitchMessage({ channel, tags, message, self }) {
    if (self) return

    const user = (Array.isArray(tags) ? tags : [])['display-name'] || tags.username || 'Unknown'

    console.debug(`[Twitch][${channel}] Message received from '${user}': ${message}`)

    this._playerControl?.play()

    if (this._memeControl) {
      if (['!meme', '!memes'].includes(message.toLowerCase().trim())) {
        this._twitchControl?.sendMessage(`Memes: ${this._memeControl.memes.join(', ')}`, channel)
      } else {
        this._memeControl.play(message)
      }
    }
  }
}

new App().run()
