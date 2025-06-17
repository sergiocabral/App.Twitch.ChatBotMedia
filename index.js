import dotenv from 'dotenv'

class App {

  initialize() {
    console.debug('Initializing...')
    dotenv.config()
  }

  run() {
    this.initialize()
    console.log('Running.')
  }

}

new App().run()