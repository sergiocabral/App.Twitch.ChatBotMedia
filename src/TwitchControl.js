import tmi from 'tmi.js'
import { EventEmitter } from 'events'
import Utils from './Utils.js'

/**
 * Controle de conexão e eventos com o chat da Twitch.
 */
export default class TwitchControl extends EventEmitter {
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
