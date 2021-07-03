const ENV = {
    ObsWebsocketAddress: 'localhost:4444',
    ObsWebsocketPassword: 'masterkey',
    ObsSourceName: 'Chat Bot Audio',
    TwitchUsername: 'sergiocabral_com',
    TwitchPassword: 'oauth:swulwzgr60gvfqekcb5nimw6cargdl'
}

const tmi = require('tmi.js');
const OBSWebSocket = require('obs-websocket-js');

var global = {
    /**
     * @type {OBSWebSocket}
     */
    obs: null,

    /**
     * @type {tmi.Client}
     */
     irc: null
};

async function connectToObs() {
    const obs = new OBSWebSocket();
    await obs.connect({
        address: ENV.ObsWebsocketAddress,
        password: ENV.ObsWebsocketPassword,
    });
    console.log('Websocket connected.');
    return obs;
}

async function connectToTwitchChat() {
    const irc = new tmi.Client({
        identity: {
            username: ENV.TwitchUsername,
            password: ENV.TwitchPassword,
        },
        channels: [ ENV.TwitchUsername ]
    })
    await irc.connect();
    console.log('Twitch Chat connected.');
    return irc;
}

async function onMessage(channel, tags, message, self) {
    /**
     * @type {OBSWebSocket}
     */
    const obs = this.obs;
    const slug = message.toLowerCase();
    if(slug == 'aqui tem coragem') {
        await obs.send(
            'SetSourceSettings', {
                sourceName: ENV.ObsSourceName,
                sourceSettings: {
                    local_file: 'D:\\OBS\\App.Twitch.ChatBotMedia\\videos\\coragem.mp4'
                }
            });
    }
}

async function main() {
    global.obs = await connectToObs();
    global.irc = await connectToTwitchChat();
    global.irc.on('message', onMessage.bind(global));
}

main();