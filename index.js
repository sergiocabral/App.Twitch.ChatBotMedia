import dotenv from 'dotenv';
import { exec } from 'child_process';

class App {
  initialize() {
    console.debug('Initializing...');
    dotenv.config();
  }

  notify(file = 'notification.wav') {
    const command = `ffplay -nodisp -autoexit -hide_banner -loglevel quiet "${file}"`;
    exec(command, error => {
      if (error) {
        console.error(`Media player not found: ${String(error ?? '').replace(/\n|\r/g, ' ').replace(/\s+/g, ' ')}`)
      }
    });
  }

  async run() {
    try {
      this.initialize();
      await this.notify();
      console.log('Running.');
    } catch (error) {
      console.error('Erro ao executar:', error);
    }
  }
}

new App().run();
