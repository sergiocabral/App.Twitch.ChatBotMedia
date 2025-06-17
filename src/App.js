import PlayerControl from "./PlayerControl.js"
import TwitchControl from "./TwitchControl.js"
import ObsControl from "./ObsControl.js"
import MemeControl from "./MemeControl.js"

/**
 * Classe principal do aplicativo.
 */
export default class App {
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
