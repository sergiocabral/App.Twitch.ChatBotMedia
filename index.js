import tmi from 'tmi.js'
import OBSWebSocket from 'obs-websocket-js'
import dotenv from 'dotenv'
import { exec } from 'child_process'

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
