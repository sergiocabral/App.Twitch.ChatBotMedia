import OBSWebSocket from "obs-websocket-js/json"
import Utils from "./Utils.js"

/**
 * Controle de interação com o OBS Studio.
 */
export default class ObsControl {
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
