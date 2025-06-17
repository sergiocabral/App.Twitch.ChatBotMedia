import tmi from 'tmi.js'
import OBSWebSocket from 'obs-websocket-js'
import dotenv from 'dotenv'
import { exec } from 'child_process'
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

class App {
  client
  obs = new OBSWebSocket()

  async initialize() {
    console.debug('Initializing...')
    dotenv.config()
    await this.connectToOBS()
    await this.connectToTwitch()
  }

  notify(file = 'notification.wav') {
    const command = `ffplay -nodisp -autoexit -hide_banner -loglevel quiet "${file}"`
    exec(command, (error) => {
      if (error) {
        console.error(
          `Media player not found: ${String(error ?? '')
            .replace(/\n|\r/g, ' ')
            .replace(/\s+/g, ' ')}`
        )
      }
    })
  }

  async executeBat(meme) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const batPath = join(__dirname, '..', 'Memes', '_play_meme.bat');

    return new Promise((resolve, reject) => {
      exec(`"${batPath}" "${meme}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Erro ao executar .bat: ${String(error)}`);
          reject(error);
        } else {
          console.log(`Meme '${meme}' executado`);
          resolve(stdout);
        }
      });
    });
  }

  async playMeme(meme) {
    if (!meme) return;

    const scene = process.env.OBS_SOURCE_SCENE ?? ''
    const source = process.env.OBS_SOURCE_NAME ?? ''

    try {
      const { sceneItems } = await this.obs.call('GetSceneItemList', {
        sceneName: scene,
      })

      const item = sceneItems.find(i => i.sourceName === source)
      if (!item) throw new Error(`Source "${source}" not found in scene "${scene}"`)

      const id = item.sceneItemId

      await this.obs.call('SetSceneItemEnabled', {
        sceneName: scene,
        sceneItemId: id,
        sceneItemEnabled: false,
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      await this.executeBat(meme)

      await new Promise(resolve => setTimeout(resolve, 1000))

      await this.obs.call('SetSceneItemEnabled', {
        sceneName: scene,
        sceneItemId: id,
        sceneItemEnabled: true,
      })
    } catch (error) {
      console.error('Erro no playMeme:', error)
    }
  }

  async connectToOBS() {
    const address = process.env.OBS_ADDRESS ?? 'localhost:4455'
    const password = process.env.OBS_PASSWORD ?? ''

    console.log('Connecting to OBS...')
    try {
      await this.obs.connect(`ws://${address}`, password)
      console.log('Connected to OBS')
    } catch (error) {
      console.error('Error when connect to OBS:', error)
    }
  }

  async connectToTwitch() {
    const username = process.env.TWITCH_USERNAME
    const oauth = process.env.TWITCH_OAUTH
    const channel = process.env.TWITCH_CHANNEL

    if (!username || !oauth || !channel) {
      throw new Error('Missing Twitch credentials in .env')
    }

    this.client = new tmi.Client({
      options: { debug: true },
      identity: {
        username,
        password: oauth,
      },
      channels: [channel],
    })

    this.client.on('connected', (address, port) => {
      console.log(`Connected to ${address}:${port}`)
    })

    this.client.on('message', (channel, tags, message, self) => {
      if (self) return
      console.log(`[${tags['display-name']}] ${message}`)
      this.notify()
      this.playMeme(message)
    })

    await this.client.connect()
  }

  async run() {
    try {
      await this.initialize()
      console.log('Running.')
    } catch (error) {
      console.error('Erro ao executar:', error)
    }
  }
}

new App().run()
